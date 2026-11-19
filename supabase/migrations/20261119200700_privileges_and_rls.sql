-- SAFF M1 · step 7 · default deny, column privileges, RLS policies (TD §5)
-- Principle: default deny, read-only for members, nothing for anonymous.

-- 5.1 Default deny
alter table public.shops enable row level security;
alter table public.shop_settings enable row level security;
alter table public.profiles enable row level security;
alter table public.shop_members enable row level security;
alter table public.queue_sessions enable row level security;
alter table public.tickets enable row level security;
alter table public.notifications enable row level security;
alter table public.queue_events enable row level security;
alter table public.rate_limits enable row level security;        -- no policies: service role only
alter table public.ticket_transitions enable row level security; -- no policies: internal only

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated;

grant usage on schema public to anon, authenticated;

-- Private schema: functions are created EXECUTE-to-PUBLIC by default; take that away. [Derived]
revoke execute on all functions in schema app from public;
alter default privileges for role postgres in schema app revoke execute on functions from public;
grant usage on schema app to authenticated;                       -- policies call app.is_shop_member
grant execute on function app.is_shop_member(uuid, public.shop_role[]) to authenticated;

-- 5.2 Column-level privileges: barbers never read raw phone numbers from tables
grant select on public.shops, public.shop_settings, public.shop_members,
  public.queue_sessions, public.queue_events to authenticated;
grant select (id, shop_id, queue_session_id, ticket_number, customer_name, locale, status, status_reason,
  joined_at, called_at, on_the_way_at, arrived_at, service_started_at, completed_at,
  skipped_at, cancelled_at, expired_at, created_at, updated_at)
  on public.tickets to authenticated;
grant select (id, shop_id, ticket_id, notification_type, status, attempts, sent_at, delivered_at,
  read_at, failed_at, error_code, created_at)
  on public.notifications to authenticated;
grant select on public.profiles to authenticated;
grant update (full_name, phone) on public.profiles to authenticated;
grant update (grace_period_minutes, default_service_minutes, max_active_tickets, whatsapp_enabled)
  on public.shop_settings to authenticated;

-- 5.3 Policies (helper calls wrapped in a select so they are evaluated once per statement)
create policy shops_select on public.shops for select to authenticated
  using ((select app.is_shop_member(id)));
create policy settings_select on public.shop_settings for select to authenticated
  using ((select app.is_shop_member(shop_id)));
create policy settings_update on public.shop_settings for update to authenticated
  using ((select app.is_shop_member(shop_id, array['owner']::public.shop_role[])))
  with check ((select app.is_shop_member(shop_id, array['owner']::public.shop_role[])));
create policy sessions_select on public.queue_sessions for select to authenticated
  using ((select app.is_shop_member(shop_id)));
create policy tickets_select on public.tickets for select to authenticated
  using ((select app.is_shop_member(shop_id)));
create policy notif_select on public.notifications for select to authenticated
  using ((select app.is_shop_member(shop_id)));
create policy events_select on public.queue_events for select to authenticated
  using ((select app.is_shop_member(shop_id)));
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()));
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy members_select on public.shop_members for select to authenticated
  using (user_id = (select auth.uid())
         or (select app.is_shop_member(shop_id, array['owner']::public.shop_role[])));
-- No INSERT / UPDATE / DELETE policy exists on tickets, sessions, notifications, events or members:
-- the only write path is the RPC layer (Milestone 2).

-- 5.4 Function exposure (RPC-SPEC §2): rate limiter is for Edge Functions only.
grant execute on function public.check_rate_limit(text, int, int) to service_role;
