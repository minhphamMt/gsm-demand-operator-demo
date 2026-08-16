begin;

create table if not exists public.dispatch_batches (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.proposals(id) on delete restrict,
  proposal_version integer not null,
  approved_content_hash text not null,
  status text not null check (status in (
    'QUEUED', 'DISPATCHING', 'PARTIALLY_ACKED', 'IN_PROGRESS',
    'PARTIALLY_EXECUTED', 'EXECUTED', 'FAILED', 'CANCELLED'
  )),
  idempotency_key text not null,
  released_by uuid references public.profiles(id) on delete set null,
  request_id text,
  correlation_id text,
  released_at timestamptz not null default now(),
  cancelled_at timestamptz,
  cancel_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (proposal_id),
  unique (released_by, idempotency_key)
);

create table if not exists public.dispatch_moves (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.dispatch_batches(id) on delete cascade,
  source_move_key text not null,
  source_zone_id integer not null check (source_zone_id between 1 and 30),
  target_zone_id integer not null check (target_zone_id between 1 and 30),
  planned_units integer not null check (planned_units > 0),
  acknowledged_units integer not null default 0 check (acknowledged_units >= 0),
  arrived_units integer not null default 0 check (arrived_units >= 0),
  available_units integer not null default 0 check (available_units >= 0),
  failed_units integer not null default 0 check (failed_units >= 0),
  state text not null default 'PLANNED' check (state in (
    'PLANNED', 'SENT', 'ACKNOWLEDGED', 'EN_ROUTE', 'ARRIVED',
    'AVAILABLE', 'FAILED', 'CANCELLED'
  )),
  route_source text,
  route_observed_at timestamptz,
  eta_minutes numeric(8,2),
  distance_km numeric(10,3),
  source_reserve numeric(12,2),
  range_slack_km numeric(10,3),
  marginal_benefit numeric(14,4),
  estimated_cost numeric(16,2),
  failure_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (batch_id, source_move_key)
);

create table if not exists public.dispatch_events (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.dispatch_batches(id) on delete cascade,
  move_id uuid references public.dispatch_moves(id) on delete cascade,
  event_key text not null unique,
  event_type text not null check (event_type in (
    'SENT', 'ACKNOWLEDGED', 'EN_ROUTE', 'ARRIVED', 'AVAILABLE',
    'FAILED', 'CANCELLED', 'RETRY_REQUESTED'
  )),
  units integer not null default 1 check (units > 0),
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  source text not null,
  quality_status text not null default 'UNVERIFIED' check (quality_status in ('UNVERIFIED', 'VALID', 'REJECTED')),
  payload jsonb not null default '{}'::jsonb,
  request_id text,
  correlation_id text
);
create index if not exists dispatch_events_batch_time_idx
  on public.dispatch_events(batch_id, occurred_at, received_at, id);

create table if not exists public.reconciliations (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.dispatch_batches(id) on delete cascade,
  revision integer not null,
  trigger_event_id uuid references public.dispatch_events(id) on delete set null,
  snapshot_id bigint references public.supply_demand_snapshots(id) on delete set null,
  planned_units integer not null,
  acknowledged_units integer not null,
  arrived_units integer not null,
  available_units integer not null,
  failed_units integer not null,
  actual_contribution integer not null,
  residual_gap numeric(14,4),
  is_snapshot_fresh boolean not null default false,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (batch_id, revision)
);

create or replace function public.reconcile_dispatch_batch(
  p_batch_id uuid, p_event_id uuid, p_snapshot_id bigint default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_revision integer;
  v_result uuid;
  v_planned integer;
  v_ack integer;
  v_arrived integer;
  v_available integer;
  v_failed integer;
  v_snapshot_at timestamptz;
  v_demand numeric;
  v_supply numeric;
begin
  perform 1 from public.dispatch_batches where id = p_batch_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Dispatch batch not found'; end if;
  select coalesce(max(revision), 0) + 1 into v_revision
  from public.reconciliations where batch_id = p_batch_id;
  select coalesce(sum(planned_units),0), coalesce(sum(acknowledged_units),0),
    coalesce(sum(arrived_units),0), coalesce(sum(available_units),0),
    coalesce(sum(failed_units),0)
  into v_planned, v_ack, v_arrived, v_available, v_failed
  from public.dispatch_moves where batch_id = p_batch_id;

  if p_snapshot_id is not null then
    select captured_at into v_snapshot_at from public.supply_demand_snapshots where id = p_snapshot_id;
    select coalesce(sum(demand_observed),0), coalesce(sum(idle_supply),0)
    into v_demand, v_supply from public.ai_zone_observations where snapshot_id = p_snapshot_id;
  end if;

  insert into public.reconciliations(
    batch_id, revision, trigger_event_id, snapshot_id, planned_units,
    acknowledged_units, arrived_units, available_units, failed_units,
    actual_contribution, residual_gap, is_snapshot_fresh, evidence
  ) values (
    p_batch_id, v_revision, p_event_id, p_snapshot_id, v_planned,
    v_ack, v_arrived, v_available, v_failed, v_available,
    case when p_snapshot_id is null then null else greatest(v_demand - v_supply - v_available, 0) end,
    v_snapshot_at is not null and v_snapshot_at >= now() - interval '15 minutes',
    jsonb_build_object('event_id', p_event_id, 'calculation', 'observed_gap_minus_verified_available')
  ) returning id into v_result;
  return v_result;
end;
$$;

create or replace function public.release_dispatch_batch(
  p_proposal_id uuid, p_actor_id uuid, p_idempotency_key text,
  p_request_id text
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_proposal public.proposals%rowtype;
  v_existing uuid;
  v_batch_id uuid;
  v_move jsonb;
  v_index integer := 0;
begin
  perform public.assert_operator_permission(p_actor_id, 'dispatch.release');
  perform set_config('app.request_id', coalesce(p_request_id, ''), true);
  perform set_config('app.correlation_id', coalesce(p_request_id, ''), true);
  if nullif(p_idempotency_key, '') is null then
    raise exception using errcode = '22023', message = 'Idempotency key is required';
  end if;
  select * into v_proposal from public.proposals where id = p_proposal_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Proposal not found'; end if;
  select id into v_existing from public.dispatch_batches where proposal_id = p_proposal_id;
  if v_existing is not null then return v_existing; end if;
  if v_proposal.status <> 'APPROVED'
     or v_proposal.approved_content_hash is null
     or v_proposal.approved_content_hash <> v_proposal.content_hash
     or v_proposal.approved_version <> v_proposal.version then
    raise exception using errcode = '23514', message = 'Approved proposal hash does not match current revision';
  end if;
  if coalesce(v_proposal.simulation_details ->> 'plan_mode', '') not in ('RELOCATION', 'HYBRID') then
    raise exception using errcode = '23514', message = 'Proposal has no direct relocation plan';
  end if;
  if jsonb_typeof(v_proposal.source_plan -> 'moves') <> 'array'
     or jsonb_array_length(v_proposal.source_plan -> 'moves') = 0 then
    raise exception using errcode = '23514', message = 'Proposal has no dispatchable moves';
  end if;

  insert into public.dispatch_batches(
    proposal_id, proposal_version, approved_content_hash, status,
    idempotency_key, released_by, request_id, correlation_id
  ) values (
    p_proposal_id, v_proposal.version, v_proposal.approved_content_hash,
    'QUEUED', p_idempotency_key, p_actor_id, p_request_id, p_request_id
  ) returning id into v_batch_id;

  for v_move in select value from jsonb_array_elements(v_proposal.source_plan -> 'moves')
  loop
    v_index := v_index + 1;
    if coalesce((v_move ->> 'drivers')::integer, (v_move ->> 'units_to_move')::integer, 0) <= 0 then
      continue;
    end if;
    insert into public.dispatch_moves(
      batch_id, source_move_key, source_zone_id, target_zone_id, planned_units,
      route_source, route_observed_at, eta_minutes, distance_km,
      source_reserve, range_slack_km, marginal_benefit, estimated_cost
    ) values (
      v_batch_id, coalesce(v_move ->> 'id', v_index::text),
      (v_move ->> 'from_zone')::integer, (v_move ->> 'to_zone')::integer,
      coalesce((v_move ->> 'drivers')::integer, (v_move ->> 'units_to_move')::integer),
      coalesce(v_move ->> 'route_source', 'optimizer'),
      coalesce((v_move ->> 'route_observed_at')::timestamptz, v_proposal.created_at),
      coalesce((v_move ->> 'eta_minutes')::numeric, 0),
      coalesce((v_move ->> 'distance_km')::numeric, 0),
      coalesce((v_move ->> 'source_supply_after')::numeric, 0),
      nullif(v_move ->> 'range_slack_km', '')::numeric,
      nullif(v_move ->> 'marginal_benefit', '')::numeric,
      coalesce((v_move ->> 'estimated_cost')::numeric, 0)
    );
  end loop;
  if not exists (select 1 from public.dispatch_moves where batch_id = v_batch_id) then
    raise exception using errcode = '23514', message = 'Proposal has no positive dispatch moves';
  end if;

  insert into public.outbox_events(aggregate_type, aggregate_id, event_type, event_key, payload)
  values ('dispatch_batch', v_batch_id::text, 'DISPATCH_RELEASED',
    'dispatch-release:' || v_batch_id::text,
    jsonb_build_object('batch_id', v_batch_id, 'proposal_id', p_proposal_id));
  insert into public.audit_logs(
    actor_id, actor_type, entity_type, entity_id, action, after_data,
    metadata, entity_version, entity_hash
  ) values (
    p_actor_id, 'OPERATOR', 'dispatch_batch', v_batch_id::text, 'DispatchReleased',
    jsonb_build_object('status', 'QUEUED', 'proposal_id', p_proposal_id),
    jsonb_build_object('proposal_id', p_proposal_id), 1, v_proposal.approved_content_hash
  );
  return v_batch_id;
end;
$$;

create or replace function public.record_dispatch_event(
  p_batch_id uuid, p_move_id uuid, p_event_key text, p_event_type text,
  p_units integer, p_occurred_at timestamptz, p_source text,
  p_payload jsonb, p_request_id text
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_existing uuid;
  v_event_id uuid;
  v_quality text := 'UNVERIFIED';
  v_accuracy numeric;
  v_snapshot_id bigint;
begin
  perform set_config('app.request_id', coalesce(p_request_id, ''), true);
  perform set_config('app.correlation_id', coalesce(p_request_id, ''), true);
  select id into v_existing from public.dispatch_events where event_key = p_event_key;
  if v_existing is not null then return v_existing; end if;
  perform 1 from public.dispatch_moves where id = p_move_id and batch_id = p_batch_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Dispatch move not found'; end if;
  if p_event_type not in ('SENT','ACKNOWLEDGED','EN_ROUTE','ARRIVED','AVAILABLE','FAILED','CANCELLED','RETRY_REQUESTED') then
    raise exception using errcode = '22023', message = 'Invalid dispatch event';
  end if;
  v_accuracy := nullif(p_payload ->> 'accuracy_m', '')::numeric;
  if p_event_type in ('ARRIVED', 'AVAILABLE') then
    v_quality := case when coalesce(v_accuracy, 9999) <= 50
      and coalesce((p_payload ->> 'inside_target')::boolean, false)
      then 'VALID' else 'REJECTED' end;
  end if;
  insert into public.dispatch_events(
    batch_id, move_id, event_key, event_type, units, occurred_at,
    source, quality_status, payload, request_id, correlation_id
  ) values (
    p_batch_id, p_move_id, p_event_key, p_event_type, greatest(p_units, 1),
    p_occurred_at, p_source, v_quality, coalesce(p_payload, '{}'::jsonb),
    p_request_id, p_request_id
  ) returning id into v_event_id;

  update public.dispatch_moves set
    state = case
      when p_event_type in ('ARRIVED','AVAILABLE') and v_quality = 'REJECTED' then state
      else p_event_type
    end,
    acknowledged_units = acknowledged_units + case when p_event_type = 'ACKNOWLEDGED' then p_units else 0 end,
    arrived_units = arrived_units + case when p_event_type = 'ARRIVED' and v_quality = 'VALID' then p_units else 0 end,
    available_units = available_units + case when p_event_type = 'AVAILABLE' and v_quality = 'VALID' then p_units else 0 end,
    failed_units = failed_units + case when p_event_type = 'FAILED' then p_units else 0 end,
    failure_code = case when p_event_type = 'FAILED' then p_payload ->> 'failure_code' else failure_code end,
    updated_at = now()
  where id = p_move_id;

  update public.dispatch_batches set status = case
    when not exists (select 1 from public.dispatch_moves where batch_id = p_batch_id and state not in ('AVAILABLE','FAILED','CANCELLED'))
      and exists (select 1 from public.dispatch_moves where batch_id = p_batch_id and state = 'AVAILABLE')
      and exists (select 1 from public.dispatch_moves where batch_id = p_batch_id and state in ('FAILED','CANCELLED')) then 'PARTIALLY_EXECUTED'
    when not exists (select 1 from public.dispatch_moves where batch_id = p_batch_id and state <> 'AVAILABLE') then 'EXECUTED'
    when exists (select 1 from public.dispatch_moves where batch_id = p_batch_id and state in ('ARRIVED','AVAILABLE')) then 'IN_PROGRESS'
    when exists (select 1 from public.dispatch_moves where batch_id = p_batch_id and state = 'ACKNOWLEDGED') then 'PARTIALLY_ACKED'
    else 'DISPATCHING' end,
    updated_at = now()
  where id = p_batch_id and status <> 'CANCELLED';

  select id into v_snapshot_id from public.supply_demand_snapshots
  order by captured_at desc, id desc limit 1;
  perform public.reconcile_dispatch_batch(p_batch_id, v_event_id, v_snapshot_id);
  return v_event_id;
end;
$$;

create or replace function public.cancel_dispatch_batch(
  p_batch_id uuid, p_actor_id uuid, p_reason text, p_request_id text
)
returns uuid language plpgsql security definer set search_path = public as $$
begin
  perform public.assert_operator_permission(p_actor_id, 'dispatch.release');
  perform set_config('app.request_id', coalesce(p_request_id, ''), true);
  perform set_config('app.correlation_id', coalesce(p_request_id, ''), true);
  perform 1 from public.dispatch_batches where id = p_batch_id
    and status not in ('EXECUTED','CANCELLED') for update;
  if not found then raise exception using errcode = '23514', message = 'Dispatch batch cannot be cancelled'; end if;
  update public.dispatch_moves set state = 'CANCELLED', updated_at = now()
  where batch_id = p_batch_id and state not in ('AVAILABLE','FAILED','CANCELLED');
  update public.dispatch_batches set status = 'CANCELLED', cancelled_at = now(),
    cancel_reason = p_reason, updated_at = now() where id = p_batch_id;
  insert into public.audit_logs(actor_id, actor_type, entity_type, entity_id,
    action, after_data, metadata)
  values (p_actor_id, 'OPERATOR', 'dispatch_batch', p_batch_id::text,
    'DispatchCancelled', jsonb_build_object('status','CANCELLED'),
    jsonb_build_object('reason',p_reason));
  return p_batch_id;
end;
$$;

alter table public.dispatch_batches enable row level security;
alter table public.dispatch_moves enable row level security;
alter table public.dispatch_events enable row level security;
alter table public.reconciliations enable row level security;
revoke all on public.dispatch_batches, public.dispatch_moves,
  public.dispatch_events, public.reconciliations from anon, authenticated;
grant all on public.dispatch_batches, public.dispatch_moves,
  public.dispatch_events, public.reconciliations to service_role;

revoke all on function public.release_dispatch_batch(uuid,uuid,text,text),
  public.record_dispatch_event(uuid,uuid,text,text,integer,timestamptz,text,jsonb,text),
  public.cancel_dispatch_batch(uuid,uuid,text,text),
  public.reconcile_dispatch_batch(uuid,uuid,bigint)
from public, anon, authenticated;
grant execute on function public.release_dispatch_batch(uuid,uuid,text,text),
  public.record_dispatch_event(uuid,uuid,text,text,integer,timestamptz,text,jsonb,text),
  public.cancel_dispatch_batch(uuid,uuid,text,text),
  public.reconcile_dispatch_batch(uuid,uuid,bigint)
to service_role;

commit;
