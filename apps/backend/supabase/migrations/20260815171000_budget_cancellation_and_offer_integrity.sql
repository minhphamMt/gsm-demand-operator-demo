begin;

create table if not exists public.budget_accounts (
  id uuid primary key default gen_random_uuid(),
  account_key text not null unique,
  market_code text not null default 'HN',
  currency text not null default 'VND' check (currency = 'VND'),
  credit_limit numeric(16,2) not null check (credit_limit >= 0),
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'FROZEN', 'CLOSED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.budget_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.budget_accounts(id) on delete restrict,
  campaign_id uuid references public.campaigns(id) on delete restrict,
  participation_id uuid references public.campaign_participations(id) on delete restrict,
  reward_id bigint references public.reward_records(id) on delete restrict,
  entry_type text not null check (entry_type in (
    'LEGACY_AGGREGATE', 'RESERVED', 'COMMITTED', 'QUALIFIED',
    'COMPENSATION_DUE', 'PAID', 'RELEASED', 'ADJUSTMENT'
  )),
  amount numeric(16,2) not null check (amount >= 0),
  source text not null,
  policy_version text,
  idempotency_key text not null unique,
  request_id text,
  correlation_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists budget_ledger_account_idx
  on public.budget_ledger_entries(account_id, created_at, id);
create index if not exists budget_ledger_campaign_idx
  on public.budget_ledger_entries(campaign_id, created_at, id)
  where campaign_id is not null;

insert into public.budget_accounts(account_key, market_code, credit_limit)
values ('HN:operator', 'HN', 100000000)
on conflict (account_key) do nothing;

alter table public.campaigns
  add column if not exists budget_account_id uuid references public.budget_accounts(id) on delete restrict,
  add column if not exists cancellation_reason text,
  add column if not exists cancellation_disposition text,
  add column if not exists cancellation_policy_version text,
  add column if not exists cancelled_at timestamptz;

alter table public.driver_offers
  add column if not exists cancellation_reason text,
  add column if not exists cancellation_policy_version text;

alter table public.campaign_participations
  add column if not exists cancellation_reason text,
  add column if not exists cancellation_disposition text,
  add column if not exists cancellation_policy_version text,
  add column if not exists cancelled_at timestamptz;

alter table public.driver_offers alter column status type varchar(32);
alter table public.campaign_participations alter column status type varchar(32);

alter table public.campaigns drop constraint if exists campaigns_status_check;
alter table public.campaigns add constraint campaigns_status_check check (status in (
  'DRAFT', 'SCHEDULED', 'ACTIVE', 'PAUSED', 'TARGET_REACHED',
  'BUDGET_EXHAUSTED', 'EXPIRED', 'CANCELLED', 'SETTLING', 'SETTLED', 'COMPLETED'
));
alter table public.driver_offers drop constraint if exists driver_offers_status_check;
alter table public.driver_offers add constraint driver_offers_status_check check (status in (
  'CREATED', 'SENT', 'DELIVERED', 'VIEWED', 'ACCEPTED', 'DECLINED',
  'EXPIRED', 'CANCELLED_BEFORE_ACCEPT'
));
update public.campaign_participations
set status = 'CANCELLED_AFTER_ACCEPT',
    cancelled_at = coalesce(cancelled_at, updated_at, now()),
    cancellation_reason = coalesce(cancellation_reason, 'LEGACY_CANCELLATION'),
    cancellation_disposition = coalesce(cancellation_disposition, 'NO_COMPENSATION'),
    cancellation_policy_version = coalesce(cancellation_policy_version, 'legacy')
where status = 'CANCELLED';
alter table public.campaign_participations drop constraint if exists campaign_participations_status_check;
alter table public.campaign_participations add constraint campaign_participations_status_check check (status in (
  'ACCEPTED', 'EN_ROUTE', 'ARRIVED_VERIFIED', 'ACTIVATED',
  'CANCELLED_AFTER_ACCEPT', 'LOCATION_LOST', 'NO_SHOW'
));
alter table public.reward_records drop constraint if exists reward_records_status_check;
alter table public.reward_records add constraint reward_records_status_check check (status in (
  'PENDING', 'RESERVED', 'COMMITTED', 'QUALIFIED', 'COMPENSATION_DUE',
  'PAID', 'RELEASED', 'PAYMENT_FAILED', 'NOT_QUALIFIED', 'SIMULATED_PAID'
));

update public.campaigns
set budget_account_id = (select id from public.budget_accounts where account_key = 'HN:operator')
where budget_account_id is null;

insert into public.budget_ledger_entries(
  account_id, campaign_id, entry_type, amount, source, policy_version,
  idempotency_key, metadata, created_at
)
select c.budget_account_id, c.id, 'LEGACY_AGGREGATE', greatest(coalesce(c.budget_used, 0), 0),
  'LEGACY_AGGREGATE', 'legacy', 'legacy-campaign:' || c.id::text,
  jsonb_build_object('budget_used', coalesce(c.budget_used, 0)), c.created_at
from public.campaigns c
where c.budget_account_id is not null
on conflict (idempotency_key) do nothing;

create or replace view public.budget_account_balances_v
with (security_invoker = true) as
select a.id, a.account_key, a.market_code, a.currency, a.credit_limit,
  coalesce(sum(case when l.entry_type = 'RESERVED' then l.amount
                    when l.entry_type = 'RELEASED' then -l.amount
                    else 0 end), 0) as reserved_amount,
  coalesce(sum(case when l.entry_type in ('COMMITTED', 'QUALIFIED', 'COMPENSATION_DUE', 'PAID')
                    then l.amount else 0 end), 0) as lifecycle_amount,
  greatest(a.credit_limit - coalesce(sum(case
    when l.entry_type = 'RESERVED' then l.amount
    when l.entry_type = 'RELEASED' then -l.amount
    else 0 end), 0), 0) as available_amount,
  a.status
from public.budget_accounts a
left join public.budget_ledger_entries l on l.account_id = a.id
group by a.id;

-- Reserve the campaign's worst-case commitment in the same transaction that
-- creates its offers.  The approved content hash must still match.
create or replace function public.activate_proposal(
  p_proposal_id uuid, p_actor_id uuid, p_response_mode text,
  p_driver_ids uuid[], p_request_id text
)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare
  v_proposal public.proposals%rowtype;
  v_account public.budget_accounts%rowtype;
  v_reserved numeric;
  v_campaign_id uuid;
begin
  perform public.assert_operator_permission(p_actor_id, 'campaign.release');
  perform set_config('app.request_id', coalesce(p_request_id, ''), true);
  perform set_config('app.correlation_id', coalesce(p_request_id, ''), true);
  select * into v_proposal from public.proposals where id = p_proposal_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Proposal not found'; end if;
  if v_proposal.status <> 'APPROVED'
     or v_proposal.approved_content_hash is null
     or v_proposal.approved_content_hash <> v_proposal.content_hash
     or v_proposal.approved_version <> v_proposal.version then
    raise exception using errcode = '23514', message = 'Approved proposal hash does not match current revision';
  end if;

  select * into v_account from public.budget_accounts
  where account_key = 'HN:operator' and status = 'ACTIVE' for update;
  if not found then raise exception using errcode = '23514', message = 'Budget account is unavailable'; end if;
  select coalesce(sum(case when entry_type = 'RESERVED' then amount
                           when entry_type = 'RELEASED' then -amount else 0 end), 0)
  into v_reserved from public.budget_ledger_entries where account_id = v_account.id;
  if greatest(coalesce(v_proposal.estimated_cost, 0), 0) > v_account.credit_limit - v_reserved then
    raise exception using errcode = '23514', message = 'Insufficient budget available';
  end if;

  v_campaign_id := public.activate_proposal(p_proposal_id, p_actor_id, p_response_mode, p_driver_ids);
  update public.campaigns set budget_account_id = v_account.id where id = v_campaign_id;
  insert into public.budget_ledger_entries(
    account_id, campaign_id, entry_type, amount, source, policy_version,
    idempotency_key, request_id, correlation_id
  ) values (
    v_account.id, v_campaign_id, 'RESERVED', greatest(coalesce(v_proposal.estimated_cost, 0), 0),
    'CAMPAIGN_ACTIVATION', coalesce(v_proposal.source_plan ->> 'policy_version', 'policy-v1'),
    'campaign-reserve:' || v_campaign_id::text, p_request_id, p_request_id
  );
  return v_campaign_id;
end;
$$;

-- Driver response is idempotent, locks the driver assignment row and prevents
-- two campaigns from accepting the same driver concurrently.
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

-- Cancellation preserves accepted offers, distinguishes open/accepted
-- dispositions and records compensation plus the uncommitted release.
create or replace function public.cancel_campaign(
  p_campaign_id uuid, p_actor_id uuid, p_reason text,
  p_disposition text, p_policy_version text, p_request_id text
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_campaign public.campaigns%rowtype;
  v_compensation numeric := 0;
  v_release numeric := 0;
  v_participation record;
begin
  perform public.assert_operator_permission(p_actor_id, 'campaign.cancel');
  perform set_config('app.request_id', coalesce(p_request_id, ''), true);
  perform set_config('app.correlation_id', coalesce(p_request_id, ''), true);
  if nullif(trim(p_reason), '') is null then
    raise exception using errcode = '22023', message = 'Cancellation reason is required';
  end if;
  select * into v_campaign from public.campaigns where id = p_campaign_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Campaign not found'; end if;
  if v_campaign.status not in ('DRAFT', 'SCHEDULED', 'ACTIVE', 'PAUSED', 'TARGET_REACHED') then
    raise exception using errcode = '23514', message = 'Campaign cannot be cancelled';
  end if;

  update public.driver_offers set status = 'CANCELLED_BEFORE_ACCEPT',
    cancellation_reason = p_reason, cancellation_policy_version = p_policy_version,
    responded_at = coalesce(responded_at, now())
  where campaign_id = p_campaign_id and status in ('CREATED', 'SENT', 'DELIVERED', 'VIEWED');

  for v_participation in
    update public.campaign_participations set status = 'CANCELLED_AFTER_ACCEPT',
      cancellation_reason = p_reason, cancellation_disposition = p_disposition,
      cancellation_policy_version = p_policy_version, cancelled_at = now(), updated_at = now()
    where campaign_id = p_campaign_id
      and status in ('ACCEPTED', 'EN_ROUTE', 'ARRIVED_VERIFIED')
    returning id, driver_id
  loop
    insert into public.reward_records(
      idempotency_key, campaign_id, driver_id, participation_id,
      reward_type, amount, status, reason, qualified_at
    ) values (
      'cancel-compensation:' || v_participation.id::text, p_campaign_id,
      v_participation.driver_id, v_participation.id, 'RELOCATION',
      greatest(coalesce(v_campaign.bonus_amount, 0), 0), 'COMPENSATION_DUE',
      p_reason, now()
    ) on conflict (idempotency_key) do nothing;
    v_compensation := v_compensation + greatest(coalesce(v_campaign.bonus_amount, 0), 0);
  end loop;

  update public.driver_states set active_campaign_id = null,
    operational_status = case when is_online then 'IDLE' else 'OFFLINE' end,
    updated_at = now()
  where active_campaign_id = p_campaign_id;

  v_release := greatest(coalesce(v_campaign.budget_limit, 0) - v_compensation, 0);
  insert into public.budget_ledger_entries(
    account_id, campaign_id, entry_type, amount, source, policy_version,
    idempotency_key, request_id, correlation_id
  ) values (
    v_campaign.budget_account_id, p_campaign_id, 'RELEASED', v_release,
    'CAMPAIGN_CANCELLED', p_policy_version, 'campaign-release:' || p_campaign_id::text,
    p_request_id, p_request_id
  ) on conflict (idempotency_key) do nothing;
  if v_compensation > 0 then
    insert into public.budget_ledger_entries(
      account_id, campaign_id, entry_type, amount, source, policy_version,
      idempotency_key, request_id, correlation_id
    ) values (
      v_campaign.budget_account_id, p_campaign_id, 'COMPENSATION_DUE', v_compensation,
      'CAMPAIGN_CANCELLED', p_policy_version, 'campaign-compensation:' || p_campaign_id::text,
      p_request_id, p_request_id
    ) on conflict (idempotency_key) do nothing;
  end if;

  update public.campaigns set status = 'CANCELLED', completed_at = now(),
    cancelled_at = now(), cancellation_reason = p_reason,
    cancellation_disposition = p_disposition,
    cancellation_policy_version = p_policy_version
  where id = p_campaign_id;

  insert into public.audit_logs(
    actor_id, actor_type, entity_type, entity_id, action, before_data, after_data,
    metadata, entity_version
  ) values (
    p_actor_id, 'OPERATOR', 'campaign', p_campaign_id::text, 'CampaignCancelled',
    jsonb_build_object('status', v_campaign.status),
    jsonb_build_object('status', 'CANCELLED', 'released_amount', v_release,
      'compensation_due', v_compensation),
    jsonb_build_object('reason', p_reason, 'disposition', p_disposition,
      'policy_version', p_policy_version), 1
  );
  return p_campaign_id;
end;
$$;

create or replace function public.verify_participation_arrival(
  p_participation_id uuid, p_actor_id uuid, p_accuracy_m numeric,
  p_inside_target boolean, p_dwell_seconds integer, p_request_id text
)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_before public.campaign_participations%rowtype;
begin
  perform set_config('app.request_id', coalesce(p_request_id, ''), true);
  perform set_config('app.correlation_id', coalesce(p_request_id, ''), true);
  select * into v_before from public.campaign_participations
  where id = p_participation_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Participation not found'; end if;
  if v_before.status = 'ARRIVED_VERIFIED' then return p_participation_id; end if;
  if v_before.status not in ('ACCEPTED','EN_ROUTE') then
    raise exception using errcode = '23514', message = 'Participation cannot be marked arrived';
  end if;
  if not p_inside_target or coalesce(p_accuracy_m,9999) > 50 or coalesce(p_dwell_seconds,0) < 60 then
    raise exception using errcode = '23514', message = 'Arrival evidence does not meet quality threshold';
  end if;
  update public.campaign_participations set status = 'ARRIVED_VERIFIED',
    arrived_verified_at = now(), dwell_seconds = p_dwell_seconds, updated_at = now()
  where id = p_participation_id;
  insert into public.audit_logs(actor_id,actor_type,entity_type,entity_id,action,
    before_data,after_data,metadata)
  values (p_actor_id,'SYSTEM','participation',p_participation_id::text,'ArrivalVerified',
    jsonb_build_object('status',v_before.status),jsonb_build_object('status','ARRIVED_VERIFIED'),
    jsonb_build_object('accuracy_m',p_accuracy_m,'dwell_seconds',p_dwell_seconds));
  return p_participation_id;
end;
$$;

create or replace function public.qualify_participation_reward(
  p_participation_id uuid, p_actor_id uuid, p_amount numeric,
  p_policy_version text, p_request_id text
)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_participation public.campaign_participations%rowtype;
  v_campaign public.campaigns%rowtype;
  v_reward_id bigint;
begin
  perform set_config('app.request_id', coalesce(p_request_id, ''), true);
  perform set_config('app.correlation_id', coalesce(p_request_id, ''), true);
  select * into v_participation from public.campaign_participations
  where id = p_participation_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Participation not found'; end if;
  if v_participation.status not in ('ARRIVED_VERIFIED','ACTIVATED') then
    raise exception using errcode = '23514', message = 'Arrival must be verified before qualification';
  end if;
  select * into v_campaign from public.campaigns where id = v_participation.campaign_id for update;
  insert into public.reward_records(
    idempotency_key,campaign_id,driver_id,participation_id,reward_type,
    amount,status,reason,qualified_at
  ) values (
    'qualification:' || p_participation_id::text,v_campaign.id,v_participation.driver_id,
    p_participation_id,'RELOCATION',greatest(p_amount,0),'QUALIFIED',
    'ARRIVAL_POLICY:' || p_policy_version,now()
  ) on conflict (idempotency_key) do update set idempotency_key=excluded.idempotency_key
  returning id into v_reward_id;
  update public.campaign_participations set status='ACTIVATED',activated_at=coalesce(activated_at,now()),updated_at=now()
  where id=p_participation_id;
  insert into public.budget_ledger_entries(
    account_id,campaign_id,participation_id,reward_id,entry_type,amount,source,
    policy_version,idempotency_key,request_id,correlation_id
  ) values (
    v_campaign.budget_account_id,v_campaign.id,p_participation_id,v_reward_id,'QUALIFIED',
    greatest(p_amount,0),'ARRIVAL_QUALIFIED',p_policy_version,
    'qualification-ledger:'||p_participation_id::text,p_request_id,p_request_id
  ) on conflict (idempotency_key) do nothing;
  insert into public.audit_logs(actor_id,actor_type,entity_type,entity_id,action,after_data,metadata)
  values (p_actor_id,'SYSTEM','reward',v_reward_id::text,'RewardQualified',
    jsonb_build_object('status','QUALIFIED','amount',greatest(p_amount,0)),
    jsonb_build_object('participation_id',p_participation_id,'policy_version',p_policy_version));
  return v_reward_id;
end;
$$;

create or replace function public.settle_reward(
  p_reward_id bigint, p_actor_id uuid, p_success boolean,
  p_payment_reference text, p_request_id text
)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_reward public.reward_records%rowtype; v_campaign public.campaigns%rowtype;
begin
  perform public.assert_operator_permission(p_actor_id, 'compensation.settle');
  perform set_config('app.request_id', coalesce(p_request_id, ''), true);
  perform set_config('app.correlation_id', coalesce(p_request_id, ''), true);
  select * into v_reward from public.reward_records where id=p_reward_id for update;
  if not found then raise exception using errcode='P0002',message='Reward not found'; end if;
  if v_reward.status='PAID' and p_success then return p_reward_id; end if;
  if v_reward.status not in ('QUALIFIED','COMPENSATION_DUE','PAYMENT_FAILED') then
    raise exception using errcode='23514',message='Reward cannot be settled';
  end if;
  select * into v_campaign from public.campaigns where id=v_reward.campaign_id for update;
  update public.reward_records set status=case when p_success then 'PAID' else 'PAYMENT_FAILED' end,
    paid_at=case when p_success then now() else null end,
    reason=coalesce(reason,'')||case when p_payment_reference is null then '' else ' payment:'||p_payment_reference end
  where id=p_reward_id;
  if p_success then
    insert into public.budget_ledger_entries(
      account_id,campaign_id,participation_id,reward_id,entry_type,amount,source,
      policy_version,idempotency_key,request_id,correlation_id
    ) values (
      v_campaign.budget_account_id,v_campaign.id,v_reward.participation_id,p_reward_id,
      'PAID',greatest(v_reward.amount,0),'PAYMENT',null,
      'reward-paid:'||p_reward_id::text,p_request_id,p_request_id
    ) on conflict (idempotency_key) do nothing;
  end if;
  insert into public.audit_logs(actor_id,actor_type,entity_type,entity_id,action,
    before_data,after_data,metadata)
  values (p_actor_id,'OPERATOR','reward',p_reward_id::text,'RewardSettled',
    jsonb_build_object('status',v_reward.status),
    jsonb_build_object('status',case when p_success then 'PAID' else 'PAYMENT_FAILED' end),
    jsonb_build_object('payment_reference',p_payment_reference));
  return p_reward_id;
end;
$$;

alter table public.budget_accounts enable row level security;
alter table public.budget_ledger_entries enable row level security;
revoke all on public.budget_accounts, public.budget_ledger_entries,
  public.budget_account_balances_v from anon, authenticated;
grant all on public.budget_accounts, public.budget_ledger_entries to service_role;
grant select on public.budget_account_balances_v to service_role;

revoke all on function public.cancel_campaign(uuid, uuid, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.cancel_campaign(uuid, uuid, text, text, text, text)
  to service_role;
revoke all on function public.verify_participation_arrival(uuid,uuid,numeric,boolean,integer,text),
  public.qualify_participation_reward(uuid,uuid,numeric,text,text),
  public.settle_reward(bigint,uuid,boolean,text,text)
from public, anon, authenticated;
grant execute on function public.verify_participation_arrival(uuid,uuid,numeric,boolean,integer,text),
  public.qualify_participation_reward(uuid,uuid,numeric,text,text),
  public.settle_reward(bigint,uuid,boolean,text,text)
to service_role;

commit;
