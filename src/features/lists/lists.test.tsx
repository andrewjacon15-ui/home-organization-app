import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { choose } from '../../test-utils'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Member } from '../../types'
import type { FamilyList, ListItem } from './listsApi'
import { ListsBoard } from './ListsBoard'
import { HOLD_MS, placeFor } from './useItemDrag'

const members: Member[] = [
  { id: 'a', displayName: 'Andrew Jacon', email: 'a@x.com', color: '#15803d' },
  { id: 'l', displayName: 'Lydia', email: 'l@x.com', color: '#c2410c' },
]
const grocery: FamilyList = { id: 'grocery', title: 'Grocery List', kind: 'grocery', sections: false, order: 0 }
const todo: FamilyList = { id: 'todo', title: 'To-Do List', kind: 'todo', sections: true, order: 1 }
const item = (id: string, text: string, over: Partial<ListItem> = {}): ListItem => ({ id, text, done: false, memberId: null, order: Number(id.replace(/\D/g, '')) || 0, ...over })

const items: Record<string, ListItem[]> = {
  grocery: [item('g1', 'Milk'), item('g2', 'Limes'), item('g3', 'Eggs', { done: true })],
  todo: [item('t1', 'Call plumber'), item('t2', 'Buy dumbbells', { memberId: 'a' }), item('t3', 'Drop off returns', { memberId: 'l' }), item('t4', 'Hem dress', { memberId: 'l' })],
}

afterEach(() => vi.restoreAllMocks())

function setup(lists: FamilyList[] = [grocery, todo], data: Record<string, ListItem[]> = items) {
  const actions = {
    onAdd: vi.fn(),
    onToggle: vi.fn(),
    onDelete: vi.fn(),
    onClearDone: vi.fn(),
    onRename: vi.fn(),
    onToggleSections: vi.fn(),
    onDeleteList: vi.fn(),
    onCreateList: vi.fn(),
    onEditItem: vi.fn(),
    onAddCategory: vi.fn(),
    onAutoSort: vi.fn(),
    onMoveItem: vi.fn(),
    onRenameCategory: vi.fn(),
    onMoveCategory: vi.fn(),
    onDeleteCategory: vi.fn(),
  }
  render(<ListsBoard lists={lists} items={data} members={members} {...actions} />)
  return { actions, user: userEvent.setup() }
}

describe('ListsBoard', () => {
  it('shows each list with open items, a count, and a Done section', () => {
    setup()
    const g = screen.getByRole('article', { name: 'Grocery List' })
    expect(within(g).getByLabelText('2 to do')).toBeInTheDocument()
    expect(within(g).getByText('Done (1)')).toBeInTheDocument()
    expect(within(g).getByRole('checkbox', { name: 'Check off Milk' })).not.toBeChecked()
  })

  it('groups a sectioned list by person, with shared items on top', () => {
    setup()
    const t = screen.getByRole('article', { name: 'To-Do List' })
    expect(within(t).getByText('Call plumber')).toBeInTheDocument()
    const lydia = within(t).getByRole('region', { name: "Lydia's items" })
    expect(within(lydia).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Drop off returns', 'Hem dress'])
    expect(within(within(t).getByRole('region', { name: "Andrew's items" })).getByText('Buy dumbbells')).toBeInTheDocument()
  })

  it('adds to the list or to a person’s section, and checks off / deletes items', async () => {
    const { actions, user } = setup()
    await user.type(screen.getByLabelText('Add to Grocery List'), 'Bread{Enter}')
    expect(actions.onAdd).toHaveBeenCalledWith(grocery, 'Bread', null)
    await user.type(screen.getByLabelText('Add for Lydia'), 'Pick up dry cleaning{Enter}')
    expect(actions.onAdd).toHaveBeenLastCalledWith(todo, 'Pick up dry cleaning', 'l', null)
    await user.click(screen.getByRole('checkbox', { name: 'Check off Milk' }))
    expect(actions.onToggle).toHaveBeenCalledWith(grocery, items.grocery[0])
    await user.click(screen.getByLabelText('Delete Limes'))
    expect(actions.onDelete).toHaveBeenCalledWith(grocery, items.grocery[1])
  })

  it('has a menu to rename, toggle sections, clear completed, and delete', async () => {
    const { actions, user } = setup()
    const g = screen.getByRole('article', { name: 'Grocery List' })
    await user.click(within(g).getByRole('button', { name: 'Grocery List options' }))
    await user.click(within(g).getByRole('menuitem', { name: 'Clear completed' }))
    expect(actions.onClearDone).toHaveBeenCalledWith(grocery)

    await user.click(within(g).getByRole('button', { name: 'Grocery List options' }))
    await user.click(within(g).getByRole('menuitemcheckbox', { name: /Sections by person/ }))
    expect(actions.onToggleSections).toHaveBeenCalledWith(grocery)

    await user.click(within(g).getByRole('button', { name: 'Grocery List options' }))
    await user.click(within(g).getByRole('menuitem', { name: 'Rename' }))
    const name = within(g).getByLabelText('List name')
    await user.clear(name)
    await user.type(name, 'Groceries{Enter}')
    expect(actions.onRename).toHaveBeenCalledWith(grocery, 'Groceries')

    vi.spyOn(window, 'confirm').mockReturnValue(true)
    await user.click(within(g).getByRole('button', { name: /options/ }))
    await user.click(within(g).getByRole('menuitem', { name: 'Delete list' }))
    expect(actions.onDeleteList).toHaveBeenCalledWith(grocery)
  })

  it('edits an item by tapping its words, and Escape cancels', async () => {
    const { actions, user } = setup()
    await user.click(screen.getByRole('button', { name: 'Edit Milk' }))
    const input = screen.getByLabelText('Item')
    await user.clear(input)
    await user.type(input, 'Oat milk{Enter}')
    expect(actions.onEditItem).toHaveBeenCalledWith(grocery, items.grocery[0], { text: 'Oat milk' })
    await user.click(screen.getByRole('button', { name: 'Edit Limes' }))
    await user.type(screen.getByLabelText('Item'), ' x{Escape}')
    expect(actions.onEditItem).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Edit Limes' })).toBeInTheDocument()
  })

  it('shows categories inside a list, adds to one, and moves items between them', async () => {
    const shop: FamilyList = { ...grocery, categories: [{ id: 'p', name: 'Produce' }, { id: 'd', name: 'Dairy & Eggs' }] }
    const data = { grocery: [item('g1', 'Milk', { categoryId: 'd' }), item('g2', 'Limes', { categoryId: 'p' }), item('g4', 'Birthday card')] }
    const { actions, user } = setup([shop], data)
    const produce = screen.getByRole('region', { name: 'Produce' })
    expect(within(produce).getByText('Limes')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Dairy & Eggs' })).getByText('Milk')).toBeInTheDocument()
    expect(within(produce).queryByLabelText('Add to Produce')).not.toBeInTheDocument()
    await user.click(within(produce).getByRole('button', { name: 'Add item to Produce' }))
    await user.type(within(produce).getByLabelText('Add to Produce'), 'Kale{Enter}')
    expect(actions.onAdd).toHaveBeenCalledWith(shop, 'Kale', null, 'p')

    await user.click(screen.getByRole('button', { name: 'Edit Birthday card' }))
    await choose(user, screen.getByRole('combobox', { name: 'Category' }), 'd')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(actions.onEditItem).toHaveBeenCalledWith(shop, data.grocery[2], { categoryId: 'd' })

    await user.click(screen.getByRole('button', { name: 'Edit Produce' }))
    await user.click(screen.getByRole('button', { name: 'Move Produce down' }))
    expect(actions.onMoveCategory).toHaveBeenCalledWith(shop, 'p', 1)
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    await user.click(screen.getByRole('button', { name: 'Remove category' }))
    expect(actions.onDeleteCategory).toHaveBeenCalledWith(shop, 'p')
  })

  it('sorts a grocery list by store aisle (switchable), and adds categories on any list', async () => {
    const { actions, user } = setup()
    const g = screen.getByRole('article', { name: 'Grocery List' })
    await user.click(within(g).getByRole('button', { name: 'Grocery List options' }))
    const sort = within(g).getByRole('menuitemcheckbox', { name: 'Sort by store aisle' })
    expect(sort).toHaveAttribute('aria-checked', 'true')
    await user.click(sort)
    expect(actions.onAutoSort).toHaveBeenCalledWith(grocery, false)
    const t = screen.getByRole('article', { name: 'To-Do List' })
    await user.click(within(t).getByRole('button', { name: 'To-Do List options' }))
    expect(within(t).queryByRole('menuitemcheckbox', { name: 'Sort by store aisle' })).not.toBeInTheDocument()
    await user.click(within(t).getByRole('menuitem', { name: 'Add category' }))
    await user.type(within(t).getByLabelText('New category name'), 'Errands{Enter}')
    expect(actions.onAddCategory).toHaveBeenCalledWith(todo, 'Errands')
  })

  it('says how long checked-off items are kept', () => {
    setup()
    expect(screen.getByText(/removed after 30 days/)).toBeInTheDocument()
  })

  it('creates a new list', async () => {
    const { actions, user } = setup()
    await user.click(screen.getByRole('button', { name: 'New list' }))
    await user.type(screen.getByLabelText('New list name'), 'Packing list')
    await user.click(screen.getByRole('button', { name: 'Create' }))
    expect(actions.onCreateList).toHaveBeenCalledWith('Packing list')
  })

  describe('press and hold to drag', () => {
    const shop: FamilyList = { ...grocery, categories: [{ id: 'p', name: 'Produce' }, { id: 'd', name: 'Dairy & Eggs' }] }
    const data = { grocery: [item('g1', 'Milk', { categoryId: 'd' }), item('g2', 'Limes', { categoryId: 'p' }), item('g3', 'Kale', { categoryId: 'p' }), item('g4', 'Napkins')] }
    // jsdom has no layout: say which group is under the finger.
    const pointer = (type: string, el: Element | Window, x: number, y: number) => {
      const e = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 })
      Object.assign(e, { pointerId: 1, pointerType: 'touch' })
      fireEvent(el, e)
    }

    it('moves an item into another category after a long press, without opening the editor', () => {
      vi.useFakeTimers()
      try {
        const { actions } = setup([shop], data)
        const produce = screen.getByRole('region', { name: 'Produce' })
        Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => produce })
        const napkins = screen.getByText('Napkins').closest('li')!
        pointer('pointerdown', napkins, 10, 10)
        act(() => vi.advanceTimersByTime(HOLD_MS + 10))
        expect(napkins).toHaveClass('list-item--lifted')
        pointer('pointermove', window, 12, 200)
        pointer('pointerup', window, 12, 200)
        fireEvent.click(screen.getByRole('button', { name: 'Edit Napkins' }))
        expect(actions.onMoveItem).toHaveBeenCalledWith(shop, data.grocery[3], { order: 4, categoryId: 'p', memberId: null })
        // The click after letting go didn't open the editor.
        expect(screen.queryByRole('form', { name: 'Edit Napkins' })).not.toBeInTheDocument()
      } finally {
        vi.useRealTimers()
      }
    })

    it('a quick tap still edits, and moving first is a scroll, not a drag', () => {
      vi.useFakeTimers()
      try {
        const { actions } = setup([shop], data)
        const limes = screen.getByText('Limes').closest('li')!
        pointer('pointerdown', limes, 10, 10)
        pointer('pointermove', window, 10, 60)
        act(() => vi.advanceTimersByTime(HOLD_MS + 10))
        expect(limes).not.toHaveClass('list-item--lifted')
        pointer('pointerup', window, 10, 60)
        pointer('pointerdown', limes, 10, 10)
        pointer('pointerup', window, 10, 10)
        fireEvent.click(screen.getByRole('button', { name: 'Edit Limes' }))
        expect(screen.getByRole('form', { name: 'Edit Limes' })).toBeInTheDocument()
        expect(actions.onMoveItem).not.toHaveBeenCalled()
      } finally {
        vi.useRealTimers()
      }
    })

    it('dragging the grip lifts the item at once, and putting it straight back saves nothing', () => {
      const { actions } = setup([shop], data)
      const produce = screen.getByRole('region', { name: 'Produce' })
      Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => produce })
      const napkins = screen.getByText('Napkins').closest('li')!
      const grip = napkins.querySelector('.list-item__grip')!
      pointer('pointerdown', grip, 10, 10)
      expect(napkins).toHaveClass('list-item--lifted')
      pointer('pointerup', window, 10, 10)
      expect(actions.onMoveItem).not.toHaveBeenCalled()
      pointer('pointerdown', grip, 10, 10)
      pointer('pointermove', window, 12, 200)
      pointer('pointerup', window, 12, 200)
      expect(actions.onMoveItem).toHaveBeenCalledWith(shop, data.grocery[3], { order: 4, categoryId: 'p', memberId: null })
    })

    it('shows a grip only on items that can move', () => {
      setup([shop], { grocery: [...data.grocery, item('g5', 'Bread', { done: true })] })
      expect(screen.getByText('Napkins').closest('li')!.querySelector('.list-item__grip')).toBeInTheDocument()
      expect(screen.getByText('Bread').closest('li')!.querySelector('.list-item__grip')).not.toBeInTheDocument()
    })
  })

  it('works out the order that puts a dropped item in its place', () => {
    const others = [item('a', 'A', { order: 10 }), item('b', 'B', { order: 20 }), item('c', 'C', { order: 30 })]
    expect(placeFor(others, { group: 'x', beforeId: 'b' })).toBe(15)
    expect(placeFor(others, { group: 'x', beforeId: 'a' })).toBe(9)
    expect(placeFor(others, { group: 'x', beforeId: null })).toBe(31)
  })
})
