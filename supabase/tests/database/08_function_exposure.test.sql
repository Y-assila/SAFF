begin;
\ir _helpers.psql
select plan(5);

-- RPC-SPEC §2: the complete exposure table, checked from the catalogue.
create temp view exposure as
  select p.proname, r.rolname,
         has_function_privilege(r.rolname, p.oid, 'execute') as can
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  cross join (values ('anon'), ('authenticated'), ('service_role')) r(rolname)
  where n.nspname = 'public' and p.prokind = 'f'
    and p.proname not like 'pgrst%';

select set_eq($$select proname from exposure where rolname = 'anon' and can$$,
  $$values ('public_get_shop')$$,
  'anon can execute only public_get_shop');

select set_eq($$select proname from exposure where rolname = 'authenticated' and can$$,
  $$values ('start_queue'), ('pause_queue'), ('resume_queue'), ('close_queue'), ('reopen_queue'),
           ('call_next_customer'), ('mark_on_the_way'), ('mark_arrived'), ('start_service'), ('complete_service'),
           ('skip_ticket'), ('barber_cancel_ticket'), ('reveal_phone'), ('reissue_ticket_link'),
           ('get_queue_stats'), ('public_get_shop'),
           ('admin_status'), ('admin_assert'), ('admin_overview'), ('admin_list_shops'), ('admin_get_shop'),
           ('admin_create_shop'), ('admin_update_shop'), ('admin_set_shop_active'), ('admin_set_member_role'),
           ('admin_remove_member')$$,
  'authenticated can execute exactly the barber RPCs, the admin console RPCs (which check admin + aal2) and public shop info');

select ok((select bool_and(can) from exposure where rolname = 'service_role'
             and proname in ('join_queue', 'customer_get_ticket', 'customer_confirm_on_the_way', 'customer_cancel_ticket', 'check_rate_limit',
                             'admin_lookup_user', 'admin_user_info', 'admin_add_member', 'admin_log_action')),
  'the service role can execute the customer RPCs, the rate limiter and the admin-users helpers');

select set_eq(
  $$select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'app' and (has_function_privilege('authenticated', p.oid, 'execute')
                                 or has_function_privilege('anon', p.oid, 'execute'))$$,
  $$values ('is_shop_member')$$,
  'no app.* helper is executable by clients except is_shop_member (used by RLS policies)');

select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'app') and p.prosecdef
      and not coalesce(array_to_string(p.proconfig, ',') like '%search_path=""%', false)),
  0, 'every SECURITY DEFINER function pins search_path to empty');

select * from finish();
rollback;
