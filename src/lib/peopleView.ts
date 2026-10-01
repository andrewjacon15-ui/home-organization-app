/**
 * Whose things a page shows: everyone's, just mine, or one person's.
 * Lists and Chores each have their own default, saved on this device
 * (Settings → Lists & chores), so a phone can open on "Just me" while the
 * wall tablet shows everyone.
 */
export type PeopleView = 'everyone' | 'me' | { member: string }
export type PeoplePage = 'lists' | 'chores'

const key = (page: PeoplePage) => `people-view-${page}`

function parse(raw: string | null): PeopleView {
  if (raw === 'me') return 'me'
  if (raw?.startsWith('member:')) return { member: raw.slice('member:'.length) }
  return 'everyone'
}

export function encodeView(view: PeopleView): string {
  return typeof view === 'string' ? view : `member:${view.member}`
}

export function readPeopleDefault(page: PeoplePage): PeopleView {
  try {
    return parse(localStorage.getItem(key(page)))
  } catch {
    return 'everyone'
  }
}

export function savePeopleDefault(page: PeoplePage, view: PeopleView) {
  try {
    if (view === 'everyone') localStorage.removeItem(key(page))
    else localStorage.setItem(key(page), encodeView(view))
  } catch {
    // A default is a convenience; "everyone" still works.
  }
}

export const decodeView = parse

/** The one person to show, or null for everyone. A person who left the family falls back to everyone. */
export function personFor(view: PeopleView, userId: string, memberIds: string[]): string | null {
  if (view === 'everyone') return null
  const id = view === 'me' ? userId : view.member
  return memberIds.includes(id) ? id : null
}

/** A list item belongs to the person whose section it's in, or else to whoever added it. */
export function itemOwner(item: { memberId: string | null; createdBy?: string }): string | null {
  return item.memberId ?? item.createdBy ?? null
}
