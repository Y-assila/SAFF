begin;
\ir _helpers.psql
select plan(4);

-- Regression (found by E2E in M3): onboarding runs as the service role, not as postgres.
set local role service_role;
select lives_ok($$insert into public.shops (name, slug) values ('Onboarded', 'svc-onboarded')$$,
  'the service role can create a shop (timezone CHECK is executable)');
select throws_ok($$insert into public.shops (name, slug, timezone) values ('Bad TZ', 'svc-bad-tz', 'Mars/Olympus')$$,
  '23514', null, 'an unknown time zone is still rejected');
select is((select count(*)::int from public.shop_settings s join public.shops p on p.id = s.shop_id where p.slug = 'svc-onboarded'), 1,
  'the default settings row is created for a service-role insert');
reset role;

select ok(not has_function_privilege('authenticated', 'app.is_valid_timezone(text)', 'execute')
          and not has_function_privilege('anon', 'app.is_valid_timezone(text)', 'execute'),
  'clients still cannot execute the helper directly');

select * from finish();
rollback;
