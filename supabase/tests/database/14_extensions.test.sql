begin;
\ir _helpers.psql
select plan(2);

-- Security Advisor lint 0014: no extension may live in the exposed `public` schema.
select is((select count(*)::int from pg_extension e join pg_namespace n on n.oid = e.extnamespace where n.nspname = 'public'),
  0, 'no extension is installed in schema public');
select ok(exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'net' and p.proname = 'http_post'),
  'pg_net still provides net.http_post (WhatsApp dispatcher wake-up)');

select * from finish();
rollback;
