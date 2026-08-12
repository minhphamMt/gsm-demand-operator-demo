begin;

create or replace function public.revise_proposal(
  p_proposal_id uuid,
  p_actor_id uuid,
  p_source_plan jsonb,
  p_target_driver_count integer,
  p_campaign_duration_minutes integer,
  p_bonus_amount numeric,
  p_zone_trip_bonus numeric,
  p_fare_multiplier numeric,
  p_budget_limit numeric,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_revised_id uuid;
  v_overbooking_factor numeric;
  v_activation_budget_cap numeric;
  v_offer_count integer;
  v_activation_commitment numeric;
begin
  if p_campaign_duration_minutes < 5 or p_campaign_duration_minutes > 240
     or p_zone_trip_bonus < 0 or p_budget_limit < 0 then
    raise exception using errcode = '22023', message = 'Invalid revision duration or budget values';
  end if;

  v_revised_id := public.revise_proposal(
    p_proposal_id, p_actor_id, p_source_plan, p_target_driver_count,
    p_bonus_amount, p_fare_multiplier, p_note
  );
  select
    greatest(1, coalesce((simulation_details #>> '{activation_policy,overbooking_factor}')::numeric, 1)),
    nullif(simulation_details #>> '{activation_policy,budget_cap}', '')::numeric
  into v_overbooking_factor, v_activation_budget_cap
  from public.proposals
  where id = v_revised_id;
  v_offer_count := greatest(p_target_driver_count, ceil(p_target_driver_count * v_overbooking_factor)::integer);
  v_activation_commitment := v_offer_count * p_bonus_amount;

  if v_activation_budget_cap is not null and v_activation_commitment > v_activation_budget_cap then
    raise exception using errcode = '22023', message = 'Activation commitment exceeds the model budget cap';
  end if;

  update public.proposals
  set window_start_at = now(),
      window_end_at = now() + make_interval(mins => p_campaign_duration_minutes),
      target_driver_count = p_target_driver_count,
      offer_count = v_offer_count,
      -- estimated_cost is the maximum activation reward commitment. The
      -- relocation budget cap remains in source_plan.plan_totals.budget_cap.
      estimated_cost = v_activation_commitment,
      simulation_details = coalesce(simulation_details, '{}'::jsonb)
        || jsonb_build_object('zone_trip_bonus', p_zone_trip_bonus)
  where id = v_revised_id;

  return v_revised_id;
end;
$$;

revoke all on function public.revise_proposal(uuid, uuid, jsonb, integer, integer, numeric, numeric, numeric, numeric, text)
  from public, anon, authenticated;
grant execute on function public.revise_proposal(uuid, uuid, jsonb, integer, integer, numeric, numeric, numeric, numeric, text)
  to service_role;

commit;
