-- Attach the HTTP correlation ID to every operator workflow audit row without
-- weakening the existing atomic lifecycle functions.
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
  p_note text,
  p_request_id text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before_status text;
  v_revised_id uuid;
begin
  select status into v_before_status from public.proposals where id = p_proposal_id;
  v_revised_id := public.revise_proposal(
    p_proposal_id, p_actor_id, p_source_plan, p_target_driver_count,
    p_campaign_duration_minutes, p_bonus_amount, p_zone_trip_bonus,
    p_fare_multiplier, p_budget_limit, p_note
  );
  update public.audit_logs
  set before_data = coalesce(before_data, '{}'::jsonb) || jsonb_build_object('status', v_before_status),
      after_data = coalesce(after_data, '{}'::jsonb) || jsonb_build_object('status', 'UNDER_REVIEW'),
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('request_id', p_request_id)
  where entity_type = 'proposal' and entity_id = v_revised_id::text
    and action = 'Revised' and actor_id = p_actor_id;
  return v_revised_id;
end;
$$;

create or replace function public.review_proposal(
  p_proposal_id uuid,
  p_actor_id uuid,
  p_decision text,
  p_note text,
  p_reason_code text,
  p_request_id text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result uuid;
begin
  v_result := public.review_proposal(p_proposal_id, p_actor_id, p_decision, p_note, p_reason_code);
  update public.audit_logs
  set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('request_id', p_request_id)
  where entity_type = 'proposal' and entity_id = p_proposal_id::text
    and action = case when p_decision = 'APPROVED' then 'Approved' else 'Rejected' end
    and actor_id = p_actor_id;
  return v_result;
end;
$$;

create or replace function public.activate_proposal(
  p_proposal_id uuid,
  p_actor_id uuid,
  p_response_mode text,
  p_driver_ids uuid[],
  p_request_id text
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_campaign_id uuid;
begin
  v_campaign_id := public.activate_proposal(p_proposal_id, p_actor_id, p_response_mode, p_driver_ids);
  update public.audit_logs
  set before_data = jsonb_build_object('campaign', null, 'proposal_status', 'APPROVED'),
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('request_id', p_request_id)
  where entity_type = 'campaign' and entity_id = v_campaign_id::text
    and action = 'ActivationStarted' and actor_id = p_actor_id;
  return v_campaign_id;
end;
$$;

create or replace function public.cancel_campaign(
  p_campaign_id uuid,
  p_actor_id uuid,
  p_request_id text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result uuid;
begin
  v_result := public.cancel_campaign(p_campaign_id, p_actor_id);
  update public.audit_logs
  set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('request_id', p_request_id)
  where entity_type = 'campaign' and entity_id = p_campaign_id::text
    and action = 'CampaignCancelled' and actor_id = p_actor_id;
  return v_result;
end;
$$;

create or replace function public.expire_offer(
  p_offer_id uuid,
  p_actor_id uuid,
  p_request_id text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result uuid;
begin
  v_result := public.expire_offer(p_offer_id, p_actor_id);
  update public.audit_logs
  set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('request_id', p_request_id)
  where entity_type = 'offer' and entity_id = p_offer_id::text
    and action = 'OfferExpired' and actor_id = p_actor_id;
  return v_result;
end;
$$;

revoke all on function public.revise_proposal(uuid, uuid, jsonb, integer, integer, numeric, numeric, numeric, numeric, text, text) from public, anon, authenticated;
revoke all on function public.review_proposal(uuid, uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.activate_proposal(uuid, uuid, text, uuid[], text) from public, anon, authenticated;
revoke all on function public.cancel_campaign(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.expire_offer(uuid, uuid, text) from public, anon, authenticated;

grant execute on function public.revise_proposal(uuid, uuid, jsonb, integer, integer, numeric, numeric, numeric, numeric, text, text) to service_role;
grant execute on function public.review_proposal(uuid, uuid, text, text, text, text) to service_role;
grant execute on function public.activate_proposal(uuid, uuid, text, uuid[], text) to service_role;
grant execute on function public.cancel_campaign(uuid, uuid, text) to service_role;
grant execute on function public.expire_offer(uuid, uuid, text) to service_role;

commit;
