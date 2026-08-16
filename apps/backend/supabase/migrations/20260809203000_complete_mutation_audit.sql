-- Complete request-correlated audit coverage for the two shared driver/operator
-- mutations while preserving the existing HTTP contracts.
begin;

create or replace function public.update_driver_status(
  p_driver_id uuid,
  p_status text,
  p_actor_id uuid,
  p_actor_type text,
  p_request_id text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before public.driver_states%rowtype;
  v_next_online boolean;
  v_next_status text;
begin
  if p_status not in ('offline', 'online') then
    raise exception using errcode = '22023', message = 'Invalid driver status';
  end if;
  if p_actor_type not in ('DRIVER', 'OPERATOR') then
    raise exception using errcode = '22023', message = 'Invalid actor type';
  end if;

  select * into v_before from public.driver_states where driver_id = p_driver_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Driver not found';
  end if;
  v_next_online := p_status = 'online';
  v_next_status := case when v_next_online then 'IDLE' else 'OFFLINE' end;

  update public.driver_states
  set is_online = v_next_online, operational_status = v_next_status, updated_at = now()
  where driver_id = p_driver_id;

  insert into public.audit_logs (
    actor_id, actor_type, entity_type, entity_id, action, before_data, after_data, metadata
  ) values (
    p_actor_id, p_actor_type, 'driver', p_driver_id::text, 'DriverStatusChanged',
    jsonb_build_object('is_online', v_before.is_online, 'operational_status', v_before.operational_status),
    jsonb_build_object('is_online', v_next_online, 'operational_status', v_next_status),
    jsonb_build_object('request_id', p_request_id)
  );
  return p_driver_id;
end;
$$;

create or replace function public.respond_to_offer(
  p_offer_id uuid,
  p_driver_id uuid,
  p_response text,
  p_actor_type text,
  p_request_id text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaign_id uuid;
  v_result uuid;
begin
  select campaign_id into v_campaign_id from public.driver_offers where id = p_offer_id;
  v_result := public.respond_to_offer(p_offer_id, p_driver_id, p_response, p_actor_type);
  update public.audit_logs
  set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('request_id', p_request_id)
  where actor_id = p_driver_id
    and (
      (entity_type = 'offer' and entity_id = p_offer_id::text and action in ('OfferAccepted', 'OfferDeclined'))
      or (entity_type = 'campaign' and entity_id = v_campaign_id::text and action = 'CampaignTargetReached')
    );
  return v_result;
end;
$$;

revoke all on function public.update_driver_status(uuid, text, uuid, text, text) from public, anon, authenticated;
revoke all on function public.respond_to_offer(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.update_driver_status(uuid, text, uuid, text, text) to service_role;
grant execute on function public.respond_to_offer(uuid, uuid, text, text, text) to service_role;

commit;
