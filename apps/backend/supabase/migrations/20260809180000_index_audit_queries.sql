begin;

create index if not exists audit_logs_created_at_id_idx
  on public.audit_logs (created_at desc, id desc);

create index if not exists audit_logs_entity_idx
  on public.audit_logs (entity_type, entity_id, created_at desc);

create index if not exists audit_logs_action_created_idx
  on public.audit_logs (action, created_at desc);

create index if not exists audit_logs_actor_created_idx
  on public.audit_logs (actor_type, actor_id, created_at desc);

create index if not exists audit_logs_proposal_metadata_idx
  on public.audit_logs ((metadata ->> 'proposal_id'), created_at desc);

commit;
