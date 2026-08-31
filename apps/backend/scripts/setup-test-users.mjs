import { createClient } from '@supabase/supabase-js';

const required = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'TEST_OPERATOR_EMAIL',
  'TEST_OPERATOR_PASSWORD',
  'TEST_DRIVER_EMAIL',
  'TEST_DRIVER_PASSWORD',
];
for (const name of required) {
  if (!process.env[name]) throw new Error(`${name} is required`);
}

const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Bộ quyền, danh sách zone và khung ca lấy nguyên từ seed của migration
// 20260815170000_operator_governance_foundations.sql. Không tự nghĩ bộ quyền mới: lệch
// với seed nghĩa là tài khoản do script tạo hành xử khác tài khoản do migration tạo.
const OPERATOR_PERMISSIONS = [
  'proposal.review',
  'campaign.release',
  'campaign.cancel',
  'dispatch.release',
  'scenario.compare',
  'compensation.settle',
  'audit.export',
];
const OPERATOR_ZONE_IDS = Array.from({ length: 30 }, (_, index) => index + 1);
const OPERATOR_MARKET_CODE = 'HN';
const SHIFT_ENDS_AT = '2099-12-31T23:59:59+07:00';

/**
 * Cấp scope và ca trực cho một điều phối viên.
 *
 * `profiles.role = 'OPERATOR'` chỉ đủ để ĐỌC — `AuthGuard` chỉ xét role. Quyền GHI nằm ở
 * `operator_scopes`, vì mọi RPC ghi đều mở đầu bằng
 * `assert_operator_permission(actor, '<quyền>')`, và hàm đó `raise 42501` khi không thấy
 * dòng scope. Thiếu bước này thì tài khoản vào được bảng điều hành, thấy đủ phương án, rồi
 * bấm Phê duyệt là 403. Đọc chạy còn ghi thì không — dạng lỗi rất khó lần, vì mọi thứ trên
 * màn hình đều trông đúng cho tới lúc bấm nút cuối.
 *
 * Cố ý KHÔNG dùng `upsert`: hai bảng này khóa bằng **partial unique index**
 * (`operator_scopes … where valid_until is null` và
 * `operator_shifts … where status in ('ACTIVE','HANDOVER')`), thứ mà `onConflict` không
 * nhắm tới được. Đọc trước rồi chèn giữ đúng ngữ nghĩa `not exists` của migration.
 */
async function ensureOperatorGovernance(operatorId) {
  const { data: existingScope, error: scopeReadError } = await client
    .from('operator_scopes')
    .select('id')
    .eq('operator_id', operatorId)
    .eq('market_code', OPERATOR_MARKET_CODE)
    .is('valid_until', null)
    .maybeSingle();
  if (scopeReadError) throw scopeReadError;

  let scopeId = existingScope?.id;
  if (!scopeId) {
    const { data, error } = await client.from('operator_scopes').insert({
      operator_id: operatorId,
      market_code: OPERATOR_MARKET_CODE,
      zone_ids: OPERATOR_ZONE_IDS,
      permissions: OPERATOR_PERMISSIONS,
    }).select('id').single();
    if (error) throw error;
    scopeId = data.id;
  }

  const { data: existingShift, error: shiftReadError } = await client
    .from('operator_shifts')
    .select('id')
    .eq('operator_id', operatorId)
    .in('status', ['ACTIVE', 'HANDOVER'])
    .maybeSingle();
  if (shiftReadError) throw shiftReadError;
  if (existingShift) return { created: !existingScope };

  // Bắt đầu lùi một ngày: `operatorContext` đòi `starts_at <= now`, nên một ca mở đúng
  // `now()` có thể trượt vì lệch đồng hồ giữa máy chạy script và Postgres.
  const { data, error } = await client.from('operator_shifts').insert({
    operator_id: operatorId,
    scope_id: scopeId,
    status: 'ACTIVE',
    starts_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    ends_at: SHIFT_ENDS_AT,
    timezone: 'Asia/Ho_Chi_Minh',
  }).select('id').single();
  if (error) throw error;
  return { created: true };
}

/**
 * Vá mọi điều phối viên đang hoạt động còn thiếu scope hoặc ca trực.
 *
 * Migration cấp scope bằng một `insert … select` chạy **đúng một lần** lúc migrate, nên mọi
 * profile sinh ra sau đó đều rỗng quyền — kể cả profile tạo bằng chính script này trước khi
 * nó biết cấp scope. Không có bước này, sửa script chỉ cứu được tài khoản tạo từ nay về sau
 * và để nguyên tài khoản đang hỏng.
 *
 * Gọi thẳng `ensureOperatorGovernance` cho từng người thay vì tự dò xem ai thiếu: hàm đó đã
 * idempotent, và một vòng dò riêng ở đây sẽ chỉ soi mỗi scope — bỏ sót đúng những tài khoản
 * có scope nhưng mất ca trực.
 */
async function backfillOperatorGovernance() {
  const { data: operators, error } = await client
    .from('profiles').select('id').eq('role', 'OPERATOR').eq('is_active', true);
  if (error) throw error;

  const repaired = [];
  for (const operator of operators ?? []) {
    const { created } = await ensureOperatorGovernance(operator.id);
    if (created) repaired.push(operator.id);
  }
  return repaired;
}

async function findUser(email) {
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw error;
    const user = data.users.find((candidate) => candidate.email?.toLowerCase() === email.toLowerCase());
    if (user) return user;
    if (data.users.length < 100) return null;
  }
  throw new Error(`Unable to find ${email} in the first 1000 auth users`);
}

async function ensureUser({ email, password, role, fullName }) {
  let user = await findUser(email);
  if (user) {
    const { data, error } = await client.auth.admin.updateUserById(user.id, {
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, role },
    });
    if (error) throw error;
    user = data.user;
  } else {
    const { data, error } = await client.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, role },
    });
    if (error) throw error;
    user = data.user;
  }

  const { error: profileError } = await client.from('profiles').upsert(
    {
      id: user.id,
      role,
      full_name: fullName,
      is_active: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' },
  );
  if (profileError) throw profileError;

  if (role === 'OPERATOR') await ensureOperatorGovernance(user.id);

  if (role === 'DRIVER') {
    const { error: stateError } = await client.from('driver_states').upsert(
      {
        driver_id: user.id,
        is_online: false,
        operational_status: 'OFFLINE',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'driver_id' },
    );
    if (stateError) throw stateError;
  }
  return { id: user.id, email, role };
}

const users = await Promise.all([
  ensureUser({
    email: process.env.TEST_OPERATOR_EMAIL,
    password: process.env.TEST_OPERATOR_PASSWORD,
    role: 'OPERATOR',
    fullName: 'GSM Test Operator',
  }),
  ensureUser({
    email: process.env.TEST_DRIVER_EMAIL,
    password: process.env.TEST_DRIVER_PASSWORD,
    role: 'DRIVER',
    fullName: 'GSM Test Driver',
  }),
]);

const repairedOperators = await backfillOperatorGovernance();

console.log(JSON.stringify({ ready: true, users, repairedOperators }, null, 2));
