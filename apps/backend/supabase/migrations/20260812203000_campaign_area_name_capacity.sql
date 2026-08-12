begin;

-- Activation can legitimately target many AI zones. The generated display
-- label must preserve that real scope instead of failing once it exceeds the
-- original single-area varchar limit.
alter table public.campaigns
  alter column display_area_name type text;

commit;
