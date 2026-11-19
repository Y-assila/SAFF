-- SAFF M1 · step 2 · tenant and access tables (TD §4.2)

-- Rejects time zone names PostgreSQL does not know; a bad zone would break shop-local dates. [Derived]
create function app.is_valid_timezone(p_tz text) returns boolean
language sql stable set search_path = '' as $$
  select exists (select 1 from pg_catalog.pg_timezone_names where name = p_tz);
$$;

create table public.shops (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 80),
  slug text not null unique
    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 3 and 60),
  logo_url text,
  address text,
  phone text check (phone is null or phone ~ '^[+][1-9][0-9]{7,14}$'),
  timezone text not null default 'Africa/Casablanca' check (app.is_valid_timezone(timezone)),
  default_locale text not null default 'fr' check (default_locale in ('fr', 'ar', 'en')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger shops_touch before update on public.shops
  for each row execute function app.touch_updated_at();

create table public.shop_settings (
  shop_id uuid primary key references public.shops(id) on delete cascade,
  grace_period_minutes int not null default 10 check (grace_period_minutes between 1 and 60),
  default_service_minutes int not null default 25 check (default_service_minutes between 5 and 180),
  max_active_tickets int not null default 40 check (max_active_tickets between 1 and 500),
  whatsapp_enabled boolean not null default true,
  require_phone_verification boolean not null default false, -- off in MVP (TD issue 6, approved)
  pii_retention_days int not null default 30 check (pii_retention_days between 1 and 365),
  updated_at timestamptz not null default now()
);
create trigger shop_settings_touch before update on public.shop_settings
  for each row execute function app.touch_updated_at();

-- Every shop has exactly one settings row (ERD shops ||--|| shop_settings). [Derived]
create function app.create_default_shop_settings() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.shop_settings (shop_id) values (new.id) on conflict do nothing;
  return new;
end $$;
create trigger shops_default_settings after insert on public.shops
  for each row execute function app.create_default_shop_settings();

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text check (full_name is null or char_length(full_name) between 1 and 80),
  phone text check (phone is null or phone ~ '^[+][1-9][0-9]{7,14}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_touch before update on public.profiles
  for each row execute function app.touch_updated_at();

-- Every auth user gets a profile row (ERD profiles 1:1 users). [Derived]
create function app.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function app.handle_new_user();

create table public.shop_members (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.shop_role not null default 'barber',
  created_at timestamptz not null default now(),
  unique (shop_id, user_id)
);
create index shop_members_user_idx on public.shop_members (user_id);

create function app.is_shop_member(p_shop uuid, p_roles public.shop_role[] default null)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.shop_members m
    where m.shop_id = p_shop and m.user_id = (select auth.uid())
      and (p_roles is null or m.role = any (p_roles)));
$$;
