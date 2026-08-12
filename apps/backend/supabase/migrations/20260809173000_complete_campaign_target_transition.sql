begin;

create or replace function public.respond_to_offer(
  p_offer_id uuid,
  p_driver_id uuid,
  p_response text,
  p_actor_type text default 'DRIVER'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_offer public.driver_offers%rowtype;
  v_campaign public.campaigns%rowtype;
  v_active_count integer;
begin
  if p_response not in ('ACCEPTED', 'DECLINED') then
    raise exception using errcode = '22023', message = 'Invalid offer response';
  end if;
  if p_actor_type not in ('DRIVER', 'OPERATOR') then
    raise exception using errcode = '22023', message = 'Invalid actor type';
  end if;

  select * into v_offer from public.driver_offers where id = p_offer_id for update;
  if not found or v_offer.driver_id <> p_driver_id then
    raise exception using errcode = 'P0002', message = 'Offer not found';
  end if;
  if v_offer.status not in ('SENT', 'VIEWED') or v_offer.expires_at <= now() then
    raise exception using errcode = '23514', message = 'Offer is expired or closed';
  end if;

  select * into v_campaign from public.campaigns where id = v_offer.campaign_id for update;
  if v_campaign.status <> 'ACTIVE' then
    raise exception using errcode = '23514', message = 'Campaign is not active';
  end if;

  if p_response = 'ACCEPTED' then
    select count(*) into v_active_count
    from public.campaign_participations
    where campaign_id = v_campaign.id
      and status in ('ACCEPTED', 'EN_ROUTE', 'ARRIVED_VERIFIED', 'ACTIVATED');
    if v_active_count >= v_campaign.target_driver_count then
      raise exception using errcode = '23514', message = 'Campaign target is already full';
    end if;

    update public.driver_offers set status = 'ACCEPTED', responded_at = now() where id = p_offer_id;
    insert into public.campaign_participations (
      campaign_id, driver_id, offer_id, status, accepted_at, slot_deadline_at, arrival_deadline_at
    ) values (
      v_campaign.id, p_driver_id, p_offer_id, 'ACCEPTED', now(),
      least(v_campaign.end_at, now() + interval '10 minutes'),
      least(v_campaign.end_at, now() + interval '30 minutes')
    );
    update public.driver_states
      set active_campaign_id = v_campaign.id, operational_status = 'EN_ROUTE', is_online = true
      where driver_id = p_driver_id;

    v_active_count := v_active_count + 1;
    if v_active_count >= v_campaign.target_driver_count then
      update public.campaigns set status = 'TARGET_REACHED' where id = v_campaign.id;
      update public.driver_offers
        set status = 'EXPIRED', responded_at = coalesce(responded_at, now())
        where campaign_id = v_campaign.id
          and id <> p_offer_id
          and status in ('CREATED', 'SENT', 'VIEWED');
      insert into public.audit_logs (
        actor_id, actor_type, entity_type, entity_id, action, before_data, after_data, metadata
      ) values (
        p_driver_id, p_actor_type, 'campaign', v_campaign.id::text, 'CampaignTargetReached',
        jsonb_build_object('status', v_campaign.status), jsonb_build_object('status', 'TARGET_REACHED'),
        jsonb_build_object('proposal_id', v_campaign.proposal_id, 'accepted_count', v_active_count)
      );
    end if;
  else
    update public.driver_offers set status = 'DECLINED', responded_at = now() where id = p_offer_id;
  end if;

  insert into public.audit_logs (actor_id, actor_type, entity_type, entity_id, action, before_data, after_data, metadata)
  values (
    p_driver_id, p_actor_type, 'offer', p_offer_id::text,
    case when p_response = 'ACCEPTED' then 'OfferAccepted' else 'OfferDeclined' end,
    jsonb_build_object('status', v_offer.status), jsonb_build_object('status', p_response),
    jsonb_build_object('campaign_id', v_campaign.id, 'proposal_id', v_campaign.proposal_id)
  );
  return p_offer_id;
end;
$$;

revoke all on function public.respond_to_offer(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.respond_to_offer(uuid, uuid, text, text) to service_role;

commit;
