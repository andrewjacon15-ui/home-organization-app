import { render, screen, within } from '@testing-library/react'
import { choose } from '../../test-utils'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Member } from '../../types'
import type { FamilyList, ListItem } from './listsApi'
import { ListsBoard } from './ListsBoard'

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
    onAddAisles: vi.fn(),
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
    expect(within(lydia).getAllByRole('listitem').map((li) => li.textContent?.replace('✕', ''))).toEqual(['Drop off returns', 'Hem dress'])
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

  it('offers store aisles on a grocery list, and new categories on any list', async () => {
    const { actions, user } = setup()
    const g = screen.getByRole('article', { name: 'Grocery List' })
    await user.click(within(g).getByRole('button', { name: 'Grocery List options' }))
    await user.click(within(g).getByRole('menuitem', { name: 'Add store aisles' }))
    expect(actions.onAddAisles).toHaveBeenCalledWith(grocery)
    const t = screen.getByRole('article', { name: 'To-Do List' })
    await user.click(within(t).getByRole('button', { name: 'To-Do List options' }))
    expect(within(t).queryByRole('menuitem', { name: 'Add store aisles' })).not.toBeInTheDocument()
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
})
