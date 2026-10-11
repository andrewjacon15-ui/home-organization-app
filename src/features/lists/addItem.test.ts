import { afterEach, describe, expect, it, vi } from 'vitest'
import { addListItem } from './addItem'
import { findRepeat, type FamilyList, type ListItem } from './listsApi'

const calls = vi.hoisted(() => ({ added: [] as unknown[][], revived: [] as unknown[][], done: [] as unknown[][], updated: [] as unknown[][] }))
vi.mock('./listsApi', async (importActual) => ({
  ...(await importActual<typeof import('./listsApi')>()),
  addItems: async (...a: unknown[]) => void calls.added.push(a),
  reviveItem: async (...a: unknown[]) => void calls.revived.push(a),
  setItemDone: async (...a: unknown[]) => void calls.done.push(a),
  updateItem: async (...a: unknown[]) => void calls.updated.push(a),
}))

const grocery: FamilyList = { id: 'grocery', title: 'Grocery List', kind: 'grocery', sections: false, order: 0 }
const todo: FamilyList = { id: 'todo', title: 'To-Do List', kind: 'todo', sections: true, order: 1 }
const item = (id: string, text: string, over: Partial<ListItem> = {}): ListItem => ({ id, text, done: false, memberId: null, order: 0, ...over })

afterEach(() => {
  for (const k of Object.keys(calls) as (keyof typeof calls)[]) calls[k] = []
})

describe('findRepeat', () => {
  it('matches grocery items by the thing itself', () => {
    const items = [item('g1', 'Bananas'), item('g2', 'Whole milk'), item('g3', 'Chicken thighs')]
    expect(findRepeat(grocery, items, '2 bunches of bananas', null)?.id).toBe('g1')
    expect(findRepeat(grocery, items, 'banana', null)?.id).toBe('g1')
    expect(findRepeat(grocery, items, 'chicken breasts', null)).toBeNull()
  })

  it('matches other lists by their words, within the same person’s section', () => {
    const items = [item('t1', 'Call plumber', { memberId: 'l' })]
    expect(findRepeat(todo, items, 'call plumber!', 'l')?.id).toBe('t1')
    expect(findRepeat(todo, items, 'Call plumber', 'a')).toBeNull()
    expect(findRepeat(todo, items, 'Call the plumber', 'l')).toBeNull()
  })

  it('prefers the one still to get over one checked off', () => {
    const items = [item('g1', 'Milk', { done: true }), item('g2', 'milk')]
    expect(findRepeat(grocery, items, 'Milk', null)?.id).toBe('g2')
  })
})

describe('addListItem', () => {
  const base = { familyId: 'f', userId: 'u', list: grocery, memberId: null, keepDays: 30, report: vi.fn() }

  it('adds something new', () => {
    const offer = vi.fn()
    addListItem({ ...base, items: [item('g1', 'Milk')], text: 'Eggs', offer })
    expect(calls.added).toHaveLength(1)
    expect(calls.added[0][3]).toEqual(['Eggs'])
    expect(offer).not.toHaveBeenCalled()
  })

  it('leaves one still to get alone and offers "Add anyway"', async () => {
    const offer = vi.fn()
    addListItem({ ...base, items: [item('g1', 'Bananas')], text: 'bananas', offer })
    expect(calls.added).toHaveLength(0)
    expect(offer).toHaveBeenCalledWith('“Bananas” is already on the list.', expect.any(Function), 'Add anyway')
    await offer.mock.calls[0][1]()
    expect(calls.added).toHaveLength(1)
  })

  it('puts one that was checked off back on the list, as typed, with Undo', async () => {
    const offer = vi.fn()
    addListItem({ ...base, items: [item('g1', 'Limes', { done: true })], text: '3 limes', offer })
    expect(calls.added).toHaveLength(0)
    expect(calls.revived).toEqual([['f', 'grocery', 'g1', '3 limes']])
    expect(offer).toHaveBeenCalledWith('Put “3 limes” back on the list.', expect.any(Function))
    await offer.mock.calls[0][1]()
    expect(calls.done).toEqual([['f', 'grocery', 'g1', true, 30]])
    expect(calls.updated).toEqual([['f', 'grocery', 'g1', { text: 'Limes' }]])
  })
})
