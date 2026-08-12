-- =============================================================================
-- GSM-14 MVP — Siết quyền EXECUTE trên các function nội bộ
--
-- Vấn đề: PostgreSQL mặc định cấp EXECUTE cho PUBLIC, và Supabase cấp thêm cho
-- anon/authenticated/service_role. Mọi function trong schema `public` vì thế
-- gọi được qua PostgREST tại /rest/v1/rpc/<tên>. Database linter báo WARN
-- 0028/0029 cho bốn function SECURITY DEFINER ở bước 1 và bước 3.
--
-- Bốn function này là chi tiết nội bộ (helper cho policy + trigger đồng bộ
-- auth.users), không phải API dành cho client.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Helper RLS: current_profile_role / is_operator / is_driver
--
-- QUAN TRỌNG — KHÔNG revoke khỏi `authenticated`:
-- biểu thức trong policy RLS được đánh giá dưới quyền của chính user đang chạy
-- truy vấn, nên nếu `authenticated` mất EXECUTE thì MỌI câu select trên bảng có
-- policy gọi is_operator() đều lỗi 42501 permission denied.
--
-- Chỉ cắt PUBLIC và anon: toàn bộ policy ở bước 3 đều khai báo `to authenticated`,
-- anon không bao giờ đánh giá tới các hàm này.
-- ---------------------------------------------------------------------------

revoke execute on function
  public.current_profile_role(),
  public.is_operator(),
  public.is_driver()
from public, anon;

-- ---------------------------------------------------------------------------
-- Trigger function: handle_new_auth_user
--
-- Cắt được toàn bộ: PostgreSQL chỉ kiểm tra EXECUTE lúc CREATE TRIGGER, không
-- kiểm tra lại mỗi lần trigger chạy — nên trigger trg_on_auth_user_created trên
-- auth.users vẫn hoạt động bình thường sau khi revoke.
-- ---------------------------------------------------------------------------

revoke execute on function public.handle_new_auth_user()
from public, anon, authenticated, service_role;
