begin;

-- PostGIS is installed in Supabase's trusted `extensions` schema. The
-- activation RPC needs that schema to resolve geometry/geography at runtime.
alter function public.activate_proposal(uuid, uuid, text, uuid[])
  set search_path = public, extensions;

revoke all on function public.activate_proposal(uuid, uuid, text, uuid[])
  from public, anon, authenticated;
grant execute on function public.activate_proposal(uuid, uuid, text, uuid[])
  to service_role;

commit;
