import type { ReactNode } from 'react'

import type { FlowAnchor } from '@/features/operator-pipeline/hooks/useFlowAnchors'

// Lớp cạnh nối của sơ đồ: bốn agent nguồn hội tụ vào node trung tâm, node trung tâm toả tiếp
// sang panel chi tiết (agent/07-Design §5.3). Toạ độ lấy từ vị trí đo được của từng thẻ nên
// cạnh vẫn đúng tâm khi thẻ đổi chiều cao lúc bung danh sách task.

export type FlowEdge = { id: string; from: string; to: string; isFlowing: boolean }

export function FlowEdges({ anchors, edges, size }: {
  anchors: readonly FlowAnchor[]
  edges: readonly FlowEdge[]
  size: { width: number; height: number }
}) {
  if (size.width === 0) return null
  const anchorOf = (id: string) => anchors.find((anchor) => anchor.id === id)

  return (
    <svg aria-hidden className="nfp-flow-edges" height={size.height} width={size.width}>
      {edges.map((edge, index) => {
        const from = anchorOf(edge.from)
        const to = anchorOf(edge.to)
        if (!from || !to) return null
        const startX = from.right
        const endX = to.left
        const bend = Math.max(18, (endX - startX) * 0.55)
        const path = `M${startX},${from.centerY} C${startX + bend},${from.centerY} ${endX - bend},${to.centerY} ${endX},${to.centerY}`
        return (
          <g key={edge.id}>
            <path d={path} fill="none" stroke="var(--nfp-grid)" strokeWidth={1.5} />
            {edge.isFlowing && (
              <circle className="nfp-flow-dot" r={3}>
                <animateMotion begin={`${index * 0.3}s`} dur="2.2s" path={path} repeatCount="indefinite" />
              </circle>
            )}
          </g>
        )
      })}
    </svg>
  )
}

export function FlowStage({ containerRef, children }: {
  containerRef: (node: HTMLElement | null) => void
  children: ReactNode
}) {
  return (
    <div className="nfp-flow" ref={containerRef}>
      {children}
    </div>
  )
}
