// Nhật ký agent — thanh thu gọn nổi góc dưới phải, và là chỗ người vận hành ra lệnh (MA-6.7, Chặng 7).
//
// **Ô nhập không phải là cửa thứ hai vào cổng phê duyệt.** Nó gửi câu chữ tới agent quan sát,
// và agent đó có allowlist chỉ-đọc; lệnh "duyệt đi" bị chặn ở server trước cả khi LLM kịp nói
// gì, rồi bị chặn lần nữa bởi allowlist directive của client. Hai cổng §11.1 vẫn chỉ mở bằng
// nút bấm, và đó là điều kiện để tính năng này tồn tại chứ không phải một hạn chế tạm thời.
//
// Thanh thu gọn luôn hiện để giữ đường vào nhật ký, nhưng nội dung chỉ mở khi người vận hành
// cần xem hoặc nhập lệnh. Không có nút đóng — chỉ mở ↔ thu gọn.

import { ChevronDown, ChevronUp, CornerDownLeft, Terminal } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { liveAwaitingSeq, rowKey, type LogRow } from '@/features/operator-console/model/logRows'
import { eventActorLabel } from '@/features/operator-pipeline/model/agentTasks'
import { eventClock } from '@/features/operator-pipeline/model/pipelineRun'

export type AgentInteractionLogProps = {
  rows: readonly LogRow[]
  /** Agent đang chạy dở, hiện thành dòng "đang suy nghĩ" tạm ở đáy nhật ký.
   *
   * Là prop chứ không tự suy ra từ `rows`: `rows` đã qua `conversationRows`, và bộ lọc đó bỏ
   * đúng những `agent_started` cần để biết ai đang chạy. */
  thinking: readonly LogRow[]
  isRunning: boolean
  isBusy: boolean
  onAsk: (text: string) => void
  /** Lệnh nhanh từ bảng điều hành: mở nhật ký, điền câu lệnh và gửi ngay. */
  quickCommand?: { id: number; text: string } | undefined
}

// Ngưỡng coi là "đang ở đáy". Không dùng 0: trình duyệt làm tròn scrollTop theo phân số pixel
// khi zoom, nên so bằng đúng sẽ làm nút tự-cuộn bật tắt loạn ở mức zoom lẻ.
const bottomSlackPx = 24

const placeholder = 'Hỏi hoặc ra lệnh — ví dụ: chạy phân tích, zone nào đang thiếu xe'

function toneOf(row: LogRow, liveAwaiting: number | null): string {
  // Dòng chờ nhấp nháy CHỈ khi còn đang chờ thật. Duyệt hoặc từ chối xong thì nó thành một
  // dòng lịch sử tĩnh — để nó nhấp nháy mãi là nói rằng hệ thống vẫn đang đợi một việc đã xong.
  if (row.kind === 'awaiting_approval') return row.seq === liveAwaiting ? 'is-waiting' : 'is-frame'
  if (row.origin === 'operator') return 'is-operator'
  // Hai cổng người-duyệt được tô riêng: đọc lại nhật ký về sau, thứ cần tìm thấy trước tiên
  // là "ai đã quyết định gì", không phải agent đã gọi tool nào.
  if (row.code === 'GATE_PLAN_APPROVED' || row.code === 'GATE_CAMPAIGN_CONFIRMED') return 'is-gate'
  if (row.origin === 'action') return row.ok === false ? 'is-bad' : 'is-action'
  // Bản ghi đã bền hoá: mờ hơn dòng tức thì, vì nó là bản xác nhận chứ không phải tin mới.
  if (row.origin === 'audit') return 'is-audit'
  if (row.kind === 'tool_denied' || row.code === 'GATE_IS_UI_ONLY') return 'is-denied'
  if (row.ok === false) return 'is-bad'
  if (row.kind === 'run_started' || row.kind === 'run_finished') return 'is-frame'
  if (row.source === 'llm') return 'is-llm'
  return ''
}

export function AgentInteractionLog({ rows, thinking, isRunning, isBusy, onAsk, quickCommand }: AgentInteractionLogProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [seenCount, setSeenCount] = useState(0)
  const [isPinned, setIsPinned] = useState(true)
  const [draft, setDraft] = useState('')
  const listRef = useRef<HTMLDivElement>(null)
  const askRef = useRef(onAsk)
  askRef.current = onAsk

  const unread = Math.max(0, rows.length - seenCount)
  const liveAwaiting = liveAwaitingSeq(rows)

  // Tự cuộn **chỉ khi** người dùng đang ở đáy. Kéo lên đọc lại một dòng cũ mà bị giật xuống
  // đáy mỗi hai giây là cách chắc chắn nhất để nhật ký thành thứ không ai đọc được.
  useEffect(() => {
    if (!isOpen || !isPinned) return
    const node = listRef.current
    if (node) node.scrollTop = node.scrollHeight
    setSeenCount(rows.length)
  }, [isOpen, isPinned, rows.length])

  // Lệnh nhanh đi từ rail qua đây để vẫn dùng đúng một cổng chat và cùng một
  // allowlist directive. Gửi ngay sau khi mở để người dùng không phải gõ lại.
  useEffect(() => {
    if (!quickCommand?.text.trim()) return
    setIsOpen(true)
    setIsPinned(true)
    setDraft(quickCommand.text)
    askRef.current(quickCommand.text)
    setDraft('')
  }, [quickCommand?.id, quickCommand?.text])

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
        {liveAwaiting !== null && <em className="nf-agent-log__waiting">chờ bạn duyệt</em>}
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
          <p className={`nf-agent-log__line ${toneOf(row, liveAwaiting)}`} key={rowKey(row)}>
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
                  [{eventActorLabel(row)}]
                </span>
                {' > '}
                {row.text}
                {row.source === 'llm' && <span className="nf-agent-log__llm" title="Dòng do LLM viết">~llm</span>}
              </>
            )}
          </p>
        ))}
        {/* Dòng tạm, không có trong `rows` và không bao giờ đi vào nhật ký: nó biến mất ngay
            khi `agent_finished` tới. Khoá theo actor để React không dựng lại phần tử mỗi
            lượt poll — dựng lại sẽ khởi động lại animation và ba chấm nhấp nháy loạn nhịp. */}
        {thinking.map((row) => (
          <p className="nf-agent-log__line is-thinking" key={`thinking-${row.origin}-${row.actor}`}>
            <span className="nf-agent-log__clock">[{eventClock(row.at)}]</span>
            {' '}
            <span className="nf-agent-log__actor">[{eventActorLabel(row)}]</span>
            {' > '}
            <span className="nf-agent-log__dots">đang suy nghĩ</span>
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
