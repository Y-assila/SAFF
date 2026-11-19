-- SAFF M2 · queue lifecycle RPCs (RPC-SPEC §3). Barber-facing; granted to `authenticated`.
-- Session states: open <-> paused, open|paused -> finished, finished -> open (same date).

-- §3.1
create function public.start_queue(p_shop_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_today date;
  v_live public.queue_sessions;
  v_id uuid;
begin
  if p_shop_id is null or not app.is_shop_member(p_shop_id) then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  -- No session row exists yet: serialize starts on the shop row.
  perform 1 from public.shops where id = p_shop_id and is_active for update;
  if not found then
    raise exception 'shop_not_found' using errcode = 'P0001';
  end if;

  v_today := app.shop_today(p_shop_id);

  select * into v_live from public.queue_sessions
   where shop_id = p_shop_id and status in ('open', 'paused') for update;
  if found then
    if v_live.queue_date = v_today then
      return jsonb_build_object('result', 'already_started', 'session_id', v_live.id);
    end if;
    perform app.finish_session(v_live.id, 'system', null); -- stale session from an earlier day
  end if;

  if exists (select 1 from public.queue_sessions where shop_id = p_shop_id and queue_date = v_today) then
    raise exception 'queue_closed_today' using errcode = 'P0001', hint = 'reopen_queue';
  end if;

  insert into public.queue_sessions (shop_id, queue_date, status, started_by)
  values (p_shop_id, v_today, 'open', auth.uid())
  returning id into v_id;
  perform app.log_event(p_shop_id, v_id, null, 'barber', auth.uid(), 'queue_started', null, 'open', null);
  perform app.bump_session(v_id);
  return jsonb_build_object('result', 'started', 'session_id', v_id);
end $$;

-- §3.2
create function public.pause_queue(p_session_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_qs public.queue_sessions;
begin
  v_qs := app.lock_member_session(p_session_id);
  if v_qs.status = 'finished' then raise exception 'queue_finished' using errcode = 'P0001'; end if;
  if v_qs.status = 'paused' then return jsonb_build_object('result', 'already_paused'); end if;
  update public.queue_sessions set status = 'paused' where id = v_qs.id;
  perform app.log_event(v_qs.shop_id, v_qs.id, null, 'barber', auth.uid(), 'queue_paused', 'open', 'paused', null);
  perform app.bump_session(v_qs.id);
  return jsonb_build_object('result', 'paused');
end $$;

create function public.resume_queue(p_session_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_qs public.queue_sessions;
begin
  v_qs := app.lock_member_session(p_session_id);
  if v_qs.status = 'finished' then raise exception 'queue_finished' using errcode = 'P0001'; end if;
  if v_qs.status = 'open' then return jsonb_build_object('result', 'already_open'); end if;
  update public.queue_sessions set status = 'open' where id = v_qs.id;
  perform app.log_event(v_qs.shop_id, v_qs.id, null, 'barber', auth.uid(), 'queue_resumed', 'paused', 'open', null);
  perform app.bump_session(v_qs.id);
  return jsonb_build_object('result', 'resumed');
end $$;

-- §3.3
create function public.close_queue(p_session_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_qs public.queue_sessions; v_count int;
begin
  v_qs := app.lock_member_session(p_session_id);
  if v_qs.status = 'finished' then return jsonb_build_object('result', 'already_closed'); end if;
  if exists (select 1 from public.tickets where queue_session_id = v_qs.id and status = 'in_service') then
    raise exception 'service_in_progress' using errcode = 'P0001';
  end if;
  v_count := app.finish_session(v_qs.id, 'barber', auth.uid());
  return jsonb_build_object('result', 'closed', 'expired_count', v_count);
end $$;

-- §3.5
create function public.reopen_queue(p_session_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_qs public.queue_sessions;
begin
  v_qs := app.lock_member_session(p_session_id);
  if v_qs.status <> 'finished' or v_qs.queue_date <> app.shop_today(v_qs.shop_id) then
    raise exception 'reopen_not_allowed' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.queue_sessions
             where shop_id = v_qs.shop_id and status in ('open', 'paused') and id <> v_qs.id) then
    raise exception 'queue_already_started' using errcode = 'P0001';
  end if;
  update public.queue_sessions set status = 'open', closed_at = null, closed_by = null where id = v_qs.id;
  -- Expired tickets stay expired (terminal); numbering continues; no notification (approved Q-2).
  perform app.log_event(v_qs.shop_id, v_qs.id, null, 'barber', auth.uid(), 'queue_reopened', 'finished', 'open', null,
                        jsonb_build_object('closed_at_was', v_qs.closed_at));
  perform app.bump_session(v_qs.id);
  return jsonb_build_object('result', 'reopened');
end $$;

revoke execute on function public.start_queue(uuid), public.pause_queue(uuid), public.resume_queue(uuid),
  public.close_queue(uuid), public.reopen_queue(uuid) from public, anon;
grant execute on function public.start_queue(uuid), public.pause_queue(uuid), public.resume_queue(uuid),
  public.close_queue(uuid), public.reopen_queue(uuid) to authenticated;
