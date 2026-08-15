begin;

-- Historical approved proposals predate immutable approval hashes. Backfill
-- them once from the content hash already computed by the governance migration.
update public.proposals
set approved_content_hash = content_hash,
    approved_version = version
where status = 'APPROVED'
  and (approved_content_hash is null or approved_version is null);

-- Preserve the existing campaign target transition while retaining the new
-- driver-assignment lock and budget-ledger guarantees.
create or replace function public.respond_to_offer(
  p_offer_id uuid, p_driver_id uuid, p_response text,
  p_actor_type text, p_request_id text
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_offer public.driver_offers%rowtype;
  v_campaign public.campaigns%rowtype;
  v_driver_state public.driver_states%rowtype;
  v_active_count integer;
  v_participation_id uuid;
begin
  perform set_config('app.request_id', coalesce(p_request_id, ''), true);
  perform set_config('app.correlation_id', coalesce(p_request_id, ''), true);
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
  if v_offer.status = p_response then return p_offer_id; end if;
  if v_offer.status not in ('SENT', 'DELIVERED', 'VIEWED') or v_offer.expires_at <= now() then
    raise exception using errcode = '23514', message = 'Offer is expired or closed';
  end if;

  select * into v_campaign from public.campaigns where id = v_offer.campaign_id for update;
  if v_campaign.status <> 'ACTIVE' then
    raise exception using errcode = '23514', message = 'Campaign is not active';
  end if;

  insert into public.driver_states(driver_id, is_online, operational_status, updated_at)
  values (p_driver_id, true, 'IDLE', now()) on conflict (driver_id) do nothing;
  select * into v_driver_state from public.driver_states where driver_id = p_driver_id for update;

  if p_response = 'ACCEPTED' then
    if v_driver_state.active_campaign_id is not null
       and v_driver_state.active_campaign_id <> v_campaign.id then
      raise exception using errcode = '23505', message = 'Driver is already in an active campaign';
    end if;
    select count(*) into v_active_count from public.campaign_participations
    where campaign_id = v_campaign.id
      and status in ('ACCEPTED', 'EN_ROUTE', 'ARRIVED_VERIFIED', 'ACTIVATED');
    if v_active_count >= v_campaign.target_driver_count then
      raise exception using errcode = '23514', message = 'Campaign target is already full';
    end if;

    update public.driver_offers set status = 'ACCEPTED', responded_at = now() where id = p_offer_id;
    insert into public.campaign_participations(
      campaign_id, driver_id, offer_id, status, accepted_at, slot_deadline_at, arrival_deadline_at
    ) values (
      v_campaign.id, p_driver_id, p_offer_id, 'ACCEPTED', now(),
      least(v_campaign.end_at, now() + interval '15 minutes'),
      least(v_campaign.end_at, now() + interval '60 minutes')
    ) returning id into v_participation_id;
    update public.driver_states set active_campaign_id = v_campaign.id,
      operational_status = 'EN_ROUTE', is_online = true, updated_at = now()
    where driver_id = p_driver_id;
    insert into public.budget_ledger_entries(
      account_id, campaign_id, participation_id, entry_type, amount, source,
      policy_version, idempotency_key, request_id, correlation_id
    ) values (
      v_campaign.budget_account_id, v_campaign.id, v_participation_id, 'COMMITTED',
      greatest(coalesce(v_campaign.bonus_amount, 0), 0), 'OFFER_ACCEPTED', 'policy-v1',
      'offer-commit:' || p_offer_id::text, p_request_id, p_request_id
    ) on conflict (idempotency_key) do nothing;

    if v_active_count + 1 >= v_campaign.target_driver_count then
      update public.campaigns
      set status = 'TARGET_REACHED', updated_at = now()
      where id = v_campaign.id;
      update public.driver_offers
      set status = 'EXPIRED', responded_at = coalesce(responded_at, now())
      where campaign_id = v_campaign.id
        and id <> p_offer_id
        and status in ('CREATED', 'SENT', 'DELIVERED', 'VIEWED');
      insert into public.audit_logs(
        actor_id, actor_type, entity_type, entity_id, action,
        before_data, after_data, metadata, entity_version
      ) values (
        p_driver_id, p_actor_type, 'campaign', v_campaign.id::text, 'CampaignTargetReached',
        jsonb_build_object('status', v_campaign.status),
        jsonb_build_object('status', 'TARGET_REACHED', 'accepted', v_active_count + 1),
        jsonb_build_object('proposal_id', v_campaign.proposal_id), 1
      );
    end if;
  else
    update public.driver_offers set status = 'DECLINED', responded_at = now() where id = p_offer_id;
  end if;

  insert into public.audit_logs(
    actor_id, actor_type, entity_type, entity_id, action, before_data, after_data,
    metadata, entity_version
  ) values (
    p_driver_id, p_actor_type, 'offer', p_offer_id::text,
    case when p_response = 'ACCEPTED' then 'OfferAccepted' else 'OfferDeclined' end,
    jsonb_build_object('status', v_offer.status), jsonb_build_object('status', p_response),
    jsonb_build_object('campaign_id', v_campaign.id, 'proposal_id', v_campaign.proposal_id), 1
  );
  return p_offer_id;
end;
$$;

revoke all on function public.respond_to_offer(uuid,uuid,text,text,text)
  from public, anon, authenticated;
grant execute on function public.respond_to_offer(uuid,uuid,text,text,text)
  to service_role;

commit;
