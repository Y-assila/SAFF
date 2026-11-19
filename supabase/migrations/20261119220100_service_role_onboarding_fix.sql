-- SAFF M3 fix · platform-admin onboarding through the service role.
-- shops.timezone has CHECK (app.is_valid_timezone(timezone)). CHECK functions are executed with the
-- inserting role's privileges, and 20261119200700 revoked EXECUTE on app.* from PUBLIC, so the
-- service role (used for onboarding, TD §2.1) could not insert shops. Grant exactly what it needs.
grant usage on schema app to service_role;
grant execute on function app.is_valid_timezone(text) to service_role;
