-- SAFF M1 · step 1 · private schema and enum types (TD §4.1)

create schema if not exists app; -- private helpers, never exposed through the API
revoke all on schema app from public;

create type public.shop_role as enum ('owner', 'barber');
create type public.queue_status as enum ('open', 'paused', 'finished');
create type public.ticket_status as enum (
  'waiting', 'getting_ready', 'on_the_way', 'arrived',
  'in_service', 'completed', 'skipped', 'cancelled', 'expired'
);
create type public.notification_type as enum (
  'ticket_created', 'turn_approaching', 'queue_update', 'queue_closed', 'link_resent'
);
create type public.notification_status as enum (
  'pending', 'sending', 'sent', 'delivered', 'read', 'failed', 'suppressed'
);
create type public.skip_reason as enum (
  'no_show_after_grace', 'unreachable', 'invalid_phone', 'barber_override'
);

-- Generic updated_at maintenance for tables that carry the column. [Derived]
create function app.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;
