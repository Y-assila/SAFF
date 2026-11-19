begin;
\ir _helpers.psql
select plan(39);

select tests.create_shop('bt-shop') as shop \gset
select tests.create_user('bt-barber@test.local') as barber \gset
select tests.create_user('bt-outsider@test.local') as outsider \gset
select tests.add_member(:'shop', :'barber');
select tests.rpc_as(:'barber', format('select public.start_queue(%L)', :'shop')) ->> 'session_id' as sess \gset
select tests.add_ticket(:'sess', '+212633000001', 'Amine') as t1 \gset
select tests.add_ticket(:'sess', '+212633000002', 'Badr') as t2 \gset
select tests.add_ticket(:'sess', '+212633000003', 'Chama') as t3 \gset
select tests.add_ticket(:'sess', '+212633000004', 'Driss') as t4 \gset

-- ── call_next_customer ─────────────────────────────────────────────────────
select throws_ok(format('select tests.rpc_as(%L, %L)', :'outsider', format('select public.call_next_customer(%L)', :'sess')),
  'P0001', 'not_authorized', 'a non-member cannot call');
select is(tests.rpc_as(:'barber', format('select public.call_next_customer(%L)', :'sess')) ->> 'ticket_id', :'t1',
  'CALL NEXT takes the lowest-numbered waiting ticket (FIFO)');
select ok((select status = 'getting_ready' and called_at is not null from public.tickets where id = :'t1'),
  'the called ticket is getting_ready with called_at set');
select is((select count(*)::int from public.notifications where ticket_id = :'t1' and notification_type = 'turn_approaching'), 1,
  'one turn_approaching message is queued');
select throws_ok(format('select tests.rpc_as(%L, %L)', :'barber', format('select public.call_next_customer(%L)', :'sess')),
  'P0001', 'called_slot_occupied', 'CALL NEXT never calls a second customer while one is called');

-- ── on the way / arrived ───────────────────────────────────────────────────
select is(tests.rpc_as(:'barber', format('select public.mark_on_the_way(%L, %L)', :'sess', :'t1')) ->> 'result', 'on_the_way', 'barber marks on the way');
select is(tests.rpc_as(:'barber', format('select public.mark_on_the_way(%L, %L)', :'sess', :'t1')) ->> 'result', 'already_on_the_way', 'on the way is idempotent');
select throws_ok(format('select tests.rpc_as(%L, %L)', :'barber', format('select public.mark_on_the_way(%L, %L)', :'sess', :'t2')),
  'P0001', 'invalid_transition', 'a waiting ticket cannot be marked on the way');
select is(tests.rpc_as(:'barber', format('select public.mark_arrived(%L, %L)', :'sess', :'t1')) ->> 'result', 'arrived', 'mark arrived');
select is(tests.rpc_as(:'barber', format('select public.mark_arrived(%L, %L)', :'sess', :'t1')) ->> 'result', 'already_arrived', 'arrived is idempotent');

-- ── start / complete ───────────────────────────────────────────────────────
select throws_ok(format('select tests.rpc_as(%L, %L)', :'barber', format('select public.start_service(%L, %L, true)', :'sess', :'t2')),
  'P0001', 'invalid_transition', 'a waiting ticket can never start service, even with p_skip_arrival');
select is(tests.rpc_as(:'barber', format('select public.start_service(%L, %L)', :'sess', :'t1')) ->> 'result', 'started', 'start service for the arrived customer');
select is(tests.rpc_as(:'barber', format('select public.start_service(%L, %L)', :'sess', :'t1')) ->> 'result', 'already_in_service', 'start is idempotent');

select tests.rpc_as(:'barber', format('select public.call_next_customer(%L)', :'sess'));  -- t2 called while t1 in service
select is((select status::text from public.tickets where id = :'t2'), 'getting_ready', 'CALL NEXT works while someone is in service');
select throws_ok(format('select tests.rpc_as(%L, %L)', :'barber', format('select public.start_service(%L, %L, true)', :'sess', :'t2')),
  'P0001', 'service_in_progress', 'only one customer in service');
select throws_ok(format('select tests.rpc_as(%L, %L)', :'barber', format('select public.complete_service(%L, %L)', :'sess', :'t2')),
  'P0001', 'invalid_transition', 'only an in-service ticket can be completed');
select is(tests.rpc_as(:'barber', format('select public.complete_service(%L, %L)', :'sess', :'t1')) ->> 'result', 'completed', 'complete service');
select is(tests.rpc_as(:'barber', format('select public.complete_service(%L, %L)', :'sess', :'t1')) ->> 'result', 'already_completed', 'COMPLETE twice is an idempotent success');
select is((select status::text from public.tickets where id = :'t2'), 'getting_ready', 'complete never touches the called customer');

select throws_ok(format('select tests.rpc_as(%L, %L)', :'barber', format('select public.start_service(%L, %L)', :'sess', :'t2')),
  'P0001', 'invalid_transition', 'a called (not arrived) customer needs p_skip_arrival');
select is(tests.rpc_as(:'barber', format('select public.start_service(%L, %L, true)', :'sess', :'t2')) ->> 'result', 'started',
  'p_skip_arrival starts a called customer');
select is((select metadata ->> 'skip_arrival' from public.queue_events where ticket_id = :'t2' and event_type = 'service_started'), 'true',
  'the skip-arrival override is recorded in the audit event');
select tests.rpc_as(:'barber', format('select public.complete_service(%L, %L)', :'sess', :'t2'));

-- ── skip rules (TD issue 11, approved Q-3) ─────────────────────────────────
select throws_ok(format('select tests.rpc_as(%L, %L)', :'barber', format($$select public.skip_ticket(%L, %L, 'no_show_after_grace')$$, :'sess', :'t4')),
  'P0001', 'invalid_skip_reason', 'a waiting customer cannot be skipped for no-show (never called)');
select tests.rpc_as(:'barber', format('select public.call_next_customer(%L)', :'sess'));  -- t3 called now
select throws_ok(format('select tests.rpc_as(%L, %L)', :'barber', format($$select public.skip_ticket(%L, %L, 'unreachable')$$, :'sess', :'t3')),
  'P0001', 'grace_not_elapsed', 'skipping a called customer before the grace period needs barber_override');
update public.tickets set called_at = now() - interval '11 minutes' where id = :'t3';
select is(tests.rpc_as(:'barber', format($$select public.skip_ticket(%L, %L, 'no_show_after_grace')$$, :'sess', :'t3')) ->> 'result', 'skipped',
  'after the grace period a no-show can be skipped');
select is((select status_reason from public.tickets where id = :'t3'), 'no_show_after_grace', 'the skip reason is stored');
select is(tests.rpc_as(:'barber', format($$select public.skip_ticket(%L, %L, 'unreachable')$$, :'sess', :'t3')) ->> 'result', 'already_skipped', 'skip is idempotent');
select is(tests.rpc_as(:'barber', format($$select public.skip_ticket(%L, %L, 'barber_override')$$, :'sess', :'t4')) ->> 'result', 'skipped',
  'barber_override can skip a waiting customer (audited)');
select is((select reason from public.queue_events where ticket_id = :'t4' and event_type = 'ticket_skipped'), 'barber_override', 'the override is audited');
select throws_ok(format('select tests.rpc_as(%L, %L)', :'barber', format('select public.call_next_customer(%L)', :'sess')),
  'P0001', 'no_waiting_customers', 'CALL NEXT on an empty queue');

-- ── cancel, foreign tickets ────────────────────────────────────────────────
select tests.add_ticket(:'sess', '+212633000005', 'Ehsan') as t5 \gset
select is(tests.rpc_as(:'barber', format('select public.barber_cancel_ticket(%L, %L)', :'sess', :'t5')) ->> 'result', 'cancelled', 'barber cancels a waiting ticket');
select is(tests.rpc_as(:'barber', format('select public.barber_cancel_ticket(%L, %L)', :'sess', :'t5')) ->> 'result', 'already_cancelled', 'cancel is idempotent');
select throws_ok(format('select tests.rpc_as(%L, %L)', :'barber', format('select public.mark_arrived(%L, %L)', :'sess', gen_random_uuid())),
  'P0001', 'ticket_not_found', 'a ticket outside the session is not found');

-- ── reveal_phone (approved Q-5) ────────────────────────────────────────────
select tests.add_ticket(:'sess', '+212633000006', 'Fatima') as t6 \gset
select is(tests.rpc_as(:'barber', format('select public.reveal_phone(%L)', :'t6')) ->> 'phone', '+212633000006', 'a member can reveal a phone number');
select is((select count(*)::int from public.queue_events where ticket_id = :'t6' and event_type = 'phone_revealed' and actor_user_id = :'barber'), 1,
  'every reveal is audited with the barber''s id');
select throws_ok(format('select tests.rpc_as(%L, %L)', :'outsider', format('select public.reveal_phone(%L)', :'t6')),
  'P0001', 'not_authorized', 'a non-member cannot reveal');
update public.tickets set cancelled_at = now() - interval '25 hours' where id = :'t5';
select is(tests.rpc_as(:'barber', format('select public.reveal_phone(%L)', :'t5')) ->> 'result', 'unavailable', 'no reveal more than 24 h after a ticket ended');
insert into public.queue_events (shop_id, ticket_id, actor_type, actor_user_id, event_type)
  select :'shop', :'t6', 'barber', :'barber', 'phone_revealed' from generate_series(1, 29);
select throws_ok(format('select tests.rpc_as(%L, %L)', :'barber', format('select public.reveal_phone(%L)', :'t6')),
  'P0001', 'rate_limited', 'at most 30 reveals per barber per hour');

-- ── reissue_ticket_link ────────────────────────────────────────────────────
select tests.rpc_as(:'barber', format('select public.reissue_ticket_link(%L, %L)', :'sess', :'t6'));
select ok((select token_version = 2 from public.tickets where id = :'t6')
  and exists (select 1 from public.notifications where ticket_id = :'t6' and notification_type = 'link_resent' and dedupe_key = 'v2'),
  'reissue bumps token_version (revoking the old link) and queues the new link');

select * from finish();
rollback;
