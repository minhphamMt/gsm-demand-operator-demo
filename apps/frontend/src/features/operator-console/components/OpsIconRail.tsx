import { Activity, CircleHelp, GitBranch, LayoutGrid, PlayCircle, ScrollText } from 'lucide-react'
import type { ReactNode } from 'react'

import type { PipelineTabId } from '@/features/operator-pipeline'

// Thanh công cụ dọc ở rìa phải (agent/07-Design §2): mỗi icon là một tab cấp 1 của panel.
// Ba tab đầu mở panel; hai mục cuối điều hướng sang trang đã có, không dựng lại trong panel.

type RailTab = { kind: 'tab'; id: PipelineTabId; label: string; icon: ReactNode }
type RailLink = { kind: 'link'; id: string; label: string; icon: ReactNode }

const items: readonly (RailTab | RailLink)[] = [
  { kind: 'tab', id: 'overview', label: 'Tổng quan', icon: <Activity size={17} /> },
  { kind: 'tab', id: 'agents', label: 'Agent', icon: <LayoutGrid size={17} /> },
  { kind: 'tab', id: 'connect', label: 'Sơ đồ luồng', icon: <GitBranch size={17} /> },
  { kind: 'link', id: 'execution', label: 'Thực thi', icon: <PlayCircle size={17} /> },
  { kind: 'link', id: 'history', label: 'Lịch sử', icon: <ScrollText size={17} /> },
]

export function OpsIconRail({ activeTab, isPanelOpen, onSelectTab, onNavigate }: {
  activeTab: PipelineTabId
  isPanelOpen: boolean
  onSelectTab: (tab: PipelineTabId) => void
  onNavigate: (id: string) => void
}) {
  return (
    <nav aria-label="Công cụ giám sát" className="nf-icon-rail">
      {items.map((item) => {
        const isActive = isPanelOpen && item.kind === 'tab' && item.id === activeTab
        return (
          <button
            aria-current={isActive ? 'true' : undefined}
            aria-label={item.label}
            className={isActive ? 'is-active' : ''}
            key={item.id}
            onClick={() => (item.kind === 'tab' ? onSelectTab(item.id) : onNavigate(item.id))}
            title={item.label}
            type="button"
          >
            {item.icon}
          </button>
        )
      })}
      <span className="nf-icon-rail-spacer" />
      <button
        aria-label="Panel giám sát dùng dữ liệu mô phỏng"
        className="nf-icon-rail-help"
        title="Mọi số liệu là simulation proxy trên dữ liệu synthetic"
        type="button"
      >
        <CircleHelp size={16} />
      </button>
    </nav>
  )
}
