-- SAFF M2 · customer RPCs (RPC-SPEC §5, service_role only) and read RPCs (§6).

-- ───────────────────────────── Wait estimate (§6.3, TD §6.2) ─────────────────────────────
-- p_ahead = waiting + called tickets ahead (the in-service customer is counted by remaining time).
create function app.estimate_wait(p_session uuid, p_ahead int) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_qs public.queue_sessions;
  v_avg numeric;
  v_remaining numeric := 0;
  v_started timestamptz;
  v_total numeric;
begin
  select * into v_qs from public.queue_sessions where id = p_session;
  if not found or v_qs.status <> 'open' then
    return jsonb_build_object('available', false);  -- paused or not live: "currently unavailable"
  end if;

  select avg(extract(epoch from d) / 60) into v_avg from (
    select completed_at - service_started_at as d from public.tickets
     where shop_id = v_qs.shop_id and status = 'completed'
       and coalesce(status_reason, '') <> 'auto_closed'
       and service_started_at is not null
       and completed_at > now() - interval '30 days'
       and completed_at - service_started_at between interval '3 minutes' and interval '120 minutes'
     order by completed_at desc limit 30) s;
  if v_avg is null then
    select default_service_minutes into v_avg from public.shop_settings where shop_id = v_qs.shop_id;
  end if;

  select service_started_at into v_started from public.tickets
   where queue_session_id = p_session and status = 'in_service';
  if v_started is not null then
    v_remaining := greatest(0, v_avg - extract(epoch from now() - v_started) / 60);
  end if;

  v_total := greatest(0, coalesce(p_ahead, 0)) * v_avg + v_remaining;
  return jsonb_build_object('available', true, 'minutes', (round(v_total / 5) * 5)::int);
end $$;

-- ───────────────────────────── Customer token context (§5) ─────────────────────────────
-- Resolves a ticket for a customer whose token the Edge Function has verified.
-- Every failure is the same 'not_found' (generic 404 at the edge).
-- With p_lock, follows §1.2: read session id unlocked, lock session, re-read ticket.
create function app.customer_ticket(p_ticket uuid, p_token_version int, p_lock boolean)
returns public.tickets language plpgsql security definer set search_path = '' as $$
declare v_session uuid; v_t public.tickets; v_qs public.queue_sessions;
begin
  select queue_session_id into v_session from public.tickets where id = p_ticket;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  if p_lock then
    select * into v_qs from public.queue_sessions where id = v_session for update;
  else
    select * into v_qs from public.queue_sessions where id = v_session;
  end if;
  select * into v_t from public.tickets where id = p_ticket;
  if v_t.token_version is distinct from p_token_version
     or v_t.anonymized_at is not null
     or not (v_qs.status in ('open', 'paused') or v_qs.closed_at > now() - interval '24 hours') then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  return v_t;
end $$;

-- ───────────────────────────── §5.1 join_queue (TD §6.3) ─────────────────────────────
create function public.join_queue(
  p_shop_slug text, p_name text, p_phone_e164 text, p_locale text,
  p_consent boolean, p_consent_text_version text, p_client_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_shop public.shops; v_cfg public.shop_settings; v_qs public.queue_sessions;
  v_t public.tickets; v_active int; v_num int;
begin
  if p_consent is not true then raise exception 'consent_required' using errcode = 'P0001'; end if;
  if char_length(btrim(coalesce(p_name, ''))) not between 1 and 60 or p_name ~ '[[:cntrl:]]' then
    raise exception 'invalid_name' using errcode = 'P0001';
  end if;
  if p_phone_e164 is null or p_phone_e164 !~ '^[+][1-9][0-9]{7,14}$' then
    raise exception 'invalid_phone' using errcode = 'P0001';
  end if;
  if char_length(coalesce(p_consent_text_version, '')) not between 1 and 40 then
    raise exception 'consent_required' using errcode = 'P0001';
  end if;
  if p_client_request_id is null then raise exception 'invalid_request' using errcode = 'P0001'; end if;
  if p_locale is null or p_locale not in ('fr', 'ar', 'en') then p_locale := 'fr'; end if;

  select * into v_shop from public.shops where slug = lower(p_shop_slug) and is_active;
  if not found then raise exception 'shop_not_found' using errcode = 'P0001'; end if;
  select * into v_cfg from public.shop_settings where shop_id = v_shop.id;

  -- THE LOCK: all joins and transitions of this queue are serialized here
  select * into v_qs from public.queue_sessions
   where shop_id = v_shop.id and status in ('open', 'paused') for update;
  if not found then raise exception 'queue_closed' using errcode = 'P0001'; end if;

  -- idempotent replay of the same submission (checked before 'paused' so a retry still succeeds)
  select * into v_t from public.tickets
   where queue_session_id = v_qs.id and client_request_id = p_client_request_id;
  if found then
    return jsonb_build_object('result', 'created', 'replayed', true, 'ticket_id', v_t.id,
                              'ticket_number', v_t.ticket_number, 'token_version', v_t.token_version);
  end if;

  if v_qs.status = 'paused' then raise exception 'queue_paused' using errcode = 'P0001'; end if;

  -- duplicate active ticket for this phone at this shop: resend the link at most once per 10 minutes
  select * into v_t from public.tickets
   where shop_id = v_shop.id and customer_phone = p_phone_e164
     and status in ('waiting', 'getting_ready', 'on_the_way', 'arrived', 'in_service');
  if found then
    perform app.enqueue_notification(v_t, 'link_resent', floor(extract(epoch from now()) / 600)::text, 'queue_ticket_created');
    return jsonb_build_object('result', 'existing'); -- no id, number or name (TD §7, approved Q-10)
  end if;

  select count(*) into v_active from public.tickets
   where queue_session_id = v_qs.id and status in ('waiting', 'getting_ready', 'on_the_way', 'arrived', 'in_service');
  if v_active >= v_cfg.max_active_tickets then raise exception 'queue_full' using errcode = 'P0001'; end if;

  update public.queue_sessions set last_ticket_number = last_ticket_number + 1
   where id = v_qs.id returning last_ticket_number into v_num;

  insert into public.tickets (shop_id, queue_session_id, ticket_number, customer_name, customer_phone, locale,
                              client_request_id, whatsapp_consent, consent_at, consent_text_version)
  values (v_shop.id, v_qs.id, v_num, btrim(p_name), p_phone_e164, p_locale,
          p_client_request_id, true, now(), p_consent_text_version)
  returning * into v_t;

  perform app.log_event(v_shop.id, v_qs.id, v_t.id, 'customer', null, 'ticket_joined', null, 'waiting', null,
                        jsonb_build_object('ticket_number', v_num));
  perform app.enqueue_notification(v_t, 'ticket_created', '', 'queue_ticket_created');
  perform app.bump_session(v_qs.id);

  return jsonb_build_object('result', 'created', 'ticket_id', v_t.id, 'ticket_number', v_num,
                            'token_version', v_t.token_version);
end $$;

-- ───────────────────────────── §5.2 / §5.3 customer actions ─────────────────────────────
create function public.customer_confirm_on_the_way(p_ticket_id uuid, p_token_version int)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_t public.tickets;
begin
  v_t := app.customer_ticket(p_ticket_id, p_token_version, true);
  if v_t.status = 'on_the_way' then return jsonb_build_object('result', 'already_on_the_way'); end if;
  if v_t.status <> 'getting_ready' then
    raise exception 'invalid_transition' using errcode = 'P0001', detail = v_t.status::text || ' -> on_the_way';
  end if;
  perform app.assert_transition(v_t.status, 'on_the_way', 'customer');
  perform app.apply_status(v_t.id, 'on_the_way');
  perform app.log_event(v_t.shop_id, v_t.queue_session_id, v_t.id, 'customer', null, 'ticket_on_the_way', 'getting_ready', 'on_the_way', null);
  perform app.bump_session(v_t.queue_session_id);
  return jsonb_build_object('result', 'on_the_way');
end $$;

create function public.customer_cancel_ticket(p_ticket_id uuid, p_token_version int)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_t public.tickets;
begin
  v_t := app.customer_ticket(p_ticket_id, p_token_version, true);
  if v_t.status = 'cancelled' then return jsonb_build_object('result', 'already_cancelled'); end if;
  perform app.assert_transition(v_t.status, 'cancelled', 'customer');
  perform app.apply_status(v_t.id, 'cancelled', 'customer');
  perform app.log_event(v_t.shop_id, v_t.queue_session_id, v_t.id, 'customer', null, 'ticket_cancelled', v_t.status::text, 'cancelled', 'customer');
  perform app.bump_session(v_t.queue_session_id);
  return jsonb_build_object('result', 'cancelled');
end $$;

-- ───────────────────────────── §5.4 customer ticket view ─────────────────────────────
-- Exactly the fields TD §7 allows: never another customer's name or phone, never the own phone.
create function public.customer_get_ticket(p_ticket_id uuid, p_token_version int)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_t public.tickets; v_qs public.queue_sessions; v_shop public.shops; v_cfg public.shop_settings;
  v_ahead int := 0; v_ahead_queue int := 0; v_serving int; v_estimate jsonb := null;
begin
  v_t := app.customer_ticket(p_ticket_id, p_token_version, false);
  select * into v_qs from public.queue_sessions where id = v_t.queue_session_id;
  select * into v_shop from public.shops where id = v_t.shop_id;
  select * into v_cfg from public.shop_settings where shop_id = v_t.shop_id;

  select ticket_number into v_serving from public.tickets
   where queue_session_id = v_qs.id and status = 'in_service';

  if v_t.status in ('waiting', 'getting_ready', 'on_the_way', 'arrived', 'in_service') then
    select count(*) filter (where status in ('waiting', 'getting_ready', 'on_the_way', 'arrived', 'in_service')),
           count(*) filter (where status in ('waiting', 'getting_ready', 'on_the_way', 'arrived'))
      into v_ahead, v_ahead_queue
      from public.tickets
     where queue_session_id = v_qs.id and ticket_number < v_t.ticket_number;
  end if;
  -- An estimate is only meaningful while still waiting; called/in-service customers are "now".
  if v_t.status = 'waiting' then
    v_estimate := app.estimate_wait(v_qs.id, v_ahead_queue);
  end if;

  return jsonb_build_object(
    'ticket_number', v_t.ticket_number,
    'customer_name', v_t.customer_name,
    'status', v_t.status,
    'people_ahead', v_ahead,
    'estimate', v_estimate,
    'now_serving_number', v_serving,
    'shop', jsonb_build_object('name', v_shop.name, 'address', v_shop.address,
                               'logo_url', v_shop.logo_url, 'timezone', v_shop.timezone),
    'queue_status', v_qs.status,
    'session_id', v_qs.id,
    'version', v_qs.version,
    'locale', v_t.locale,
    'called_at', v_t.called_at,
    'grace_period_minutes', v_cfg.grace_period_minutes);  -- approved Q-6 (arrival countdown)
end $$;

-- ───────────────────────────── §6.1 public shop info (anon) ─────────────────────────────
create function public.public_get_shop(p_slug text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_shop public.shops; v_qs public.queue_sessions; v_count int := 0;
begin
  select * into v_shop from public.shops where slug = lower(p_slug) and is_active;
  if not found then return jsonb_build_object('result', 'not_found'); end if;

  select * into v_qs from public.queue_sessions where shop_id = v_shop.id and status in ('open', 'paused');
  if found then
    -- approved Q-7: exact count of waiting + called, displayed as "about N"
    select count(*) into v_count from public.tickets
     where queue_session_id = v_qs.id and status in ('waiting', 'getting_ready', 'on_the_way', 'arrived');
  end if;

  return jsonb_build_object(
    'result', 'ok',
    'name', v_shop.name, 'logo_url', v_shop.logo_url, 'address', v_shop.address,
    'default_locale', v_shop.default_locale,
    'status', coalesce(v_qs.status::text, 'closed'),
    'waiting_count', v_count,
    'session_id', v_qs.id,
    'version', v_qs.version);
end $$;

-- ───────────────────────────── §6.2 dashboard stats (barber) ─────────────────────────────
create function public.get_queue_stats(p_session_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_qs public.queue_sessions; v_counts jsonb; v_queue int;
begin
  select * into v_qs from public.queue_sessions where id = p_session_id;
  if not found or not app.is_shop_member(v_qs.shop_id) then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  select coalesce(jsonb_object_agg(status, n), '{}'::jsonb) into v_counts
    from (select status, count(*) n from public.tickets where queue_session_id = v_qs.id group by status) s;
  select count(*) into v_queue from public.tickets
   where queue_session_id = v_qs.id and status in ('waiting', 'getting_ready', 'on_the_way', 'arrived');
  return jsonb_build_object('status', v_qs.status, 'counts', v_counts,
                            'next_join_estimate', app.estimate_wait(v_qs.id, v_queue));
end $$;

-- ───────────────────────────── Exposure (RPC-SPEC §2) ─────────────────────────────
revoke execute on all functions in schema app from public, anon, authenticated;
grant execute on function app.is_shop_member(uuid, public.shop_role[]) to authenticated;

revoke execute on function public.join_queue(text, text, text, text, boolean, text, uuid),
  public.customer_confirm_on_the_way(uuid, int), public.customer_cancel_ticket(uuid, int),
  public.customer_get_ticket(uuid, int) from public, anon, authenticated;
grant execute on function public.join_queue(text, text, text, text, boolean, text, uuid),
  public.customer_confirm_on_the_way(uuid, int), public.customer_cancel_ticket(uuid, int),
  public.customer_get_ticket(uuid, int) to service_role;

revoke execute on function public.public_get_shop(text) from public;
grant execute on function public.public_get_shop(text) to anon, authenticated;

revoke execute on function public.get_queue_stats(uuid) from public, anon;
grant execute on function public.get_queue_stats(uuid) to authenticated;
