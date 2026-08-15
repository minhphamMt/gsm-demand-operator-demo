begin;

alter table public.dispatch_events
  add column if not exists actor_id uuid references public.profiles(id) on delete set null,
  add column if not exists actor_type text not null default 'OPERATOR'
    check (actor_type in ('OPERATOR', 'SYSTEM', 'PROVIDER'));

create or replace function public.record_dispatch_event(
  p_batch_id uuid, p_move_id uuid, p_event_key text, p_event_type text,
  p_units integer, p_occurred_at timestamptz, p_source text,
  p_payload jsonb, p_request_id text, p_actor_id uuid
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_existing uuid;
  v_event_id uuid;
  v_quality text := 'UNVERIFIED';
  v_accuracy numeric;
  v_snapshot_id bigint;
  v_move public.dispatch_moves%rowtype;
  v_next_state text;
begin
  perform public.assert_operator_permission(p_actor_id, 'dispatch.release');
  perform set_config('app.request_id', coalesce(p_request_id, ''), true);
  perform set_config('app.correlation_id', coalesce(p_request_id, ''), true);
  select id into v_existing from public.dispatch_events where event_key = p_event_key;
  if v_existing is not null then return v_existing; end if;
  select * into v_move from public.dispatch_moves
  where id = p_move_id and batch_id = p_batch_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Dispatch move not found'; end if;
  if p_event_type not in ('SENT','ACKNOWLEDGED','EN_ROUTE','ARRIVED','AVAILABLE','FAILED','CANCELLED','RETRY_REQUESTED') then
    raise exception using errcode = '22023', message = 'Invalid dispatch event';
  end if;
  if p_units < 1 or p_units > v_move.planned_units then
    raise exception using errcode = '22023', message = 'Dispatch event units exceed the planned move';
  end if;
  if p_event_type = 'RETRY_REQUESTED' and v_move.state <> 'FAILED' then
    raise exception using errcode = '23514', message = 'Only a failed dispatch move can be retried';
  end if;

  v_accuracy := nullif(p_payload ->> 'accuracy_m', '')::numeric;
  if p_event_type in ('ARRIVED', 'AVAILABLE') then
    v_quality := case when coalesce(v_accuracy, 9999) <= 50
      and coalesce((p_payload ->> 'inside_target')::boolean, false)
      then 'VALID' else 'REJECTED' end;
  end if;

  insert into public.dispatch_events(
    batch_id, move_id, event_key, event_type, units, occurred_at,
    source, quality_status, payload, request_id, correlation_id, actor_id, actor_type
  ) values (
    p_batch_id, p_move_id, p_event_key, p_event_type, p_units,
    p_occurred_at, p_source, v_quality, coalesce(p_payload, '{}'::jsonb),
    p_request_id, p_request_id, p_actor_id, 'OPERATOR'
  ) returning id into v_event_id;

  v_next_state := case
    when p_event_type in ('ARRIVED','AVAILABLE') and v_quality = 'REJECTED' then v_move.state
    when p_event_type = 'RETRY_REQUESTED' then 'SENT'
    when p_event_type in ('FAILED','CANCELLED') then p_event_type
    when v_move.state = 'AVAILABLE' then v_move.state
    when v_move.state = 'ARRIVED' and p_event_type in ('SENT','ACKNOWLEDGED','EN_ROUTE') then v_move.state
    when v_move.state = 'EN_ROUTE' and p_event_type in ('SENT','ACKNOWLEDGED') then v_move.state
    when v_move.state = 'ACKNOWLEDGED' and p_event_type = 'SENT' then v_move.state
    else p_event_type
  end;

  update public.dispatch_moves set
    state = v_next_state,
    acknowledged_units = least(planned_units, acknowledged_units + case when p_event_type = 'ACKNOWLEDGED' then p_units else 0 end),
    arrived_units = least(planned_units, arrived_units + case when p_event_type = 'ARRIVED' and v_quality = 'VALID' then p_units else 0 end),
    available_units = least(planned_units, available_units + case when p_event_type = 'AVAILABLE' and v_quality = 'VALID' then p_units else 0 end),
    failed_units = least(planned_units, failed_units + case when p_event_type = 'FAILED' then p_units else 0 end),
    failure_code = case
      when p_event_type = 'FAILED' then p_payload ->> 'failure_code'
      when p_event_type = 'RETRY_REQUESTED' then null
      else failure_code
    end,
    updated_at = now()
  where id = p_move_id;

  update public.dispatch_batches set status = case
    when not exists (select 1 from public.dispatch_moves where batch_id = p_batch_id and state not in ('AVAILABLE','FAILED','CANCELLED'))
      and exists (select 1 from public.dispatch_moves where batch_id = p_batch_id and state = 'AVAILABLE')
      and exists (select 1 from public.dispatch_moves where batch_id = p_batch_id and state in ('FAILED','CANCELLED')) then 'PARTIALLY_EXECUTED'
    when not exists (select 1 from public.dispatch_moves where batch_id = p_batch_id and state <> 'AVAILABLE') then 'EXECUTED'
    when exists (select 1 from public.dispatch_moves where batch_id = p_batch_id and state in ('ARRIVED','AVAILABLE')) then 'IN_PROGRESS'
    when exists (select 1 from public.dispatch_moves where batch_id = p_batch_id and state = 'ACKNOWLEDGED') then 'PARTIALLY_ACKED'
    else 'DISPATCHING' end,
    updated_at = now()
  where id = p_batch_id and status <> 'CANCELLED';

  insert into public.audit_logs(
    actor_id, actor_type, entity_type, entity_id, action,
    before_data, after_data, metadata, entity_version
  ) values (
    p_actor_id, 'OPERATOR', 'dispatch_move', p_move_id::text,
    case when p_event_type = 'RETRY_REQUESTED' then 'DispatchRetryRequested' else 'DispatchEventRecorded' end,
    jsonb_build_object('state', v_move.state),
    jsonb_build_object('state', v_next_state, 'event_type', p_event_type, 'quality', v_quality),
    jsonb_build_object('batch_id', p_batch_id, 'event_id', v_event_id, 'source', p_source),
    1
  );

  select id into v_snapshot_id from public.supply_demand_snapshots
  order by captured_at desc, id desc limit 1;
  perform public.reconcile_dispatch_batch(p_batch_id, v_event_id, v_snapshot_id);
  return v_event_id;
end;
$$;

revoke all on function public.record_dispatch_event(
  uuid,uuid,text,text,integer,timestamptz,text,jsonb,text,uuid
) from public, anon, authenticated;
grant execute on function public.record_dispatch_event(
  uuid,uuid,text,text,integer,timestamptz,text,jsonb,text,uuid
) to service_role;
revoke all on function public.record_dispatch_event(
  uuid,uuid,text,text,integer,timestamptz,text,jsonb,text
) from public, anon, authenticated, service_role;

commit;
