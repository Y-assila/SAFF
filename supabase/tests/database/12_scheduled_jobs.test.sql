begin;
\ir _helpers.psql
select plan(19);

-- ── Stale sessions ──────────────────────────────────────────────────────────
select tests.create_shop('job-stale') as shop_stale \gset
select tests.create_shop('job-today') as shop_today \gset
select tests.open_session(:'shop_stale', app.shop_today(:'shop_stale') - 2) as stale \gset
select tests.open_session(:'shop_today', app.shop_today(:'shop_today')) as today \gset
select tests.add_ticket(:'stale', '+212656000001') as s_wait \gset
select tests.add_ticket(:'stale', '+212656000002') as s_serv \gset
select tests.set_status(:'s_serv', 'getting_ready'); select tests.set_status(:'s_serv', 'arrived'); select tests.set_status(:'s_serv', 'in_service');
select tests.add_ticket(:'today', '+212656000003') as t_wait \gset

select ok(app.job_finish_stale_sessions() >= 1, 'the stale-session job finishes forgotten queues');
select is((select status::text from public.queue_sessions where id = :'stale'), 'finished', 'a queue from two days ago is finished');
select is((select status::text from public.tickets where id = :'s_wait'), 'expired', 'its waiting customer is expired');
select is((select status::text || '/' || status_reason from public.tickets where id = :'s_serv'), 'completed/auto_closed',
  'a forgotten in-service customer is completed as auto_closed (approved Q-1)');
select is((select status::text from public.queue_sessions where id = :'today'), 'open', 'today''s queue is left alone');
select is((select status::text from public.tickets where id = :'t_wait'), 'waiting', '…and so are its customers');
select is((select count(*)::int from public.queue_events where queue_session_id = :'stale' and event_type = 'queue_closed' and actor_type = 'system'), 1,
  'the automatic close is audited as a system action');
select is(app.job_finish_stale_sessions(), 0, 'running it again changes nothing (idempotent)');

-- ── PII retention ───────────────────────────────────────────────────────────
select tests.create_shop('job-pii') as shop_pii \gset
update public.shop_settings set pii_retention_days = 30 where shop_id = :'shop_pii';
select tests.open_session(:'shop_pii', app.shop_today(:'shop_pii')) as pii_sess \gset
select tests.add_ticket(:'pii_sess', '+212656000010', 'Old Done') as old_done \gset
select tests.add_ticket(:'pii_sess', '+212656000011', 'Recent Done') as recent_done \gset
select tests.add_ticket(:'pii_sess', '+212656000012', 'Old Active') as old_active \gset
select tests.set_status(:'old_done', 'cancelled'); select tests.set_status(:'recent_done', 'cancelled');
update public.tickets set cancelled_at = now() - interval '40 days' where id = :'old_done';
update public.tickets set created_at = now() - interval '40 days' where id in (:'old_done', :'old_active');
insert into public.notifications (shop_id, ticket_id, notification_type, recipient_phone, template_name, template_language)
  values (:'shop_pii', :'old_done', 'ticket_created', '+212656000010', 'queue_ticket_created', 'fr');

select ok(app.job_anonymize() >= 1, 'the retention job anonymises old tickets');
select ok((select customer_name is null and customer_phone is null and anonymized_at is not null from public.tickets where id = :'old_done'),
  'a finished ticket older than the retention period loses name and phone');
select ok((select status = 'cancelled' and cancelled_at is not null and ticket_number = 1 from public.tickets where id = :'old_done'),
  '…while its statistics remain (status, timestamps, number)');
select is((select recipient_phone from public.notifications where ticket_id = :'old_done'), null,
  'its notifications lose the phone number too');
select is((select customer_name from public.tickets where id = :'recent_done'), 'Recent Done', 'recent tickets are kept');
select is((select customer_name from public.tickets where id = :'old_active'), 'Old Active',
  'active tickets are never anonymised (stale queues are closed first)');
select is(app.job_anonymize(), 0, 'running it again changes nothing (idempotent)');

-- ── Housekeeping, schedule, health ──────────────────────────────────────────
insert into public.rate_limits (key, window_start, hits) values ('job-test-key-0123456789', now() - interval '2 days', 3);
-- Separate statements: a subquery in the same statement would still see the row through its snapshot.
select ok(app.job_prune_rate_limits() >= 1, 'the prune job removes old rate-limit windows');
select ok(not exists (select 1 from public.rate_limits where key = 'job-test-key-0123456789'), '…including the test window');
select set_eq($$select jobname from cron.job where jobname like 'saff-%'$$,
  $$values ('saff-whatsapp-sweeper'), ('saff-finish-stale-sessions'), ('saff-anonymize'), ('saff-prune-rate-limits')$$,
  'all SAFF jobs are scheduled');
select ok(public.ops_health() ?& array['outbox', 'queues', 'retention', 'jobs']
          and not has_function_privilege('authenticated', 'public.ops_health()', 'execute'),
  'ops_health reports outbox, queues, retention and jobs — service role only');

select * from finish();
rollback;
