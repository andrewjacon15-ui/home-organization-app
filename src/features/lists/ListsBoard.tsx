import { useState, type CSSProperties, type FormEvent } from 'react'
import type { Member } from '../../types'
import type { FamilyList, ListItem } from './listsApi'

export interface ListActions {
  onAdd: (list: FamilyList, text: string, memberId: string | null) => void
  onToggle: (list: FamilyList, item: ListItem) => void
  onDelete: (list: FamilyList, item: ListItem) => void
  onClearDone: (list: FamilyList) => void
  onRename: (list: FamilyList, title: string) => void
  onToggleSections: (list: FamilyList) => void
  onDeleteList: (list: FamilyList) => void
  onCreateList: (title: string) => void
}

interface Props extends ListActions {
  lists: FamilyList[]
  items: Record<string, ListItem[]>
  members: Member[]
}

const byOrder = (a: ListItem, b: ListItem) => a.order - b.order

/** Lists side by side, like Skylight's Lists screen. */
export function ListsBoard({ lists, items, members, onCreateList, ...actions }: Props) {
  const [newTitle, setNewTitle] = useState('')
  const [adding, setAdding] = useState(false)

  return (
    <section className="lists" aria-label="Lists">
      <div className="lists__head">
        <h1 className="page-title">Lists</h1>
        {adding ? (
          <form
            className="row"
            onSubmit={(e) => {
              e.preventDefault()
              if (!newTitle.trim()) return
              onCreateList(newTitle)
              setNewTitle('')
              setAdding(false)
            }}
          >
            <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="List name" aria-label="New list name" maxLength={80} autoFocus />
            <button className="button button--primary" disabled={!newTitle.trim()}>
              Create
            </button>
            <button type="button" className="button" onClick={() => setAdding(false)}>
              Cancel
            </button>
          </form>
        ) : (
          <button type="button" className="button" onClick={() => setAdding(true)}>
            + New list
          </button>
        )}
      </div>
      <div className="lists__columns">
        {lists.map((l) => (
          <ListColumn key={l.id} list={l} items={items[l.id] ?? []} members={members} {...actions} />
        ))}
      </div>
    </section>
  )
}

type ColumnProps = Omit<ListActions, 'onCreateList'> & { list: FamilyList; items: ListItem[]; members: Member[] }

function ListColumn({ list, items, members, onAdd, onToggle, onDelete, onClearDone, onRename, onToggleSections, onDeleteList }: ColumnProps) {
  const [menu, setMenu] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const open = items.filter((i) => !i.done).sort(byOrder)
  const done = items.filter((i) => i.done).sort(byOrder)
  const sectionIds = new Set(members.map((m) => m.id))
  const shared = list.sections ? open.filter((i) => !i.memberId || !sectionIds.has(i.memberId)) : open

  return (
    <article className={`list-col list-col--${list.kind}`} aria-label={list.title}>
      <header className="list-col__head">
        {renaming ? (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              const v = (new FormData(e.currentTarget).get('title') as string).trim()
              if (v) onRename(list, v)
              setRenaming(false)
            }}
          >
            <input name="title" defaultValue={list.title} aria-label="List name" maxLength={80} autoFocus onBlur={(e) => e.currentTarget.form?.requestSubmit()} />
          </form>
        ) : (
          <h2 className="list-col__title">{list.title}</h2>
        )}
        <span className="list-col__count" aria-label={`${open.length} to do`}>
          {open.length}
        </span>
        <div className="list-col__menu">
          <button type="button" className="icon-button" aria-label={`${list.title} options`} aria-expanded={menu} onClick={() => setMenu(!menu)}>
            ⋯
          </button>
          {menu && (
            <div className="menu" role="menu">
              <button type="button" role="menuitem" onClick={() => (setMenu(false), setRenaming(true))}>
                Rename
              </button>
              <button type="button" role="menuitemcheckbox" aria-checked={list.sections} onClick={() => (setMenu(false), onToggleSections(list))}>
                {list.sections ? '✓ ' : ''}Sections by person
              </button>
              <button type="button" role="menuitem" disabled={done.length === 0} onClick={() => (setMenu(false), onClearDone(list))}>
                Clear completed
              </button>
              <button
                type="button"
                role="menuitem"
                className="menu__danger"
                onClick={() => {
                  setMenu(false)
                  if (confirm(`Delete "${list.title}" and everything on it?`)) onDeleteList(list)
                }}
              >
                Delete list
              </button>
            </div>
          )}
        </div>
      </header>

      <AddItem label={`Add to ${list.title}`} onAdd={(text) => onAdd(list, text, null)} />
      <Items list={list} items={shared} onToggle={onToggle} onDelete={onDelete} />

      {list.sections &&
        members.map((m) => {
          const mine = open.filter((i) => i.memberId === m.id)
          return (
            <section key={m.id} className="list-section" aria-label={`${m.displayName.split(' ')[0]}'s items`} style={{ '--pill': m.color } as CSSProperties}>
              <h3 className="list-section__title">{m.displayName.split(' ')[0]}</h3>
              <AddItem label={`Add for ${m.displayName.split(' ')[0]}`} onAdd={(text) => onAdd(list, text, m.id)} />
              <Items list={list} items={mine} onToggle={onToggle} onDelete={onDelete} />
            </section>
          )
        })}

      {done.length > 0 && (
        <details className="done-section">
          <summary>Done ({done.length})</summary>
          <Items list={list} items={done} onToggle={onToggle} onDelete={onDelete} />
        </details>
      )}
    </article>
  )
}

function AddItem({ label, onAdd }: { label: string; onAdd: (text: string) => void }) {
  const [text, setText] = useState('')
  function submit(e: FormEvent) {
    e.preventDefault()
    if (!text.trim()) return
    onAdd(text)
    setText('')
  }
  return (
    <form className="add-item" onSubmit={submit}>
      <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add item" aria-label={label} maxLength={300} />
    </form>
  )
}

function Items({ list, items, onToggle, onDelete }: { list: FamilyList; items: ListItem[]; onToggle: ListActions['onToggle']; onDelete: ListActions['onDelete'] }) {
  if (items.length === 0) return null
  return (
    <ul className="list-items">
      {items.map((i) => (
        <li key={i.id} className={`list-item${i.done ? ' list-item--done' : ''}`}>
          <label className="list-item__check">
            <input type="checkbox" checked={i.done} onChange={() => onToggle(list, i)} aria-label={`${i.done ? 'Uncheck' : 'Check off'} ${i.text}`} />
            <span className="list-item__text">{i.text}</span>
          </label>
          <button type="button" className="icon-button list-item__delete" onClick={() => onDelete(list, i)} aria-label={`Delete ${i.text}`}>
            ✕
          </button>
        </li>
      ))}
    </ul>
  )
}
