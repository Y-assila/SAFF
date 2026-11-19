begin;
\ir _helpers.psql
select plan(8);

-- Puts a fresh ticket (in its own shop, so partial unique indexes never interfere) into p_from
-- by walking legal transitions, then attempts p_from -> p_to. Returns true if the database accepts it.
create function tests.try_transition(p_from public.ticket_status, p_to public.ticket_status)
returns boolean language plpgsql as $$
declare
  v_ticket uuid;
  v_path public.ticket_status[] := case p_from
    when 'waiting'       then '{}'
    when 'getting_ready' then '{getting_ready}'
    when 'on_the_way'    then '{getting_ready,on_the_way}'
    when 'arrived'       then '{getting_ready,arrived}'
    when 'in_service'    then '{getting_ready,arrived,in_service}'
    when 'completed'     then '{getting_ready,arrived,in_service,completed}'
    when 'skipped'       then '{skipped}'
    when 'cancelled'     then '{cancelled}'
    when 'expired'       then '{expired}' end;
  s public.ticket_status;
begin
  v_ticket := tests.add_ticket(tests.open_session(tests.create_shop('sm-' || substr(md5(random()::text), 1, 12))), '+212600000001');
  foreach s in array v_path loop perform tests.set_status(v_ticket, s); end loop;
  begin
    perform tests.set_status(v_ticket, p_to);
    raise exception 'accepted';
  exception
    when others then
      if sqlerrm = 'accepted' then return true; end if;
      if sqlerrm = 'invalid_transition' then return false; end if;
      raise;  -- any other error is a bug in the test or schema
  end;
end $$;

create temp table attempts as
  select f, t, tests.try_transition(f, t) as accepted
  from unnest(enum_range(null::public.ticket_status)) f,
       unnest(enum_range(null::public.ticket_status)) t
  where f <> t;

select is((select count(*)::int from attempts), 72, 'all 72 status changes were attempted (81 pairs minus no-ops)');

select set_eq(
  'select f, t from attempts where accepted',
  'select from_status, to_status from public.ticket_transitions',
  'the database accepts exactly the transitions in ticket_transitions');

select is((select count(*)::int from attempts where accepted), 20, 'exactly 20 transitions are allowed (TD §4.4)');

select is(
  (select count(*)::int from attempts where accepted and f in ('completed','skipped','cancelled','expired')),
  0, 'terminal statuses have no exit');

select ok(not exists (select 1 from attempts where accepted and f = 'waiting' and t = 'in_service'),
  'a waiting ticket can never jump straight to in_service (FIFO)');

-- Immutable fields and entry point
select tests.add_ticket(tests.open_session(tests.create_shop('sm-immutable')), '+212600000002') as tid \gset

select throws_ok(
  format('update public.tickets set ticket_number = 99 where id = %L', :'tid'),
  'P0001', 'immutable_ticket_fields', 'ticket_number cannot change');

select lives_ok(
  format('update public.tickets set customer_name = %L where id = %L', 'Renamed', :'tid'),
  'non-identity fields can change without a status change');

select throws_ok(
  $$insert into public.tickets (shop_id, queue_session_id, ticket_number, customer_name, customer_phone,
      status, whatsapp_consent, consent_at, consent_text_version)
    select shop_id, id, 50, 'X', '+212600000003', 'in_service', true, now(), 'v' from public.queue_sessions limit 1$$,
  'P0001', 'invalid_transition', 'new tickets must start in waiting');

select * from finish();
rollback;
