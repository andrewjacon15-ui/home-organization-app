import { ArrowDown, ArrowUp, Pencil, Plus, X } from 'lucide-react'
import { Select } from '../../components/Select'
import { useState, type CSSProperties, type FormEvent } from 'react'
import type { Member } from '../../types'
import type { FamilyList, ListCategory, ListItem } from './listsApi'
import { AddIcon, DoneIcon, ICON_STROKE } from '../../components/Icons'

export interface ListActions {
  /** categoryId undefined = let the list file it (store aisles); null = the list's top. */
  onAdd: (list: FamilyList, text: string, memberId: string | null, categoryId?: string | null) => void
  onToggle: (list: FamilyList, item: ListItem) => void
  onDelete: (list: FamilyList, item: ListItem) => void
  onEditItem: (list: FamilyList, item: ListItem, changes: { text?: string; categoryId?: string | null }) => void
  onClearDone: (list: FamilyList) => void
  onRename: (list: FamilyList, title: string) => void
  onToggleSections: (list: FamilyList) => void
  onDeleteList: (list: FamilyList) => void
  onCreateList: (title: string) => void
  onAddCategory: (list: FamilyList, name: string) => void
  onAddAisles: (list: FamilyList) => void
  onRenameCategory: (list: FamilyList, categoryId: string, name: string) => void
  onMoveCategory: (list: FamilyList, categoryId: string, by: -1 | 1) => void
  onDeleteCategory: (list: FamilyList, categoryId: string) => void
}

interface Props extends ListActions {
  lists: FamilyList[]
  items: Record<string, ListItem[]>
  members: Member[]
  /** Days a checked-off item is kept (0 = until cleared), for the Done note. */
  doneDays?: number
}

const byOrder = (a: ListItem, b: ListItem) => a.order - b.order

/** Lists side by side, like Skylight's Lists screen. */
export function ListsBoard({ lists, items, members, onCreateList, doneDays = 30, ...actions }: Props) {
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
            <AddIcon />
            New list
          </button>
        )}
      </div>
      <div className="lists__columns">
        {lists.map((l) => (
          <ListColumn key={l.id} list={l} items={items[l.id] ?? []} members={members} doneDays={doneDays} {...actions} />
        ))}
      </div>
    </section>
  )
}

type ColumnProps = Omit<ListActions, 'onCreateList'> & { list: FamilyList; items: ListItem[]; members: Member[]; doneDays: number }

function ListColumn({ list, items, members, doneDays, ...a }: ColumnProps) {
  const [menu, setMenu] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [newCategory, setNewCategory] = useState(false)
  const categories = list.categories ?? []
  const catIds = new Set(categories.map((c) => c.id))
  const open = items.filter((i) => !i.done).sort(byOrder)
  const done = items.filter((i) => i.done).sort(byOrder)
  const sectionIds = new Set(members.map((m) => m.id))
  const shared = list.sections ? open.filter((i) => !i.memberId || !sectionIds.has(i.memberId)) : open
  const top = shared.filter((i) => !i.categoryId || !catIds.has(i.categoryId))
  const rowProps = { list, categories, onToggle: a.onToggle, onDelete: a.onDelete, onEditItem: a.onEditItem }

  return (
    <article className={`list-col list-col--${list.kind}`} aria-label={list.title}>
      <header className="list-col__head">
        {renaming ? (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              const v = (new FormData(e.currentTarget).get('title') as string).trim()
              if (v) a.onRename(list, v)
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
              <button type="button" role="menuitem" onClick={() => (setMenu(false), setNewCategory(true))}>
                Add category
              </button>
              {list.kind === 'grocery' && categories.length === 0 && (
                <button type="button" role="menuitem" onClick={() => (setMenu(false), a.onAddAisles(list))}>
                  Add store aisles
                </button>
              )}
              <button type="button" role="menuitemcheckbox" aria-checked={list.sections} onClick={() => (setMenu(false), a.onToggleSections(list))}>
                {list.sections && <DoneIcon width={16} height={16} aria-hidden />}Sections by person
              </button>
              <button type="button" role="menuitem" disabled={done.length === 0} onClick={() => (setMenu(false), a.onClearDone(list))}>
                Clear completed
              </button>
              <button
                type="button"
                role="menuitem"
                className="menu__danger"
                onClick={() => {
                  setMenu(false)
                  if (confirm(`Delete "${list.title}" and everything on it?`)) a.onDeleteList(list)
                }}
              >
                Delete list
              </button>
            </div>
          )}
        </div>
      </header>

      <AddItem label={`Add to ${list.title}`} onAdd={(text) => a.onAdd(list, text, null)} />
      {newCategory && (
        <NameForm
          label="New category name"
          placeholder="e.g. Produce, Errands, Party"
          onSave={(name) => (a.onAddCategory(list, name), setNewCategory(false))}
          onCancel={() => setNewCategory(false)}
        />
      )}
      <Items {...rowProps} items={top} />

      {categories.map((c, ci) => (
        <CategorySection key={c.id} category={c} first={ci === 0} last={ci === categories.length - 1} items={shared.filter((i) => i.categoryId === c.id)} rowProps={rowProps} actions={a} />
      ))}

      {list.sections &&
        members.map((m) => {
          const mine = open.filter((i) => i.memberId === m.id)
          return (
            <section key={m.id} className="list-section" aria-label={`${m.displayName.split(' ')[0]}'s items`} style={{ '--pill': m.color } as CSSProperties}>
              <h3 className="list-section__title">{m.displayName.split(' ')[0]}</h3>
              <AddItem label={`Add for ${m.displayName.split(' ')[0]}`} onAdd={(text) => a.onAdd(list, text, m.id, null)} />
              <Items {...rowProps} items={mine} />
            </section>
          )
        })}

      {done.length > 0 && (
        <details className="done-section">
          <summary>
            Done ({done.length}){doneDays > 0 && <span className="done-section__note"> · removed after {doneDays} days</span>}
          </summary>
          <Items {...rowProps} items={done} />
        </details>
      )}
    </article>
  )
}

function CategorySection({ category, first, last, items, rowProps, actions: a }: { category: ListCategory; first: boolean; last: boolean; items: ListItem[]; rowProps: RowProps; actions: Omit<ListActions, 'onCreateList'> }) {
  const [editing, setEditing] = useState(false)
  const [adding, setAdding] = useState(false)
  const list = rowProps.list
  return (
    <section className="list-category" aria-label={category.name}>
      {editing ? (
        <div className="list-category__edit">
          <NameForm label="Category name" initial={category.name} onSave={(name) => (a.onRenameCategory(list, category.id, name), setEditing(false))} onCancel={() => setEditing(false)} />
          <div className="row">
            <button type="button" className="icon-button" aria-label={`Move ${category.name} up`} disabled={first} onClick={() => a.onMoveCategory(list, category.id, -1)}>
              <ArrowUp size={18} strokeWidth={ICON_STROKE} aria-hidden />
            </button>
            <button type="button" className="icon-button" aria-label={`Move ${category.name} down`} disabled={last} onClick={() => a.onMoveCategory(list, category.id, 1)}>
              <ArrowDown size={18} strokeWidth={ICON_STROKE} aria-hidden />
            </button>
            <button
              type="button"
              className="link menu__danger"
              onClick={() => {
                if (confirm(`Remove the "${category.name}" category? Its items stay on the list.`)) a.onDeleteCategory(list, category.id)
              }}
            >
              Remove category
            </button>
          </div>
        </div>
      ) : (
        <h3 className="list-category__title">
          <span>{category.name}</span>
          <span className="list-category__count">{items.length || ''}</span>
          <button type="button" className="icon-button list-category__edit-btn" aria-label={`Add item to ${category.name}`} aria-expanded={adding} onClick={() => setAdding((v) => !v)}>
            <Plus size={16} strokeWidth={ICON_STROKE} aria-hidden />
          </button>
          <button type="button" className="icon-button list-category__edit-btn" aria-label={`Edit ${category.name}`} onClick={() => setEditing(true)}>
            <Pencil size={15} strokeWidth={ICON_STROKE} aria-hidden />
          </button>
        </h3>
      )}
      {adding && <AddItem label={`Add to ${category.name}`} placeholder={`Add to ${category.name}`} autoFocus onAdd={(text) => a.onAdd(list, text, null, category.id)} />}
      <Items {...rowProps} items={items} />
    </section>
  )
}

function NameForm({ label, initial = '', placeholder, onSave, onCancel }: { label: string; initial?: string; placeholder?: string; onSave: (name: string) => void; onCancel: () => void }) {
  const [name, setName] = useState(initial)
  return (
    <form
      className="row name-form"
      onSubmit={(e) => {
        e.preventDefault()
        if (name.trim()) onSave(name)
      }}
    >
      <input value={name} onChange={(e) => setName(e.target.value)} aria-label={label} placeholder={placeholder} maxLength={40} autoFocus onKeyDown={(e) => e.key === 'Escape' && onCancel()} />
      <button className="button button--primary" disabled={!name.trim()}>
        Save
      </button>
      <button type="button" className="button" onClick={onCancel}>
        Cancel
      </button>
    </form>
  )
}

function AddItem({ label, placeholder = 'Add item', autoFocus, onAdd }: { label: string; placeholder?: string; autoFocus?: boolean; onAdd: (text: string) => void }) {
  const [text, setText] = useState('')
  function submit(e: FormEvent) {
    e.preventDefault()
    if (!text.trim()) return
    onAdd(text)
    setText('')
  }
  return (
    <form className="add-item" onSubmit={submit}>
      <input value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} aria-label={label} maxLength={300} autoFocus={autoFocus} />
    </form>
  )
}

interface RowProps {
  list: FamilyList
  categories: ListCategory[]
  onToggle: ListActions['onToggle']
  onDelete: ListActions['onDelete']
  onEditItem: ListActions['onEditItem']
}

function Items({ items, ...p }: RowProps & { items: ListItem[] }) {
  if (items.length === 0) return null
  return (
    <ul className="list-items">
      {items.map((i) => (
        <ItemRow key={i.id} item={i} {...p} />
      ))}
    </ul>
  )
}

/** Tap the circle to check off; tap the words to edit them or move the item to another category. */
function ItemRow({ item: i, list, categories, onToggle, onDelete, onEditItem }: RowProps & { item: ListItem }) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(i.text)
  const [cat, setCat] = useState(i.categoryId ?? '')

  if (editing) {
    const save = (e?: FormEvent) => {
      e?.preventDefault()
      const changes: { text?: string; categoryId?: string | null } = {}
      if (text.trim() && text.trim() !== i.text) changes.text = text
      if ((cat || null) !== (i.categoryId ?? null)) changes.categoryId = cat || null
      if (Object.keys(changes).length) onEditItem(list, i, changes)
      setEditing(false)
    }
    return (
      <li className="list-item list-item--editing">
        <form className="item-edit" onSubmit={save} aria-label={`Edit ${i.text}`}>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-label="Item"
            maxLength={300}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setText(i.text)
                setEditing(false)
              }
            }}
          />
          {categories.length > 0 && (
            <Select value={cat} onChange={setCat} aria-label="Category" options={[{ value: '', label: 'No category' }, ...categories.map((c) => ({ value: c.id, label: c.name }))]} />
          )}
          <div className="row item-edit__actions">
            <button className="button button--primary" disabled={!text.trim()}>
              Save
            </button>
            <button type="button" className="button" onClick={() => (setText(i.text), setEditing(false))}>
              Cancel
            </button>
            <button type="button" className="link menu__danger" onClick={() => onDelete(list, i)}>
              Delete
            </button>
          </div>
        </form>
      </li>
    )
  }

  return (
    <li className={`list-item${i.done ? ' list-item--done' : ''}`}>
      <input type="checkbox" className="list-item__box" checked={i.done} onChange={() => onToggle(list, i)} aria-label={`${i.done ? 'Uncheck' : 'Check off'} ${i.text}`} />
      <button
        type="button"
        className="list-item__text list-item__edit"
        aria-label={`Edit ${i.text}`}
        onClick={() => {
          setText(i.text)
          setCat(i.categoryId ?? '')
          setEditing(true)
        }}
      >
        {i.text}
      </button>
      <button type="button" className="icon-button list-item__delete" onClick={() => onDelete(list, i)} aria-label={`Delete ${i.text}`}>
        <X size={16} strokeWidth={ICON_STROKE} aria-hidden />
      </button>
    </li>
  )
}
