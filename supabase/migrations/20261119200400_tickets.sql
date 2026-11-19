-- SAFF M1 · step 4 · tickets and database-level invariants (TD §4.3)

create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null,
  queue_session_id uuid not null,
  ticket_number int not null check (ticket_number > 0),
  customer_name text check (char_length(customer_name) between 1 and 60),
  customer_phone text check (customer_phone ~ '^[+][1-9][0-9]{7,14}$'), -- E.164, normalised in the Edge Function
  locale text not null default 'fr' check (locale in ('fr', 'ar', 'en')),
  status public.ticket_status not null default 'waiting',
  status_reason text check (status_reason is null or char_length(status_reason) <= 40),
  client_request_id uuid,                      -- idempotency for double submits and retries
  joined_at timestamptz not null default now(), -- informational; ticket_number is the order
  called_at timestamptz, on_the_way_at timestamptz, arrived_at timestamptz,
  service_started_at timestamptz, completed_at timestamptz,
  skipped_at timestamptz, cancelled_at timestamptz, expired_at timestamptz,
  token_version smallint not null default 1,   -- bump to revoke the ticket link
  whatsapp_consent boolean not null,
  consent_at timestamptz not null,
  consent_text_version text not null,
  anonymized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (queue_session_id, shop_id) references public.queue_sessions (id, shop_id),
  unique (queue_session_id, ticket_number),
  unique (queue_session_id, client_request_id),
  unique (id, shop_id),
  check (whatsapp_consent),
  check ((customer_phone is not null and customer_name is not null) or anonymized_at is not null)
);

-- Database-level invariants (backstop behind the RPC logic)
create unique index tickets_one_active_per_phone on public.tickets (shop_id, customer_phone)
  where status in ('waiting', 'getting_ready', 'on_the_way', 'arrived', 'in_service');
create unique index tickets_one_in_service on public.tickets (queue_session_id)
  where status = 'in_service';
create unique index tickets_one_called_slot on public.tickets (queue_session_id)
  where status in ('getting_ready', 'on_the_way', 'arrived');
create index tickets_queue_order on public.tickets (queue_session_id, ticket_number)
  where status in ('waiting', 'getting_ready', 'on_the_way', 'arrived', 'in_service');
create index tickets_session_status_idx on public.tickets (queue_session_id, status);
create index tickets_retention_idx on public.tickets (created_at) where anonymized_at is null;
