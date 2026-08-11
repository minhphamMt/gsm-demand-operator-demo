import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
}

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const { data: template, error: templateError } = await db.from('proposals')
  .select('*').order('created_at', { ascending: false }).limit(1).single();
if (templateError || !template) throw new Error(`Proposal template is unavailable: ${templateError?.code ?? 'missing'}`);

const now = Date.now();
const variants = [
  { drivers: 3, offers: 5, bonus: 30000, multiplier: 1.1, durationMinutes: 180, label: 'Bổ sung nhẹ khu vực thiếu cung' },
  { drivers: 5, offers: 8, bonus: 45000, multiplier: 1.2, durationMinutes: 210, label: 'Điều phối giờ cao điểm' },
  { drivers: 8, offers: 12, bonus: 60000, multiplier: 1.3, durationMinutes: 240, label: 'Tăng cường khu vực thiếu cung nghiêm trọng' },
];
const rows = variants.map((variant, index) => {
  const id = randomUUID();
  const budget = variant.drivers * variant.bonus * 2;
  return {
    id,
    root_proposal_id: id,
    parent_proposal_id: null,
    hotspot_id: template.hotspot_id,
    input_snapshot_id: template.input_snapshot_id,
    version: 1,
    generator_type: 'MOCK',
    generator_version: 'mock:operator-review-demo-v1',
    status: 'UNDER_REVIEW',
    policy_status: 'PASSED',
    target_h3_indexes: template.target_h3_indexes,
    target_geofence: template.target_geofence,
    source_plan: template.source_plan,
    target_driver_count: variant.drivers,
    offer_count: variant.offers,
    window_start_at: new Date(now + index * 5 * 60_000).toISOString(),
    window_end_at: new Date(now + variant.durationMinutes * 60_000).toISOString(),
    bonus_amount: variant.bonus,
    fare_multiplier: variant.multiplier,
    estimated_cost: budget,
    simulation_details: template.simulation_details,
    explanation: `[DỮ LIỆU MÔ PHỎNG ĐỂ TEST] ${variant.label}. Có thể chỉnh sửa, duyệt hoặc từ chối an toàn trong luồng operator.`,
  };
});

const { data, error } = await db.from('proposals').insert(rows)
  .select('id,status,generator_type,generator_version,target_driver_count,bonus_amount,estimated_cost,window_end_at');
if (error) throw new Error(`Cannot seed review proposals: ${error.code} ${error.message}`);
console.log(JSON.stringify({ created: data.length, proposals: data }, null, 2));
