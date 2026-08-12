import { useEffect, useId, useRef, type ReactNode } from 'react'

import { IconButton } from '@/shared/components/ui/IconButton'

type DialogProps = { children: ReactNode; isOpen: boolean; onClose: () => void; title: string }

export function Dialog({ children, isOpen, onClose, title }: DialogProps) {
  const dialogRef = useRef<HTMLElement>(null)
  const onCloseRef = useRef(onClose)
  const titleId = useId()
  useEffect(() => { onCloseRef.current = onClose }, [onClose])
  useEffect(() => {
    if (!isOpen) return undefined
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const focusable = () => [...(dialogRef.current?.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])') ?? [])].filter((element) => !element.hasAttribute('disabled'))
    const focusFrame = window.requestAnimationFrame(() => (focusable()[0] ?? dialogRef.current)?.focus())
    const handleKeyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onCloseRef.current(); return }
      if (event.key !== 'Tab') return
      const elements = focusable()
      if (!elements.length) { event.preventDefault(); dialogRef.current?.focus(); return }
      const first = elements[0]!
      const last = elements[elements.length - 1]!
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', handleKeyboard)
    return () => { window.cancelAnimationFrame(focusFrame); window.removeEventListener('keydown', handleKeyboard); previouslyFocused?.focus() }
  }, [isOpen])

  if (!isOpen) return null
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/35 p-4" role="presentation" onMouseDown={onClose}>
      <section ref={dialogRef} aria-modal="true" aria-labelledby={titleId} role="dialog" tabIndex={-1} className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-panel bg-white p-5 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3"><h2 id={titleId} className="text-lg font-semibold text-slate-950">{title}</h2><IconButton label="Đóng hộp thoại" onClick={onClose}>×</IconButton></div>
        <div className="mt-4">{children}</div>
      </section>
    </div>
  )
}
