-- SAFF · explicit table privileges for the service role (found on hosted staging, 20 Nov 2026).
-- The Edge Functions read tables directly with the service role (e.g. tickets.token_version in
-- ticket-get, shop_settings in join-queue). Newer hosted Supabase projects no longer grant table
-- privileges to service_role by default, while the local stack still does, so ticket-get failed
-- with 500 on hosted only. Grant them explicitly instead of relying on platform defaults.
-- The service role is the platform-admin role by design (it bypasses RLS); anon and authenticated
-- privileges are unchanged.
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
alter default privileges for role postgres in schema public grant select, insert, update, delete on tables to service_role;
alter default privileges for role postgres in schema public grant usage, select on sequences to service_role;
