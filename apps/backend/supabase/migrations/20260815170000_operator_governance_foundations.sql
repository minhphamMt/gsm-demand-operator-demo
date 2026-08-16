begin;

-- Immutable proposal/revision identity.  The hash is calculated by the
-- database so every API, worker and audit consumer sees the same value.
alter table public.proposals
  add column if not exists content_hash text,
  add column if not exists approved_content_hash text,
  add column if not exists approved_version integer,
  add column if not exists optimizer_run_id uuid;

create or replace function public.set_proposal_content_hash()
returns trigger
language plpgsql
security invoker
set search_path = public, extensions
as $$
begin
  new.content_hash := encode(extensions.digest(convert_to(jsonb_build_object(
    'root_proposal_id', new.root_proposal_id,
    'parent_proposal_id', new.parent_proposal_id,
    'version', new.version,
    'input_snapshot_id', new.input_snapshot_id,
    'generator_type', new.generator_type,
    'generator_version', new.generator_version,
    'policy_status', new.policy_status,
    'target_zone_ids', new.target_zone_ids,
    'source_plan', new.source_plan,
    'target_driver_count', new.target_driver_count,
    'offer_count', new.offer_count,
    'window_start_at', new.window_start_at,
    'window_end_at', new.window_end_at,
    'bonus_amount', new.bonus_amount,
    'fare_multiplier', new.fare_multiplier,
    'estimated_cost', new.estimated_cost,
    'simulation_details', new.simulation_details
  )::text, 'UTF8'), 'sha256'), 'hex');
  return new;
end;
$$;

drop trigger if exists trg_proposals_content_hash on public.proposals;
create trigger trg_proposals_content_hash
before insert or update of root_proposal_id, parent_proposal_id, version,
  input_snapshot_id, generator_type, generator_version, policy_status,
  target_zone_ids, source_plan, target_driver_count, offer_count,
  window_start_at, window_end_at, bonus_amount, fare_multiplier,
  estimated_cost, simulation_details
on public.proposals
for each row execute function public.set_proposal_content_hash();

-- Backfill through the trigger without changing business data.
update public.proposals set version = version where content_hash is null;
alter table public.proposals alter column content_hash set not null;
create index if not exists proposals_content_hash_idx on public.proposals(content_hash);

-- Durable optimizer execution evidence.
create table if not exists public.optimizer_runs (
  id uuid primary key default gen_random_uuid(),
  forecast_run_id uuid not null references public.forecast_runs(id) on delete restrict,
  model_input_id uuid references public.model_inputs(id) on delete set null,
  input_hash text not null,
  solver_name text not null,
  solver_version text not null,
  policy_version text not null,
  status text not null check (status in ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FALLBACK', 'INFEASIBLE', 'FAILED', 'SUPERSEDED')),
  fallback_reason text,
  infeasible_reason text,
  runtime_ms integer check (runtime_ms is null or runtime_ms >= 0),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint optimizer_runs_terminal_evidence_check check (
    (status in ('QUEUED', 'RUNNING') and completed_at is null)
    or (status not in ('QUEUED', 'RUNNING') and completed_at is not null)
  )
);
create index if not exists optimizer_runs_forecast_idx
  on public.optimizer_runs(forecast_run_id, started_at desc);
alter table public.optimizer_runs enable row level security;
revoke all on public.optimizer_runs from anon, authenticated;
grant all on public.optimizer_runs to service_role;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'proposals_optimizer_run_id_fkey'
  ) then
    alter table public.proposals
      add constraint proposals_optimizer_run_id_fkey
      foreign key (optimizer_run_id) references public.optimizer_runs(id) on delete set null;
  end if;
end
$$;

-- Persisted common-input scenario comparisons.
create table if not exists public.scenario_runs (
  id uuid primary key default gen_random_uuid(),
  snapshot_id bigint not null references public.supply_demand_snapshots(id) on delete restrict,
  forecast_run_id uuid not null references public.forecast_runs(id) on delete restrict,
  model_version text not null,
  policy_version text not null,
  common_input_hash text not null,
  status text not null check (status in ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (forecast_run_id, common_input_hash)
);

create table if not exists public.scenario_results (
  id uuid primary key default gen_random_uuid(),
  scenario_run_id uuid not null references public.scenario_runs(id) on delete cascade,
  scenario_type text not null check (scenario_type in ('NO_ACTION', 'RELOCATION', 'ACTIVATION', 'HYBRID')),
  estimated_metrics jsonb not null default '{}'::jsonb,
  observed_metrics jsonb,
  uncertainty jsonb not null default '{}'::jsonb,
  response_source text,
  created_at timestamptz not null default now(),
  unique (scenario_run_id, scenario_type)
);

-- Operator market/zone scope, shifts and handover tasks.
create table if not exists public.operator_scopes (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid not null references public.profiles(id) on delete cascade,
  market_code text not null default 'HN',
  zone_ids integer[] not null default '{}',
  permissions text[] not null default array['proposal.review']::text[],
  valid_from timestamptz not null default now(),
  valid_until timestamptz,
  created_at timestamptz not null default now(),
  check (valid_until is null or valid_until > valid_from)
);
create unique index if not exists operator_scopes_active_market_idx
  on public.operator_scopes(operator_id, market_code)
  where valid_until is null;

create table if not exists public.operator_shifts (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid not null references public.profiles(id) on delete cascade,
  scope_id uuid references public.operator_scopes(id) on delete set null,
  status text not null check (status in ('SCHEDULED', 'ACTIVE', 'HANDOVER', 'COMPLETED', 'CANCELLED')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  timezone text not null default 'Asia/Ho_Chi_Minh',
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create table if not exists public.handover_tasks (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null references public.operator_shifts(id) on delete cascade,
  owner_id uuid references public.profiles(id) on delete set null,
  entity_type text not null,
  entity_id text not null,
  title text not null,
  status text not null default 'OPEN' check (status in ('OPEN', 'ACKNOWLEDGED', 'COMPLETED', 'CANCELLED')),
  due_at timestamptz,
  acknowledged_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

insert into public.operator_scopes(operator_id, market_code, zone_ids, permissions)
select p.id, 'HN', array(select generate_series(1,30)),
  array['proposal.review','campaign.release','campaign.cancel','dispatch.release','scenario.compare','compensation.settle','audit.export']::text[]
from public.profiles p
where p.role = 'OPERATOR' and p.is_active
  and not exists (select 1 from public.operator_scopes s where s.operator_id = p.id and s.valid_until is null);

create unique index if not exists operator_shifts_active_operator_idx
  on public.operator_shifts(operator_id) where status in ('ACTIVE','HANDOVER');
insert into public.operator_shifts(operator_id, scope_id, status, starts_at, ends_at, timezone)
select s.operator_id, s.id, 'ACTIVE', now() - interval '1 day', timestamptz '2099-12-31 23:59:59+07', 'Asia/Ho_Chi_Minh'
from public.operator_scopes s
where s.valid_until is null
  and not exists (select 1 from public.operator_shifts sh where sh.operator_id = s.operator_id and sh.status in ('ACTIVE','HANDOVER'));

create or replace function public.assert_operator_permission(p_operator_id uuid, p_permission text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.operator_scopes s
    join public.profiles p on p.id = s.operator_id
    where s.operator_id = p_operator_id and p.role = 'OPERATOR' and p.is_active
      and s.valid_from <= now() and (s.valid_until is null or s.valid_until > now())
      and p_permission = any(s.permissions)
  ) then
    raise exception using errcode = '42501', message = 'Operator permission denied';
  end if;
end;
$$;

-- Durable jobs, transactional outbox and notifications provide refresh-safe
-- recovery and explicit ownership/escalation.
create table if not exists public.job_runs (
  id uuid primary key default gen_random_uuid(),
  job_type text not null,
  entity_type text,
  entity_id text,
  idempotency_key text not null,
  status text not null check (status in ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'UNKNOWN')),
  progress smallint not null default 0 check (progress between 0 and 100),
  input_payload jsonb not null default '{}'::jsonb,
  result_payload jsonb,
  error_code text,
  error_message text,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_type, idempotency_key)
);

create table if not exists public.outbox_events (
  id uuid primary key default gen_random_uuid(),
  aggregate_type text not null,
  aggregate_id text not null,
  event_type text not null,
  event_key text not null unique,
  payload jsonb not null,
  status text not null default 'PENDING' check (status in ('PENDING', 'PROCESSING', 'PUBLISHED', 'FAILED', 'DEAD_LETTER')),
  attempt_count integer not null default 0,
  available_at timestamptz not null default now(),
  published_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);
create index if not exists outbox_events_delivery_idx
  on public.outbox_events(status, available_at, created_at)
  where status in ('PENDING', 'FAILED');

create table if not exists public.operator_notifications (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.profiles(id) on delete set null,
  severity text not null check (severity in ('INFO', 'WARNING', 'CRITICAL')),
  category text not null,
  title text not null,
  message text not null,
  entity_type text,
  entity_id text,
  request_id text,
  status text not null default 'UNREAD' check (status in ('UNREAD', 'READ', 'ACKNOWLEDGED', 'RESOLVED')),
  read_at timestamptz,
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  escalate_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists operator_notifications_owner_idx
  on public.operator_notifications(owner_id, status, created_at desc);

create or replace function public.notify_from_operational_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_severity text;
begin
  if new.action not in (
    'Created', 'Revised', 'DispatchReleased', 'DispatchCancelled',
    'CampaignCancelled', 'CampaignTargetReached', 'OfferExpired'
  ) then return new; end if;
  v_severity := case when new.action in ('DispatchCancelled','CampaignCancelled','OfferExpired')
    then 'WARNING' else 'INFO' end;
  insert into public.operator_notifications(
    owner_id, severity, category, title, message, entity_type,
    entity_id, request_id, escalate_at
  ) values (
    case when new.actor_type = 'OPERATOR' then new.actor_id else null end,
    v_severity, new.action, new.action,
    coalesce(new.metadata ->> 'detail', new.action || ' · ' || new.entity_type || ' ' || new.entity_id),
    new.entity_type, new.entity_id, new.request_id,
    case when v_severity = 'WARNING' then now() + interval '15 minutes' else null end
  );
  return new;
end;
$$;

create table if not exists public.retention_policies (
  resource_name text primary key,
  retention_interval interval not null,
  enabled boolean not null default true,
  last_run_at timestamptz,
  updated_at timestamptz not null default now(),
  check (retention_interval > interval '0 seconds')
);
insert into public.retention_policies(resource_name, retention_interval)
values ('driver_location_events', interval '7 days'), ('supply_demand_snapshots', interval '90 days')
on conflict (resource_name) do nothing;

create or replace function public.run_operator_retention(p_resource_name text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_interval interval;
  v_deleted bigint;
begin
  select retention_interval into v_interval
  from public.retention_policies
  where resource_name = p_resource_name and enabled
  for update;
  if not found then
    raise exception using errcode = '22023', message = 'Retention policy is disabled or missing';
  end if;

  if p_resource_name = 'driver_location_events' then
    delete from public.driver_location_events where recorded_at < now() - v_interval;
  elsif p_resource_name = 'supply_demand_snapshots' then
    delete from public.supply_demand_snapshots s
    where s.captured_at < now() - v_interval
      and not exists (select 1 from public.proposals p where p.input_snapshot_id = s.id)
      and not exists (select 1 from public.forecast_runs f where f.snapshot_id = s.id);
  else
    raise exception using errcode = '22023', message = 'Unsupported retention resource';
  end if;
  get diagnostics v_deleted = row_count;
  update public.retention_policies set last_run_at = now(), updated_at = now()
  where resource_name = p_resource_name;
  return v_deleted;
end;
$$;

-- Audit context is attached before the first INSERT.  Legacy aliases are
-- normalized here so all new readers share one vocabulary.
alter table public.audit_logs
  add column if not exists event_id uuid default gen_random_uuid(),
  add column if not exists request_id text,
  add column if not exists correlation_id text,
  add column if not exists causation_id uuid,
  add column if not exists entity_version integer,
  add column if not exists entity_hash text;

update public.audit_logs
set event_id = coalesce(event_id, gen_random_uuid()),
    request_id = coalesce(request_id, metadata ->> 'request_id'),
    correlation_id = coalesce(correlation_id, metadata ->> 'request_id')
where event_id is null or request_id is null or correlation_id is null;
alter table public.audit_logs alter column event_id set not null;
create unique index if not exists audit_logs_event_id_idx on public.audit_logs(event_id);
create index if not exists audit_logs_correlation_idx
  on public.audit_logs(correlation_id, created_at desc, id desc);

create or replace function public.prepare_audit_event()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_request_id text := nullif(current_setting('app.request_id', true), '');
  v_correlation_id text := nullif(current_setting('app.correlation_id', true), '');
begin
  new.event_id := coalesce(new.event_id, gen_random_uuid());
  new.entity_type := case new.entity_type
    when 'proposals' then 'proposal'
    when 'campaigns' then 'campaign'
    when 'driver_offers' then 'offer'
    when 'drivers' then 'driver'
    when 'trips' then 'trip'
    when 'reward_records' then 'reward'
    else new.entity_type
  end;
  new.request_id := coalesce(new.request_id, new.metadata ->> 'request_id', v_request_id);
  new.correlation_id := coalesce(new.correlation_id, new.metadata ->> 'correlation_id', v_correlation_id, new.request_id);
  new.metadata := coalesce(new.metadata, '{}'::jsonb)
    || case when new.request_id is null then '{}'::jsonb else jsonb_build_object('request_id', new.request_id) end
    || case when new.correlation_id is null then '{}'::jsonb else jsonb_build_object('correlation_id', new.correlation_id) end;
  return new;
end;
$$;

create or replace function public.reject_audit_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception using errcode = '55000', message = 'audit_logs is append-only';
end;
$$;

drop trigger if exists trg_prepare_audit_event on public.audit_logs;
create trigger trg_prepare_audit_event before insert on public.audit_logs
for each row execute function public.prepare_audit_event();
drop trigger if exists trg_audit_logs_append_only on public.audit_logs;
create trigger trg_audit_logs_append_only before update or delete on public.audit_logs
for each row execute function public.reject_audit_mutation();
drop trigger if exists trg_notify_from_operational_audit on public.audit_logs;
create trigger trg_notify_from_operational_audit after insert on public.audit_logs
for each row execute function public.notify_from_operational_audit();

-- Apply request context before legacy atomic routines insert their audit rows.
create or replace function public.review_proposal(
  p_proposal_id uuid, p_actor_id uuid, p_decision text, p_note text,
  p_reason_code text, p_request_id text
)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_result uuid;
begin
  perform public.assert_operator_permission(p_actor_id, 'proposal.review');
  perform set_config('app.request_id', coalesce(p_request_id, ''), true);
  perform set_config('app.correlation_id', coalesce(p_request_id, ''), true);
  v_result := public.review_proposal(p_proposal_id, p_actor_id, p_decision, p_note, p_reason_code);
  if p_decision = 'APPROVED' then
    update public.proposals
    set approved_content_hash = content_hash, approved_version = version
    where id = p_proposal_id;
  end if;
  return v_result;
end;
$$;

create or replace function public.activate_proposal(
  p_proposal_id uuid, p_actor_id uuid, p_response_mode text,
  p_driver_ids uuid[], p_request_id text
)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
begin
  perform public.assert_operator_permission(p_actor_id, 'campaign.release');
  perform set_config('app.request_id', coalesce(p_request_id, ''), true);
  perform set_config('app.correlation_id', coalesce(p_request_id, ''), true);
  return public.activate_proposal(p_proposal_id, p_actor_id, p_response_mode, p_driver_ids);
end;
$$;

create or replace function public.expire_offer(p_offer_id uuid, p_actor_id uuid, p_request_id text)
returns uuid language plpgsql security definer set search_path = public as $$
begin
  perform set_config('app.request_id', coalesce(p_request_id, ''), true);
  perform set_config('app.correlation_id', coalesce(p_request_id, ''), true);
  return public.expire_offer(p_offer_id, p_actor_id);
end;
$$;

-- The optimistic revision overload sets context before invoking the immutable
-- revision constructor.  It never edits an existing audit event.
create or replace function public.revise_proposal(
  p_proposal_id uuid, p_actor_id uuid, p_source_plan jsonb,
  p_target_driver_count integer, p_campaign_duration_minutes integer,
  p_bonus_amount numeric, p_zone_trip_bonus numeric, p_fare_multiplier numeric,
  p_budget_limit numeric, p_expected_version integer, p_note text, p_request_id text
)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_current_version integer; v_current_status text; v_revised_id uuid;
begin
  perform public.assert_operator_permission(p_actor_id, 'proposal.review');
  perform set_config('app.request_id', coalesce(p_request_id, ''), true);
  perform set_config('app.correlation_id', coalesce(p_request_id, ''), true);
  perform set_config('lock_timeout', '5s', true);
  begin
    select version, status into v_current_version, v_current_status
    from public.proposals where id = p_proposal_id for update nowait;
  exception when lock_not_available then
    raise exception using errcode = '40001', message = 'Proposal version conflict';
  end;
  if not found then raise exception using errcode = 'P0002', message = 'Proposal not found'; end if;
  if p_expected_version is null or p_expected_version <> v_current_version
     or v_current_status not in ('GENERATED', 'UNDER_REVIEW') then
    raise exception using errcode = '40001', message = 'Proposal version conflict';
  end if;
  v_revised_id := public.revise_proposal(
    p_proposal_id, p_actor_id, p_source_plan, p_target_driver_count,
    p_campaign_duration_minutes, p_bonus_amount, p_zone_trip_bonus,
    p_fare_multiplier, p_budget_limit, p_note
  );
  return v_revised_id;
end;
$$;

-- RLS: operational tables are service-owned; operators receive scoped reads
-- through the backend API only.
alter table public.scenario_runs enable row level security;
alter table public.scenario_results enable row level security;
alter table public.operator_scopes enable row level security;
alter table public.operator_shifts enable row level security;
alter table public.handover_tasks enable row level security;
alter table public.job_runs enable row level security;
alter table public.outbox_events enable row level security;
alter table public.operator_notifications enable row level security;
alter table public.retention_policies enable row level security;

revoke all on public.scenario_runs, public.scenario_results, public.operator_scopes,
  public.operator_shifts, public.handover_tasks, public.job_runs,
  public.outbox_events, public.operator_notifications, public.retention_policies
from anon, authenticated;
grant all on public.scenario_runs, public.scenario_results, public.operator_scopes,
  public.operator_shifts, public.handover_tasks, public.job_runs,
  public.outbox_events, public.operator_notifications, public.retention_policies
to service_role;

revoke all on function public.run_operator_retention(text) from public, anon, authenticated;
grant execute on function public.run_operator_retention(text) to service_role;
revoke all on function public.assert_operator_permission(uuid,text) from public, anon, authenticated;
grant execute on function public.assert_operator_permission(uuid,text) to service_role;

commit;
