-- SAFF M2 · barber ticket RPCs (RPC-SPEC §4). Granted to `authenticated`.
-- Pattern: lock session -> authorize -> re-read ticket -> validate -> apply + audit + outbox -> bump.

-- §4.1 (TD §6.3 reference implementation, using the shared helpers)
create function public.call_next_customer(p_session_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_qs public.queue_sessions; v_t public.tickets;
begin
  v_qs := app.lock_member_session(p_session_id);
  if v_qs.status = 'finished' then raise exception 'queue_finished' using errcode = 'P0001'; end if;

  if exists (select 1 from public.tickets where queue_session_id = v_qs.id
             and status in ('getting_ready', 'on_the_way', 'arrived')) then
    raise exception 'called_slot_occupied' using errcode = 'P0001';
  end if;

  select * into v_t from public.tickets
   where queue_session_id = v_qs.id and status = 'waiting'
   order by ticket_number limit 1;
  if not found then raise exception 'no_waiting_customers' using errcode = 'P0001'; end if;

  perform app.assert_transition('waiting', 'getting_ready', 'barber');
  perform app.apply_status(v_t.id, 'getting_ready');
  perform app.log_event(v_qs.shop_id, v_qs.id, v_t.id, 'barber', auth.uid(), 'ticket_called', 'waiting', 'getting_ready', null);
  perform app.enqueue_notification(v_t, 'turn_approaching', 'called', 'queue_turn_approaching');
  perform app.bump_session(v_qs.id);
  return jsonb_build_object('result', 'called', 'ticket_id', v_t.id, 'ticket_number', v_t.ticket_number);
end $$;

-- §4.2
create function public.mark_on_the_way(p_session_id uuid, p_ticket_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_qs public.queue_sessions; v_t public.tickets;
begin
  v_qs := app.lock_member_session(p_session_id);
  v_t := app.get_session_ticket(v_qs.id, p_ticket_id);
  if v_t.status = 'on_the_way' then return jsonb_build_object('result', 'already_on_the_way'); end if;
  perform app.assert_transition(v_t.status, 'on_the_way', 'barber');
  perform app.apply_status(v_t.id, 'on_the_way');
  perform app.log_event(v_qs.shop_id, v_qs.id, v_t.id, 'barber', auth.uid(), 'ticket_on_the_way', v_t.status::text, 'on_the_way', null);
  perform app.bump_session(v_qs.id);
  return jsonb_build_object('result', 'on_the_way');
end $$;

-- §4.3
create function public.mark_arrived(p_session_id uuid, p_ticket_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_qs public.queue_sessions; v_t public.tickets;
begin
  v_qs := app.lock_member_session(p_session_id);
  v_t := app.get_session_ticket(v_qs.id, p_ticket_id);
  if v_t.status = 'arrived' then return jsonb_build_object('result', 'already_arrived'); end if;
  perform app.assert_transition(v_t.status, 'arrived', 'barber');
  perform app.apply_status(v_t.id, 'arrived');
  perform app.log_event(v_qs.shop_id, v_qs.id, v_t.id, 'barber', auth.uid(), 'ticket_arrived', v_t.status::text, 'arrived', null);
  perform app.bump_session(v_qs.id);
  return jsonb_build_object('result', 'arrived');
end $$;

-- §4.4
create function public.start_service(p_session_id uuid, p_ticket_id uuid, p_skip_arrival boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_qs public.queue_sessions; v_t public.tickets;
begin
  v_qs := app.lock_member_session(p_session_id);
  v_t := app.get_session_ticket(v_qs.id, p_ticket_id);
  if v_t.status = 'in_service' then return jsonb_build_object('result', 'already_in_service'); end if;
  if exists (select 1 from public.tickets where queue_session_id = v_qs.id and status = 'in_service') then
    raise exception 'service_in_progress' using errcode = 'P0001';
  end if;
  -- Without the flag only arrived customers start; the flag adds getting_ready/on_the_way (TD issue 2).
  -- A waiting ticket can never start: there is no waiting -> in_service transition (FIFO).
  if v_t.status <> 'arrived' and not (coalesce(p_skip_arrival, false) and v_t.status in ('getting_ready', 'on_the_way')) then
    raise exception 'invalid_transition' using errcode = 'P0001', detail = v_t.status::text || ' -> in_service';
  end if;
  perform app.assert_transition(v_t.status, 'in_service', 'barber');
  perform app.apply_status(v_t.id, 'in_service');
  perform app.log_event(v_qs.shop_id, v_qs.id, v_t.id, 'barber', auth.uid(), 'service_started', v_t.status::text, 'in_service', null,
                        jsonb_build_object('skip_arrival', v_t.status <> 'arrived'));
  perform app.bump_session(v_qs.id);
  return jsonb_build_object('result', 'started', 'ticket_id', v_t.id);
end $$;

-- §4.5 (TD §6.3 reference implementation)
create function public.complete_service(p_session_id uuid, p_ticket_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_qs public.queue_sessions; v_t public.tickets;
begin
  v_qs := app.lock_member_session(p_session_id);
  v_t := app.get_session_ticket(v_qs.id, p_ticket_id);
  if v_t.status = 'completed' then return jsonb_build_object('result', 'already_completed'); end if;
  perform app.assert_transition(v_t.status, 'completed', 'barber');
  perform app.apply_status(v_t.id, 'completed'); -- nothing else is touched
  perform app.log_event(v_qs.shop_id, v_qs.id, v_t.id, 'barber', auth.uid(), 'service_completed', 'in_service', 'completed', null);
  perform app.bump_session(v_qs.id);
  return jsonb_build_object('result', 'completed', 'ticket_id', v_t.id);
end $$;

-- §4.6 (TD issue 11; approved Q-3: grace applies to every reason except barber_override;
-- approved Q-4: no free-text notes)
create function public.skip_ticket(p_session_id uuid, p_ticket_id uuid, p_reason public.skip_reason)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_qs public.queue_sessions; v_t public.tickets; v_grace int;
begin
  v_qs := app.lock_member_session(p_session_id);
  v_t := app.get_session_ticket(v_qs.id, p_ticket_id);
  if v_t.status = 'skipped' then return jsonb_build_object('result', 'already_skipped'); end if;
  if p_reason is null then raise exception 'invalid_skip_reason' using errcode = 'P0001'; end if;
  perform app.assert_transition(v_t.status, 'skipped', 'barber'); -- rejects in_service and terminal states

  if v_t.status = 'waiting' then
    -- Never called, so there is no grace period to have run out.
    if p_reason = 'no_show_after_grace' then
      raise exception 'invalid_skip_reason' using errcode = 'P0001';
    end if;
  elsif p_reason <> 'barber_override' then
    select grace_period_minutes into v_grace from public.shop_settings where shop_id = v_qs.shop_id;
    if v_t.called_at is null or now() < v_t.called_at + make_interval(mins => v_grace) then
      raise exception 'grace_not_elapsed' using errcode = 'P0001';
    end if;
  end if;

  perform app.apply_status(v_t.id, 'skipped', p_reason::text);
  perform app.log_event(v_qs.shop_id, v_qs.id, v_t.id, 'barber', auth.uid(), 'ticket_skipped', v_t.status::text, 'skipped', p_reason::text);
  perform app.bump_session(v_qs.id);
  return jsonb_build_object('result', 'skipped');
end $$;

-- §4.7
create function public.barber_cancel_ticket(p_session_id uuid, p_ticket_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_qs public.queue_sessions; v_t public.tickets;
begin
  v_qs := app.lock_member_session(p_session_id);
  v_t := app.get_session_ticket(v_qs.id, p_ticket_id);
  if v_t.status = 'cancelled' then return jsonb_build_object('result', 'already_cancelled'); end if;
  perform app.assert_transition(v_t.status, 'cancelled', 'barber');
  perform app.apply_status(v_t.id, 'cancelled', 'barber');
  perform app.log_event(v_qs.shop_id, v_qs.id, v_t.id, 'barber', auth.uid(), 'ticket_cancelled', v_t.status::text, 'cancelled', 'barber');
  perform app.bump_session(v_qs.id);
  return jsonb_build_object('result', 'cancelled');
end $$;

-- §4.8 (TD issue 9; approved Q-5: active tickets + 24 h after they end; 30 reveals per barber per hour)
create function public.reveal_phone(p_ticket_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_t public.tickets; v_ended timestamptz;
begin
  select * into v_t from public.tickets where id = p_ticket_id;
  if not found or not app.is_shop_member(v_t.shop_id) then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  v_ended := coalesce(v_t.completed_at, v_t.skipped_at, v_t.cancelled_at, v_t.expired_at);
  if v_t.anonymized_at is not null or v_t.customer_phone is null
     or (v_ended is not null and v_ended < now() - interval '24 hours') then
    return jsonb_build_object('result', 'unavailable');
  end if;
  if (select count(*) from public.queue_events
       where actor_user_id = auth.uid() and event_type = 'phone_revealed'
         and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  -- Audited before disclosure (same transaction).
  perform app.log_event(v_t.shop_id, v_t.queue_session_id, v_t.id, 'barber', auth.uid(), 'phone_revealed', null, null, null);
  return jsonb_build_object('result', 'ok', 'phone', v_t.customer_phone);
end $$;

-- §4.9 (TD §7)
create function public.reissue_ticket_link(p_session_id uuid, p_ticket_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_qs public.queue_sessions; v_t public.tickets;
begin
  v_qs := app.lock_member_session(p_session_id);
  v_t := app.get_session_ticket(v_qs.id, p_ticket_id);
  if v_t.status not in ('waiting', 'getting_ready', 'on_the_way', 'arrived', 'in_service') then
    raise exception 'invalid_transition' using errcode = 'P0001', detail = v_t.status::text || ' (inactive)';
  end if;
  update public.tickets set token_version = token_version + 1 where id = v_t.id returning * into v_t;
  perform app.log_event(v_qs.shop_id, v_qs.id, v_t.id, 'barber', auth.uid(), 'link_reissued', null, null, null,
                        jsonb_build_object('token_version', v_t.token_version));
  perform app.enqueue_notification(v_t, 'link_resent', 'v' || v_t.token_version, 'queue_ticket_created');
  perform app.bump_session(v_qs.id);
  return jsonb_build_object('result', 'reissued');
end $$;

revoke execute on function
  public.call_next_customer(uuid), public.mark_on_the_way(uuid, uuid), public.mark_arrived(uuid, uuid),
  public.start_service(uuid, uuid, boolean), public.complete_service(uuid, uuid),
  public.skip_ticket(uuid, uuid, public.skip_reason), public.barber_cancel_ticket(uuid, uuid),
  public.reveal_phone(uuid), public.reissue_ticket_link(uuid, uuid)
  from public, anon;
grant execute on function
  public.call_next_customer(uuid), public.mark_on_the_way(uuid, uuid), public.mark_arrived(uuid, uuid),
  public.start_service(uuid, uuid, boolean), public.complete_service(uuid, uuid),
  public.skip_ticket(uuid, uuid, public.skip_reason), public.barber_cancel_ticket(uuid, uuid),
  public.reveal_phone(uuid), public.reissue_ticket_link(uuid, uuid)
  to authenticated;
