import { useCallback, useEffect, useRef, useState } from 'react'

// Đo vị trí thật của từng node để vẽ cạnh nối đúng tâm thẻ.
//
// Không dùng toạ độ cố định: thẻ agent cao thấp khác nhau tuỳ số chỉ số, và bung danh sách
// task ra thì chiều cao đổi ngay — cạnh nối tính sẵn sẽ lệch khỏi thẻ.
//
// Hai chỗ dễ gây vòng lặp vô hạn, đều đã chặn:
//   · ref callback phải **ổn định theo id**, nếu tạo mới mỗi render thì React gỡ/gắn ref liên
//     tục, mỗi lần lại đo và setState;
//   · chỉ setState khi số đo đổi thật, vì ResizeObserver bắn cả khi kích thước không đổi.

export type FlowAnchor = { id: string; centerY: number; right: number; left: number }

export type FlowSize = { width: number; height: number }

export type FlowAnchors = {
  containerRef: (node: HTMLElement | null) => void
  registerNode: (id: string) => (node: HTMLElement | null) => void
  anchors: readonly FlowAnchor[]
  size: FlowSize
}

const isSameSize = (left: FlowSize, right: FlowSize) =>
  Math.abs(left.width - right.width) < 0.5 && Math.abs(left.height - right.height) < 0.5

const isSameAnchors = (left: readonly FlowAnchor[], right: readonly FlowAnchor[]) =>
  left.length === right.length
    && left.every((anchor, index) => {
      const other = right[index]
      return other !== undefined
        && anchor.id === other.id
        && Math.abs(anchor.centerY - other.centerY) < 0.5
        && Math.abs(anchor.left - other.left) < 0.5
        && Math.abs(anchor.right - other.right) < 0.5
    })

export function useFlowAnchors(): FlowAnchors {
  const container = useRef<HTMLElement | null>(null)
  const nodes = useRef(new Map<string, HTMLElement>())
  const callbacks = useRef(new Map<string, (node: HTMLElement | null) => void>())
  const observer = useRef<ResizeObserver | null>(null)
  const [anchors, setAnchors] = useState<readonly FlowAnchor[]>([])
  const [size, setSize] = useState<FlowSize>({ width: 0, height: 0 })

  const measure = useCallback(() => {
    const root = container.current
    if (!root) return
    const base = root.getBoundingClientRect()
    const nextSize = { width: base.width, height: base.height }
    const nextAnchors = [...nodes.current.entries()].map(([id, node]) => {
      const box = node.getBoundingClientRect()
      return {
        id,
        centerY: box.top - base.top + box.height / 2,
        right: box.right - base.left,
        left: box.left - base.left,
      }
    })
    setSize((current) => (isSameSize(current, nextSize) ? current : nextSize))
    setAnchors((current) => (isSameAnchors(current, nextAnchors) ? current : nextAnchors))
  }, [])

  const observe = useCallback((node: HTMLElement) => observer.current?.observe(node), [])

  const containerRef = useCallback((node: HTMLElement | null) => {
    container.current = node
    if (!node) return
    observer.current?.disconnect()
    observer.current = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    observe(node)
    for (const tracked of nodes.current.values()) observe(tracked)
    measure()
  }, [measure, observe])

  const registerNode = useCallback((id: string) => {
    const cached = callbacks.current.get(id)
    if (cached) return cached
    const callback = (node: HTMLElement | null) => {
      if (node) {
        nodes.current.set(id, node)
        observe(node)
      } else {
        nodes.current.delete(id)
      }
      measure()
    }
    callbacks.current.set(id, callback)
    return callback
  }, [measure, observe])

  useEffect(() => () => observer.current?.disconnect(), [])

  return { containerRef, registerNode, anchors, size }
}
