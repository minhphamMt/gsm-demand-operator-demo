begin;

create or replace function public.expire_stale_approved_proposals(p_request_id text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
  v_request_id text := coalesce(nullif(p_request_id, ''), 'proposal-lifecycle-' || gen_random_uuid()::text);
begin
  with candidates as materialized (
    select proposals.id, proposals.status, proposals.window_end_at,
      proposals.version, proposals.content_hash
    from public.proposals
    where proposals.status = 'APPROVED'
      and (proposals.window_end_at is null or proposals.window_end_at <= now())
      and not exists (
        select 1 from public.campaigns where campaigns.proposal_id = proposals.id
      )
      and not exists (
        select 1 from public.dispatch_batches where dispatch_batches.proposal_id = proposals.id
      )
    order by proposals.id
    for update of proposals skip locked
  ), expired as (
    update public.proposals proposals
    set status = 'STALE'
    from candidates
    where proposals.id = candidates.id
      and proposals.status = 'APPROVED'
    returning proposals.id, proposals.version, proposals.content_hash,
      candidates.window_end_at
  ), audited as (
    insert into public.audit_logs (
      actor_id, actor_type, entity_type, entity_id, action,
      before_data, after_data, metadata, entity_version, entity_hash
    )
    select null, 'SYSTEM', 'proposal', expired.id::text, 'ProposalExpired',
      jsonb_build_object('status', 'APPROVED'),
      jsonb_build_object('status', 'STALE'),
      jsonb_build_object(
        'request_id', v_request_id,
        'reason', 'window_end_at_reached',
        'window_end_at', expired.window_end_at
      ),
      expired.version, expired.content_hash
    from expired
    returning 1
  )
  select count(*) into v_count from audited;

  return jsonb_build_object(
    'proposals_staled', v_count,
    'request_id', v_request_id,
    'ran_at', now()
  );
end;
$$;

revoke all on function public.expire_stale_approved_proposals(text) from public, anon, authenticated;
grant execute on function public.expire_stale_approved_proposals(text) to service_role;

create or replace function public.enforce_fresh_proposal_execution()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_status text;
  v_window_end_at timestamptz;
begin
  select status, window_end_at into v_status, v_window_end_at
  from public.proposals
  where id = new.proposal_id;

  if v_status <> 'APPROVED' then
    raise exception using errcode = '23514', message = 'Proposal is not approved for execution';
  end if;
  if v_window_end_at is null or v_window_end_at <= now() then
    raise exception using errcode = '23514', message = 'Proposal input window has expired';
  end if;
  return new;
end;
$$;

drop trigger if exists campaigns_require_fresh_proposal on public.campaigns;
create trigger campaigns_require_fresh_proposal
before insert on public.campaigns
for each row execute function public.enforce_fresh_proposal_execution();

drop trigger if exists dispatch_batches_require_fresh_proposal on public.dispatch_batches;
create trigger dispatch_batches_require_fresh_proposal
before insert on public.dispatch_batches
for each row execute function public.enforce_fresh_proposal_execution();

commit;
