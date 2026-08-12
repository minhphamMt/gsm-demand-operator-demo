export type TabItem<T extends string> = { id: T; label: string }

export function Tabs<T extends string>({ activeId, items, onChange }: { activeId: T; items: readonly TabItem<T>[]; onChange: (id: T) => void }) {
  return <div role="tablist" className="flex w-full max-w-full gap-1 overflow-x-auto rounded-lg bg-slate-100 p-1">{items.map((item) => <button key={item.id} role="tab" aria-selected={activeId === item.id} onClick={() => onChange(item.id)} className={`whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium ${activeId === item.id ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>{item.label}</button>)}</div>
}
