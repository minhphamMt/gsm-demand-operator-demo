// Bước sau khi duyệt, đọc từ audit trail — MA-6.9.
//
// **Trung thực về chủ thể.** Những việc này do NestJS và tài xế làm, **không phải** agent trong
// đồ thị. Dán nhãn `[DISPATCH_AGENT]` lên một lệnh điều xe do backend phát là bịa ra một agent
// không tồn tại — cùng luật đã áp cho `[NGƯỜI VẬN HÀNH]` ở MA-6.8.
//
// Ba chủ thể, không phải một:
//   · `[THỰC THI]`       — backend: phát lệnh, phát offer, dừng chiến dịch, hết hiệu lực
//   · `[TÀI XẾ]`         — nhận / từ chối / để hết hạn một offer
//   · `[NGƯỜI VẬN HÀNH]` — duyệt, từ chối, chỉnh sửa, hủy phương án
//
// Gộp tài xế vào `[THỰC THI]` là chỗ dễ sai nhất: từ chối một offer là **quyền của tài xế**
// (C-08), không phải một bước thực thi của hệ thống, và trình bày nó như vậy là mô tả sai ai
// đang quyết định điều gì.
//
// **Trùng dòng: chấp nhận, không gộp.** Một lần bấm Phê duyệt để lại hai dòng — dòng tức thì
// của client (MA-6.8) và bản ghi từ DB mang tiền tố `[LƯU]`. Đọc ra thành "đã bấm" rồi "đã lưu",
// và đó là thông tin thật: bản thứ hai xác nhận quyết định đã bền hoá. Đối chiếu khoá để gộp
// chúng tốn khoảng một ngày công mà chỉ để giấu đi một dòng đúng.
//
// Lợi thêm không định trước: quyết định làm ở màn hình khác (`PlanDetail`) không có dòng client
// nào, nên bản `[LƯU]` là dòng duy nhất — và nhờ vậy nhật ký không bỏ sót nó.

import type { LogRow } from '@/features/operator-console/model/logRows'
import { auditActionLabels } from '@/features/operator-data/model/auditLabels'
import type { AuditAction, AuditEntry } from '@/features/operator-data/model/types'

// Việc dọn dẹp của hệ thống, không phải quyết định của ai. Đưa vào nhật ký chỉ làm loãng.
const HOUSEKEEPING: readonly AuditAction[] = ['Created', 'DemoReset', 'ScenarioLoaded']

const DRIVER_ACTIONS: readonly AuditAction[] = ['OfferAccepted', 'OfferDeclined', 'OfferExpired']

const OPERATOR_ACTIONS: readonly AuditAction[] = ['Approved', 'Rejected', 'Revised', 'ProposalCancelled']

export const AUDIT_PREFIX = '[LƯU]'

export function auditActor(action: AuditAction): string {
  if (DRIVER_ACTIONS.includes(action)) return 'driver'
  if (OPERATOR_ACTIONS.includes(action)) return 'operator'
  return 'execution'
}

/** Dòng nhật ký cho một phương án, lấy từ audit trail. Rỗng khi chưa có `planId`. */
export function auditLogRows(entries: readonly AuditEntry[], planId: string | undefined): readonly LogRow[] {
  if (!planId) return []
  return entries
    .filter((entry) => entry.planId === planId && !HOUSEKEEPING.includes(entry.action))
    // Audit trả về mới nhất trước; nhật ký đọc xuôi thời gian.
    .slice()
    .sort((left, right) => (left.occurredAt < right.occurredAt ? -1 : left.occurredAt > right.occurredAt ? 1 : 0))
    .map((entry, index): LogRow => ({
      origin: 'audit',
      seq: index + 1,
      at: entry.occurredAt,
      kind: 'audit_record',
      actor: auditActor(entry.action),
      text: `${AUDIT_PREFIX} ${auditActionLabels[entry.action]}${entry.detail ? ` — ${entry.detail}` : ''}`,
      source: 'system',
    }))
}
