begin;
\ir _helpers.psql
select plan(40);

-- Runs SQL as the service role (what the Edge Functions use) and returns the jsonb result.
create function tests.svc(p_sql text) returns jsonb language plpgsql as $$
declare v jsonb;
begin
  execute 'set local role service_role';
  execute p_sql into v;
  execute 'reset role';
  return v;
exception when others then
  execute 'reset role';
  raise;
end $$;
grant execute on function tests.svc(text) to service_role;

create function tests.join(p_slug text, p_phone text, p_req uuid default gen_random_uuid(), p_name text default 'Client',
  p_consent boolean default true, p_locale text default 'ar') returns jsonb language sql as $$
  select tests.svc(format('select public.join_queue(%L, %L, %L, %L, %L, %L, %L)',
                          p_slug, p_name, p_phone, p_locale, p_consent, 'consent-v1', p_req));
$$;

select tests.create_shop('cust-shop') as shop \gset
select tests.create_user('cust-barber@test.local') as barber \gset
select tests.create_user('cust-outsider@test.local') as outsider \gset
select tests.add_member(:'shop', :'barber');

-- ── join_queue ─────────────────────────────────────────────────────────────
select throws_ok($$select tests.join('cust-shop', '+212644000001')$$, 'P0001', 'queue_closed', 'cannot join when no queue is open');
select tests.rpc_as(:'barber', format('select public.start_queue(%L)', :'shop')) ->> 'session_id' as sess \gset

select gen_random_uuid() as req1 \gset
select tests.join('cust-shop', '+212644000001', :'req1') as j1 \gset
select is(:'j1'::jsonb ->> 'result', 'created', 'a customer joins');
select is(:'j1'::jsonb ->> 'ticket_number', '1', 'the database assigns ticket number 1');
select is(:'j1'::jsonb ->> 'token_version', '1', 'the join returns the token version for the edge to sign');
select is((select locale from public.tickets where id = (:'j1'::jsonb ->> 'ticket_id')::uuid), 'ar', 'the ticket keeps the customer locale');
select is((select count(*)::int from public.notifications where ticket_id = (:'j1'::jsonb ->> 'ticket_id')::uuid and notification_type = 'ticket_created'), 1,
  'a ticket_created message is queued');
select is((select count(*)::int from public.queue_events where ticket_id = (:'j1'::jsonb ->> 'ticket_id')::uuid and event_type = 'ticket_joined' and actor_type = 'customer'), 1,
  'the join is audited as a customer action');
select ok(not ((select metadata from public.queue_events where event_type = 'ticket_joined' and ticket_id = (:'j1'::jsonb ->> 'ticket_id')::uuid)::text ~ '(Client|2126)'),
  'the audit event contains no name or phone');

select is(tests.join('cust-shop', '+212644000001', :'req1') ->> 'replayed', 'true', 'a retried submission returns the same ticket (idempotent)');
select is((select count(*)::int from public.tickets where queue_session_id = :'sess'), 1, 'the retry created no second ticket');

select tests.join('cust-shop', '+212644000001') as dup \gset
select is(:'dup'::jsonb, '{"result":"existing"}'::jsonb, 'a duplicate phone gets "existing" with no id, number or name');
select is((select count(*)::int from public.notifications where notification_type = 'link_resent'), 1, 'the link is re-sent to that WhatsApp number');
select tests.join('cust-shop', '+212644000001');
select is((select count(*)::int from public.notifications where notification_type = 'link_resent'), 1, 'at most one re-send per 10 minutes');

select throws_ok($$select tests.join('cust-shop', '+212644000009', gen_random_uuid(), 'X', false)$$, 'P0001', 'consent_required', 'consent is required');
select throws_ok($$select tests.join('cust-shop', '+212644000009', gen_random_uuid(), '   ')$$, 'P0001', 'invalid_name', 'a blank name is refused');
select throws_ok($$select tests.join('cust-shop', '+212644000009', gen_random_uuid(), E'Bad\nName')$$, 'P0001', 'invalid_name', 'control characters in names are refused');
select throws_ok($$select tests.join('cust-shop', '0644000009')$$, 'P0001', 'invalid_phone', 'non-E.164 phones are refused');
select throws_ok($$select tests.join('no-such-shop', '+212644000009')$$, 'P0001', 'shop_not_found', 'unknown shop');
select is(tests.join('cust-shop', '+212644000002', gen_random_uuid(), 'Client', true, 'xx') ->> 'ticket_number', '2', 'an unknown locale still joins');
select is((select locale from public.tickets where queue_session_id = :'sess' and ticket_number = 2), 'fr', 'and falls back to fr');

select tests.rpc_as(:'barber', format('select public.pause_queue(%L)', :'sess'));
select throws_ok($$select tests.join('cust-shop', '+212644000003')$$, 'P0001', 'queue_paused', 'cannot join a paused queue');
select tests.rpc_as(:'barber', format('select public.resume_queue(%L)', :'sess'));

update public.shop_settings set max_active_tickets = 3, whatsapp_enabled = false where shop_id = :'shop';
select tests.join('cust-shop', '+212644000003') as j3 \gset
select is((select count(*)::int from public.notifications where ticket_id = (:'j3'::jsonb ->> 'ticket_id')::uuid), 0,
  'with WhatsApp disabled the ticket is created without any message');
select throws_ok($$select tests.join('cust-shop', '+212644000004')$$, 'P0001', 'queue_full', 'the active-ticket cap is enforced');

-- ── customer_get_ticket ────────────────────────────────────────────────────
select (:'j3'::jsonb ->> 'ticket_id') as t3 \gset
select tests.svc(format('select public.customer_get_ticket(%L, 1)', :'t3')) as view \gset
select is(:'view'::jsonb ->> 'people_ahead', '2', 'people ahead counts active tickets with a lower number');
select ok(not (:'view'::jsonb ? 'customer_phone') and :'view'::jsonb::text !~ '2126', 'the ticket view never contains a phone number');
select is(:'view'::jsonb -> 'estimate', '{"available": true, "minutes": 50}'::jsonb,
  'estimate = 2 ahead × default 25 min (no history yet), rounded to 5');
select throws_ok(format('select tests.svc(%L)', format('select public.customer_get_ticket(%L, 2)', :'t3')),
  'P0001', 'not_found', 'a wrong token version is a generic not_found');

-- serve ticket 1 for a while to build history and a current service
select tests.rpc_as(:'barber', format('select public.call_next_customer(%L)', :'sess'));
select (:'j1'::jsonb ->> 'ticket_id') as t1 \gset
select tests.rpc_as(:'barber', format('select public.start_service(%L, %L, true)', :'sess', :'t1'));
update public.tickets set service_started_at = now() - interval '10 minutes' where id = :'t1';
select tests.svc(format('select public.customer_get_ticket(%L, 1)', :'t3')) as view2 \gset
select is(:'view2'::jsonb ->> 'now_serving_number', '1', 'the customer sees only the number being served');
select is(:'view2'::jsonb -> 'estimate' ->> 'minutes', '40', 'estimate = 1 waiting × 25 + (25 − 10 elapsed) = 40');

select tests.rpc_as(:'barber', format('select public.pause_queue(%L)', :'sess'));
select is(tests.svc(format('select public.customer_get_ticket(%L, 1)', :'t3')) -> 'estimate', '{"available": false}'::jsonb,
  'while paused the wait is "currently unavailable"');
select tests.rpc_as(:'barber', format('select public.resume_queue(%L)', :'sess'));

-- ── customer actions ───────────────────────────────────────────────────────
select throws_ok(format('select tests.svc(%L)', format('select public.customer_confirm_on_the_way(%L, 1)', :'t3')),
  'P0001', 'invalid_transition', 'a waiting customer cannot confirm on the way');
select tests.rpc_as(:'barber', format('select public.complete_service(%L, %L)', :'sess', :'t1'));
select tests.rpc_as(:'barber', format('select public.call_next_customer(%L)', :'sess'));  -- ticket 2 called
select (select id from public.tickets where queue_session_id = :'sess' and ticket_number = 2) as t2 \gset
select is(tests.svc(format('select public.customer_confirm_on_the_way(%L, 1)', :'t2')) ->> 'result', 'on_the_way', 'the called customer confirms on the way');
select is(tests.svc(format('select public.customer_confirm_on_the_way(%L, 1)', :'t2')) ->> 'result', 'already_on_the_way', 'confirm is idempotent');
select is(tests.svc(format('select public.customer_cancel_ticket(%L, 1)', :'t3')) ->> 'result', 'cancelled', 'a customer cancels their own ticket');
select is(tests.svc(format('select public.customer_cancel_ticket(%L, 1)', :'t3')) ->> 'result', 'already_cancelled', 'cancel is idempotent');

-- ── public_get_shop ────────────────────────────────────────────────────────
select tests.as_anon();
select is(public.public_get_shop('no-such-shop'), '{"result":"not_found"}'::jsonb, 'anon: unknown slug is not_found (no error oracle)');
select is(public.public_get_shop('CUST-SHOP') ->> 'status', 'open', 'anon sees the queue status (slug is case-insensitive)');
select is(public.public_get_shop('cust-shop') ->> 'waiting_count', '1', 'waiting_count = waiting + called');
select tests.as_postgres();

-- ── get_queue_stats ────────────────────────────────────────────────────────
select is(tests.rpc_as(:'barber', format('select public.get_queue_stats(%L)', :'sess')) -> 'counts' ->> 'completed', '1', 'stats count tickets per status');
select throws_ok(format('select tests.rpc_as(%L, %L)', :'outsider', format('select public.get_queue_stats(%L)', :'sess')),
  'P0001', 'not_authorized', 'stats are members-only');

select * from finish();
rollback;
