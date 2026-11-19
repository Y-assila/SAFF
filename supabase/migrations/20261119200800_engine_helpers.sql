-- SAFF M1 · step 8 · shared queue-engine helpers (TD §4.5). Internal: called by RPCs only.

-- Called at the end of every mutating RPC, inside the same transaction.
create function app.bump_session(p_session uuid) returns bigint
language plpgsql security definer set search_path = '' as $$
declare v bigint;
begin
  update public.queue_sessions set version = version + 1 where id = p_session returning version into v;
  if v is null then
    raise exception 'session_not_found' using errcode = 'P0001';
  end if;
  -- Broadcast payload carries only a version number, no personal data.
  perform realtime.send(jsonb_build_object('v', v), 'queue_changed', 'qs:' || p_session::text, false);
  return v;
end $$;

create function app.log_event(p_shop uuid, p_session uuid, p_ticket uuid, p_actor_type text,
  p_actor uuid, p_event text, p_old text, p_new text, p_reason text, p_meta jsonb default '{}')
returns void language sql security definer set search_path = '' as $$
  insert into public.queue_events (shop_id, queue_session_id, ticket_id, actor_type, actor_user_id,
    event_type, old_status, new_status, reason, metadata)
  values (p_shop, p_session, p_ticket, p_actor_type, p_actor, p_event, p_old, p_new, p_reason, p_meta);
$$;

-- Defence in depth: default privileges already strip PUBLIC; be explicit for these two.
revoke execute on function app.bump_session(uuid) from public, anon, authenticated;
revoke execute on function app.log_event(uuid, uuid, uuid, text, uuid, text, text, text, text, jsonb)
  from public, anon, authenticated;
