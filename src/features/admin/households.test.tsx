import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { User } from 'firebase/auth'
import { describe, expect, it, vi } from 'vitest'
import { FamilySetup } from '../../components/FamilySetup'
import { HouseholdsAdmin } from './HouseholdsAdmin'
import { inviteMessage } from './inviteMessage'
import { inviteLink, newCode, pendingInvite, takeInviteFromUrl, type HouseholdInvite } from './householdInvites'

const createFamily = vi.fn(async () => 'famNew')
vi.mock('../../lib/family', () => ({ createFamily: (...a: unknown[]) => (createFamily as (...x: unknown[]) => unknown)(...a) }))

const user = { uid: 'u1', email: 'sam@example.com', displayName: 'Sam Rivera' } as User

describe('invite links', () => {
  it('makes long, unguessable codes from an unambiguous alphabet', () => {
    const code = newCode()
    expect(code).toMatch(/^[a-km-zA-HJ-NP-Z2-9]{24}$/)
    expect(newCode()).not.toBe(code)
    expect(inviteLink('abc', 'https://home.example')).toBe('https://home.example/?household=abc')
  })

  it('remembers the code from the address and tidies the address', () => {
    const replace = vi.fn()
    takeInviteFromUrl({ search: '?household=CODE123&x=1', href: 'https://home.example/?household=CODE123&x=1' } as Location, { replaceState: replace } as unknown as History)
    expect(pendingInvite()).toBe('CODE123')
    expect(replace).toHaveBeenCalledWith(null, '', '/?x=1')
  })
})

describe('invite messages', () => {
  const link = 'https://home.example/?household=abc'
  it('gives numbered setup steps for each device, with the link', () => {
    const iphone = inviteMessage(link, 'iphone')
    expect(iphone).toContain('1. Open this link in Safari: ' + link)
    expect(iphone).toMatch(/Add to Home Screen/)
    expect(iphone).toMatch(/expires in 14 days/)
    expect(inviteMessage(link, 'android')).toMatch(/Open this link in Chrome[\s\S]*Add to home screen/)
    expect(inviteMessage(link, 'computer')).toMatch(/Settings → Google Calendar/)
  })

  it('sets up a wall tablet from a phone first, then signs the tablet in without the link', () => {
    const tablet = inviteMessage(link, 'tablet')
    expect(tablet).toMatch(/^1\. Start on your phone or computer/m)
    expect(tablet).toContain('open https://home.example in Chrome')
    expect(tablet.split(link)).toHaveLength(2)
    expect(tablet).toMatch(/This device is a to Tablet/)
  })
})

describe('starting a household from a link', () => {
  it('creates the household with the invite code', async () => {
    const onCreated = vi.fn()
    const u = userEvent.setup()
    render(<FamilySetup user={user} onCreated={onCreated} invite={{ code: 'CODE123', check: async () => 'valid' }} />)
    expect(await screen.findByText(/invited to start your own household/)).toBeInTheDocument()
    expect(screen.getByLabelText('Household name')).toHaveValue('The Rivera Family')
    await u.click(screen.getByRole('button', { name: 'Create my household' }))
    expect(createFamily).toHaveBeenCalledWith(user, 'The Rivera Family', 'CODE123')
    expect(onCreated).toHaveBeenCalledWith('famNew')
  })

  it('explains a used or expired link', async () => {
    render(<FamilySetup user={user} onCreated={vi.fn()} invite={{ code: 'OLD', check: async () => 'used' }} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('already been used')
    render(<FamilySetup user={user} onCreated={vi.fn()} invite={{ code: 'OLD2', check: async () => 'expired' }} />)
    expect(await screen.findByText(/has expired/)).toBeInTheDocument()
  })
})

describe('Households (admin)', () => {
  const now = Date.now()
  const invites: HouseholdInvite[] = [
    { code: 'open1', note: 'For Sam', createdAt: new Date(now), expiresAt: new Date(now + 5 * 86_400_000) },
    { code: 'used1', note: '', createdAt: new Date(now), expiresAt: new Date(now + 5 * 86_400_000), usedBy: 'u9', usedEmail: 'kim@example.com', usedAt: new Date(now) },
  ]
  const api = (admin: boolean) => ({
    isAdmin: vi.fn(async () => admin),
    watch: vi.fn((cb: (l: HouseholdInvite[]) => void) => {
      cb(invites)
      return () => undefined
    }),
    create: vi.fn(async () => 'NEWCODE'),
    revoke: vi.fn(async () => undefined),
    households: vi.fn(async () => [
      { id: 'f1', name: 'The Jacobs Family', ownerEmail: 'andrew@example.com', createdAt: '2026-09-27T00:00:00Z', members: 2, events: 180, recipes: 196, photos: 40, photoBytes: 200 * 1024 ** 2, cookbookBytes: 30 * 1024 ** 2 },
    ]),
  })

  it('shows nothing to anyone but the admin', async () => {
    const a = api(false)
    const { container } = render(<HouseholdsAdmin userId="u1" api={a} />)
    await vi.waitFor(() => expect(a.isAdmin).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
    expect(a.watch).not.toHaveBeenCalled()
  })

  it('creates and lists invite links, and shows households with their size', async () => {
    const a = api(true)
    const u = userEvent.setup()
    render(<HouseholdsAdmin userId="u1" api={a} />)
    expect(await screen.findByText('For Sam')).toBeInTheDocument()
    expect(screen.getByText(/kim@example.com/)).toBeInTheDocument()
    await u.type(screen.getByLabelText('Who it’s for'), 'For Pat')
    await u.click(screen.getByRole('button', { name: 'Create invite link' }))
    expect(a.create).toHaveBeenCalledWith('u1', 'For Pat')
    expect(await screen.findByRole('status')).toHaveTextContent('/?household=NEWCODE')
    expect(screen.getByLabelText('Invite message')).toHaveTextContent(/Open this link in Safari: .*\/\?household=NEWCODE/)
    await u.click(screen.getByRole('button', { name: 'Wall tablet' }))
    expect(screen.getByRole('button', { name: 'Wall tablet' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText('Invite message')).toHaveTextContent(/Start on your phone or computer/)
    const write = vi.fn(async () => undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: write }, configurable: true })
    await u.click(screen.getByRole('button', { name: 'Copy message' }))
    expect(write).toHaveBeenCalledWith(expect.stringContaining('Start on your phone or computer'))
    expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument()
    // An older open link can show its message too.
    await u.click(screen.getByRole('button', { name: 'Message' }))
    expect(screen.getByRole('status')).toHaveTextContent('/?household=open1')
    await u.click(screen.getByRole('button', { name: 'Show households and usage' }))
    expect(await screen.findByText('The Jacobs Family')).toBeInTheDocument()
    expect(screen.getByText(/2 people · 180 events · 196 recipes · 40 photos · 230 MB/)).toBeInTheDocument()
    expect(screen.getByText(/1 household · photos and cookbooks use 230 MB of the 5 GB free/)).toBeInTheDocument()
  })
})
