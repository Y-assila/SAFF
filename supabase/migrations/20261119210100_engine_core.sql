-- SAFF M2 · engine core: shared internal helpers used by every queue RPC (RPC-SPEC §1).
-- All live in the private `app` schema; EXECUTE is not granted to anon/authenticated
-- (default privileges from 20261119200700 strip PUBLIC).

-- §1.2 step 1 + §1.3: lock the session row, then authorize against the locked row's shop.
-- Missing session and foreign shop both yield not_authorized (no existence oracle).
create function app.lock_member_session(p_session uuid) returns public.queue_sessions
language plpgsql security definer set search_path = '' as $$
declare v_qs public.queue_sessions;
begin
  select * into v_qs from public.queue_sessions where id = p_session for update;
  if not found or not app.is_shop_member(v_qs.shop_id) then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  return v_qs;
end $$;

-- §1.2 step 2: re-read the ticket after the lock, scoped to that session.
create function app.get_session_ticket(p_session uuid, p_ticket uuid) returns public.tickets
language plpgsql security definer set search_path = '' as $$
declare v_t public.tickets;
begin
  select * into v_t from public.tickets where id = p_ticket and queue_session_id = p_session;
  if not found then
    raise exception 'ticket_not_found' using errcode = 'P0001';
  end if;
  return v_t;
end $$;

-- §1.2 step 3: the transition must exist AND the actor must be listed for it (TD §4.4 `actors`).
-- The table trigger only checks existence; this adds who may perform it.
create function app.assert_transition(p_from public.ticket_status, p_to public.ticket_status, p_actor text)
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.ticket_transitions t
                 where t.from_status = p_from and t.to_status = p_to and p_actor = any (t.actors)) then
    raise exception 'invalid_transition' using errcode = 'P0001',
      detail = p_from::text || ' -> ' || p_to::text;
  end if;
end $$;

-- §1.6: change status and stamp the matching *_at column; earlier stamps are never overwritten.
create function app.apply_status(p_ticket uuid, p_to public.ticket_status, p_reason text default null)
returns void language sql security definer set search_path = '' as $$
  update public.tickets set
    status = p_to,
    status_reason = coalesce(p_reason, status_reason),
    called_at          = case when p_to = 'getting_ready' then coalesce(called_at, now()) else called_at end,
    on_the_way_at      = case when p_to = 'on_the_way'    then coalesce(on_the_way_at, now()) else on_the_way_at end,
    arrived_at         = case when p_to = 'arrived'       then coalesce(arrived_at, now()) else arrived_at end,
    service_started_at = case when p_to = 'in_service'    then coalesce(service_started_at, now()) else service_started_at end,
    completed_at       = case when p_to = 'completed'     then coalesce(completed_at, now()) else completed_at end,
    skipped_at         = case when p_to = 'skipped'       then coalesce(skipped_at, now()) else skipped_at end,
    cancelled_at       = case when p_to = 'cancelled'     then coalesce(cancelled_at, now()) else cancelled_at end,
    expired_at         = case when p_to = 'expired'       then coalesce(expired_at, now()) else expired_at end
  where id = p_ticket;
$$;

-- §1.7: outbox insert, only when WhatsApp is enabled for the shop and the ticket still has a phone.
create function app.enqueue_notification(p_ticket public.tickets, p_type public.notification_type,
  p_dedupe_key text, p_template text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_ticket.customer_phone is null then return; end if;
  if not coalesce((select whatsapp_enabled from public.shop_settings where shop_id = p_ticket.shop_id), false) then
    return;
  end if;
  insert into public.notifications (shop_id, ticket_id, notification_type, dedupe_key,
                                    recipient_phone, template_name, template_language)
  values (p_ticket.shop_id, p_ticket.id, p_type, coalesce(p_dedupe_key, ''),
          p_ticket.customer_phone, p_template, p_ticket.locale)
  on conflict do nothing;
end $$;

-- Shop-local calendar date (TD issue 8: IANA zone, Africa/Casablanca by default).
create function app.shop_today(p_shop uuid) returns date
language sql stable security definer set search_path = '' as $$
  select (now() at time zone s.timezone)::date from public.shops s where s.id = p_shop;
$$;

-- RPC-SPEC §3.4: finish a session. The CALLER must already hold the session lock.
--  * every active ticket except in_service -> expired (actor system), with a queue_closed message;
--  * stale sessions only (p_actor = 'system'): a forgotten in_service ticket -> completed
--    with reason 'auto_closed' (approved Q-1; excluded from service-time averages);
--  * session -> finished, audited, pinged.
create function app.finish_session(p_session uuid, p_actor text, p_closed_by uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare
  v_qs public.queue_sessions;
  t public.tickets;
  v_count int := 0;
begin
  select * into v_qs from public.queue_sessions where id = p_session;

  for t in select * from public.tickets
           where queue_session_id = p_session and status in ('waiting', 'getting_ready', 'on_the_way', 'arrived')
           order by ticket_number loop
    perform app.assert_transition(t.status, 'expired', 'system');
    perform app.apply_status(t.id, 'expired');
    perform app.log_event(v_qs.shop_id, p_session, t.id, 'system', null, 'ticket_expired', t.status::text, 'expired', null);
    perform app.enqueue_notification(t, 'queue_closed', '', 'queue_closed');
    v_count := v_count + 1;
  end loop;

  if p_actor = 'system' then
    for t in select * from public.tickets where queue_session_id = p_session and status = 'in_service' loop
      -- Approved Q-1: completed is the only legal exit from in_service; deliberately bypasses the
      -- actor list (completed is barber-only) because no barber is present for a forgotten queue.
      perform app.apply_status(t.id, 'completed', 'auto_closed');
      perform app.log_event(v_qs.shop_id, p_session, t.id, 'system', null, 'service_auto_completed',
                            'in_service', 'completed', 'auto_closed');
    end loop;
  end if;

  update public.queue_sessions set status = 'finished', closed_at = now(), closed_by = p_closed_by
   where id = p_session;
  perform app.log_event(v_qs.shop_id, p_session, null, p_actor, p_closed_by, 'queue_closed',
                        v_qs.status::text, 'finished', null, jsonb_build_object('expired_count', v_count));
  perform app.bump_session(p_session);
  return v_count;
end $$;

revoke execute on all functions in schema app from public, anon, authenticated;
grant execute on function app.is_shop_member(uuid, public.shop_role[]) to authenticated;
