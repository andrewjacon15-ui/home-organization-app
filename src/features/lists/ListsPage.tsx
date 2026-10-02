import { useEffect, useState } from 'react'
import { PeopleFilter } from '../../components/PeopleFilter'
import { itemOwner, personFor, readPeopleDefault } from '../../lib/peopleView'
import type { Member } from '../../types'
import { useSettings } from '../settings/SettingsContext'
import { addAisles, addCategories, addItems, clearCompleted, createList, deleteCategory, deleteItem, deleteList, ensureDefaultLists, moveCategory, renameCategory, setItemDone, updateItem, updateList, watchItems, watchLists, type FamilyList, type ListItem } from './listsApi'
import { ListsBoard } from './ListsBoard'

export function ListsPage({ familyId, userId, members }: { familyId: string; userId: string; members: Member[] }) {
  const [lists, setLists] = useState<FamilyList[]>([])
  const [items, setItems] = useState<Record<string, ListItem[]>>({})
  const [error, setError] = useState<string | null>(null)
  const { settings } = useSettings()
  const report = (e: unknown) => setError(e instanceof Error ? e.message : String(e))
  const [view, setView] = useState(() => readPeopleDefault('lists'))
  const only = personFor(view, userId, members.map((m) => m.id))
  // One person: just their items (their section, or shared items they added) and just their section.
  const shownItems = only ? Object.fromEntries(Object.entries(items).map(([id, list]) => [id, list.filter((i) => itemOwner(i) === only)])) : items
  const shownMembers = only ? members.filter((m) => m.id === only) : members

  useEffect(() => {
    ensureDefaultLists(familyId, userId).catch(report)
    return watchLists(familyId, setLists)
  }, [familyId, userId])

  const listIds = lists.map((l) => l.id).join(',')
  useEffect(() => {
    const ids = listIds ? listIds.split(',') : []
    const stops = ids.map((id) => watchItems(familyId, id, (next) => setItems((cur) => ({ ...cur, [id]: next }))))
    return () => stops.forEach((s) => s())
  }, [familyId, listIds])

  return (
    <>
      {error && (
        <p className="error" role="alert">
          {error} <button className="link" onClick={() => setError(null)}>Dismiss</button>
        </p>
      )}
      <PeopleFilter members={members} userId={userId} value={view} onChange={setView} label="Show list items for" />
      <ListsBoard
        lists={lists}
        items={shownItems}
        members={shownMembers}
        doneDays={settings.listDoneDays}
        onAdd={(l, text, memberId, categoryId) => addItems(familyId, l.id, userId, [text], memberId, { categoryId, categories: l.categories }).catch(report)}
        onToggle={(l, i) => setItemDone(familyId, l.id, i.id, !i.done, settings.listDoneDays).catch(report)}
        onEditItem={(l, i, changes) => updateItem(familyId, l.id, i.id, changes).catch(report)}
        onAddCategory={(l, name) => addCategories(familyId, l, [name]).catch(report)}
        onAddAisles={(l) => addAisles(familyId, l, items[l.id] ?? []).catch(report)}
        onRenameCategory={(l, id, name) => renameCategory(familyId, l, id, name).catch(report)}
        onMoveCategory={(l, id, by) => moveCategory(familyId, l, id, by).catch(report)}
        onDeleteCategory={(l, id) => deleteCategory(familyId, l, id, items[l.id] ?? []).catch(report)}
        onDelete={(l, i) => deleteItem(familyId, l.id, i.id).catch(report)}
        onClearDone={(l) => clearCompleted(familyId, l.id, items[l.id] ?? []).catch(report)}
        onRename={(l, title) => updateList(familyId, l.id, { title }).catch(report)}
        onToggleSections={(l) => updateList(familyId, l.id, { sections: !l.sections }).catch(report)}
        onDeleteList={(l) => deleteList(familyId, l.id).catch(report)}
        onCreateList={(title) => createList(familyId, userId, title, (lists.at(-1)?.order ?? 0) + 1).catch(report)}
      />
    </>
  )
}
