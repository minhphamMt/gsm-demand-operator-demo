begin;

-- One durable record per client command. Mutating RPCs use this table to make
-- duplicate submissions and unknown HTTP outcomes observable and recoverable.
create table if not exists public.command_records (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.profiles(id) on delete restrict,
  command_type text not null check (command_type in (
    'PROPOSAL_REVIEW', 'PROPOSAL_REVISION', 'PROPOSAL_ACTIVATION',
    'CAMPAIGN_CANCEL', 'OFFER_RESPONSE', 'OFFER_EXPIRE'
  )),
  idempotency_key text not null check (char_length(idempotency_key) between 1 and 120),
  request_hash text not null check (char_length(request_hash) between 1 and 128),
  status text not null check (status in ('PENDING', 'SUCCEEDED', 'FAILED')),
  result_entity_type text,
  result_entity_id text,
  response_payload jsonb,
  error_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint command_records_idempotency_unique unique (actor_id, command_type, idempotency_key),
  constraint command_records_completion_consistent check (
    (status = 'PENDING' and completed_at is null)
    or (status in ('SUCCEEDED', 'FAILED') and completed_at is not null)
  )
);

create index if not exists idx_command_records_actor_created
  on public.command_records(actor_id, created_at desc);
create index if not exists idx_command_records_pending
  on public.command_records(created_at) where status = 'PENDING';

alter table public.command_records enable row level security;
revoke all on public.command_records from public, anon, authenticated;
grant select, insert, update, delete on public.command_records to service_role;

comment on table public.command_records is
  'Durable idempotency and unknown-outcome records for privileged operator and driver commands.';

commit;
