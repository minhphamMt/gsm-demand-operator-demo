// Nhật ký agent — thanh thu gọn nổi góc dưới phải, và là chỗ người vận hành ra lệnh (MA-6.7, Chặng 7).
//
// **Ô nhập không phải là cửa thứ hai vào cổng phê duyệt.** Nó gửi câu chữ tới agent quan sát,
// và agent đó có allowlist chỉ-đọc; lệnh "duyệt đi" bị chặn ở server trước cả khi LLM kịp nói
// gì, rồi bị chặn lần nữa bởi allowlist directive của client. Hai cổng §11.1 vẫn chỉ mở bằng
// nút bấm, và đó là điều kiện để tính năng này tồn tại chứ không phải một hạn chế tạm thời.
//
// Thanh thu gọn luôn hiện để giữ đường vào nhật ký, nhưng nội dung chỉ mở khi người vận hành
// cần xem hoặc nhập lệnh. Không có nút đóng — chỉ mở ↔ thu gọn.
// Lệnh gạch chéo (`/clear`, `/help`, `/export`) **không** làm yếu ranh giới đó, vì chúng không
// đi qua cùng một cửa: chúng dừng ở client và chỉ đổi cách nhìn, không đổi trạng thái nghiệp
// vụ nào. Ranh giới nằm ở chỗ chúng được xử lý *trước* `onAsk` — xem `parseConsoleCommand`.
//
// Popup **luôn hiện**, kể cả khi chưa chạy lượt nào: nó là chỗ ra lệnh, không chỉ là chỗ xem
// kết quả. Không có nút đóng — chỉ mở ↔ thu gọn, nên không có trạng thái nào mất đường quay lại.

import { ChevronDown, ChevronUp, CornerDownLeft, Terminal } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import {
  clearMark,
  clearedText,
  commandMenuMatches,
  exportText,
  gatesText,
  helpText,
  isDecisionRow,
  parseConsoleCommand,
  statusText,
  visibleRows,
  type ClearMark,
  type ConsoleStatus,
} from '@/features/operator-console/model/logCommands'
import { liveAwaitingSeq, rowKey, type LogRow } from '@/features/operator-console/model/logRows'
import { eventActorLabel } from '@/features/operator-pipeline/model/agentTasks'
import { eventClock, operatorNowIso } from '@/features/operator-pipeline/model/pipelineRun'

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
  /** Ảnh chụp trạng thái vận hành cho `/status`. Bắt buộc chứ không optional: bảng điều hành
   * là nơi duy nhất dựng popup này, và để nó thiếu được thì `/status` sẽ im lặng trả lời sai
   * ở đúng lúc người ta hỏi để kiểm chứng một điều họ đang nghi ngờ. */
  status: ConsoleStatus
}

// Ngưỡng coi là "đang ở đáy". Không dùng 0: trình duyệt làm tròn scrollTop theo phân số pixel
// khi zoom, nên so bằng đúng sẽ làm nút tự-cuộn bật tắt loạn ở mức zoom lẻ.
const bottomSlackPx = 24

const placeholder = 'Hỏi, ra lệnh, hoặc gõ / để xem lệnh'

function toneOf(row: LogRow, liveAwaiting: number | null): string {
  // Dòng chờ nhấp nháy CHỈ khi còn đang chờ thật. Duyệt hoặc từ chối xong thì nó thành một
  // dòng lịch sử tĩnh — để nó nhấp nháy mãi là nói rằng hệ thống vẫn đang đợi một việc đã xong.
  if (row.kind === 'awaiting_approval') return row.seq === liveAwaiting ? 'is-waiting' : 'is-frame'
  if (row.origin === 'operator') return 'is-operator'
  // Trả lời của chính ô nhập: không phải tin từ hệ thống, nên nó mang sắc riêng và không được
  // đội lốt một agent. Câu người ta vừa gõ thì vẫn hiện như câu người ta gõ.
  if (row.origin === 'console') return row.kind === 'operator_message' ? 'is-operator' : 'is-console'
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

export function AgentInteractionLog({ rows, thinking, isRunning, isBusy, onAsk, quickCommand, status }: AgentInteractionLogProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [seenCount, setSeenCount] = useState(0)
  const [isPinned, setIsPinned] = useState(true)
  const [draft, setDraft] = useState('')
  const [consoleRows, setConsoleRows] = useState<readonly LogRow[]>([])
  const [cleared, setCleared] = useState<ClearMark | null>(null)
  const [gatesOnly, setGatesOnly] = useState(false)
  const [history, setHistory] = useState<readonly string[]>([])
  // `null` = đang soạn dòng mới. Số = đang xem lại câu thứ n trong lịch sử.
  const [recallIndex, setRecallIndex] = useState<number | null>(null)
  const [menuIndex, setMenuIndex] = useState(0)
  // Esc đóng menu mà KHÔNG xoá chữ đang gõ. Cần cờ riêng vì chỉ nhìn `draft` thì menu sẽ bật
  // lại ngay ở lần render kế — người ta bấm Esc để nó biến đi, không phải để nó nháy một cái.
  const [menuDismissed, setMenuDismissed] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const askRef = useRef(onAsk)
  askRef.current = onAsk
  // Đếm tăng đơn điệu, KHÔNG dùng `consoleRows.length`: `/clear` dọn sạch mảng, nên đếm theo độ
  // dài sẽ cấp lại `console-1` cho dòng ngay sau đó — đúng cái khoá vừa bị ghi vào dấu xoá, và
  // dòng xác nhận "đã xoá N dòng" sẽ tự giấu chính mình đi.
  const consoleSeq = useRef(0)

  const merged = useMemo(
    // `sort` của JS ổn định, nên hai dòng cùng mốc giữ nguyên thứ tự đã xếp: dòng từ props
    // trước, trả lời của ô nhập sau — đúng thứ tự nhân quả của một lượt gõ lệnh.
    () => [...rows, ...consoleRows].sort((left, right) => (Date.parse(left.at) || 0) - (Date.parse(right.at) || 0)),
    [rows, consoleRows],
  )
  // `liveAwaitingSeq` đọc từ `merged` CHƯA lọc: nó tìm dòng chờ rồi soi những dòng *sau* nó xem
  // đã có ai duyệt hay từ chối chưa. Đưa mảng đã lọc vào thì một `/clear` có thể giấu mất đúng
  // dòng "đã phê duyệt", và cổng vừa đóng sẽ nhấp nháy trở lại như thể chưa ai quyết định gì.
  const liveAwaiting = liveAwaitingSeq(merged)
  const shown = useMemo(() => {
    const afterClear = visibleRows(merged, cleared, liveAwaiting)
    return gatesOnly ? afterClear.filter(isDecisionRow) : afterClear
  }, [merged, cleared, liveAwaiting, gatesOnly])

  const unread = Math.max(0, shown.length - seenCount)

  // Tự cuộn **chỉ khi** người dùng đang ở đáy. Kéo lên đọc lại một dòng cũ mà bị giật xuống
  // đáy mỗi hai giây là cách chắc chắn nhất để nhật ký thành thứ không ai đọc được.
  useEffect(() => {
    if (!isOpen || !isPinned) return
    const node = listRef.current
    if (node) node.scrollTop = node.scrollHeight
    setSeenCount(shown.length)
  }, [isOpen, isPinned, shown.length])

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

  const pushConsole = (text: string, patch: Partial<LogRow> = {}) => {
    consoleSeq.current += 1
    const line: LogRow = {
      origin: 'console',
      seq: consoleSeq.current,
      at: operatorNowIso(),
      kind: 'narration',
      actor: 'console',
      text,
      source: 'system',
      ...patch,
    }
    setConsoleRows((current) => [...current, line])
  }

  const runClear = () => {
    const mark = clearMark(rows, operatorNowIso())
    const remaining = visibleRows(rows, mark, liveAwaiting).length
    setCleared(mark)
    // Dòng của chính ô nhập biến mất hẳn thay vì đi qua dấu xoá: chúng là state cục bộ, dọn
    // được thật, và dọn thật thì tập khoá trong dấu xoá không phình thêm mỗi lần gõ lệnh.
    setConsoleRows([])
    pushConsole(clearedText(shown.length - remaining, liveAwaiting !== null))
  }

  const runExport = () => {
    void navigator.clipboard
      ?.writeText(exportText(shown))
      .then(() => pushConsole(`đã chép ${shown.length} dòng vào clipboard.`))
      .catch(() => pushConsole('không chép được vào clipboard — trình duyệt từ chối quyền.', { ok: false }))
  }

  const runGates = () => {
    // Đếm trên phần đang hiện chứ không trên toàn bộ `rows`: vừa `/clear` xong thì con số phải
    // khớp thứ người ta sắp nhìn thấy, không phải thứ đã dọn đi. Bỏ dòng của chính ô nhập ra
    // khỏi phép đếm — chúng lọt qua bộ lọc để làm lời giải thích, không phải để làm quyết định.
    const next = !gatesOnly
    setGatesOnly(next)
    pushConsole(gatesText(next, shown.filter((row) => row.origin !== 'console' && isDecisionRow(row)).length))
  }

  const submit = (override?: string) => {
    const text = (override ?? draft).trim()
    if (!text) return
    // Lịch sử nhận cả lệnh lẫn câu hỏi, và bỏ lần lặp liền kề — đúng nếp của shell.
    setHistory((current) => (current.at(-1) === text ? current : [...current, text]))
    setRecallIndex(null)
    setDraft('')
    setMenuDismissed(false)
    jumpToLatest()

    const command = parseConsoleCommand(text)
    if (command.kind === 'ask') {
      onAsk(text)
      return
    }
    // Từ đây trở xuống không có lời gọi mạng nào. Câu vừa gõ được vọng lại để người ta thấy
    // mình gõ gì — trừ `/clear`, vì nó dọn cả chính nó, đúng như `clear` của terminal.
    if (command.kind !== 'clear') pushConsole(text, { kind: 'operator_message', actor: 'operator' })
    if (command.kind === 'clear') runClear()
    else if (command.kind === 'help') pushConsole(helpText())
    else if (command.kind === 'export') runExport()
    else if (command.kind === 'status') pushConsole(statusText(status))
    else if (command.kind === 'gates') runGates()
    else pushConsole(`không có lệnh ${command.name}. Gõ /help để xem danh sách.`, { ok: false })
  }

  const recall = (direction: -1 | 1) => {
    if (history.length === 0) return
    const from = recallIndex ?? history.length
    const next = Math.min(history.length, Math.max(0, from + direction))
    setRecallIndex(next === history.length ? null : next)
    setDraft(next === history.length ? '' : history[next]!)
  }

  // Menu gợi ý lệnh, bật khi gõ `/`. Suy ra từ `draft` chứ không giữ thành state riêng: hai
  // nguồn cho cùng một sự thật thì sớm muộn cũng lệch, và ở đây "menu đang mở" **là** hệ quả
  // của thứ đang gõ, không phải một trạng thái độc lập.
  const menu = menuDismissed ? [] : commandMenuMatches(draft)
  // Kẹp ở đây thay vì đồng bộ bằng `useEffect`: danh sách co lại theo từng ký tự gõ thêm, và
  // một effect chỉnh index sẽ luôn chậm đúng một lần render — vừa đủ để `aria-activedescendant`
  // trỏ vào một phần tử không còn tồn tại.
  const activeIndex = menu.length === 0 ? 0 : Math.min(menuIndex, menu.length - 1)
  const activeCommand = menu[activeIndex]

  const moveMenu = (direction: -1 | 1) => {
    setMenuIndex((menu.length + activeIndex + direction) % menu.length)
  }

  const handleKeyDown = (key: string, prevent: () => void) => {
    // Menu mở thì mũi tên lái menu; menu đóng thì mũi tên gọi lại lịch sử. Cùng một phím, hai
    // việc — nhưng không bao giờ cùng lúc, nên không có ca nào mơ hồ.
    if (menu.length > 0) {
      if (key === 'ArrowDown') { prevent(); moveMenu(1); return }
      if (key === 'ArrowUp') { prevent(); moveMenu(-1); return }
      // Tab điền nốt tên lệnh mà KHÔNG chạy: người ta còn muốn đọc lại trước khi Enter.
      if (key === 'Tab' && activeCommand) { prevent(); setDraft(activeCommand.name); return }
      if (key === 'Escape') { prevent(); setMenuDismissed(true); return }
      return
    }
    if (key === 'ArrowUp') { prevent(); recall(-1) }
    else if (key === 'ArrowDown') { prevent(); recall(1) }
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
        {/* Bộ lọc là trạng thái DÍNH, nên nó phải nhìn thấy được. Một nhật ký lọc âm thầm là
            một nhật ký nói dối: người vận hành đọc nó và kết luận "không có gì xảy ra". */}
        {gatesOnly && <em className="nf-agent-log__filter">chỉ quyết định</em>}
        <small>{shown.length} dòng</small>
        <button aria-label="Thu gọn nhật ký" onClick={() => setIsOpen(false)} type="button">
          <ChevronDown className="size-3.5" />
        </button>
      </header>

      <div aria-live="polite" className="nf-agent-log__body" onScroll={handleScroll} ref={listRef} role="log">
        {shown.length === 0 && (
          gatesOnly ? (
            <p className="nf-agent-log__empty">
              Chưa có quyết định nào của con người trong nhật ký. Gõ <b>/gates</b> lần nữa để hiện lại đủ.
            </p>
          ) : (
            <p className="nf-agent-log__empty">
              Chưa có lượt chạy nào. Gõ <b>chạy phân tích</b> để agent bắt đầu, hoặc <b>/</b> để xem lệnh của màn hình.
            </p>
          )
        )}
        {shown.map((row) => (
          <p className={`nf-agent-log__line ${toneOf(row, liveAwaiting)}`} key={rowKey(row)}>
            {row.origin === 'operator' || row.kind === 'operator_message' ? (
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
        // Enter khi menu đang mở chạy lệnh **đang tô**, không phải chữ gõ dở: gõ `/g` rồi Enter
        // ra `/gates`, đúng như một CLI. Không có nó thì `/g` đi thẳng vào nhánh "không có lệnh"
        // ngay bên dưới cái menu đang chỉ ra lệnh đúng — mâu thuẫn thấy được bằng mắt.
        onSubmit={(submitEvent) => { submitEvent.preventDefault(); submit(activeCommand?.name) }}
      >
        {menu.length > 0 && (
          <ul className="nf-agent-log__menu" id="nf-agent-log-menu" role="listbox">
            {menu.map((command, index) => (
              <li
                aria-selected={index === activeIndex}
                className="nf-agent-log__menu-item"
                id={`nf-agent-log-cmd-${command.name.slice(1)}`}
                key={command.name}
                // `onMouseDown` chứ không `onClick`: nhấn chuột làm ô nhập mất focus trước, và
                // menu đóng theo focus sẽ tháo phần tử đi trước khi `click` kịp bắn.
                onMouseDown={(mouseEvent) => { mouseEvent.preventDefault(); submit(command.name) }}
                role="option"
              >
                <b>{command.name}</b>
                <span>{command.summary}</span>
              </li>
            ))}
          </ul>
        )}
        <span aria-hidden="true">&gt;</span>
        <input
          aria-activedescendant={activeCommand ? `nf-agent-log-cmd-${activeCommand.name.slice(1)}` : undefined}
          aria-autocomplete="list"
          aria-controls="nf-agent-log-menu"
          aria-expanded={menu.length > 0}
          aria-label="Ra lệnh hoặc hỏi agent"
          onChange={(changeEvent) => {
            setDraft(changeEvent.target.value)
            setRecallIndex(null)
            // Gõ tiếp sau khi Esc thì menu được mở lại: Esc bỏ qua *gợi ý hiện tại*, không tắt
            // hẳn tính năng cho tới cuối phiên.
            setMenuDismissed(false)
            setMenuIndex(0)
          }}
          onKeyDown={(keyEvent) => {
            // Chặn hành vi mặc định của ô nhập (mũi tên nhảy con trỏ về đầu/cuối, Tab rời ô)
            // trước khi thay chữ, nếu không con trỏ sẽ đứng sai chỗ hoặc focus đi mất.
            handleKeyDown(keyEvent.key, () => keyEvent.preventDefault())
          }}
          placeholder={placeholder}
          role="combobox"
          value={draft}
        />
        <button aria-label="Gửi" disabled={!draft.trim()} type="submit">
          <CornerDownLeft className="size-3.5" />
        </button>
      </form>
    </section>
  )
}
