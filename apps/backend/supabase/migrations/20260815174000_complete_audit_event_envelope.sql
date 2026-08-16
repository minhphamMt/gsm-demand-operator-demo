begin;

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
  new.before_data := coalesce(new.before_data, '{}'::jsonb);
  new.after_data := coalesce(new.after_data, '{}'::jsonb);
  new.entity_version := coalesce(new.entity_version, 1);
  new.entity_hash := coalesce(
    new.entity_hash,
    encode(extensions.digest((new.before_data || new.after_data)::text, 'sha256'), 'hex')
  );
  new.request_id := coalesce(new.request_id, new.metadata ->> 'request_id', v_request_id);
  new.correlation_id := coalesce(new.correlation_id, new.metadata ->> 'correlation_id', v_correlation_id, new.request_id);
  new.metadata := coalesce(new.metadata, '{}'::jsonb)
    || case when new.request_id is null then '{}'::jsonb else jsonb_build_object('request_id', new.request_id) end
    || case when new.correlation_id is null then '{}'::jsonb else jsonb_build_object('correlation_id', new.correlation_id) end;
  return new;
end;
$$;

commit;
