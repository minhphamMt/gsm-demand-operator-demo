begin;

-- A relocation plan can legitimately cover the full gap and therefore need
-- no activation campaign. Revision must preserve that zero activation target.
create or replace function public.revise_proposal(
  p_proposal_id uuid,
  p_actor_id uuid,
  p_source_plan jsonb,
  p_target_driver_count integer,
  p_bonus_amount numeric,
  p_fare_multiplier numeric,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current public.proposals%rowtype;
  v_new_id uuid;
begin
  select * into v_current from public.proposals where id = p_proposal_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Proposal not found'; end if;
  if v_current.status not in ('GENERATED', 'UNDER_REVIEW') then
    raise exception using errcode = '23514', message = 'Proposal cannot be revised in its current state';
  end if;
  if v_current.window_end_at is null or v_current.window_end_at <= now() then
    raise exception using errcode = '23514', message = 'Proposal input window has expired';
  end if;
  if p_target_driver_count < 0 or p_bonus_amount < 0
     or p_fare_multiplier < 1 or p_fare_multiplier > 5 then
    raise exception using errcode = '22023', message = 'Invalid revision values';
  end if;

  insert into public.proposals (
    hotspot_id, input_snapshot_id, root_proposal_id, parent_proposal_id, version,
    generator_type, generator_version, status, policy_status, target_zone_ids,
    target_geofence, source_plan, target_driver_count, offer_count,
    window_start_at, window_end_at, bonus_amount, fare_multiplier, estimated_cost,
    simulation_details, explanation, review_note
  ) values (
    v_current.hotspot_id, v_current.input_snapshot_id,
    coalesce(v_current.root_proposal_id, v_current.id), v_current.id, coalesce(v_current.version, 1) + 1,
    v_current.generator_type, v_current.generator_version, 'UNDER_REVIEW', v_current.policy_status,
    v_current.target_zone_ids, v_current.target_geofence, p_source_plan,
    p_target_driver_count, greatest(0, p_target_driver_count),
    v_current.window_start_at, v_current.window_end_at, p_bonus_amount, p_fare_multiplier,
    p_target_driver_count * p_bonus_amount, v_current.simulation_details,
    v_current.explanation, p_note
  ) returning id into v_new_id;

  update public.proposals set status = 'STALE' where id = v_current.id;
  insert into public.audit_logs (actor_id, actor_type, entity_type, entity_id, action, before_data, after_data)
  values (
    p_actor_id, 'OPERATOR', 'proposal', v_new_id::text, 'Revised',
    jsonb_build_object('proposal_id', v_current.id, 'version', v_current.version),
    jsonb_build_object('proposal_id', v_new_id, 'version', coalesce(v_current.version, 1) + 1)
  );
  return v_new_id;
end;
$$;

-- Approval validates the plan. Positive activation incentives are required
-- only when there is no direct relocation move and activation is the plan.
create or replace function public.enforce_proposal_operational_readiness()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_has_direct_move boolean;
begin
  if new.status = 'APPROVED' and new.status is distinct from old.status then
    select exists (
      select 1
      from jsonb_array_elements(
        case
          when jsonb_typeof(new.source_plan -> 'moves') = 'array'
            then new.source_plan -> 'moves'
          else '[]'::jsonb
        end
      ) as move
      where coalesce(
        nullif(move ->> 'units_to_move', '')::numeric,
        nullif(move ->> 'drivers', '')::numeric,
        nullif(move ->> 'quantity', '')::numeric,
        0
      ) > 0
    ) into v_has_direct_move;
    if new.policy_status <> 'PASSED'
       or (
         not v_has_direct_move
         and (
           coalesce(new.target_driver_count, 0) < 1
           or coalesce(new.bonus_amount, 0) <= 0
           or coalesce(new.estimated_cost, 0) <= 0
         )
       )
       or jsonb_path_exists(coalesce(new.simulation_details, '{}'::jsonb),
            '$.warnings[*] ? (@.code == "NO_SOLUTION")') then
      raise exception using errcode = '23514', message = 'Proposal has no valid operational plan';
    end if;
  end if;
  return new;
end;
$$;

commit;
