import type { UndoValue } from '../../lib/undo'
import { addItems, findRepeat, reviveItem, setItemDone, updateItem, type FamilyList, type ListItem } from './listsApi'

interface AddArgs {
  familyId: string
  userId: string
  list: FamilyList
  /** What's on the list now, checked off or not. */
  items: ListItem[]
  text: string
  memberId: string | null
  /** undefined files a grocery item by itself; null is the list's top. */
  categoryId?: string | null
  /** How long checked-off items stay (Settings → Lists & chores). */
  keepDays: number
  offer: UndoValue['offer']
  report: (e: unknown) => void
}

/**
 * Adds an item, unless it would repeat one. Two people adding milk get one milk: if it's still
 * to get, nothing is added ("Add anyway" adds it); if it was checked off, it goes back on the
 * list where it was (Undo checks it off again).
 */
export function addListItem(a: AddArgs) {
  const add = () => addItems(a.familyId, a.list.id, a.userId, [a.text], a.memberId, { categoryId: a.categoryId, list: a.list })
  const repeat = findRepeat(a.list, a.items, a.text, a.memberId)
  if (!repeat) {
    add().catch(a.report)
    return
  }
  if (!repeat.done) {
    a.offer(`“${repeat.text}” is already on the list.`, add, 'Add anyway')
    return
  }
  const wording = a.text.trim()
  const reworded = wording !== repeat.text
  reviveItem(a.familyId, a.list.id, repeat.id, reworded ? wording : undefined).catch(a.report)
  a.offer(`Put “${wording}” back on the list.`, async () => {
    await setItemDone(a.familyId, a.list.id, repeat.id, true, a.keepDays)
    if (reworded) await updateItem(a.familyId, a.list.id, repeat.id, { text: repeat.text })
  })
}
