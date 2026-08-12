begin;

-- A terminal campaign can never remain the driver's current assignment. Keep
-- this invariant in the database so it also holds for lifecycle jobs and
-- administrative updates that do not pass through the API process.
create or replace function public.release_driver_states_for_terminal_campaign()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('TARGET_REACHED', 'COMPLETED', 'CANCELLED', 'BUDGET_EXHAUSTED')
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

drop trigger if exists trg_release_driver_states_for_terminal_campaign on public.campaigns;
create trigger trg_release_driver_states_for_terminal_campaign
after update of status on public.campaigns
for each row execute function public.release_driver_states_for_terminal_campaign();

-- Repair assignments left behind before the invariant was introduced.
update public.driver_states state
set active_campaign_id = null,
    operational_status = case when state.is_online then 'IDLE' else 'OFFLINE' end,
    updated_at = now()
from public.campaigns campaign
where campaign.id = state.active_campaign_id
  and campaign.status in ('TARGET_REACHED', 'COMPLETED', 'CANCELLED', 'BUDGET_EXHAUSTED');

-- Existing unreviewed AI rows created by the old adapter may still claim a
-- passed policy despite having no executable incentive. Keep their audit
-- history, but make the review UI and API reflect the true readiness state.
update public.proposals
set policy_status = 'FAILED', updated_at = now()
where status in ('GENERATED', 'UNDER_REVIEW')
  and policy_status = 'PASSED'
  and (
    coalesce(target_driver_count, 0) < 1
    or coalesce(bonus_amount, 0) <= 0
    or coalesce(estimated_cost, 0) <= 0
    or jsonb_path_exists(coalesce(simulation_details, '{}'::jsonb),
         '$.warnings[*] ? (@.code == "NO_SOLUTION")')
  );

-- Approval is the financial commitment gate. A policy flag alone is not
-- sufficient: reject empty/zero incentives and explicit optimizer failure.
create or replace function public.enforce_proposal_operational_readiness()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'APPROVED' and new.status is distinct from old.status then
    if new.policy_status <> 'PASSED'
       or coalesce(new.target_driver_count, 0) < 1
       or coalesce(new.bonus_amount, 0) <= 0
       or coalesce(new.estimated_cost, 0) <= 0
       or jsonb_path_exists(coalesce(new.simulation_details, '{}'::jsonb),
            '$.warnings[*] ? (@.code == "NO_SOLUTION")') then
      raise exception using errcode = '23514', message = 'Proposal has no valid operational incentive plan';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_proposal_operational_readiness on public.proposals;
create trigger trg_enforce_proposal_operational_readiness
before update of status on public.proposals
for each row execute function public.enforce_proposal_operational_readiness();

alter table public.campaigns drop constraint if exists campaigns_positive_operational_plan_check;
alter table public.campaigns add constraint campaigns_positive_operational_plan_check
  check (target_driver_count > 0 and bonus_amount > 0 and budget_limit > 0) not valid;

commit;
