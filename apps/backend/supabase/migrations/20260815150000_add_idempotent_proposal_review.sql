begin;

-- The client sends the version it actually reviewed and one stable key for a
-- logical command.  A repeat after an unknown HTTP outcome returns the prior
-- result instead of attempting another state transition.
create or replace function public.review_proposal(
  p_proposal_id uuid,
  p_actor_id uuid,
  p_decision text,
  p_note text,
  p_reason_code text,
  p_request_id text,
  p_idempotency_key text,
  p_expected_version integer
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_hash text;
  v_existing public.command_records%rowtype;
  v_current_version integer;
  v_current_status text;
  v_result uuid;
begin
  if p_idempotency_key is null or char_length(p_idempotency_key) = 0 then
    raise exception using errcode = '22023', message = 'Idempotency key is required';
  end if;
  if p_expected_version is null or p_expected_version < 1 then
    raise exception using errcode = '22023', message = 'Expected proposal version is required';
  end if;

  v_request_hash := md5(jsonb_build_object(
    'proposal_id', p_proposal_id,
    'decision', p_decision,
    'note', p_note,
    'reason_code', p_reason_code,
    'expected_version', p_expected_version
  )::text);

  begin
    insert into public.command_records (
      actor_id, command_type, idempotency_key, request_hash, status
    ) values (
      p_actor_id, 'PROPOSAL_REVIEW', p_idempotency_key, v_request_hash, 'PENDING'
    );
  exception when unique_violation then
    select * into v_existing
    from public.command_records
    where actor_id = p_actor_id
      and command_type = 'PROPOSAL_REVIEW'
      and idempotency_key = p_idempotency_key
    for update;

    if v_existing.request_hash <> v_request_hash then
      raise exception using errcode = '40001', message = 'Idempotency key was reused for a different proposal review';
    end if;
    if v_existing.status = 'SUCCEEDED' and v_existing.result_entity_id is not null then
      return v_existing.result_entity_id::uuid;
    end if;
    raise exception using errcode = '40001', message = 'Proposal review is still being processed';
  end;

  perform set_config('lock_timeout', '5s', true);
  begin
    select version, status into v_current_version, v_current_status
    from public.proposals
    where id = p_proposal_id
    for update nowait;
  exception when lock_not_available then
    raise exception using errcode = '40001', message = 'Proposal version conflict';
  end;

  if not found then
    raise exception using errcode = 'P0002', message = 'Proposal not found';
  end if;
  if v_current_version <> p_expected_version
    or v_current_status not in ('GENERATED', 'UNDER_REVIEW') then
    raise exception using errcode = '40001', message = 'Proposal version conflict';
  end if;

  v_result := public.review_proposal(
    p_proposal_id, p_actor_id, p_decision, p_note, p_reason_code, p_request_id
  );

  update public.command_records
  set status = 'SUCCEEDED',
      result_entity_type = 'proposal',
      result_entity_id = v_result::text,
      response_payload = jsonb_build_object('proposal_id', v_result),
      completed_at = now()
  where actor_id = p_actor_id
    and command_type = 'PROPOSAL_REVIEW'
    and idempotency_key = p_idempotency_key;

  return v_result;
end;
$$;

revoke all on function public.review_proposal(uuid, uuid, text, text, text, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.review_proposal(uuid, uuid, text, text, text, text, text, integer)
  to service_role;

commit;
