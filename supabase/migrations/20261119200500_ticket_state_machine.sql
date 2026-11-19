-- SAFF M1 · step 5 · state machine as data, enforced by trigger (TD §4.4)

create table public.ticket_transitions (
  from_status public.ticket_status not null,
  to_status public.ticket_status not null,
  actors text[] not null,                      -- who may perform it: barber, customer, system
  primary key (from_status, to_status),
  check (actors <@ array['barber', 'customer', 'system'] and cardinality(actors) > 0)
);

insert into public.ticket_transitions values
  ('waiting', 'getting_ready', '{barber}'),       ('waiting', 'cancelled', '{customer,barber}'),
  ('waiting', 'skipped', '{barber}'),             ('waiting', 'expired', '{system}'),
  ('getting_ready', 'on_the_way', '{customer,barber}'), ('getting_ready', 'arrived', '{barber}'),
  ('getting_ready', 'cancelled', '{customer,barber}'),  ('getting_ready', 'skipped', '{barber}'),
  ('getting_ready', 'expired', '{system}'),
  ('on_the_way', 'arrived', '{barber}'),          ('on_the_way', 'cancelled', '{customer,barber}'),
  ('on_the_way', 'skipped', '{barber}'),          ('on_the_way', 'expired', '{system}'),
  ('arrived', 'in_service', '{barber}'),          ('arrived', 'cancelled', '{customer,barber}'),
  ('arrived', 'skipped', '{barber}'),             ('arrived', 'expired', '{system}'),
  ('in_service', 'completed', '{barber}'),
  -- explicit override, only reachable through start_service(p_skip_arrival => true)
  ('getting_ready', 'in_service', '{barber}'),    ('on_the_way', 'in_service', '{barber}');

-- Terminal statuses (completed, skipped, cancelled, expired) have no outgoing rows,
-- so a skipped customer can never silently re-enter the queue.

create function app.enforce_ticket_transition() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.status is distinct from old.status and not exists (
    select 1 from public.ticket_transitions t
    where t.from_status = old.status and t.to_status = new.status) then
    raise exception 'invalid_transition' using errcode = 'P0001',
      detail = old.status::text || ' -> ' || new.status::text;
  end if;
  if (new.id, new.shop_id, new.queue_session_id, new.ticket_number)
     is distinct from (old.id, old.shop_id, old.queue_session_id, old.ticket_number) then
    raise exception 'immutable_ticket_fields' using errcode = 'P0001';
  end if;
  new.updated_at := now();
  return new;
end $$;

create trigger tickets_enforce_transition before update on public.tickets
  for each row execute function app.enforce_ticket_transition();

-- New tickets always start in 'waiting'. [Derived: the state machine has no other entry point]
create function app.enforce_ticket_insert() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.status <> 'waiting' then
    raise exception 'invalid_transition' using errcode = 'P0001', detail = 'insert -> ' || new.status::text;
  end if;
  return new;
end $$;
create trigger tickets_enforce_insert before insert on public.tickets
  for each row execute function app.enforce_ticket_insert();
