-- SAFF M6 · scheduled jobs (RPC-SPEC §8; approved Q-12) and an operations health check.
-- Jobs are idempotent, use the same session lock as the queue RPCs, and are scheduled off the hour.

-- ── Stale sessions (TD issue 8) ──────────────────────────────────────────────────────────────
-- A queue left open finishes at 04:00 shop-local time on the day after its queue_date (approved Q-12):
-- waiting/called tickets → expired (+ queue_closed message), a forgotten in_service → completed(auto_closed).
create function app.job_finish_stale_sessions() returns int
language plpgsql security definer set search_path = '' as $$
declare r record; v_count int := 0;
begin
  for r in
    select qs.id from public.queue_sessions qs join public.shops s on s.id = qs.shop_id
     where qs.status in ('open', 'paused')
       and (now() at time zone s.timezone) >= (qs.queue_date + 1) + time '04:00'
  loop
    -- Same lock as every queue RPC; skip a session someone is acting on right now (next run retries).
    perform 1 from public.queue_sessions where id = r.id and status in ('open', 'paused') for update skip locked;
    if found then
      perform app.finish_session(r.id, 'system', null);
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end $$;

-- ── PII retention (TD issue 9, Law 09-08 data minimisation) ─────────────────────────────────
-- Terminal tickets older than the shop's pii_retention_days lose name and phone; statistics remain
-- (status, timestamps, ticket numbers). Pending messages for them are suppressed by claim_notifications.
create function app.job_anonymize(p_batch int default 1000) returns int
language plpgsql security definer set search_path = '' as $$
declare v_total int := 0; v_ids uuid[];
begin
  loop
    select array_agg(id) into v_ids from (
      select t.id from public.tickets t
        join public.shop_settings ss on ss.shop_id = t.shop_id
       where t.anonymized_at is null
         and t.status in ('completed', 'skipped', 'cancelled', 'expired')
         and t.created_at < now() - make_interval(days => ss.pii_retention_days)
       limit p_batch
       for update of t skip locked) v;
    exit when v_ids is null;
    update public.tickets set customer_name = null, customer_phone = null, anonymized_at = now() where id = any (v_ids);
    update public.notifications set recipient_phone = null where ticket_id = any (v_ids);
    v_total := v_total + cardinality(v_ids);
    exit when cardinality(v_ids) < p_batch;
  end loop;
  return v_total;
end $$;

-- ── Rate-limit housekeeping ─────────────────────────────────────────────────────────────────
create function app.job_prune_rate_limits() returns int
language plpgsql security definer set search_path = '' as $$
declare v_count int;
begin
  delete from public.rate_limits where window_start < now() - interval '1 day';
  get diagnostics v_count = row_count;
  return v_count;
end $$;

select cron.schedule('saff-finish-stale-sessions', '7 * * * *', 'select app.job_finish_stale_sessions()');
select cron.schedule('saff-anonymize', '17 3 * * *', 'select app.job_anonymize()');
select cron.schedule('saff-prune-rate-limits', '27 * * * *', 'select app.job_prune_rate_limits()');

-- ── Operations health (service role only) ───────────────────────────────────────────────────
-- One call answers "is anything stuck?" for monitoring and the runbook (docs/OPERATIONS.md).
-- Counts only: no names, phone numbers or ticket links.
create function public.ops_health() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v jsonb;
begin
  select jsonb_build_object(
    'checked_at', now(),
    'outbox', jsonb_build_object(
      'pending_overdue', (select count(*) from public.notifications where status = 'pending' and next_attempt_at < now() - interval '5 minutes'),
      'sending_stuck',   (select count(*) from public.notifications where status = 'sending' and locked_at < now() - interval '5 minutes'),
      'sent_24h',        (select count(*) from public.notifications where sent_at > now() - interval '24 hours'),
      'failed_24h',      (select count(*) from public.notifications where failed_at > now() - interval '24 hours'),
      'dispatch_configured', (select count(*) = 2 from vault.secrets where name in ('saff_dispatch_url', 'saff_dispatch_secret'))),
    'queues', jsonb_build_object(
      'live',  (select count(*) from public.queue_sessions where status in ('open', 'paused')),
      'stale', (select count(*) from public.queue_sessions qs join public.shops s on s.id = qs.shop_id
                 where qs.status in ('open', 'paused') and (now() at time zone s.timezone) >= (qs.queue_date + 1) + time '04:00')),
    'retention', jsonb_build_object(
      'overdue_anonymisation', (select count(*) from public.tickets t join public.shop_settings ss on ss.shop_id = t.shop_id
                                 where t.anonymized_at is null and t.status in ('completed', 'skipped', 'cancelled', 'expired')
                                   and t.created_at < now() - make_interval(days => ss.pii_retention_days + 1))),
    'jobs', coalesce((select jsonb_object_agg(j.jobname, jsonb_build_object(
               'schedule', j.schedule, 'active', j.active,
               'last_status', (select d.status from cron.job_run_details d where d.jobid = j.jobid order by d.start_time desc limit 1),
               'last_run', (select d.start_time from cron.job_run_details d where d.jobid = j.jobid order by d.start_time desc limit 1),
               'failures_24h', (select count(*) from cron.job_run_details d where d.jobid = j.jobid and d.status = 'failed'
                                  and d.start_time > now() - interval '24 hours')))
             from cron.job j where j.jobname like 'saff-%'), '{}'::jsonb)
  ) into v;
  return v;
end $$;

revoke execute on function public.ops_health() from public, anon, authenticated;
grant execute on function public.ops_health() to service_role;
revoke execute on all functions in schema app from public, anon, authenticated;
grant execute on function app.is_shop_member(uuid, public.shop_role[]) to authenticated;
grant execute on function app.is_valid_timezone(text) to service_role;
