begin;

-- Optimizer proposals persist route evidence as eta_steps and
-- estimated_distance_km/deadhead_km. Preserve those values when the approved
-- immutable proposal is materialized into an execution batch.
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
      coalesce(
        nullif(v_move ->> 'eta_minutes', '')::numeric,
        nullif(v_move ->> 'eta_steps', '')::numeric * 5,
        0
      ),
      coalesce(
        nullif(v_move ->> 'distance_km', '')::numeric,
        nullif(v_move ->> 'estimated_distance_km', '')::numeric,
        nullif(v_move ->> 'deadhead_km', '')::numeric,
        0
      ),
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

-- Repair route evidence for batches created before this contract fix without
-- changing any move quantity, source, target, lifecycle state, or audit row.
with source_metrics as (
  select
    batches.id as batch_id,
    coalesce(move.value ->> 'id', move.ordinality::text) as source_move_key,
    coalesce(
      nullif(move.value ->> 'eta_minutes', '')::numeric,
      nullif(move.value ->> 'eta_steps', '')::numeric * 5,
      0
    ) as eta_minutes,
    coalesce(
      nullif(move.value ->> 'distance_km', '')::numeric,
      nullif(move.value ->> 'estimated_distance_km', '')::numeric,
      nullif(move.value ->> 'deadhead_km', '')::numeric,
      0
    ) as distance_km
  from public.dispatch_batches batches
  join public.proposals proposals on proposals.id = batches.proposal_id
  cross join lateral jsonb_array_elements(proposals.source_plan -> 'moves')
    with ordinality as move(value, ordinality)
)
update public.dispatch_moves moves
set
  eta_minutes = case
    when coalesce(moves.eta_minutes, 0) = 0 then source_metrics.eta_minutes
    else moves.eta_minutes
  end,
  distance_km = case
    when coalesce(moves.distance_km, 0) = 0 then source_metrics.distance_km
    else moves.distance_km
  end,
  updated_at = now()
from source_metrics
where moves.batch_id = source_metrics.batch_id
  and moves.source_move_key = source_metrics.source_move_key
  and (
    (coalesce(moves.eta_minutes, 0) = 0 and source_metrics.eta_minutes > 0)
    or (coalesce(moves.distance_km, 0) = 0 and source_metrics.distance_km > 0)
  );

revoke all on function public.release_dispatch_batch(uuid,uuid,text,text)
from public, anon, authenticated;
grant execute on function public.release_dispatch_batch(uuid,uuid,text,text)
to service_role;

commit;
