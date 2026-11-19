begin;
\ir _helpers.psql
select plan(3);

select tests.create_shop('slug-fixed') as shop \gset
select throws_ok(format($$update public.shops set slug = 'slug-renamed' where id = %L$$, :'shop'),
  'P0001', 'slug_immutable', 'a shop slug can never change (printed QR codes, D-02)');
select lives_ok(format($$update public.shops set name = 'Renamed Shop', slug = 'slug-fixed' where id = %L$$, :'shop'),
  'other fields can change, and re-setting the same slug is allowed');
set local role service_role;
select throws_ok(format($$update public.shops set slug = 'svc-renamed' where id = %L$$, :'shop'),
  'P0001', 'slug_immutable', 'not even the service role can change a slug');
reset role;

select * from finish();
rollback;
