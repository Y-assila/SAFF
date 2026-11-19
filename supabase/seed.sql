-- LOCAL DEVELOPMENT ONLY. Run by `supabase db reset` against the local stack; never applied to
-- staging or production (seed files are not migrations).
-- Creates one inactive-looking demo shop so the schema can be explored. No customers, no tickets.
-- Barber accounts are created through the Auth admin API (see README → Local database).
insert into public.shops (name, slug, default_locale)
values ('Local Dev Shop', 'local-dev-shop', 'fr')
on conflict (slug) do nothing;
