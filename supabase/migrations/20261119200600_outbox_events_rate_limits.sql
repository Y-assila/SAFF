-- SAFF M1 · step 6 · outbox, audit log, rate limits (TD §4.5)

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null,
  ticket_id uuid not null,
  notification_type public.notification_type not null,
  dedupe_key text not null default '',         -- e.g. 'called' so CALL NEXT can never message twice
  recipient_phone text,                        -- anonymised with the ticket
  template_name text, template_language text,
  status public.notification_status not null default 'pending',
  attempts int not null default 0,
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  provider_message_id text,
  error_code text, error_message text,
  sent_at timestamptz, delivered_at timestamptz, read_at timestamptz, failed_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (ticket_id, shop_id) references public.tickets (id, shop_id),
  unique (ticket_id, notification_type, dedupe_key)
);
create unique index notifications_provider_msg_uq on public.notifications (provider_message_id)
  where provider_message_id is not null;
create index notifications_due_idx on public.notifications (next_attempt_at) where status = 'pending';

-- append-only audit trail; never put PII in metadata
create table public.queue_events (
  id bigint generated always as identity primary key,
  shop_id uuid not null references public.shops(id),
  queue_session_id uuid references public.queue_sessions(id),
  ticket_id uuid references public.tickets(id),
  actor_type text not null check (actor_type in ('barber', 'customer', 'system')),
  actor_user_id uuid,
  event_type text not null,
  old_status text, new_status text, reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index queue_events_session_idx on public.queue_events (queue_session_id, id);
create index queue_events_ticket_idx on public.queue_events (ticket_id, id);

create function app.forbid_mutation() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'append_only' using errcode = 'P0001';
end $$;
create trigger queue_events_append_only before update or delete on public.queue_events
  for each row execute function app.forbid_mutation();
-- TRUNCATE bypasses row triggers; block it too. [Derived]
create trigger queue_events_no_truncate before truncate on public.queue_events
  for each statement execute function app.forbid_mutation();

create table public.rate_limits (
  key text not null,                           -- hashed IP / phone / shop, never raw
  window_start timestamptz not null,
  hits int not null default 1,
  primary key (key, window_start)
);

create function public.check_rate_limit(p_key text, p_window_seconds int, p_max int)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_hits int;
begin
  if p_key is null or char_length(p_key) not between 16 and 128
     or p_window_seconds not between 1 and 86400 or p_max < 1 then
    raise exception 'invalid_rate_limit_args' using errcode = 'P0001';
  end if;
  insert into public.rate_limits as r (key, window_start)
  values (p_key, to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds))
  on conflict (key, window_start) do update set hits = r.hits + 1
  returning hits into v_hits;
  return v_hits <= p_max;
end $$;
