begin;

-- Keep the existing revision implementation intact and add a transactional
-- optimistic-concurrency wrapper for callers that provide a reviewed version.
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
  p_expected_version integer,
  p_note text,
  p_request_id text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_version integer;
  v_current_status text;
  v_revised_id uuid;
begin
  -- Never leave an interactive editor waiting behind an abandoned DB lock.
  -- A lock timeout is normalized to the same refresh-and-retry contract as a
  -- normal optimistic-concurrency conflict.
  perform set_config('lock_timeout', '5s', true);
  begin
    select version, status into v_current_version, v_current_status
    from public.proposals
    where id = p_proposal_id
    for update nowait;
  exception when lock_not_available then
    raise exception using errcode = '40001', message = 'Proposal version conflict';
  end;

  if not found then
    raise exception using errcode = 'P0002', message = 'Proposal not found';
  end if;
  if p_expected_version is null or p_expected_version <> v_current_version then
    raise exception using errcode = '40001', message = 'Proposal version conflict';
  end if;
  if v_current_status not in ('GENERATED', 'UNDER_REVIEW') then
    raise exception using errcode = '40001', message = 'Proposal version conflict';
  end if;

  -- Inline the request-context wrapper rather than calling the 11-argument
  -- overload. That keeps this row lock in one routine and prevents two
  -- concurrent HTTP RPC calls from waiting through nested overloads.
  v_revised_id := public.revise_proposal(
    p_proposal_id, p_actor_id, p_source_plan, p_target_driver_count,
    p_campaign_duration_minutes, p_bonus_amount, p_zone_trip_bonus,
    p_fare_multiplier, p_budget_limit, p_note
  );
  update public.audit_logs
  set before_data = coalesce(before_data, '{}'::jsonb) || jsonb_build_object('status', v_current_status),
      after_data = coalesce(after_data, '{}'::jsonb) || jsonb_build_object('status', 'UNDER_REVIEW'),
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('request_id', p_request_id)
  where entity_type = 'proposal' and entity_id = v_revised_id::text
    and action = 'Revised' and actor_id = p_actor_id;
  return v_revised_id;
end;
$$;

revoke all on function public.revise_proposal(uuid, uuid, jsonb, integer, integer, numeric, numeric, numeric, numeric, integer, text, text)
  from public, anon, authenticated;
grant execute on function public.revise_proposal(uuid, uuid, jsonb, integer, integer, numeric, numeric, numeric, numeric, integer, text, text)
  to service_role;

commit;
