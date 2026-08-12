-- =============================================================================
-- GSM-14 MVP — Bước 1/3: Extensions và trigger function dùng chung
-- Nguồn: docs/database-spec.md
--
-- File này cố tình KHÔNG tham chiếu bảng nào: hàm LANGUAGE sql được Postgres
-- kiểm tra body ngay lúc CREATE, nên helper RLS (đọc profiles) nằm ở bước 3.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------

-- Supabase tạo sẵn schema `extensions` để tránh làm bẩn `public`.
create schema if not exists extensions;

create extension if not exists pgcrypto with schema extensions;
create extension if not exists postgis with schema extensions;

-- H3 chỉ dùng cho tính toán phía backend; schema này lưu h3_index dạng VARCHAR
-- nên nếu project chưa bật được extension thì migration vẫn chạy bình thường.
do $$
begin
  create extension if not exists h3 with schema extensions;
exception
  when others then
    raise notice
      'Không bật được extension h3 (%). Bỏ qua — h3_index lưu dạng VARCHAR nên schema không bị ảnh hưởng.',
      sqlerrm;
end
$$;

-- ---------------------------------------------------------------------------
-- Trigger dùng chung: tự cập nhật updated_at
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

comment on function public.set_updated_at() is
  'Trigger BEFORE UPDATE: đặt updated_at = now().';
