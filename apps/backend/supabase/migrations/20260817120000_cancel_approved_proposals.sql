begin;

create or replace function public.cancel_approved_proposal(
  p_proposal_id uuid,
  p_actor_id uuid,
  p_reason text,
  p_request_id text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before public.proposals%rowtype;
begin
  perform public.assert_operator_permission(p_actor_id, 'proposal.review');

  if nullif(trim(p_reason), '') is null then
    raise exception using errcode = '22023', message = 'A cancellation reason is required';
  end if;

  select * into v_before
  from public.proposals
  where id = p_proposal_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Proposal not found';
  end if;
  if v_before.status <> 'APPROVED' then
    raise exception using errcode = '23514', message = 'Only APPROVED proposals can be cancelled';
  end if;
  if exists (select 1 from public.campaigns where proposal_id = p_proposal_id)
     or exists (select 1 from public.dispatch_batches where proposal_id = p_proposal_id) then
    raise exception using errcode = '23514', message = 'Applied proposal cannot be cancelled; stop its execution instead';
  end if;

  perform set_config('app.request_id', coalesce(p_request_id, ''), true);
  perform set_config('app.correlation_id', coalesce(p_request_id, ''), true);

  update public.proposals
  set status = 'STALE',
      reviewed_by = p_actor_id,
      reviewed_at = now(),
      review_note = concat_ws(': ', nullif(review_note, ''), 'Cancelled: ' || trim(p_reason))
  where id = p_proposal_id;

  insert into public.audit_logs (
    actor_id, actor_type, entity_type, entity_id, action,
    before_data, after_data, metadata
  ) values (
    p_actor_id, 'OPERATOR', 'proposal', p_proposal_id::text, 'ProposalCancelled',
    jsonb_build_object('status', v_before.status),
    jsonb_build_object('status', 'STALE'),
    jsonb_build_object('request_id', p_request_id, 'reason', trim(p_reason))
  );

  return p_proposal_id;
end;
$$;

revoke all on function public.cancel_approved_proposal(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.cancel_approved_proposal(uuid, uuid, text, text) to service_role;

commit;
