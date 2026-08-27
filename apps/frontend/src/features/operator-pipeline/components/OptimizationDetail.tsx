import type { ReactNode } from 'react'
import { ExternalLink, ShieldCheck, Sparkles } from 'lucide-react'

import { PlanComparisonBars } from '@/features/operator-pipeline/components/PlanComparisonBars'
import type { PipelineRunRecord } from '@/features/operator-pipeline/model/pipelineRun'
import { formatCurrency } from '@/shared/lib/format'

// Panel chi tiết Optimization Agent (agent/07-Design §6): mô tả, ba ô chỉ số nổi bật, thanh
// so sánh phương án, diễn giải, rồi tới khối quyết định của con người.
//
// Khác design ở một điểm có chủ ý: **không có nút Confirm tự động và không có Recall**.
// Hai cổng phê duyệt là hành động người, hệ thống không tự duyệt (CLAUDE.md §11.1), và offer
// đã gửi thì không thu hồi ngược (C-08). Chỗ đó đặt đúng bộ nút thật của quy trình.

export function OptimizationDetail({ run, onOpenPlan, decisionSlot }: {
  run: PipelineRunRecord | undefined
  onOpenPlan: (() => void) | undefined
  decisionSlot: ReactNode
}) {
  const planSet = run?.plan_set
  const plans = planSet?.plans ?? []
  const recommended = plans.find((plan) => plan.plan_id === run?.recommended_plan_id) ?? plans[0]
  const explanation = run?.explanation

  return (
    <div className="space-y-4">
      <header>
        <h3 className="text-[13px] font-bold text-[var(--nfp-ink)]">Optimization Agent</h3>
        <p className="mt-1 text-[11px] leading-relaxed text-[var(--nfp-muted)]">
          Gộp output của bốn agent nguồn, giải bài toán vận tải theo ràng buộc chính sách và
          chấm ba chiến lược để chọn phương án khuyến nghị.
        </p>
      </header>

      {recommended ? (
        <>
          <dl className="grid grid-cols-3 gap-2">
            <StatTile label="Xe điều" value={`${recommended.total_units}`} unit="xe" />
            <StatTile label="Chi phí" value={formatCurrency(recommended.total_cost)} unit="" />
            <StatTile label="Zone còn thiếu" value={`${recommended.residual_zone_count}`} unit="zone" />
          </dl>

          <div className="nfp-card px-3 py-2.5">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold text-[var(--nfp-ink)]">{recommended.plan_id}</span>
              <span className="rounded-full bg-[var(--nfp-accent-fill)] px-2 py-0.5 text-[9px] font-bold text-white">
                Khuyến nghị
              </span>
              <span className="ml-auto text-[10px] text-[var(--nfp-muted)]">{recommended.move_count} chặng</span>
            </div>
            {planSet?.converged && (
              <p className="mt-2 rounded-lg border border-[var(--nfp-warn)]/30 bg-[var(--nfp-warn-soft)] px-2.5 py-2 text-[10px] leading-relaxed text-[var(--nfp-warn)]" role="note">
                <Sparkles className="mr-1 inline size-3 align-[-2px]" />
                Ba chiến lược (chi phí / cân bằng / ETA) cho ra cùng một phương án: chi phí và ETA
                cùng tăng theo quãng đường nên không có đánh đổi giữa chúng.
              </p>
            )}
          </div>

          <PlanComparisonBars plans={plans} recommendedPlanId={run?.recommended_plan_id} />
        </>
      ) : (
        <p className="nfp-card px-3 py-3 text-[11px] text-[var(--nfp-muted)]">
          {run
            ? `Chưa có phương án nào${run.quality_reason ? ` — quality gate từ chối: ${run.quality_reason}` : '.'}`
            : 'Chưa chạy lượt phân tích nào. Bấm “Chạy phân tích” để agent bắt đầu.'}
        </p>
      )}

      {explanation && (
        <section className="nfp-card px-3 py-2.5">
          <div className="mb-1 flex items-center justify-between gap-2">
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-[var(--nfp-muted)]">Diễn giải</h4>
            <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
              explanation.layer === 'llm' ? 'bg-violet-100 text-violet-700' : 'bg-[var(--nfp-raise-2)] text-[var(--nfp-muted)]'
            }`}>
              {explanation.layer === 'llm' ? 'LLM viết' : 'Template ghép'}
            </span>
          </div>
          <p className="text-[11px] leading-relaxed text-[var(--nfp-ink)]">{explanation.text}</p>
        </section>
      )}

      {(run?.warnings ?? []).length > 0 && (
        <ul className="space-y-1">
          {(run?.warnings ?? []).map((warning, index) => (
            <li className="nfp-card px-2.5 py-1.5 text-[10px] text-[var(--nfp-muted)]" key={`${warning.code ?? 'warn'}-${index}`}>
              {warning.message}
            </li>
          ))}
        </ul>
      )}

      <section aria-label="Quyết định của điều phối viên" className="nfp-card px-3 py-3">
        <h4 className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--nfp-muted)]">
          <ShieldCheck className="size-3" />Quyết định của điều phối viên
        </h4>
        <p className="mb-2.5 mt-1 text-[10px] leading-relaxed text-[var(--nfp-muted)]">
          Hệ thống không tự duyệt và không có đường tắt nào vòng qua bước này.
        </p>
        {decisionSlot}
        {onOpenPlan && (
          <button
            className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-bold text-[var(--nfp-accent)]"
            onClick={onOpenPlan}
            type="button"
          >
            Mở phương án đầy đủ<ExternalLink className="size-3" />
          </button>
        )}
      </section>
    </div>
  )
}

function StatTile({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="nfp-card px-2.5 py-2">
      <dt className="text-[9px] uppercase tracking-wider text-[var(--nfp-muted)]">{label}</dt>
      <dd className="mt-0.5 truncate text-[15px] font-black text-[var(--nfp-accent)]" title={`${value} ${unit}`}>
        {value}
        {unit && <span className="ml-1 text-[10px] font-semibold text-[var(--nfp-muted)]">{unit}</span>}
      </dd>
    </div>
  )
}
