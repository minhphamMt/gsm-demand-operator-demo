// Nhật ký agent — popup nổi góc dưới phải của bảng điều hành (MA-6.7).
//
// **Chỉ đọc.** Hai nút duy nhất ở đây là thu gọn và cuộn-xuống-cuối: chúng đổi cách nhìn, không
// đổi thứ gì trong hệ thống. Không có nút duyệt, không có nút chạy lại. Một nút hành động đặt
// trong nhật ký là con đường thứ hai tới cổng phê duyệt (§11.1), và tệ hơn nữa vì nhật ký là
// khung nhìn **quá khứ**: người dùng cuộn lên, bấm một dòng cũ, và duyệt phải bản đã chết.
//
// Không có nút đóng — chỉ mở ↔ thu gọn. Đóng hẳn thì phải có chỗ mở lại, mà chỗ đó nằm ngoài
// phạm vi Chặng 2; thu gọn thành một thanh mỏng đã đủ trả lại chỗ cho bản đồ.

import { ChevronDown, ChevronUp, Terminal } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { eventActorLabel } from '@/features/operator-pipeline/model/agentTasks'
import { eventClock, type RunEvent } from '@/features/operator-pipeline/model/pipelineRun'

export type AgentInteractionLogProps = {
  events: readonly RunEvent[]
  isRunning: boolean
}

// Ngưỡng coi là "đang ở đáy". Không dùng 0: trình duyệt làm tròn scrollTop theo phân số pixel
// khi zoom, nên so bằng đúng sẽ làm nút tự-cuộn bật tắt loạn ở mức zoom lẻ.
const bottomSlackPx = 24

function toneOf(event: RunEvent): string {
  if (event.kind === 'tool_denied') return 'is-denied'
  if (event.ok === false) return 'is-bad'
  if (event.kind === 'run_started' || event.kind === 'run_finished') return 'is-frame'
  if (event.source === 'llm') return 'is-llm'
  return ''
}

export function AgentInteractionLog({ events, isRunning }: AgentInteractionLogProps) {
  const [isOpen, setIsOpen] = useState(true)
  const [seenSeq, setSeenSeq] = useState(0)
  const [isPinned, setIsPinned] = useState(true)
  const listRef = useRef<HTMLDivElement>(null)

  const lastSeq = events.at(-1)?.seq ?? 0
  const unread = events.filter((event) => event.seq > seenSeq).length

  // Tự cuộn **chỉ khi** người dùng đang ở đáy. Kéo lên đọc lại một dòng cũ mà bị giật xuống
  // đáy mỗi hai giây là cách chắc chắn nhất để nhật ký thành thứ không ai đọc được.
  useEffect(() => {
    if (!isOpen || !isPinned) return
    const node = listRef.current
    if (node) node.scrollTop = node.scrollHeight
    setSeenSeq(lastSeq)
  }, [isOpen, isPinned, lastSeq])

  if (events.length === 0) return null

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

  if (!isOpen) {
    return (
      <button className="nf-agent-log nf-agent-log--bar" onClick={() => { setIsOpen(true); jumpToLatest() }} type="button">
        <Terminal aria-hidden="true" className="size-3.5" />
        <strong>Nhật ký agent</strong>
        {isRunning && <span aria-label="đang chạy" className="nf-agent-log__live" />}
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
        {isRunning && <span aria-label="đang chạy" className="nf-agent-log__live" />}
        <small>{events.length} dòng</small>
        <button aria-label="Thu gọn nhật ký" onClick={() => setIsOpen(false)} type="button">
          <ChevronDown className="size-3.5" />
        </button>
      </header>

      <div aria-live="polite" className="nf-agent-log__body" onScroll={handleScroll} ref={listRef} role="log">
        {events.map((event) => (
          <p className={`nf-agent-log__line ${toneOf(event)}`} key={event.seq}>
            <span className="nf-agent-log__clock">[{eventClock(event.at)}]</span>
            {' '}
            <span className="nf-agent-log__actor">[{eventActorLabel(event)}]</span>
            {' > '}
            {event.text}
            {event.source === 'llm' && <span className="nf-agent-log__llm" title="Dòng do LLM viết">~llm</span>}
          </p>
        ))}
      </div>

      {!isPinned && unread > 0 && (
        <button className="nf-agent-log__jump" onClick={jumpToLatest} type="button">
          ↓ {unread} dòng mới
        </button>
      )}
    </section>
  )
}
