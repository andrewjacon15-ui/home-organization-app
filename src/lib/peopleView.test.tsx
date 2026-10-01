import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PeopleFilter } from '../components/PeopleFilter'
import type { Member } from '../types'
import { decodeView, encodeView, itemOwner, personFor, readPeopleDefault, savePeopleDefault } from './peopleView'

const members: Member[] = [
  { id: 'a', displayName: 'Andrew Jacon', email: 'a@x.com', color: '#15803d' },
  { id: 'l', displayName: 'Lydia', email: 'l@x.com', color: '#c2410c' },
]

afterEach(() => localStorage.clear())

describe('people views', () => {
  it('resolves to one person or everyone, falling back if the person left', () => {
    expect(personFor('everyone', 'a', ['a', 'l'])).toBeNull()
    expect(personFor('me', 'a', ['a', 'l'])).toBe('a')
    expect(personFor({ member: 'l' }, 'a', ['a', 'l'])).toBe('l')
    expect(personFor({ member: 'gone' }, 'a', ['a', 'l'])).toBeNull()
  })

  it('treats a list item as its section person’s, or else whoever added it', () => {
    expect(itemOwner({ memberId: 'l', createdBy: 'a' })).toBe('l')
    expect(itemOwner({ memberId: null, createdBy: 'a' })).toBe('a')
    expect(itemOwner({ memberId: null })).toBeNull()
  })

  it('remembers a default per page on this device, defaulting to everyone', () => {
    expect(readPeopleDefault('lists')).toBe('everyone')
    savePeopleDefault('lists', 'me')
    savePeopleDefault('chores', { member: 'l' })
    expect(readPeopleDefault('lists')).toBe('me')
    expect(readPeopleDefault('chores')).toEqual({ member: 'l' })
    savePeopleDefault('lists', 'everyone')
    expect(readPeopleDefault('lists')).toBe('everyone')
    expect(decodeView(encodeView({ member: 'x' }))).toEqual({ member: 'x' })
  })
})

describe('PeopleFilter', () => {
  it('offers Everyone, Me, and each other person, and reports the pick', () => {
    const onChange = vi.fn()
    render(<PeopleFilter members={members} userId="a" value="everyone" onChange={onChange} label="Show chores for" />)
    const group = screen.getByRole('group', { name: 'Show chores for' })
    expect(group).toHaveTextContent('EveryoneMeLydia')
    expect(screen.getByRole('button', { name: 'Everyone' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Lydia' }))
    expect(onChange).toHaveBeenCalledWith({ member: 'l' })
  })

  it('hides itself when there is only one person', () => {
    render(<PeopleFilter members={members.slice(0, 1)} userId="a" value="everyone" onChange={vi.fn()} label="Show" />)
    expect(screen.queryByRole('group')).not.toBeInTheDocument()
  })
})
