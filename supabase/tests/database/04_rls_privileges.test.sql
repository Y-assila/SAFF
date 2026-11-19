begin;
\ir _helpers.psql
select plan(30);

-- Fixture: shop A (owner + barber), shop B (barber), and a signed-in user with no shop.
select tests.create_shop('rls-a') as shop_a \gset
select tests.create_shop('rls-b') as shop_b \gset
select tests.create_user('owner-a@test.local') as owner_a \gset
select tests.create_user('barber-a@test.local') as barber_a \gset
select tests.create_user('barber-b@test.local') as barber_b \gset
select tests.create_user('stranger@test.local') as stranger \gset
select tests.add_member(:'shop_a', :'owner_a', 'owner');
select tests.add_member(:'shop_a', :'barber_a', 'barber');
select tests.add_member(:'shop_b', :'barber_b', 'barber');
select tests.open_session(:'shop_a') as sess_a \gset
select tests.open_session(:'shop_b') as sess_b \gset
select tests.add_ticket(:'sess_a', '+212611111111', 'Alice') as ticket_a \gset
select tests.add_ticket(:'sess_b', '+212622222222', 'Bob') as ticket_b \gset
insert into public.notifications (shop_id, ticket_id, notification_type, recipient_phone)
  values (:'shop_a', :'ticket_a', 'ticket_created', '+212611111111'), (:'shop_b', :'ticket_b', 'ticket_created', '+212622222222');
select app.log_event(:'shop_a', :'sess_a', :'ticket_a', 'customer', null, 'ticket_joined', null, 'waiting', null);
select app.log_event(:'shop_b', :'sess_b', :'ticket_b', 'customer', null, 'ticket_joined', null, 'waiting', null);

-- ── Barber of shop A ────────────────────────────────────────────────────────
select tests.authenticate_as(:'barber_a');

select results_eq('select id from public.shops', format('values (%L::uuid)', :'shop_a'),
  'barber A sees only shop A');
select results_eq('select id from public.queue_sessions', format('values (%L::uuid)', :'sess_a'),
  'barber A sees only shop A sessions');
select results_eq('select id, customer_name from public.tickets', format($$values (%L::uuid, 'Alice')$$, :'ticket_a'),
  'barber A sees only shop A tickets (name, no phone)');
select is((select count(*)::int from public.notifications), 1, 'barber A sees only shop A notifications');
select is((select count(*)::int from public.queue_events), 1, 'barber A sees only shop A events');
select is((select count(*)::int from public.shop_settings), 1, 'barber A sees only shop A settings');
select results_eq('select user_id from public.shop_members', format('values (%L::uuid)', :'barber_a'),
  'a barber sees only their own membership');
select results_eq('select id from public.profiles', format('values (%L::uuid)', :'barber_a'),
  'a user sees only their own profile');

select throws_ok('select customer_phone from public.tickets', '42501', null,
  'barbers cannot read customer phone numbers from tickets');
select throws_ok('select * from public.tickets', '42501', null,
  'select * on tickets is refused (phone column not granted)');
select throws_ok('select recipient_phone from public.notifications', '42501', null,
  'barbers cannot read notification phone numbers');
select throws_ok('select * from public.ticket_transitions', '42501', null,
  'the transition table is internal');
select throws_ok('select * from public.rate_limits', '42501', null,
  'rate limits are internal');

select throws_ok(format($$insert into public.tickets (shop_id, queue_session_id, ticket_number, customer_name, customer_phone,
  whatsapp_consent, consent_at, consent_text_version) values (%L, %L, 50, 'X', '+212699999999', true, now(), 'v')$$, :'shop_a', :'sess_a'),
  '42501', null, 'barbers cannot insert tickets directly');
select throws_ok(format($$update public.tickets set status = 'getting_ready' where id = %L$$, :'ticket_a'),
  '42501', null, 'barbers cannot update tickets directly');
select throws_ok(format('delete from public.tickets where id = %L', :'ticket_a'),
  '42501', null, 'barbers cannot delete tickets');
select throws_ok(format($$update public.queue_sessions set status = 'paused' where id = %L$$, :'sess_a'),
  '42501', null, 'barbers cannot update sessions directly');
select throws_ok('insert into public.queue_events (shop_id, actor_type, event_type) values (gen_random_uuid(), $$barber$$, $$x$$)',
  '42501', null, 'barbers cannot write audit events');

-- Settings: barbers cannot change them (policy filters the row out).
update public.shop_settings set grace_period_minutes = 30 where shop_id = :'shop_a';

select throws_ok(format('select app.bump_session(%L)', :'sess_a'), '42501', null,
  'barbers cannot call internal helpers');
select throws_ok('select public.check_rate_limit($$k-0123456789abcdef$$, 60, 5)', '42501', null,
  'barbers cannot call the rate limiter');

-- ── Owner of shop A ─────────────────────────────────────────────────────────
select tests.as_postgres();
select is((select grace_period_minutes from public.shop_settings where shop_id = :'shop_a'), 10,
  'the barber''s settings update changed nothing');
select tests.authenticate_as(:'owner_a');
update public.shop_settings set grace_period_minutes = 15 where shop_id = :'shop_a';
update public.shop_settings set grace_period_minutes = 15 where shop_id = :'shop_b';
select is((select count(*)::int from public.shop_members), 2, 'an owner sees all members of their shop');
select throws_ok(format('update public.shop_settings set require_phone_verification = true where shop_id = %L', :'shop_a'),
  '42501', null, 'owners cannot change columns outside the settings grant');
select tests.as_postgres();
select results_eq(
  format('select shop_id::text, grace_period_minutes from public.shop_settings where shop_id in (%L, %L) order by grace_period_minutes', :'shop_a', :'shop_b'),
  format('values (%L, 10), (%L, 15)', :'shop_b', :'shop_a'),
  'an owner can update their own shop settings only');

-- ── Signed-in user without a shop ───────────────────────────────────────────
select tests.authenticate_as(:'stranger');
select is((select count(*)::int from public.shops) + (select count(*)::int from public.tickets)
        + (select count(*)::int from public.queue_sessions), 0,
  'a signed-in user without membership sees no shop data');

-- ── Anonymous ───────────────────────────────────────────────────────────────
select tests.as_anon();
select throws_ok('select id from public.shops', '42501', null, 'anon cannot read shops');
select throws_ok('select id from public.tickets', '42501', null, 'anon cannot read tickets');
select throws_ok('select id from public.queue_sessions', '42501', null, 'anon cannot read sessions');
select throws_ok(format('select app.is_shop_member(%L)', :'shop_a'), '42501', null, 'anon cannot reach the app schema');

-- ── Service role (Edge Functions) ───────────────────────────────────────────
select tests.as_postgres();
set local role service_role;
select ok(public.check_rate_limit('svc-0123456789abcdef', 60, 5), 'the service role can call the rate limiter');
reset role;

select * from finish();
rollback;
