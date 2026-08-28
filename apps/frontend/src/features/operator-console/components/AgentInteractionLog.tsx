// Nhật ký agent — popup nổi góc dưới phải, và là chỗ người vận hành ra lệnh (MA-6.7, Chặng 7).
//
// **Ô nhập không phải là cửa thứ hai vào cổng phê duyệt.** Nó gửi câu chữ tới agent quan sát,
// và agent đó có allowlist chỉ-đọc; lệnh "duyệt đi" bị chặn ở server trước cả khi LLM kịp nói
// gì, rồi bị chặn lần nữa bởi allowlist directive của client. Hai cổng §11.1 vẫn chỉ mở bằng
// nút bấm, và đó là điều kiện để tính năng này tồn tại chứ không phải một hạn chế tạm thời.
//
// Popup **luôn hiện**, kể cả khi chưa chạy lượt nào: nó là chỗ ra lệnh, không chỉ là chỗ xem
// kết quả. Không có nút đóng — chỉ mở ↔ thu gọn, nên không có trạng thái nào mất đường quay lại.

import { ChevronDown, ChevronUp, CornerDownLeft, Terminal } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { rowKey, type LogRow } from '@/features/operator-console/model/logRows'
import { eventActorLabel } from '@/features/operator-pipeline/model/agentTasks'
import { eventClock } from '@/features/operator-pipeline/model/pipelineRun'

export type AgentInteractionLogProps = {
  rows: readonly LogRow[]
  isRunning: boolean
  isBusy: boolean
  onAsk: (text: string) => void
}

// Ngưỡng coi là "đang ở đáy". Không dùng 0: trình duyệt làm tròn scrollTop theo phân số pixel
// khi zoom, nên so bằng đúng sẽ làm nút tự-cuộn bật tắt loạn ở mức zoom lẻ.
const bottomSlackPx = 24

const placeholder = 'Hỏi hoặc ra lệnh — ví dụ: chạy phân tích, zone nào đang thiếu xe'

function toneOf(row: LogRow): string {
  if (row.origin === 'operator') return 'is-operator'
  // Hai cổng người-duyệt được tô riêng: đọc lại nhật ký về sau, thứ cần tìm thấy trước tiên
  // là "ai đã quyết định gì", không phải agent đã gọi tool nào.
  if (row.code === 'GATE_PLAN_APPROVED' || row.code === 'GATE_CAMPAIGN_CONFIRMED') return 'is-gate'
  if (row.origin === 'action') return row.ok === false ? 'is-bad' : 'is-action'
  if (row.kind === 'tool_denied' || row.code === 'GATE_IS_UI_ONLY') return 'is-denied'
  if (row.ok === false) return 'is-bad'
  if (row.kind === 'run_started' || row.kind === 'run_finished') return 'is-frame'
  if (row.source === 'llm') return 'is-llm'
  return ''
}

export function AgentInteractionLog({ rows, isRunning, isBusy, onAsk }: AgentInteractionLogProps) {
  const [isOpen, setIsOpen] = useState(true)
  const [seenCount, setSeenCount] = useState(0)
  const [isPinned, setIsPinned] = useState(true)
  const [draft, setDraft] = useState('')
  const listRef = useRef<HTMLDivElement>(null)

  const unread = Math.max(0, rows.length - seenCount)

  // Tự cuộn **chỉ khi** người dùng đang ở đáy. Kéo lên đọc lại một dòng cũ mà bị giật xuống
  // đáy mỗi hai giây là cách chắc chắn nhất để nhật ký thành thứ không ai đọc được.
  useEffect(() => {
    if (!isOpen || !isPinned) return
    const node = listRef.current
    if (node) node.scrollTop = node.scrollHeight
    setSeenCount(rows.length)
  }, [isOpen, isPinned, rows.length])

  const jumpToLatest = () => {
    const node = listRef.current
    if (node) node.scrollTop = node.scrollHeight
    setIsPinned(true)
  }

  const handleScroll = () => {
    const node = listRef.current
    if (!node) return
    setIsPinned(node.scrollHeight - node.scrollTop - node.clientHeight < bottomSlackPx)
  }

  const submit = () => {
    if (!draft.trim()) return
    onAsk(draft)
    setDraft('')
    jumpToLatest()
  }

  if (!isOpen) {
    return (
      <button className="nf-agent-log nf-agent-log--bar" onClick={() => { setIsOpen(true); jumpToLatest() }} type="button">
        <Terminal aria-hidden="true" className="size-3.5" />
        <strong>Nhật ký agent</strong>
        {(isRunning || isBusy) && <span aria-label="đang chạy" className="nf-agent-log__live" />}
        {unread > 0 && <em>{unread} dòng mới</em>}
        <ChevronUp aria-hidden="true" className="size-3.5" />
      </button>
    )
  }

  return (
    <section aria-label="Nhật ký agent" className="nf-agent-log nf-agent-log--open">
      <header className="nf-agent-log__head">
        <Terminal aria-hidden="true" className="size-3.5" />
        <strong>Nhật ký agent</strong>
        {(isRunning || isBusy) && <span aria-label="đang chạy" className="nf-agent-log__live" />}
        <small>{rows.length} dòng</small>
        <button aria-label="Thu gọn nhật ký" onClick={() => setIsOpen(false)} type="button">
          <ChevronDown className="size-3.5" />
        </button>
      </header>

      <div aria-live="polite" className="nf-agent-log__body" onScroll={handleScroll} ref={listRef} role="log">
        {rows.length === 0 && (
          <p className="nf-agent-log__empty">
            Chưa có lượt chạy nào. Gõ <b>chạy phân tích</b> để agent bắt đầu, hoặc hỏi về dự báo, thời tiết, tình hình cung.
          </p>
        )}
        {rows.map((row) => (
          <p className={`nf-agent-log__line ${toneOf(row)}`} key={rowKey(row)}>
            {row.origin === 'operator' ? (
              <>
                <span className="nf-agent-log__clock">[{eventClock(row.at)}]</span>
                {' '}
                <span className="nf-agent-log__prompt">&gt;</span>
                {' '}
                {row.text}
              </>
            ) : (
              <>
                <span className="nf-agent-log__clock">[{eventClock(row.at)}]</span>
                {' '}
                <span className="nf-agent-log__actor">
                  [{row.origin === 'action' ? 'NGƯỜI VẬN HÀNH' : eventActorLabel(row)}]
                </span>
                {' > '}
                {row.text}
                {row.source === 'llm' && <span className="nf-agent-log__llm" title="Dòng do LLM viết">~llm</span>}
              </>
            )}
          </p>
        ))}
      </div>

      {!isPinned && unread > 0 && (
        <button className="nf-agent-log__jump" onClick={jumpToLatest} type="button">
          ↓ {unread} dòng mới
        </button>
      )}

      <form
        className="nf-agent-log__compose"
        onSubmit={(submitEvent) => { submitEvent.preventDefault(); submit() }}
      >
        <span aria-hidden="true">&gt;</span>
        <input
          aria-label="Ra lệnh hoặc hỏi agent"
          onChange={(changeEvent) => setDraft(changeEvent.target.value)}
          placeholder={placeholder}
          value={draft}
        />
        <button aria-label="Gửi" disabled={!draft.trim()} type="submit">
          <CornerDownLeft className="size-3.5" />
        </button>
      </form>
    </section>
  )
}
