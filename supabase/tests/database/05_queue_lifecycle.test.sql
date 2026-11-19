begin;
\ir _helpers.psql
select plan(23);

select tests.create_shop('life-a') as shop \gset
select tests.create_shop('life-b') as other_shop \gset
select tests.create_user('life-barber@test.local') as barber \gset
select tests.create_user('life-outsider@test.local') as outsider \gset
select tests.add_member(:'shop', :'barber');

-- ── start_queue ─────────────────────────────────────────────────────────────
select throws_ok(format('select tests.rpc_as(%L, %L)', :'outsider', format('select public.start_queue(%L)', :'shop')),
  'P0001', 'not_authorized', 'a non-member cannot start a queue');

select tests.rpc_as(:'barber', format('select public.start_queue(%L)', :'shop')) ->> 'session_id' as sess \gset
select is((select status::text from public.queue_sessions where id = :'sess'), 'open', 'start_queue opens a session');
select is((select queue_date from public.queue_sessions where id = :'sess'), app.shop_today(:'shop'),
  'queue_date is the shop-local date');
select is(tests.rpc_as(:'barber', format('select public.start_queue(%L)', :'shop')) ->> 'result', 'already_started',
  'starting twice on the same day is an idempotent success');
select is((select count(*)::int from public.queue_events where queue_session_id = :'sess' and event_type = 'queue_started'), 1,
  'queue_started is audited once');
select ok((select version from public.queue_sessions where id = :'sess') >= 1, 'start bumps the session version');

-- ── pause / resume ──────────────────────────────────────────────────────────
select is(tests.rpc_as(:'barber', format('select public.pause_queue(%L)', :'sess')) ->> 'result', 'paused', 'pause');
select is(tests.rpc_as(:'barber', format('select public.pause_queue(%L)', :'sess')) ->> 'result', 'already_paused', 'pause is idempotent');
select is(tests.rpc_as(:'barber', format('select public.resume_queue(%L)', :'sess')) ->> 'result', 'resumed', 'resume');
select is(tests.rpc_as(:'barber', format('select public.resume_queue(%L)', :'sess')) ->> 'result', 'already_open', 'resume is idempotent');
select throws_ok(format('select tests.rpc_as(%L, %L)', :'outsider', format('select public.pause_queue(%L)', :'sess')),
  'P0001', 'not_authorized', 'a non-member cannot pause');

-- ── close_queue ─────────────────────────────────────────────────────────────
select tests.add_ticket(:'sess', '+212611000001') as t1 \gset
select tests.add_ticket(:'sess', '+212611000002') as t2 \gset
select tests.add_ticket(:'sess', '+212611000003') as t3 \gset
select tests.set_status(:'t1', 'getting_ready'); select tests.set_status(:'t1', 'arrived'); select tests.set_status(:'t1', 'in_service');

select throws_ok(format('select tests.rpc_as(%L, %L)', :'barber', format('select public.close_queue(%L)', :'sess')),
  'P0001', 'service_in_progress', 'cannot close while a customer is in service');

select tests.set_status(:'t1', 'completed');
select tests.set_status(:'t2', 'getting_ready');
select is(tests.rpc_as(:'barber', format('select public.close_queue(%L)', :'sess')) ->> 'expired_count', '2',
  'close expires the remaining active tickets');
select results_eq(format('select id, status::text from public.tickets where queue_session_id = %L order by ticket_number', :'sess'),
  format($$values (%L::uuid, 'completed'), (%L::uuid, 'expired'), (%L::uuid, 'expired')$$, :'t1', :'t2', :'t3'),
  'completed stays completed; called and waiting become expired');
select is((select count(*)::int from public.notifications where notification_type = 'queue_closed'
             and ticket_id in (:'t2', :'t3')), 2, 'each expired customer gets one queue_closed message');
select is((select count(*)::int from public.queue_events where ticket_id in (:'t2', :'t3') and event_type = 'ticket_expired' and actor_type = 'system'), 2,
  'expirations are audited as system actions');
select is(tests.rpc_as(:'barber', format('select public.close_queue(%L)', :'sess')) ->> 'result', 'already_closed', 'close is idempotent');
select throws_ok(format('select tests.rpc_as(%L, %L)', :'barber', format('select public.start_queue(%L)', :'shop')),
  'P0001', 'queue_closed_today', 'a closed day must be reopened, not restarted');

-- ── reopen_queue ────────────────────────────────────────────────────────────
select is(tests.rpc_as(:'barber', format('select public.reopen_queue(%L)', :'sess')) ->> 'result', 'reopened', 'reopen same day');
select is((select status::text from public.tickets where id = :'t3'), 'expired', 'expired tickets stay expired after reopen');
select throws_ok(format('select tests.rpc_as(%L, %L)', :'barber', format('select public.reopen_queue(%L)', :'sess')),
  'P0001', 'reopen_not_allowed', 'only a finished session can be reopened');

-- ── stale session (forgot to close yesterday) ──────────────────────────────
select tests.open_session(:'other_shop', app.shop_today(:'other_shop') - 1) as stale \gset
select tests.add_ticket(:'stale', '+212622000001') as s1 \gset
select tests.add_ticket(:'stale', '+212622000002') as s2 \gset
select tests.set_status(:'s1', 'getting_ready'); select tests.set_status(:'s1', 'arrived'); select tests.set_status(:'s1', 'in_service');
select tests.add_member(:'other_shop', :'barber');
select tests.rpc_as(:'barber', format('select public.start_queue(%L)', :'other_shop')) ->> 'session_id' as fresh \gset
select results_eq(format($$select status::text, coalesce(status_reason, '') from public.tickets where id in (%L, %L) order by ticket_number$$, :'s1', :'s2'),
  $$values ('completed', 'auto_closed'), ('expired', '')$$,
  'starting today auto-finishes yesterday: forgotten service -> completed(auto_closed), waiting -> expired');
select ok((select status = 'finished' from public.queue_sessions where id = :'stale')
          and (select status = 'open' from public.queue_sessions where id = :'fresh'),
  'the stale session is finished and today''s session is open');

select * from finish();
rollback;
