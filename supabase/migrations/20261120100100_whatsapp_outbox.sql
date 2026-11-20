-- SAFF M5 · WhatsApp outbox processing (TD §4.5, RPC-SPEC §7.6–§8; approved Q-11 retry policy).
-- The queue engine already inserts notifications in the same transaction as each queue change.
-- These functions let the whatsapp-dispatch Edge Function (service role) claim, send and settle them.
-- INVARIANT: nothing here can roll back or block a ticket change — WhatsApp failures stay in the outbox.

create extension if not exists pg_net;   -- async HTTP from the database (sent after commit)
create extension if not exists pg_cron;  -- the minute sweeper

-- ── Claim (with suppression) ──────────────────────────────────────────────────────────────────
-- Returns up to p_limit sendable notifications and marks them 'sending' (attempts + 1).
-- Rows that must not be sent are settled as 'suppressed' with a reason (RPC-SPEC §7.6).
-- FOR UPDATE SKIP LOCKED: concurrent dispatchers never claim the same row.
create function public.claim_notifications(p_limit int default 20) returns setof jsonb
language plpgsql security definer set search_path = '' as $$
declare r record; v_reason text;
begin
  if p_limit is null or p_limit not between 1 and 100 then
    raise exception 'invalid_limit' using errcode = 'P0001';
  end if;

  -- A dispatcher that died mid-send leaves rows in 'sending': release them after 5 minutes.
  update public.notifications set status = 'pending', locked_at = null
   where status = 'sending' and locked_at < now() - interval '5 minutes';

  for r in
    select n.id, n.notification_type, n.dedupe_key, n.recipient_phone, n.template_name, n.template_language,
           n.attempts, t.id as ticket_id, t.ticket_number, t.token_version, t.status as ticket_status,
           t.anonymized_at, s.name as shop_name, ss.whatsapp_enabled, ss.grace_period_minutes
      from public.notifications n
      join public.tickets t on t.id = n.ticket_id
      join public.shops s on s.id = n.shop_id
      join public.shop_settings ss on ss.shop_id = n.shop_id
     where n.status = 'pending' and n.next_attempt_at <= now()
     order by n.next_attempt_at, n.created_at
     limit p_limit
     for update of n skip locked
  loop
    v_reason := case
      when not r.whatsapp_enabled then 'whatsapp_disabled'
      when r.anonymized_at is not null or r.recipient_phone is null then 'no_recipient'
      when r.notification_type = 'turn_approaching'
           and r.ticket_status not in ('getting_ready', 'on_the_way', 'arrived') then 'no_longer_called'
      when r.notification_type = 'link_resent' and r.dedupe_key like 'v%'
           and r.dedupe_key <> 'v' || r.token_version then 'link_superseded'
      else null end;

    if v_reason is not null then
      update public.notifications set status = 'suppressed', error_code = v_reason, locked_at = null where id = r.id;
      continue;
    end if;

    update public.notifications set status = 'sending', locked_at = now(), attempts = attempts + 1 where id = r.id;
    return next jsonb_build_object(
      'id', r.id, 'notification_type', r.notification_type, 'recipient_phone', r.recipient_phone,
      'template_name', r.template_name, 'template_language', r.template_language, 'attempt', r.attempts + 1,
      'ticket_id', r.ticket_id, 'ticket_number', r.ticket_number, 'token_version', r.token_version,
      'shop_name', r.shop_name, 'grace_period_minutes', r.grace_period_minutes);
  end loop;
end $$;

-- ── Settle ───────────────────────────────────────────────────────────────────────────────────
create function public.mark_notification_sent(p_id uuid, p_provider_message_id text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if p_provider_message_id is null or char_length(p_provider_message_id) not between 1 and 200 then
    raise exception 'invalid_provider_message_id' using errcode = 'P0001';
  end if;
  update public.notifications
     set status = 'sent', provider_message_id = p_provider_message_id, sent_at = now(),
         locked_at = null, error_code = null, error_message = null
   where id = p_id and status = 'sending';
  return found;
end $$;

-- Approved Q-11: retryable errors back off 1, 5, 15, 60 minutes; at most 5 attempts; permanent → failed.
create function public.mark_notification_failed(p_id uuid, p_error_code text, p_error_message text, p_retryable boolean)
returns text language plpgsql security definer set search_path = '' as $$
declare v_attempts int; v_message text;
begin
  -- Error text is stored for operators: cap it and redact anything that looks like a phone number.
  v_message := left(regexp_replace(coalesce(p_error_message, ''), '\+?[0-9][0-9 ]{7,}[0-9]', '[redacted]', 'g'), 300);
  select attempts into v_attempts from public.notifications where id = p_id and status = 'sending' for update;
  if not found then return 'not_sending'; end if;

  if coalesce(p_retryable, false) and v_attempts < 5 then
    update public.notifications
       set status = 'pending', locked_at = null, error_code = left(p_error_code, 60), error_message = v_message,
           next_attempt_at = now() + make_interval(mins => (array[1, 5, 15, 60])[v_attempts])
     where id = p_id;
    return 'retry_scheduled';
  end if;

  update public.notifications
     set status = 'failed', locked_at = null, failed_at = now(), error_code = left(p_error_code, 60), error_message = v_message
   where id = p_id;
  return 'failed';
end $$;

-- Delivery receipts from the webhook. Status only moves forward (sent → delivered → read);
-- 'failed' may arrive after sent/delivered. Unknown message ids are ignored (returns false).
create function public.record_whatsapp_status(p_provider_message_id text, p_status text, p_at timestamptz,
  p_error_code text default null) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_current public.notification_status; v_rank int; v_new_rank int;
begin
  if p_status not in ('sent', 'delivered', 'read', 'failed') then return false; end if;
  select status into v_current from public.notifications where provider_message_id = p_provider_message_id for update;
  if not found then return false; end if;

  if p_status = 'failed' then
    if v_current in ('failed', 'read') then return false; end if;
    update public.notifications set status = 'failed', failed_at = coalesce(p_at, now()), error_code = left(p_error_code, 60)
     where provider_message_id = p_provider_message_id;
    return true;
  end if;

  v_rank := case v_current when 'sent' then 1 when 'delivered' then 2 when 'read' then 3 else 0 end;
  v_new_rank := case p_status when 'sent' then 1 when 'delivered' then 2 else 3 end;
  if v_current in ('failed', 'suppressed') or v_new_rank <= v_rank then return false; end if;

  update public.notifications set
    status = p_status::public.notification_status,
    sent_at = coalesce(sent_at, p_at),
    delivered_at = case when p_status in ('delivered', 'read') then coalesce(delivered_at, p_at) else delivered_at end,
    read_at = case when p_status = 'read' then coalesce(read_at, p_at) else read_at end
   where provider_message_id = p_provider_message_id;
  return true;
end $$;

-- ── Waking the dispatcher ────────────────────────────────────────────────────────────────────
-- The dispatch URL and its shared secret live in Supabase Vault (encrypted), never in a table.
-- pg_net queues the request and sends it after commit; any error here is swallowed so that a
-- notification insert — and the queue change it belongs to — can never fail because of WhatsApp.
create function app.kick_whatsapp_dispatch() returns void
language plpgsql security definer set search_path = '' as $$
declare v_url text; v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'saff_dispatch_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'saff_dispatch_secret';
  if v_url is null or v_secret is null then return; end if;  -- not configured: rows wait in the outbox
  perform net.http_post(
    url := v_url,
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_secret),
    timeout_milliseconds := 10000);
exception when others then
  raise warning 'whatsapp dispatch kick failed: %', sqlstate;
end $$;

create function app.notifications_kick_trigger() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform app.kick_whatsapp_dispatch();
  return null;
end $$;

-- One wake-up per statement (CALL NEXT inserts one row; close_queue may insert many).
create trigger notifications_kick_dispatch after insert on public.notifications
  for each statement execute function app.notifications_kick_trigger();

-- Minute sweeper: retries that became due, rows left behind by a failed wake-up, stuck 'sending'.
create function app.whatsapp_sweep() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.notifications
             where (status = 'pending' and next_attempt_at <= now())
                or (status = 'sending' and locked_at < now() - interval '5 minutes')) then
    perform app.kick_whatsapp_dispatch();
  end if;
end $$;

select cron.schedule('saff-whatsapp-sweeper', '* * * * *', 'select app.whatsapp_sweep()');

-- ── Platform-admin configuration (service role only) ─────────────────────────────────────────
create function public.admin_configure_whatsapp_dispatch(p_url text, p_secret text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if p_url is null or p_url !~ '^https?://[^ ]+/functions/v1/whatsapp-dispatch$' then
    raise exception 'invalid_dispatch_url' using errcode = 'P0001';
  end if;
  if p_secret is null or char_length(p_secret) < 32 then
    raise exception 'weak_dispatch_secret' using errcode = 'P0001';
  end if;
  select id into v_id from vault.secrets where name = 'saff_dispatch_url';
  if v_id is null then perform vault.create_secret(p_url, 'saff_dispatch_url', 'SAFF whatsapp-dispatch URL');
  else perform vault.update_secret(v_id, p_url); end if;
  select id into v_id from vault.secrets where name = 'saff_dispatch_secret';
  if v_id is null then perform vault.create_secret(p_secret, 'saff_dispatch_secret', 'SAFF whatsapp-dispatch shared secret');
  else perform vault.update_secret(v_id, p_secret); end if;
end $$;

-- ── Exposure ─────────────────────────────────────────────────────────────────────────────────
revoke execute on function public.claim_notifications(int), public.mark_notification_sent(uuid, text),
  public.mark_notification_failed(uuid, text, text, boolean), public.record_whatsapp_status(text, text, timestamptz, text),
  public.admin_configure_whatsapp_dispatch(text, text)
  from public, anon, authenticated;
grant execute on function public.claim_notifications(int), public.mark_notification_sent(uuid, text),
  public.mark_notification_failed(uuid, text, text, boolean), public.record_whatsapp_status(text, text, timestamptz, text),
  public.admin_configure_whatsapp_dispatch(text, text)
  to service_role;
revoke execute on all functions in schema app from public, anon, authenticated;
grant execute on function app.is_shop_member(uuid, public.shop_role[]) to authenticated;
grant execute on function app.is_valid_timezone(text) to service_role;
