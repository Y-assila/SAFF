begin;
\ir _helpers.psql
select plan(14);

select has_table('public', t, 'table ' || t || ' exists') from unnest(array[
  'shops','shop_settings','profiles','shop_members','queue_sessions','tickets',
  'ticket_transitions','notifications','queue_events','rate_limits']) t;

select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity),
  0, 'RLS is enabled on every public table');

select enum_has_labels('public', 'ticket_status',
  array['waiting','getting_ready','on_the_way','arrived','in_service','completed','skipped','cancelled','expired'],
  'ticket_status has the approved statuses, including expired');

-- 1:1 helper triggers
select tests.create_shop('schema-shop') as shop_id \gset
select tests.create_user('profile@test.local') as user_id \gset
select is((select count(*)::int from public.shop_settings where shop_id = :'shop_id'),
  1, 'creating a shop creates its default settings row');
select is((select count(*)::int from public.profiles where id = :'user_id'),
  1, 'creating an auth user creates a profile row');

select * from finish();
rollback;
