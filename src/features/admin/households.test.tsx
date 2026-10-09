import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { User } from 'firebase/auth'
import { describe, expect, it, vi } from 'vitest'
import { FamilySetup } from '../../components/FamilySetup'
import { AdminPage } from './HouseholdsAdmin'
import { useIsAdmin } from './useIsAdmin'
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
  const household = (id: string, name: string, extra = {}) => ({
    id,
    name,
    ownerEmail: 'andrew@example.com',
    createdAt: '2026-09-27T00:00:00Z',
    members: 2,
    people: [
      { name: 'Andrew', email: 'andrew@example.com', owner: true },
      { name: 'Lydia', email: 'lydia@example.com', owner: false },
    ],
    events: 180,
    recipes: 196,
    photos: 40,
    photoBytes: 200 * 1024 ** 2,
    cookbookBytes: 30 * 1024 ** 2,
    otherBytes: 0,
    ...extra,
  })
  const api = (admin: boolean) => ({
    isAdmin: vi.fn(async () => admin),
    watch: vi.fn((cb: (l: HouseholdInvite[]) => void) => {
      cb(invites)
      return () => undefined
    }),
    create: vi.fn(async () => 'NEWCODE'),
    revoke: vi.fn(async () => undefined),
    households: vi.fn(async () => [household('f1', 'The Jacobs Family'), household('f2', 'The Smiths', { members: 1, photos: 0, photoBytes: 0, cookbookBytes: 0, people: [] })]),
    rename: vi.fn(async () => undefined),
    remove: vi.fn(async () => undefined),
  })

  function AdminGate({ a }: { a: ReturnType<typeof api> }) {
    return useIsAdmin(a) ? <AdminPage userId="u1" familyId="f1" api={a} /> : <p>Household settings</p>
  }

  it('is only for the admin', async () => {
    const a = api(false)
    render(<AdminGate a={a} />)
    await vi.waitFor(() => expect(a.isAdmin).toHaveBeenCalled())
    expect(screen.getByText('Household settings')).toBeInTheDocument()
    expect(a.households).not.toHaveBeenCalled()
    expect(a.watch).not.toHaveBeenCalled()
  })

  it('creates invite links and shares the setup message', async () => {
    const a = api(true)
    const u = userEvent.setup()
    render(<AdminPage userId="u1" familyId="f1" api={a} />)
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
  })

  it('shows usage across households, and each household with its people and size', async () => {
    const a = api(true)
    render(<AdminPage userId="u1" familyId="f1" api={a} />)
    const card = await screen.findByRole('listitem', { name: 'The Jacobs Family' })
    expect(card).toHaveTextContent('2 people · 180 events · 196 recipes · 40 photos · 230 MB')
    expect(card).toHaveTextContent('Yours')
    expect(within(card).getByText(/lydia@example.com/)).toBeInTheDocument()
    // Your own household can be renamed but not deleted from here.
    expect(within(card).queryByRole('button', { name: 'Delete…' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Storage: 230 MB of 5 GB free')).toHaveTextContent('Photos and videos 200 MB')
    expect(screen.getByRole('region', { name: 'Usage' })).toHaveTextContent(/Households2People3Photos40Recipes392/)
  })

  it('renames a household, and deletes another only once its name is typed', async () => {
    const a = api(true)
    const u = userEvent.setup()
    render(<AdminPage userId="u1" familyId="f1" api={a} />)
    const smiths = await screen.findByRole('listitem', { name: 'The Smiths' })
    await u.click(within(smiths).getByRole('button', { name: 'Rename' }))
    await u.clear(within(smiths).getByLabelText('New name'))
    await u.type(within(smiths).getByLabelText('New name'), 'Smith Family')
    await u.click(within(smiths).getByRole('button', { name: 'Save' }))
    expect(a.rename).toHaveBeenCalledWith('f2', 'Smith Family')
    const renamed = await screen.findByRole('listitem', { name: 'Smith Family' })

    await u.click(within(renamed).getByRole('button', { name: 'Delete…' }))
    const go = within(renamed).getByRole('button', { name: 'Delete forever' })
    expect(go).toBeDisabled()
    await u.type(within(renamed).getByLabelText('Household name to confirm'), 'smith family')
    await u.click(go)
    expect(a.remove).toHaveBeenCalledWith('f2', 'smith family')
    await vi.waitFor(() => expect(screen.queryByRole('listitem', { name: 'Smith Family' })).not.toBeInTheDocument())
  })
})
