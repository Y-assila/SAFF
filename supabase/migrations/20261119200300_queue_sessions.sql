-- SAFF M1 · step 3 · queue sessions (TD §4.3)

create table public.queue_sessions (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id),
  queue_date date not null,                    -- shop-local date at start_queue
  status public.queue_status not null default 'open',
  last_ticket_number int not null default 0,  -- allocator, only touched under the row lock
  version bigint not null default 0,          -- bumped on every change; used by realtime pings
  started_at timestamptz not null default now(),
  started_by uuid references auth.users(id),
  closed_at timestamptz,
  closed_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (shop_id, queue_date),
  unique (id, shop_id),                        -- target of composite FKs
  check ((status = 'finished') = (closed_at is not null))
);

-- at most one live (open or paused) session per shop
create unique index queue_sessions_one_live_per_shop
  on public.queue_sessions (shop_id) where status in ('open', 'paused');
