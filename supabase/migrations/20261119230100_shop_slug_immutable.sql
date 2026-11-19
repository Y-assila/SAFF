-- SAFF M4 · decision D-02: printed QR codes point to /s/<slug> forever, so a slug can never change.
create function app.forbid_slug_change() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.slug is distinct from old.slug then
    raise exception 'slug_immutable' using errcode = 'P0001',
      detail = 'Shop slugs are permanent: printed QR codes point to /s/<slug>.';
  end if;
  return new;
end $$;

create trigger shops_slug_immutable before update of slug on public.shops
  for each row execute function app.forbid_slug_change();

revoke execute on function app.forbid_slug_change() from public, anon, authenticated;
