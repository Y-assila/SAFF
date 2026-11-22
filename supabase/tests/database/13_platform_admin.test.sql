begin;
\ir _helpers.psql
select plan(33);

-- Claims as the Auth server issues them: aal1 after a password, aal2 after the second factor.
create function tests.auth_with(p_user uuid, p_aal text, p_app_meta jsonb default '{}'::jsonb) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated', 'aal', p_aal, 'app_metadata', p_app_meta)::text, true);
  execute 'set local role authenticated';
end $$;
grant execute on function tests.auth_with(uuid, text, jsonb) to authenticated;

select tests.create_user('admin@saff.test') as admin \gset
select tests.create_user('owner@saff.test') as owner \gset
select tests.create_user('new@saff.test') as newbie \gset
select tests.create_shop('admin-shop') as shop \gset
select tests.add_member(:'shop', :'owner', 'owner');
insert into public.platform_admins (user_id) values (:'admin');

-- ── Tables are closed to every API role ──
select ok(not has_table_privilege('authenticated', 'public.platform_admins', 'select')
          and not has_table_privilege('anon', 'public.platform_admins', 'select')
          and not has_table_privilege('service_role', 'public.platform_admins', 'insert'),
  'platform_admins is not readable or writable through the API');
select ok(not has_table_privilege('authenticated', 'public.admin_audit_log', 'select')
          and not has_table_privilege('service_role', 'public.admin_audit_log', 'update')
          and not has_table_privilege('service_role', 'public.admin_audit_log', 'delete'),
  'the audit log is closed to clients and append-only even for the service role');

-- ── Status ──
select tests.auth_with(:'owner', 'aal2');
select is((select public.admin_status() ->> 'is_admin'), 'false', 'a shop owner is not a SAFF admin');
select tests.as_postgres();
select tests.auth_with(:'admin', 'aal1');
select is(public.admin_status(), '{"is_admin": true, "aal": "aal1"}'::jsonb, 'admin_status reports the admin and the session level');

-- ── Two-factor is required ──
select throws_ok($$select public.admin_list_shops()$$, 'P0001', 'not_authorized', 'an admin without two-factor (aal1) is refused');
select throws_ok($$select public.admin_assert()$$, 'P0001', 'not_authorized', 'admin_assert also requires aal2');
select tests.as_postgres();

-- ── Non-admins are refused everywhere, even with aal2 ──
select tests.auth_with(:'owner', 'aal2');
select throws_ok($$select public.admin_overview()$$, 'P0001', 'not_authorized', 'owner: overview refused');
select throws_ok($$select public.admin_list_shops()$$, 'P0001', 'not_authorized', 'owner: shop list refused');
select throws_ok(format('select public.admin_get_shop(%L)', :'shop'), 'P0001', 'not_authorized', 'owner: shop detail refused');
select throws_ok($$select public.admin_create_shop('X Shop', 'x-shop')$$, 'P0001', 'not_authorized', 'owner: create shop refused');
select throws_ok(format('select public.admin_set_shop_active(%L, false)', :'shop'), 'P0001', 'not_authorized', 'owner: disable shop refused');
select throws_ok(format('select public.admin_remove_member(%L, %L)', :'shop', :'owner'), 'P0001', 'not_authorized', 'owner: remove member refused');
select tests.as_postgres();

-- ── Admin with two-factor ──
select tests.auth_with(:'admin', 'aal2');
select is(public.admin_assert(), :'admin'::uuid, 'admin_assert returns the admin id');
select lives_ok($$select public.admin_create_shop('Salon Atlas', 'Salon-Atlas', 'Africa/Casablanca', 'ar', '  Rabat ', null)$$,
  'an admin creates a shop');
select throws_ok($$select public.admin_create_shop('Again', 'salon-atlas')$$, 'P0001', 'slug_taken', 'a used link is refused');
select throws_ok($$select public.admin_create_shop('Bad', 'bad slug!')$$, 'P0001', 'invalid_input', 'an invalid link is refused');
select throws_ok($$select public.admin_create_shop('Bad TZ', 'bad-tz', 'Mars/Olympus')$$, 'P0001', 'invalid_input', 'an unknown time zone is refused');
select tests.as_postgres();

select is((select row(slug, default_locale, address)::text from public.shops where slug = 'salon-atlas'),
  row('salon-atlas', 'ar', 'Rabat')::text, 'the shop is stored normalised (lowercase link, trimmed address)');
select is((select count(*)::int from public.shop_settings ss join public.shops s on s.id = ss.shop_id where s.slug = 'salon-atlas'), 1,
  'the default settings row exists');

select tests.auth_with(:'admin', 'aal2');
select ok((select jsonb_array_length(public.admin_list_shops()) >= 2), 'the shop list includes every shop');
select is((select public.admin_get_shop(:'shop') -> 'members' -> 0 ->> 'email'), 'owner@saff.test', 'shop detail lists member emails');
select ok(position('phone' in (select (public.admin_get_shop(:'shop') -> 'members')::text)) = 0,
  'member rows carry no phone field');
select throws_ok(format('select public.admin_get_shop(%L)', gen_random_uuid()), 'P0001', 'shop_not_found', 'unknown shop');
select lives_ok(format('select public.admin_update_shop(%L, %L, %L, %L, %L)', :'shop', 'Renamed Shop', 'en', 'Fes', '+212522000000'),
  'an admin edits name, language, address and phone');
select lives_ok(format('select public.admin_set_shop_active(%L, false)', :'shop'), 'an admin disables a shop');
select lives_ok(format('select public.admin_set_member_role(%L, %L, %L)', :'shop', :'owner', 'barber'), 'an admin changes a role');
select tests.as_postgres();

select is((select row(name, is_active, phone)::text from public.shops where id = :'shop'),
  row('Renamed Shop', false, '+212522000000')::text, 'the edits are stored');
select is((select array_agg(action order by id) from public.admin_audit_log where actor_id = :'admin'),
  array['shop_created', 'shop_updated', 'shop_disabled', 'member_role_changed'],
  'every admin change is in the audit log, in order');

-- ── Service-role helpers (admin-users function) ──
set local role service_role;
select is((select public.admin_lookup_user('ADMIN@saff.test') ->> 'is_platform_admin'), 'true', 'lookup by email, case-insensitive');
select throws_ok(format('select public.admin_add_member(%L, %L, %L, %L, true)', :'owner', :'shop', :'newbie', 'barber'),
  'P0001', 'not_authorized', 'admin_add_member requires a real admin as actor');
select lives_ok(format('select public.admin_add_member(%L, %L, %L, %L, true)', :'admin', :'shop', :'newbie', 'barber'),
  'the function adds a new account to a shop');
reset role;

-- ── A temporary password blocks all shop access until it is changed ──
select tests.auth_with(:'newbie', 'aal1', '{"must_change_password": true}');
select is((select count(*)::int from public.shops), 0, 'with must_change_password the user sees no shop');
select tests.as_postgres();
select tests.auth_with(:'newbie', 'aal1', '{"must_change_password": false}');
select is((select count(*)::int from public.shops), 1, 'after the change (flag false) the shop is visible');
select tests.as_postgres();

select * from finish();
rollback;
