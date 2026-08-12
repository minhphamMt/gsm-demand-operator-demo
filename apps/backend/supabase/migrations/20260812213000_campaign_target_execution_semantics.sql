begin;

-- TARGET_REACHED means recruitment is full; accepted drivers are still moving
-- toward the target. Only a truly closed campaign may release driver state.
create or replace function public.release_driver_states_for_terminal_campaign()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('COMPLETED', 'CANCELLED', 'BUDGET_EXHAUSTED')
     and new.status is distinct from old.status then
    update public.driver_states
    set active_campaign_id = null,
        operational_status = case when is_online then 'IDLE' else 'OFFLINE' end,
        updated_at = now()
    where active_campaign_id = new.id;
  end if;
  return new;
end;
$$;

-- A target-reached campaign must still close when its execution window ends
-- or its budget is exhausted. Row locks keep concurrent schedulers idempotent.
create or replace function public.reconcile_campaign_lifecycle(p_request_id text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaign public.campaigns%rowtype;
  v_next_status text;
  v_campaign_count integer := 0;
  v_offer_count integer := 0;
  v_expired integer;
  v_request_id text := coalesce(nullif(p_request_id, ''), 'lifecycle-' || gen_random_uuid()::text);
begin
  for v_campaign in
    select * from public.campaigns
    where status in ('ACTIVE', 'TARGET_REACHED')
      and ((budget_limit > 0 and budget_used >= budget_limit) or end_at <= now())
    order by id for update skip locked
  loop
    v_next_status := case
      when v_campaign.budget_limit > 0 and v_campaign.budget_used >= v_campaign.budget_limit then 'BUDGET_EXHAUSTED'
      else 'COMPLETED'
    end;

    update public.campaigns set status = v_next_status, completed_at = coalesce(completed_at, now())
    where id = v_campaign.id and status in ('ACTIVE', 'TARGET_REACHED');
    if not found then continue; end if;

    with candidates as materialized (
      select id, status from public.driver_offers
      where campaign_id = v_campaign.id and status in ('CREATED', 'SENT', 'VIEWED')
      for update skip locked
    ), expired as (
      update public.driver_offers offers
      set status = 'EXPIRED', responded_at = coalesce(offers.responded_at, now())
      from candidates where offers.id = candidates.id
      returning offers.id, candidates.status as before_status
    ), audited as (
      insert into public.audit_logs (
        actor_id, actor_type, entity_type, entity_id, action, before_data, after_data, metadata
      )
      select null, 'SYSTEM', 'offer', expired.id::text, 'OfferExpired',
        jsonb_build_object('status', expired.before_status), jsonb_build_object('status', 'EXPIRED'),
        jsonb_build_object('request_id', v_request_id, 'campaign_id', v_campaign.id, 'reason', 'campaign_terminal')
      from expired returning 1
    )
    select count(*) into v_expired from audited;
    v_offer_count := v_offer_count + v_expired;

    insert into public.audit_logs (
      actor_id, actor_type, entity_type, entity_id, action, before_data, after_data, metadata
    ) values (
      null, 'SYSTEM', 'campaign', v_campaign.id::text,
      case when v_next_status = 'BUDGET_EXHAUSTED' then 'CampaignBudgetExhausted' else 'CampaignCompleted' end,
      jsonb_build_object('status', v_campaign.status, 'budget_used', v_campaign.budget_used),
      jsonb_build_object('status', v_next_status, 'budget_used', v_campaign.budget_used),
      jsonb_build_object('request_id', v_request_id, 'proposal_id', v_campaign.proposal_id,
        'expired_offer_count', v_expired,
        'reason', case when v_next_status = 'BUDGET_EXHAUSTED' then 'budget_limit_reached' else 'end_at_reached' end)
    );
    v_campaign_count := v_campaign_count + 1;
  end loop;

  with candidates as materialized (
    select offers.id, offers.campaign_id, offers.status
    from public.driver_offers offers
    join public.campaigns campaigns on campaigns.id = offers.campaign_id
    where campaigns.status in ('ACTIVE', 'TARGET_REACHED')
      and offers.status in ('CREATED', 'SENT', 'VIEWED')
      and offers.expires_at <= now()
    for update of offers skip locked
  ), expired as (
    update public.driver_offers offers
    set status = 'EXPIRED', responded_at = coalesce(offers.responded_at, now())
    from candidates where offers.id = candidates.id
    returning offers.id, offers.campaign_id, candidates.status as before_status
  ), audited as (
    insert into public.audit_logs (
      actor_id, actor_type, entity_type, entity_id, action, before_data, after_data, metadata
    )
    select null, 'SYSTEM', 'offer', expired.id::text, 'OfferExpired',
      jsonb_build_object('status', expired.before_status), jsonb_build_object('status', 'EXPIRED'),
      jsonb_build_object('request_id', v_request_id, 'campaign_id', expired.campaign_id, 'reason', 'expires_at_reached')
    from expired returning 1
  )
  select count(*) into v_expired from audited;
  v_offer_count := v_offer_count + v_expired;

  return jsonb_build_object('campaigns_transitioned', v_campaign_count, 'offers_expired', v_offer_count,
    'request_id', v_request_id, 'ran_at', now());
end;
$$;

revoke all on function public.reconcile_campaign_lifecycle(text) from public, anon, authenticated;
grant execute on function public.reconcile_campaign_lifecycle(text) to service_role;

commit;
