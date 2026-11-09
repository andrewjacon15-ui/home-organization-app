import { describe, expect, it } from 'vitest'
import type { Chore } from '../../../src/types'
import * as f from './format'

const people: f.Person[] = [
  { id: 'a', name: 'Andrew Jacon', email: 'a@x.test' },
  { id: 'l', name: 'Lydia', email: 'l@x.test' },
]
const me = people[0]
const stamps: f.Stamps<string> = { now: 'NOW', at: (d) => `AT ${d.toISOString()}` }
const grocery: f.List = { id: 'g', title: 'Grocery List', kind: 'grocery', sections: false, categories: [{ id: 'produce', name: 'Produce' }, { id: 'dairy', name: 'Dairy & Eggs' }] }
const todo: f.List = { id: 't', title: 'To-Do List', kind: 'todo', sections: true, categories: [] }

describe('overview', () => {
  it('lays out each day in a few short lines', () => {
    const chores: Chore[] = [{ id: 'c', title: 'Trash', assigneeId: 'a', dueDate: '2026-11-09', dueTime: '19:00', repeat: { freq: 'weekly', interval: 1, days: [1] }, done: false, points: 1 }]
    const text = f.overview({
      from: '2026-11-09',
      days: 2,
      today: '2026-11-09',
      family: 'The Jacons',
      people,
      events: [
        { title: 'Dentist', start: new Date(2026, 10, 9, 9, 30), end: new Date(2026, 10, 9, 10, 30), allDay: false, who: ['a'] },
        { title: 'Grandma visiting', start: new Date(Date.UTC(2026, 10, 9)), end: new Date(Date.UTC(2026, 10, 11)), allDay: true, startDate: '2026-11-09', endDate: '2026-11-11', who: ['a', 'l'] },
      ],
      chores,
      meals: { '2026-11-09': { breakfast: '', lunch: '', dinner: 'Tacos', notes: '' } },
      countdowns: [{ title: 'Thanksgiving', date: '2026-11-26', kind: 'once' }],
    })
    expect(text).toBe(
      [
        'The Jacons · Mon, Nov 9 to Tue, Nov 10 · people: Andrew, Lydia',
        '',
        'Mon, Nov 9 (today)',
        '  all day Grandma visiting (everyone)',
        '  9:30 AM–10:30 AM Dentist (Andrew)',
        '  chores: Trash (Andrew 19:00)',
        '  meals: dinner Tacos',
        '',
        'Tue, Nov 10',
        '  all day Grandma visiting (everyone)',
        '',
        'Countdowns: Thanksgiving in 17 days (Thu, Nov 26)',
      ].join('\n'),
    )
  })

  it('rolls yearly countdowns to their next date', () => {
    expect(f.upcoming([{ title: "Maya's birthday", date: '2015-01-03', kind: 'birthday' }], '2026-11-09')).toEqual(["Maya's birthday in 55 days (Sun, Jan 3)"])
  })
})

describe('lists', () => {
  it('groups open items by aisle, or by person on sectioned lists', () => {
    const items: f.Item[] = [
      { id: '1', text: 'Milk', memberId: null, categoryId: 'dairy', order: 2 },
      { id: '2', text: 'Limes', memberId: null, categoryId: 'produce', order: 1 },
      { id: '3', text: 'Napkins', memberId: null, categoryId: null, order: 3 },
    ]
    expect(f.listText(grocery, items, people)).toBe('Grocery List (3 to get)\nProduce: Limes\nDairy & Eggs: Milk\nOther: Napkins')
    expect(f.listText(todo, [{ id: '4', text: 'Passport', memberId: 'l', categoryId: null, order: 1 }], people)).toBe('To-Do List (1 to get)\nLydia: Passport')
  })

  it('finds lists, people and items by the names people use', () => {
    expect(f.findList([grocery, todo], 'grocery').id).toBe('g')
    expect(() => f.findList([grocery, todo], 'list')).toThrow(/More than one/)
    expect(f.findPerson(people, 'lydia', me).id).toBe('l')
    expect(f.findPerson(people, 'me', me).id).toBe('a')
    expect(() => f.findPerson(people, 'Bob', me)).toThrow(/People: Andrew, Lydia/)
    const items: f.Item[] = [
      { id: '1', text: 'Whole milk', memberId: null, categoryId: null, order: 1 },
      { id: '2', text: 'Oat milk', memberId: null, categoryId: null, order: 2 },
    ]
    expect(f.findItems(items, ['oat milk', 'milk', 'eggs'])).toEqual({ found: [items[1]], missing: ['milk (matches Whole milk, Oat milk)', 'eggs'] })
  })
})

describe('writes', () => {
  it('adds new grocery items filed by aisle, skipping ones already there', () => {
    const open: f.Item[] = [{ id: '1', text: 'Milk', memberId: null, categoryId: 'dairy', order: 1 }]
    const { docs, skipped } = f.listItemDocs(grocery, open, ['bananas', 'milk', ' '], null, 'a', stamps, 1000)
    expect(skipped).toEqual(['milk'])
    expect(docs).toEqual([{ text: 'bananas', done: false, memberId: null, categoryId: 'produce', order: 1000, createdBy: 'a', createdAt: 'NOW' }])
  })

  it('builds events, chores and countdowns the way the app does', () => {
    expect(f.eventDoc({ title: 'Party', date: '2026-11-14', memberIds: ['a'] }, 'a', stamps)).toMatchObject({ title: 'Party', allDay: true, startDate: '2026-11-14', endDate: '2026-11-15', source: 'manual', sourceUserId: 'a', memberIds: ['a'] })
    expect(f.choreDoc({ title: 'Mow', assigneeId: 'l', repeat: 'weekly', days: [6] }, 'a', '2026-11-09', stamps)).toEqual({
      title: 'Mow',
      assigneeId: 'l',
      dueDate: '2026-11-09',
      points: 1,
      repeat: { freq: 'weekly', interval: 1, days: [6] },
      done: false,
      createdBy: 'a',
      createdAt: 'NOW',
    })
    expect(f.countdownDoc('Trip', '2026-12-01', 'once', 'a', stamps)).toEqual({ title: 'Trip', date: '2026-12-01', createdBy: 'a', createdAt: 'NOW', expireAt: 'AT 2026-12-03T00:00:00.000Z' })
    expect(f.checkOffFields(0, stamps)).toEqual({ done: true, doneAt: 'NOW' })
  })

  it('searches recipes by title or ingredient', () => {
    const entries: f.IndexEntry[] = [
      { t: 'Turkey chili', k: ['ground turkey', 'beans'], m: 45, s: 'online', b: 'Budget Bytes', f: true },
      { t: 'Pancakes', k: ['flour', 'milk'], m: 20, s: 'manual', b: null, f: false },
    ]
    expect(f.recipeText(entries, 'turkey')).toBe('1 recipe:\n★ Turkey chili · 45 min · Budget Bytes')
    expect(f.recipeText(entries, 'sushi')).toBe('No recipes match "sushi" (2 in the book).')
  })
})
