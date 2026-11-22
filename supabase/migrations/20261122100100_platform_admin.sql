-- SAFF · SAFF team admin console (decision D-17, approved 22 Nov 2026).
--
-- Who:     users listed in public.platform_admins (bootstrap: one SQL insert, docs/OPERATIONS.md).
-- How:     every admin RPC checks app.is_platform_admin(): listed AND signed in with two-factor
--          (JWT claim aal = 'aal2'). Being a shop owner gives no admin access.
-- Privacy: admins see shops, member emails and counts. Never customer names or phone numbers.
-- Trace:   every admin change writes public.admin_audit_log, which nobody can edit or delete
--          through the API (append-only, even for the service role).
-- Accounts: creating auth users needs the Auth admin API, so that part lives in the
--          `admin-users` Edge Function. It authorizes the caller with public.admin_assert()
--          (run with the caller's own JWT) and then uses the service-role-only helpers below.

create table public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.platform_admins enable row level security; -- no policies: definer functions only
revoke all on public.platform_admins from anon, authenticated, service_role;

create table public.admin_audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null check (action ~ '^[a-z_]{3,40}$'),
  shop_id uuid references public.shops(id) on delete set null,
  target_user_id uuid references auth.users(id) on delete set null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index admin_audit_log_created_idx on public.admin_audit_log (created_at desc);
alter table public.admin_audit_log enable row level security; -- no policies: definer functions only
revoke all on public.admin_audit_log from anon, authenticated, service_role;

-- ── Helpers ─────────────────────────────────────────────────────────────────────────────────

/** Listed as a SAFF admin AND the session passed two-factor (aal2). */
create function app.is_platform_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null
     and coalesce((select auth.jwt()) ->> 'aal', '') = 'aal2'
     and exists (select 1 from public.platform_admins where user_id = (select auth.uid()));
$$;

create function app.require_platform_admin() returns uuid
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.is_platform_admin() then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  return auth.uid();
end $$;

create function app.audit(p_actor uuid, p_action text, p_shop uuid, p_target uuid, p_details jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = '' as $$
  insert into public.admin_audit_log (actor_id, action, shop_id, target_user_id, details)
  values (p_actor, p_action, p_shop, p_target, coalesce(p_details, '{}'::jsonb));
$$;

-- A temporary password must be replaced before the account can do anything: while the JWT carries
-- app_metadata.must_change_password = true (set only by the admin-users function; users cannot edit
-- app_metadata), the user is a member of no shop, so RLS and every barber RPC deny access.
create or replace function app.is_shop_member(p_shop uuid, p_roles public.shop_role[] default null)
returns boolean language sql stable security definer set search_path = '' as $$
  select ((select auth.jwt()) -> 'app_metadata' ->> 'must_change_password') is distinct from 'true'
     and exists (
       select 1 from public.shop_members m
       where m.shop_id = p_shop and m.user_id = (select auth.uid())
         and (p_roles is null or m.role = any (p_roles)));
$$;

-- ── Client-facing (authenticated) ───────────────────────────────────────────────────────────

/** Lets the app decide what to show. Reveals only the caller's own status. */
create function public.admin_status() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'is_admin', exists (select 1 from public.platform_admins where user_id = (select auth.uid())),
    'aal', coalesce((select auth.jwt()) ->> 'aal', 'aal1'));
$$;

/** Used by the admin-users Edge Function with the caller's JWT: returns the admin's id or raises. */
create function public.admin_assert() returns uuid
language sql stable security definer set search_path = '' as $$
  select app.require_platform_admin();
$$;

create function public.admin_overview() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform app.require_platform_admin();
  return jsonb_build_object(
    'shops_total', (select count(*) from public.shops),
    'shops_active', (select count(*) from public.shops where is_active),
    'queues_live', (select count(*) from public.queue_sessions where status in ('open', 'paused')),
    'tickets_today', (select count(*) from public.tickets t join public.queue_sessions qs on qs.id = t.queue_session_id
                       where qs.queue_date = app.shop_today(qs.shop_id)),
    'health', public.ops_health(),
    'recent_actions', coalesce((
      select jsonb_agg(row_to_json(a)::jsonb order by a.created_at desc) from (
        select l.created_at, l.action, l.details, s.name as shop_name, l.shop_id,
               actor.email as actor_email, target.email as target_email
          from public.admin_audit_log l
          left join public.shops s on s.id = l.shop_id
          left join auth.users actor on actor.id = l.actor_id
          left join auth.users target on target.id = l.target_user_id
         order by l.created_at desc, l.id desc limit 20) a), '[]'::jsonb));
end $$;

create function public.admin_list_shops() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform app.require_platform_admin();
  return coalesce((
    select jsonb_agg(row_to_json(x)::jsonb order by x.name) from (
      select s.id, s.name, s.slug, s.is_active, s.created_at,
             (select count(*) from public.shop_members m where m.shop_id = s.id) as members,
             (select qs.status from public.queue_sessions qs
               where qs.shop_id = s.id and qs.queue_date = app.shop_today(s.id)) as queue_today,
             (select count(*) from public.tickets t join public.queue_sessions qs on qs.id = t.queue_session_id
               where qs.shop_id = s.id and qs.queue_date = app.shop_today(s.id)) as tickets_today
        from public.shops s) x), '[]'::jsonb);
end $$;

create function public.admin_get_shop(p_shop_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v jsonb;
begin
  perform app.require_platform_admin();
  select jsonb_build_object(
    'id', s.id, 'name', s.name, 'slug', s.slug, 'address', s.address, 'phone', s.phone,
    'timezone', s.timezone, 'default_locale', s.default_locale, 'is_active', s.is_active, 'created_at', s.created_at,
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
               'user_id', u.id, 'email', u.email, 'role', m.role, 'added_at', m.created_at,
               'last_sign_in_at', u.last_sign_in_at,
               'disabled', coalesce(u.banned_until > now(), false),
               'must_change_password', coalesce(u.raw_app_meta_data ->> 'must_change_password', '') = 'true',
               'is_platform_admin', exists (select 1 from public.platform_admins pa where pa.user_id = u.id))
             order by m.role, u.email)
        from public.shop_members m join auth.users u on u.id = m.user_id
       where m.shop_id = s.id), '[]'::jsonb))
    into v
    from public.shops s where s.id = p_shop_id;
  if v is null then
    raise exception 'shop_not_found' using errcode = 'P0001';
  end if;
  return v;
end $$;

create function public.admin_create_shop(
  p_name text, p_slug text, p_timezone text default 'Africa/Casablanca', p_default_locale text default 'fr',
  p_address text default null, p_phone text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := app.require_platform_admin(); v_id uuid;
begin
  begin
    insert into public.shops (name, slug, timezone, default_locale, address, phone)
    values (btrim(p_name), lower(btrim(p_slug)), coalesce(nullif(btrim(p_timezone), ''), 'Africa/Casablanca'),
            coalesce(p_default_locale, 'fr'), nullif(btrim(p_address), ''), nullif(btrim(p_phone), ''))
    returning id into v_id;
  exception
    when unique_violation then raise exception 'slug_taken' using errcode = 'P0001';
    when check_violation or not_null_violation then raise exception 'invalid_input' using errcode = 'P0001';
  end;
  perform app.audit(v_actor, 'shop_created', v_id, null, jsonb_build_object('slug', lower(btrim(p_slug))));
  return jsonb_build_object('shop_id', v_id);
end $$;

/** Name, address, phone and language. The slug (QR address) and time zone never change here. */
create function public.admin_update_shop(
  p_shop_id uuid, p_name text, p_default_locale text, p_address text default null, p_phone text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := app.require_platform_admin();
begin
  begin
    update public.shops
       set name = btrim(p_name), default_locale = p_default_locale,
           address = nullif(btrim(p_address), ''), phone = nullif(btrim(p_phone), '')
     where id = p_shop_id;
  exception
    when check_violation or not_null_violation then raise exception 'invalid_input' using errcode = 'P0001';
  end;
  if not found then
    raise exception 'shop_not_found' using errcode = 'P0001';
  end if;
  perform app.audit(v_actor, 'shop_updated', p_shop_id, null);
  return jsonb_build_object('result', 'updated');
end $$;

/** A disabled shop takes no new customers and cannot start a queue (existing RPC checks). */
create function public.admin_set_shop_active(p_shop_id uuid, p_active boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := app.require_platform_admin();
begin
  if p_active is null then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;
  update public.shops set is_active = p_active where id = p_shop_id;
  if not found then
    raise exception 'shop_not_found' using errcode = 'P0001';
  end if;
  perform app.audit(v_actor, case when p_active then 'shop_enabled' else 'shop_disabled' end, p_shop_id, null);
  return jsonb_build_object('result', 'updated');
end $$;

create function public.admin_set_member_role(p_shop_id uuid, p_user_id uuid, p_role public.shop_role) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := app.require_platform_admin();
begin
  if p_role is null then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;
  update public.shop_members set role = p_role where shop_id = p_shop_id and user_id = p_user_id;
  if not found then
    raise exception 'member_not_found' using errcode = 'P0001';
  end if;
  perform app.audit(v_actor, 'member_role_changed', p_shop_id, p_user_id, jsonb_build_object('role', p_role));
  return jsonb_build_object('result', 'updated');
end $$;

/** Removes access to this shop only. The login itself stays (it may belong to other shops). */
create function public.admin_remove_member(p_shop_id uuid, p_user_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := app.require_platform_admin();
begin
  delete from public.shop_members where shop_id = p_shop_id and user_id = p_user_id;
  if not found then
    raise exception 'member_not_found' using errcode = 'P0001';
  end if;
  perform app.audit(v_actor, 'member_removed', p_shop_id, p_user_id);
  return jsonb_build_object('result', 'removed');
end $$;

-- ── Service role only (the admin-users Edge Function, after admin_assert) ───────────────────

create function public.admin_lookup_user(p_email text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'user_id', u.id,
    'is_platform_admin', exists (select 1 from public.platform_admins pa where pa.user_id = u.id))
    from auth.users u where lower(u.email) = lower(btrim(p_email)) limit 1;
$$;

create function public.admin_user_info(p_user_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'user_id', u.id, 'email', u.email,
    'is_platform_admin', exists (select 1 from public.platform_admins pa where pa.user_id = u.id))
    from auth.users u where u.id = p_user_id;
$$;

create function public.admin_add_member(p_actor uuid, p_shop_id uuid, p_user_id uuid, p_role public.shop_role, p_new_account boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if p_actor is null or not exists (select 1 from public.platform_admins where user_id = p_actor) then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.shops where id = p_shop_id) then
    raise exception 'shop_not_found' using errcode = 'P0001';
  end if;
  begin
    insert into public.shop_members (shop_id, user_id, role) values (p_shop_id, p_user_id, coalesce(p_role, 'barber'));
  exception when unique_violation then
    raise exception 'already_member' using errcode = 'P0001';
  end;
  perform app.audit(p_actor, case when p_new_account then 'account_created' else 'member_added' end,
                    p_shop_id, p_user_id, jsonb_build_object('role', coalesce(p_role, 'barber')));
  return jsonb_build_object('result', 'added');
end $$;

create function public.admin_log_action(p_actor uuid, p_action text, p_target uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_actor is null or not exists (select 1 from public.platform_admins where user_id = p_actor) then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  if p_action not in ('password_reset', 'account_disabled', 'account_enabled') then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;
  perform app.audit(p_actor, p_action, null, p_target);
end $$;

-- ── Exposure ────────────────────────────────────────────────────────────────────────────────
revoke execute on all functions in schema app from public, anon, authenticated;
grant execute on function app.is_shop_member(uuid, public.shop_role[]) to authenticated;
grant execute on function app.is_valid_timezone(text) to service_role;

revoke execute on function public.admin_status(), public.admin_assert(), public.admin_overview(),
  public.admin_list_shops(), public.admin_get_shop(uuid), public.admin_create_shop(text, text, text, text, text, text),
  public.admin_update_shop(uuid, text, text, text, text), public.admin_set_shop_active(uuid, boolean),
  public.admin_set_member_role(uuid, uuid, public.shop_role), public.admin_remove_member(uuid, uuid),
  public.admin_lookup_user(text), public.admin_user_info(uuid),
  public.admin_add_member(uuid, uuid, uuid, public.shop_role, boolean), public.admin_log_action(uuid, text, uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.admin_status(), public.admin_assert(), public.admin_overview(),
  public.admin_list_shops(), public.admin_get_shop(uuid), public.admin_create_shop(text, text, text, text, text, text),
  public.admin_update_shop(uuid, text, text, text, text), public.admin_set_shop_active(uuid, boolean),
  public.admin_set_member_role(uuid, uuid, public.shop_role), public.admin_remove_member(uuid, uuid)
  to authenticated;

grant execute on function public.admin_lookup_user(text), public.admin_user_info(uuid),
  public.admin_add_member(uuid, uuid, uuid, public.shop_role, boolean), public.admin_log_action(uuid, text, uuid)
  to service_role;
