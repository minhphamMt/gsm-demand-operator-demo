-- =============================================================================
-- GSM-14 MVP — Bước 3/3: Helper RLS và chính sách truy cập
-- Nguồn: docs/database-spec.md §7
--
-- Ghi chú quan trọng: role `service_role` của Supabase có thuộc tính BYPASSRLS,
-- nên Backend đi qua service key KHÔNG cần policy nào. File này chỉ định nghĩa
-- quyền cho `authenticated` (Operator Console và Driver App).
--
-- Nguyên tắc: bật RLS trên cả 16 bảng. Bảng không có policy = từ chối toàn bộ
-- với client — đúng yêu cầu "không mở cho Driver App".
-- =============================================================================

set search_path = public, extensions;

-- =============================================================================
-- Helper functions
--
-- SECURITY DEFINER để đọc profiles mà không kích hoạt lại RLS của chính bảng đó
-- (nếu không sẽ đệ quy vô hạn khi policy trên profiles gọi hàm này).
-- =============================================================================

create or replace function public.current_profile_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.role
  from public.profiles p
  where p.id = (select auth.uid())
    and p.is_active
$$;

comment on function public.current_profile_role() is
  'Role (OPERATOR/DRIVER) của user đang đăng nhập; NULL nếu không có hồ sơ đang hoạt động.';

create or replace function public.is_operator()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_profile_role() = 'OPERATOR', false)
$$;

comment on function public.is_operator() is 'True nếu user đang đăng nhập là Người vận hành.';

create or replace function public.is_driver()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_profile_role() = 'DRIVER', false)
$$;

comment on function public.is_driver() is 'True nếu user đang đăng nhập là Tài xế.';

-- =============================================================================
-- Bật RLS trên toàn bộ 16 bảng
-- =============================================================================

alter table public.profiles                enable row level security;
alter table public.driver_states           enable row level security;
alter table public.h3_cells                enable row level security;
alter table public.supply_demand_snapshots enable row level security;
alter table public.supply_demand_cells     enable row level security;
alter table public.hotspots                enable row level security;
alter table public.proposals               enable row level security;
alter table public.campaigns               enable row level security;
alter table public.driver_offers           enable row level security;
alter table public.campaign_participations enable row level security;
alter table public.driver_location_events  enable row level security;
alter table public.trips                   enable row level security;
alter table public.reward_records          enable row level security;
alter table public.audit_logs              enable row level security;
alter table public.model_inputs            enable row level security;
alter table public.model_outputs           enable row level security;

-- =============================================================================
-- Giới hạn cột được phép ghi
--
-- PostgreSQL không cho REVOKE quyền ở mức cột khi quyền đã cấp ở mức bảng, nên
-- phải thu hồi UPDATE toàn bảng rồi cấp lại đúng những cột cho phép.
-- Nếu không làm bước này, tài xế có thể tự UPDATE profiles.role thành OPERATOR.
-- =============================================================================

revoke update on public.profiles from anon, authenticated;
grant  update (full_name, phone, avatar_url) on public.profiles to authenticated;

revoke update on public.driver_states from anon, authenticated;
grant  update (
         is_online, operational_status, current_location, current_h3_index,
         location_accuracy_m, location_source, location_updated_at
       ) on public.driver_states to authenticated;

-- Tài xế chỉ phản hồi offer; các cột còn lại do service role quản lý.
revoke insert, update, delete on public.driver_offers from anon, authenticated;
grant  update (status, viewed_at, responded_at) on public.driver_offers to authenticated;

-- GPS: tài xế được ghi điểm của mình, nhưng KHÔNG được tự đặt kết quả xác minh.
-- is_inside_geofence và is_valid là kết luận của backend (H3 + PostGIS); nếu để
-- client ghi được thì tài xế có thể tự nhận đã tới vùng và nhận thưởng sai.
revoke insert, update, delete on public.driver_location_events from anon, authenticated;
grant  insert (
         driver_id, participation_id, location, h3_index,
         accuracy_m, source, recorded_at, event_type
       ) on public.driver_location_events to authenticated;

-- Tương tự với driver_states: active_campaign_id/active_trip_id do backend gán.
revoke insert, delete on public.driver_states from anon, authenticated;
grant  insert (
         driver_id, is_online, operational_status, current_location,
         current_h3_index, location_accuracy_m, location_source, location_updated_at
       ) on public.driver_states to authenticated;

-- Những bảng client không bao giờ được ghi trực tiếp.
revoke insert, update, delete on
  public.h3_cells,
  public.supply_demand_snapshots,
  public.supply_demand_cells,
  public.hotspots,
  public.campaigns,
  public.campaign_participations,
  public.trips,
  public.reward_records,
  public.audit_logs,
  public.model_inputs,
  public.model_outputs
from anon, authenticated;

-- Proposal do Người vận hành tạo/sửa trực tiếp trên console.
revoke delete on public.proposals from anon, authenticated;

-- =============================================================================
-- profiles
-- =============================================================================

create policy "profiles_select_own_or_operator"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.is_operator());

create policy "profiles_update_own"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- =============================================================================
-- driver_states — DRIVER ghi của mình, OPERATOR đọc để điều phối
-- =============================================================================

create policy "driver_states_select_own_or_operator"
  on public.driver_states for select to authenticated
  using (driver_id = (select auth.uid()) or public.is_operator());

create policy "driver_states_insert_own"
  on public.driver_states for insert to authenticated
  with check (driver_id = (select auth.uid()));

create policy "driver_states_update_own"
  on public.driver_states for update to authenticated
  using (driver_id = (select auth.uid()))
  with check (driver_id = (select auth.uid()));

-- =============================================================================
-- Bản đồ và cung–cầu — chỉ OPERATOR đọc
-- Spec §7: "DRIVER không đọc heatmap vận hành".
-- =============================================================================

create policy "h3_cells_select_operator"
  on public.h3_cells for select to authenticated
  using (public.is_operator());

create policy "snapshots_select_operator"
  on public.supply_demand_snapshots for select to authenticated
  using (public.is_operator());

create policy "sd_cells_select_operator"
  on public.supply_demand_cells for select to authenticated
  using (public.is_operator());

-- =============================================================================
-- Tích hợp Model — chỉ OPERATOR đọc; ghi hoàn toàn qua service role
-- Spec §7: "không mở cho Driver App".
-- =============================================================================

create policy "model_inputs_select_operator"
  on public.model_inputs for select to authenticated
  using (public.is_operator());

create policy "model_outputs_select_operator"
  on public.model_outputs for select to authenticated
  using (public.is_operator());

-- =============================================================================
-- hotspots và proposals — OPERATOR đọc/ghi
-- =============================================================================

create policy "hotspots_select_operator"
  on public.hotspots for select to authenticated
  using (public.is_operator());

create policy "proposals_select_operator"
  on public.proposals for select to authenticated
  using (public.is_operator());

create policy "proposals_insert_operator"
  on public.proposals for insert to authenticated
  with check (public.is_operator());

create policy "proposals_update_operator"
  on public.proposals for update to authenticated
  using (public.is_operator())
  with check (public.is_operator());

-- =============================================================================
-- campaigns — OPERATOR đọc tất cả; DRIVER chỉ đọc campaign liên quan tới mình
-- =============================================================================

create policy "campaigns_select_operator_or_related_driver"
  on public.campaigns for select to authenticated
  using (
    public.is_operator()
    or exists (
      select 1 from public.driver_offers o
      where o.campaign_id = campaigns.id
        and o.driver_id = (select auth.uid())
    )
    or exists (
      select 1 from public.campaign_participations p
      where p.campaign_id = campaigns.id
        and p.driver_id = (select auth.uid())
    )
  );

-- =============================================================================
-- driver_offers — DRIVER chỉ thấy và phản hồi offer của chính mình
-- =============================================================================

create policy "offers_select_own_or_operator"
  on public.driver_offers for select to authenticated
  using (driver_id = (select auth.uid()) or public.is_operator());

create policy "offers_respond_own"
  on public.driver_offers for update to authenticated
  using (driver_id = (select auth.uid()))
  with check (driver_id = (select auth.uid()));

-- =============================================================================
-- campaign_participations — DRIVER đọc bản ghi của mình
-- Cập nhật trạng thái (EN_ROUTE/ARRIVED_VERIFIED/ACTIVATED) do service role làm.
-- =============================================================================

create policy "participations_select_own_or_operator"
  on public.campaign_participations for select to authenticated
  using (driver_id = (select auth.uid()) or public.is_operator());

-- =============================================================================
-- driver_location_events — DRIVER insert GPS của mình, không đọc của người khác
-- =============================================================================

create policy "location_events_insert_own"
  on public.driver_location_events for insert to authenticated
  with check (driver_id = (select auth.uid()));

create policy "location_events_select_own_or_operator"
  on public.driver_location_events for select to authenticated
  using (driver_id = (select auth.uid()) or public.is_operator());

-- =============================================================================
-- trips và reward_records — DRIVER chỉ đọc bản ghi của mình
-- =============================================================================

create policy "trips_select_own_or_operator"
  on public.trips for select to authenticated
  using (driver_id = (select auth.uid()) or public.is_operator());

create policy "rewards_select_own_or_operator"
  on public.reward_records for select to authenticated
  using (driver_id = (select auth.uid()) or public.is_operator());

-- =============================================================================
-- audit_logs — chỉ OPERATOR đọc; ghi hoàn toàn qua service role
-- =============================================================================

create policy "audit_logs_select_operator"
  on public.audit_logs for select to authenticated
  using (public.is_operator());
