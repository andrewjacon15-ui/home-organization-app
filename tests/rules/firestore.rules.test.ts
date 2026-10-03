import { readFileSync } from 'node:fs'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import {
  collection,
  deleteDoc,
  documentId,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type Firestore,
} from 'firebase/firestore'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'

// Two families. Alice owns family A, Bob is an invited member of A.
// Mallory owns family B and must never see anything in A.
const FAM_A = 'famA'
const FAM_B = 'famB'
const ALICE = { uid: 'alice', email: 'alice@example.com' }
const BOB = { uid: 'bob', email: 'bob@example.com' }
const MALLORY = { uid: 'mallory', email: 'mallory@example.com' }
const CAROL = { uid: 'carol', email: 'carol@example.com' } // invited to A, not yet joined

let env: RulesTestEnvironment

function dbFor(user: { uid: string; email: string }, emailVerified = true): Firestore {
  return env
    .authenticatedContext(user.uid, { email: user.email, email_verified: emailVerified })
    .firestore() as unknown as Firestore
}

const anon = () => env.unauthenticatedContext().firestore() as unknown as Firestore

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-family-rules',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  })
})

afterAll(async () => {
  await env?.cleanup()
})

beforeEach(async () => {
  await env.clearFirestore()
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore() as unknown as Firestore
    await setDoc(doc(db, `families/${FAM_A}`), { name: 'A', ownerId: ALICE.uid, timezone: 'America/New_York' })
    await setDoc(doc(db, `families/${FAM_A}/members/${ALICE.uid}`), { displayName: 'Alice', email: ALICE.email, color: '#e76f51' })
    await setDoc(doc(db, `families/${FAM_A}/members/${BOB.uid}`), { displayName: 'Bob', email: BOB.email, color: '#2a9d8f' })
    await setDoc(doc(db, `families/${FAM_A}/members/${ALICE.uid}/private/tokens`), { refreshToken: 'secret' })
    await setDoc(doc(db, `families/${FAM_A}/chores/c1`), { title: 'Dishes', assigneeId: BOB.uid, dueDate: null, done: false, points: 1 })
    await setDoc(doc(db, `families/${FAM_A}/events/g1`), { source: 'google', sourceUserId: ALICE.uid, title: 'Work', start: 1, end: 2, allDay: false })
    await setDoc(doc(db, `families/${FAM_A}/events/m1`), { source: 'manual', sourceUserId: BOB.uid, title: 'Party', start: 1, end: 2, allDay: false })
    await setDoc(doc(db, `invites/${ALICE.email}`), { familyId: FAM_A, invitedBy: ALICE.uid })
    await setDoc(doc(db, `invites/${BOB.email}`), { familyId: FAM_A, invitedBy: ALICE.uid })
    await setDoc(doc(db, `invites/${CAROL.email}`), { familyId: FAM_A, invitedBy: ALICE.uid })

    await setDoc(doc(db, `families/${FAM_B}`), { name: 'B', ownerId: MALLORY.uid, timezone: 'UTC' })
    await setDoc(doc(db, `families/${FAM_B}/members/${MALLORY.uid}`), { displayName: 'Mallory', email: MALLORY.email, color: '#000000' })
    await setDoc(doc(db, `invites/${MALLORY.email}`), { familyId: FAM_B, invitedBy: MALLORY.uid })

    // Who may start a new family (server-managed; everyone else joins by invite).
    await setDoc(doc(db, 'config/access'), { familyCreators: ['dave@example.com'] })
  })
})

describe('cross-family isolation', () => {
  it('lets members read their own family', async () => {
    await assertSucceeds(getDoc(doc(dbFor(BOB), `families/${FAM_A}`)))
    await assertSucceeds(getDocs(collection(dbFor(BOB), `families/${FAM_A}/chores`)))
    await assertSucceeds(getDocs(collection(dbFor(BOB), `families/${FAM_A}/members`)))
  })

  it("blocks another family's member from every collection", async () => {
    const db = dbFor(MALLORY)
    await assertFails(getDoc(doc(db, `families/${FAM_A}`)))
    for (const sub of ['members', 'chores', 'events', 'mealPlans', 'photos', 'reminderPrefs']) {
      await assertFails(getDocs(collection(db, `families/${FAM_A}/${sub}`)))
    }
    await assertFails(setDoc(doc(db, `families/${FAM_A}/chores/x`), { title: 'Hack', assigneeId: null, dueDate: null, done: false, points: 0 }))
    await assertFails(setDoc(doc(db, `families/${FAM_A}/members/${MALLORY.uid}`), { displayName: 'M', email: MALLORY.email, color: '#000000' }))
  })

  it('blocks unauthenticated access', async () => {
    await assertFails(getDoc(doc(anon(), `families/${FAM_A}`)))
    await assertFails(getDocs(collection(anon(), `families/${FAM_A}/chores`)))
    await assertFails(getDoc(doc(anon(), `invites/${ALICE.email}`)))
  })
})

describe('private/tokens', () => {
  it('cannot be read even by its owner', async () => {
    await assertFails(getDoc(doc(dbFor(ALICE), `families/${FAM_A}/members/${ALICE.uid}/private/tokens`)))
    await assertFails(getDocs(collection(dbFor(ALICE), `families/${FAM_A}/members/${ALICE.uid}/private`)))
  })

  it('cannot be written even by its owner', async () => {
    await assertFails(setDoc(doc(dbFor(ALICE), `families/${FAM_A}/members/${ALICE.uid}/private/tokens`), { refreshToken: 'x' }))
    await assertFails(deleteDoc(doc(dbFor(ALICE), `families/${FAM_A}/members/${ALICE.uid}/private/tokens`)))
  })

  it('cannot be read by other family members', async () => {
    await assertFails(getDoc(doc(dbFor(BOB), `families/${FAM_A}/members/${ALICE.uid}/private/tokens`)))
  })
})

describe('family creation and joining', () => {
  it('lets a new user create a family, their member doc, and their own invite in one batch', async () => {
    const dave = { uid: 'dave', email: 'dave@example.com' }
    const db = dbFor(dave)
    const batch = writeBatch(db)
    batch.set(doc(db, 'families/famD'), { name: 'D', ownerId: dave.uid, timezone: 'UTC' })
    batch.set(doc(db, `families/famD/members/${dave.uid}`), { displayName: 'Dave', email: dave.email, color: '#123456' })
    batch.set(doc(db, `invites/${dave.email}`), { familyId: 'famD', invitedBy: dave.uid })
    await assertSucceeds(batch.commit())
  })

  it('only lets allowlisted, verified accounts start a family', async () => {
    const eve = { uid: 'eve', email: 'eve@example.com' }
    await assertFails(setDoc(doc(dbFor(eve), 'families/famE'), { name: 'E', ownerId: eve.uid, timezone: 'UTC' }))
    const dave = { uid: 'dave', email: 'dave@example.com' }
    await assertFails(setDoc(doc(dbFor(dave, false), 'families/famD'), { name: 'D', ownerId: dave.uid, timezone: 'UTC' }))
    await assertSucceeds(setDoc(doc(dbFor(dave), 'families/famD'), { name: 'D', ownerId: dave.uid, timezone: 'UTC' }))
  })

  it('keeps the access allowlist away from every client', async () => {
    await assertFails(getDoc(doc(dbFor(ALICE), 'config/access')))
    await assertFails(setDoc(doc(dbFor(ALICE), 'config/access'), { familyCreators: ['alice@example.com'] }))
    await assertFails(setDoc(doc(dbFor(MALLORY), 'config/access'), { familyCreators: ['mallory@example.com'] }))
  })

  it('rejects creating a family owned by someone else', async () => {
    await assertFails(setDoc(doc(dbFor(MALLORY), 'families/famX'), { name: 'X', ownerId: ALICE.uid, timezone: 'UTC' }))
  })

  it('lets an invited user read their invite and join', async () => {
    const db = dbFor(CAROL)
    await assertSucceeds(getDoc(doc(db, `invites/${CAROL.email}`)))
    await assertSucceeds(setDoc(doc(db, `families/${FAM_A}/members/${CAROL.uid}`), { displayName: 'Carol', email: CAROL.email, color: '#abcdef' }))
  })

  it('lets a not-yet-joined user check their own member doc, but not list members', async () => {
    await assertSucceeds(getDoc(doc(dbFor(CAROL), `families/${FAM_A}/members/${CAROL.uid}`)))
    await assertFails(getDocs(collection(dbFor(CAROL), `families/${FAM_A}/members`)))
    await assertFails(getDoc(doc(dbFor(CAROL), `families/${FAM_A}/members/${ALICE.uid}`)))
  })

  it('rejects joining with an unverified email', async () => {
    await assertFails(setDoc(doc(dbFor(CAROL, false), `families/${FAM_A}/members/${CAROL.uid}`), { displayName: 'Carol', email: CAROL.email, color: '#abcdef' }))
  })

  it('rejects joining a family you were not invited to', async () => {
    await assertFails(setDoc(doc(dbFor(MALLORY), `families/${FAM_A}/members/${MALLORY.uid}`), { displayName: 'M', email: MALLORY.email, color: '#000000' }))
  })

  it("rejects creating a member doc under someone else's uid", async () => {
    await assertFails(setDoc(doc(dbFor(CAROL), `families/${FAM_A}/members/someone-else`), { displayName: 'Carol', email: CAROL.email, color: '#abcdef' }))
  })

  it("does not let a user read someone else's invite", async () => {
    await assertFails(getDoc(doc(dbFor(MALLORY), `invites/${CAROL.email}`)))
  })

  it('only lets the owner invite and uninvite', async () => {
    await assertSucceeds(setDoc(doc(dbFor(ALICE), 'invites/erin@example.com'), { familyId: FAM_A, invitedBy: ALICE.uid }))
    await assertFails(setDoc(doc(dbFor(BOB), 'invites/frank@example.com'), { familyId: FAM_A, invitedBy: BOB.uid }))
    await assertFails(setDoc(doc(dbFor(MALLORY), 'invites/gina@example.com'), { familyId: FAM_A, invitedBy: MALLORY.uid }))
    await assertFails(deleteDoc(doc(dbFor(BOB), `invites/${CAROL.email}`)))
    await assertSucceeds(deleteDoc(doc(dbFor(ALICE), `invites/${CAROL.email}`)))
  })

  it("does not let another family take over an existing invite", async () => {
    await assertFails(setDoc(doc(dbFor(MALLORY), `invites/${CAROL.email}`), { familyId: FAM_B, invitedBy: MALLORY.uid }))
  })

  it("lets members list their family's invites but not another family's", async () => {
    await assertSucceeds(getDocs(query(collection(dbFor(BOB), 'invites'), where('familyId', '==', FAM_A))))
    await assertFails(getDocs(query(collection(dbFor(MALLORY), 'invites'), where('familyId', '==', FAM_A))))
  })

  it('does not let a member change the owner', async () => {
    await assertFails(updateDoc(doc(dbFor(ALICE), `families/${FAM_A}`), { ownerId: BOB.uid }))
    await assertFails(updateDoc(doc(dbFor(BOB), `families/${FAM_A}`), { name: 'Bob family' }))
    await assertSucceeds(updateDoc(doc(dbFor(ALICE), `families/${FAM_A}`), { timezone: 'America/Chicago' }))
  })

  it('lets members edit only their own profile, and not their email', async () => {
    await assertSucceeds(updateDoc(doc(dbFor(BOB), `families/${FAM_A}/members/${BOB.uid}`), { color: '#111111' }))
    await assertFails(updateDoc(doc(dbFor(BOB), `families/${FAM_A}/members/${ALICE.uid}`), { color: '#111111' }))
    await assertFails(updateDoc(doc(dbFor(BOB), `families/${FAM_A}/members/${BOB.uid}`), { email: 'other@example.com' }))
  })
})

describe('chores', () => {
  const valid = { title: 'Laundry', assigneeId: ALICE.uid, dueDate: '2026-10-01', done: false, points: 3 }

  it('lets members create, toggle, and delete chores', async () => {
    const db = dbFor(BOB)
    await assertSucceeds(setDoc(doc(db, `families/${FAM_A}/chores/c2`), valid))
    await assertSucceeds(updateDoc(doc(db, `families/${FAM_A}/chores/c2`), { done: true }))
    await assertSucceeds(deleteDoc(doc(db, `families/${FAM_A}/chores/c2`)))
  })

  it('rejects malformed chores', async () => {
    const db = dbFor(BOB)
    await assertFails(setDoc(doc(db, `families/${FAM_A}/chores/bad1`), { ...valid, title: '' }))
    await assertFails(setDoc(doc(db, `families/${FAM_A}/chores/bad2`), { ...valid, points: -1 }))
    await assertFails(setDoc(doc(db, `families/${FAM_A}/chores/bad3`), { ...valid, done: 'yes' }))
    await assertFails(setDoc(doc(db, `families/${FAM_A}/chores/bad4`), { ...valid, dueDate: 'tomorrow' }))
    await assertFails(setDoc(doc(db, `families/${FAM_A}/chores/bad5`), { ...valid, extra: 'field' }))
  })
})

describe('meal plans', () => {
  it('lets members write a day and rejects bad keys', async () => {
    const db = dbFor(BOB)
    await assertSucceeds(setDoc(doc(db, `families/${FAM_A}/mealPlans/2026-10-01`), { breakfast: 'Eggs', lunch: '', dinner: 'Tacos', notes: '' }))
    await assertFails(setDoc(doc(db, `families/${FAM_A}/mealPlans/not-a-date`), { breakfast: 'Eggs', lunch: '', dinner: '', notes: '' }))
    await assertFails(setDoc(doc(db, `families/${FAM_A}/mealPlans/2026-10-02`), { breakfast: 5, lunch: '', dinner: '', notes: '' }))
  })

  it('supports what the planner does: stamp the editor, query a week, clear a day', async () => {
    const db = dbFor(BOB)
    const day = doc(db, `families/${FAM_A}/mealPlans/2026-10-03`)
    await assertSucceeds(setDoc(day, { breakfast: '', lunch: '', dinner: 'Pizza', notes: '', updatedBy: BOB.uid }))
    const week = query(
      collection(db, `families/${FAM_A}/mealPlans`),
      where(documentId(), '>=', '2026-09-27'),
      where(documentId(), '<=', '2026-10-03'),
    )
    await assertSucceeds(getDocs(week))
    await assertSucceeds(deleteDoc(day))
  })

  it("blocks other families from a week query", async () => {
    const week = query(
      collection(dbFor(MALLORY), `families/${FAM_A}/mealPlans`),
      where(documentId(), '>=', '2026-09-27'),
      where(documentId(), '<=', '2026-10-03'),
    )
    await assertFails(getDocs(week))
  })
})

describe('events', () => {
  const t = (iso: string) => Timestamp.fromDate(new Date(iso))
  const manual = {
    source: 'manual',
    sourceUserId: BOB.uid,
    title: 'Dentist',
    start: t('2026-10-01T15:00:00Z'),
    end: t('2026-10-01T16:00:00Z'),
    allDay: false,
  }
  const allDay = {
    ...manual,
    title: 'School holiday',
    allDay: true,
    start: t('2026-10-12T00:00:00Z'),
    end: t('2026-10-13T00:00:00Z'),
    startDate: '2026-10-12',
    endDate: '2026-10-13',
  }

  it('lets members read all events', async () => {
    await assertSucceeds(getDocs(collection(dbFor(BOB), `families/${FAM_A}/events`)))
  })

  it('lets members add timed and all-day manual events', async () => {
    const db = dbFor(BOB)
    await assertSucceeds(setDoc(doc(db, `families/${FAM_A}/events/m2`), manual))
    await assertSucceeds(setDoc(doc(db, `families/${FAM_A}/events/m3`), allDay))
    await assertSucceeds(updateDoc(doc(db, `families/${FAM_A}/events/m2`), { title: 'Dentist (moved)' }))
    await assertSucceeds(deleteDoc(doc(db, `families/${FAM_A}/events/m1`)))
  })

  it('rejects malformed or misattributed manual events', async () => {
    const db = dbFor(BOB)
    const e = (id: string) => doc(db, `families/${FAM_A}/events/${id}`)
    await assertFails(setDoc(e('x1'), { ...manual, sourceUserId: ALICE.uid }))
    await assertFails(setDoc(e('x2'), { ...manual, title: '' }))
    await assertFails(setDoc(e('x3'), { ...manual, start: 1, end: 2 }))
    await assertFails(setDoc(e('x4'), { ...manual, end: t('2026-10-01T14:00:00Z') }))
    await assertFails(setDoc(e('x5'), { ...manual, extra: true }))
    await assertFails(setDoc(e('x6'), { ...allDay, startDate: 'Oct 12' }))
    await setDoc(e('x7'), manual)
    await assertFails(updateDoc(e('x7'), { sourceUserId: ALICE.uid }))
  })

  it('never lets clients write google-synced events', async () => {
    const db = dbFor(BOB)
    await assertFails(setDoc(doc(db, `families/${FAM_A}/events/g2`), { ...manual, source: 'google' }))
    await assertFails(updateDoc(doc(db, `families/${FAM_A}/events/g1`), { title: 'Edited' }))
    await assertFails(deleteDoc(doc(db, `families/${FAM_A}/events/g1`)))
    await assertFails(updateDoc(doc(db, `families/${FAM_A}/events/m1`), { source: 'google' }))
  })
})

describe('calendar connection status', () => {
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore() as unknown as Firestore
      await updateDoc(doc(db, `families/${FAM_A}/members/${BOB.uid}`), {
        calendar: { status: 'connected', email: BOB.email },
      })
    })
  })

  it('still lets members edit their profile once the server has set calendar status', async () => {
    await assertSucceeds(updateDoc(doc(dbFor(BOB), `families/${FAM_A}/members/${BOB.uid}`), { color: '#222222' }))
  })

  it('does not let members write calendar status themselves', async () => {
    const me = doc(dbFor(BOB), `families/${FAM_A}/members/${BOB.uid}`)
    await assertFails(updateDoc(me, { calendar: { status: 'connected', email: 'x@example.com' } }))
    await assertFails(
      setDoc(doc(dbFor(CAROL), `families/${FAM_A}/members/${CAROL.uid}`), {
        displayName: 'Carol',
        email: CAROL.email,
        color: '#abcdef',
        calendar: { status: 'connected' },
      }),
    )
  })
})

describe('reminder prefs', () => {
  it('are private to each person', async () => {
    const prefs = { leadTimeMinutes: 30, dailyDigestEnabled: true, digestHourLocal: 7, timezone: 'America/New_York' }
    await assertSucceeds(setDoc(doc(dbFor(BOB), `families/${FAM_A}/reminderPrefs/${BOB.uid}`), prefs))
    await assertSucceeds(getDoc(doc(dbFor(BOB), `families/${FAM_A}/reminderPrefs/${BOB.uid}`)))
    await assertFails(getDoc(doc(dbFor(ALICE), `families/${FAM_A}/reminderPrefs/${BOB.uid}`)))
    await assertFails(setDoc(doc(dbFor(ALICE), `families/${FAM_A}/reminderPrefs/${BOB.uid}`), prefs))
    await assertFails(setDoc(doc(dbFor(BOB), `families/${FAM_A}/reminderPrefs/${BOB.uid}`), { ...prefs, digestHourLocal: 24 }))
  })

  it('accept the event-email switch, and only as a boolean', async () => {
    const prefs = { eventEmailsEnabled: true, leadTimeMinutes: 30, dailyDigestEnabled: false, digestHourLocal: 7, timezone: 'America/New_York' }
    await assertSucceeds(setDoc(doc(dbFor(BOB), `families/${FAM_A}/reminderPrefs/${BOB.uid}`), prefs))
    await assertFails(setDoc(doc(dbFor(BOB), `families/${FAM_A}/reminderPrefs/${BOB.uid}`), { ...prefs, eventEmailsEnabled: 'yes' }))
  })

  it('keep the sent-email log server-only', async () => {
    await assertFails(getDocs(collection(dbFor(ALICE), `families/${FAM_A}/emailLog`)))
    await assertFails(setDoc(doc(dbFor(ALICE), `families/${FAM_A}/emailLog/x`), { sentAt: 1 }))
  })
})

describe('photos', () => {
  it('lets members add photos as themselves', async () => {
    const photo = { storagePath: 'families/famA/photos/p1.jpg', uploadedBy: BOB.uid, caption: '', createdAt: 1 }
    await assertSucceeds(setDoc(doc(dbFor(BOB), `families/${FAM_A}/photos/p1`), photo))
    await assertFails(setDoc(doc(dbFor(BOB), `families/${FAM_A}/photos/p2`), { ...photo, uploadedBy: ALICE.uid }))
  })

  it('lets anyone in the household remove any photo, but nobody outside it', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore() as unknown as Firestore, `families/${FAM_A}/photos/byAlice`), { storagePath: 'families/famA/photos/a.jpg', uploadedBy: ALICE.uid, caption: '' })
    })
    await assertFails(deleteDoc(doc(dbFor(MALLORY), `families/${FAM_A}/photos/byAlice`)))
    // Bob is neither the uploader nor the owner.
    await assertSucceeds(deleteDoc(doc(dbFor(BOB), `families/${FAM_A}/photos/byAlice`)))
  })
})

describe('family settings', () => {
  const display = (db: Firestore) => doc(db, `families/${FAM_A}/settings/display`)
  const lock = (db: Firestore) => doc(db, `families/${FAM_A}/settings/lock`)

  it('lets any member read and write display settings', async () => {
    await assertSucceeds(
      setDoc(display(dbFor(BOB)), {
        calendarName: 'Smith Family',
        weekStartsOn: 1,
        showCountdowns: 'always',
        colorCodeMultiProfile: true,
        shadeWeekends: false,
        dimPastEvents: true,
        weekStartToday: false,
        monthStartCurrentWeek: true,
        scheduleDays: 7,
        scheduleStartToday: false,
        temperatureUnit: 'F',
        weatherLocation: { label: 'Atlanta, GA', lat: 33.7, lon: -84.4 },
        textSize: 'small',
        density: 'cozy',
        remindAtStart: false,
        remindBeforeEnabled: true,
        remindBeforeMinutes: 30,
        remindChoresDue: false,
        reminderSound: true,
        showPhotosTab: true,
      }),
    )
    await assertSucceeds(getDoc(display(dbFor(ALICE))))
    await assertSucceeds(updateDoc(display(dbFor(ALICE)), { shadeWeekends: true }))
  })

  it('rejects unknown keys and bad values', async () => {
    const db = dbFor(BOB)
    await assertFails(setDoc(display(db), { hacked: true }))
    await assertFails(setDoc(display(db), { weekStartsOn: 7 }))
    await assertFails(setDoc(display(db), { showCountdowns: 'sometimes' }))
    await assertFails(setDoc(display(db), { scheduleDays: 0 }))
    await assertFails(setDoc(display(db), { temperatureUnit: 'K' }))
    await assertFails(setDoc(display(db), { weatherLocation: { label: 'x', lat: 'north', lon: 1 } }))
    await assertFails(setDoc(display(db), { remindBeforeMinutes: -5 }))
    await assertFails(setDoc(doc(db, `families/${FAM_A}/settings/other`), { x: 1 }))
  })

  it('keeps settings inside the family and never deletable', async () => {
    await assertFails(getDoc(display(dbFor(MALLORY))))
    await assertFails(setDoc(display(dbFor(MALLORY)), { shadeWeekends: true }))
    await setDoc(display(dbFor(BOB)), { shadeWeekends: true })
    await assertFails(deleteDoc(display(dbFor(ALICE))))
  })

  it('validates the parental lock doc', async () => {
    await assertSucceeds(setDoc(lock(dbFor(BOB)), { enabled: true, pinHash: 'a'.repeat(64), salt: 'b'.repeat(32), lockAfterMinutes: 5 }))
    await assertFails(setDoc(lock(dbFor(BOB)), { enabled: true, pin: '1234' }))
    await assertFails(setDoc(lock(dbFor(BOB)), { enabled: 'yes' }))
  })
})

describe('events for multiple people', () => {
  it('accepts a manual event tagged with family members', async () => {
    await assertSucceeds(
      setDoc(doc(dbFor(BOB), `families/${FAM_A}/events/multi`), {
        source: 'manual',
        sourceUserId: BOB.uid,
        memberIds: [BOB.uid, ALICE.uid],
        title: 'Family dinner',
        start: Timestamp.fromDate(new Date('2026-10-01T22:00:00Z')),
        end: Timestamp.fromDate(new Date('2026-10-01T23:00:00Z')),
        allDay: false,
      }),
    )
    await assertFails(
      setDoc(doc(dbFor(BOB), `families/${FAM_A}/events/multi2`), {
        source: 'manual',
        sourceUserId: BOB.uid,
        memberIds: 'everyone',
        title: 'Bad',
        start: Timestamp.fromDate(new Date('2026-10-01T22:00:00Z')),
        end: Timestamp.fromDate(new Date('2026-10-01T23:00:00Z')),
        allDay: false,
      }),
    )
  })
})

describe('chore due times', () => {
  const chore = { title: 'Feed the dog', assigneeId: null, dueDate: '2026-10-01', done: false, points: 1 }

  it('accepts an optional HH:MM due time', async () => {
    await assertSucceeds(setDoc(doc(dbFor(BOB), `families/${FAM_A}/chores/t1`), { ...chore, dueTime: '07:30' }))
    await assertSucceeds(setDoc(doc(dbFor(BOB), `families/${FAM_A}/chores/t2`), { ...chore, dueTime: null }))
  })

  it('rejects malformed times', async () => {
    await assertFails(setDoc(doc(dbFor(BOB), `families/${FAM_A}/chores/t3`), { ...chore, dueTime: '7:30am' }))
    await assertFails(setDoc(doc(dbFor(BOB), `families/${FAM_A}/chores/t4`), { ...chore, dueTime: '25:00' }))
  })
})

describe('star ledger', () => {
  const entry = (over = {}) => ({ memberId: BOB.uid, delta: 3, reason: 'Chore: Dishes', choreId: 'c1', createdBy: BOB.uid, ...over })

  it('lets members credit and debit stars as themselves, and undo', async () => {
    const db = dbFor(BOB)
    await assertSucceeds(setDoc(doc(db, `families/${FAM_A}/stars/chore_c1`), entry()))
    await assertSucceeds(setDoc(doc(db, `families/${FAM_A}/stars/r1`), entry({ delta: -5, reason: 'Reward: Ice cream', choreId: null, rewardId: 'rw1' })))
    await assertSucceeds(getDocs(collection(db, `families/${FAM_A}/stars`)))
    await assertSucceeds(deleteDoc(doc(db, `families/${FAM_A}/stars/chore_c1`)))
  })

  it('rejects edits, forged authors, bad values, and other families', async () => {
    const db = dbFor(BOB)
    await setDoc(doc(db, `families/${FAM_A}/stars/s1`), entry())
    await assertFails(updateDoc(doc(db, `families/${FAM_A}/stars/s1`), { delta: 100 }))
    await assertFails(setDoc(doc(db, `families/${FAM_A}/stars/s2`), entry({ createdBy: ALICE.uid })))
    await assertFails(setDoc(doc(db, `families/${FAM_A}/stars/s3`), entry({ delta: 2.5 })))
    await assertFails(setDoc(doc(db, `families/${FAM_A}/stars/s4`), entry({ delta: 1_000_000 })))
    await assertFails(setDoc(doc(db, `families/${FAM_A}/stars/s5`), entry({ extra: 1 })))
    await assertFails(getDocs(collection(dbFor(MALLORY), `families/${FAM_A}/stars`)))
    await assertFails(setDoc(doc(dbFor(MALLORY), `families/${FAM_A}/stars/s6`), entry({ createdBy: MALLORY.uid })))
  })
})

describe('rewards', () => {
  const reward = { title: 'Ice cream trip', cost: 20, memberId: BOB.uid, emoji: '🍦' }

  it('lets members create, redeem, and delete rewards', async () => {
    const db = dbFor(BOB)
    await assertSucceeds(setDoc(doc(db, `families/${FAM_A}/rewards/rw1`), reward))
    await assertSucceeds(setDoc(doc(db, `families/${FAM_A}/rewards/rw2`), { ...reward, memberId: null }))
    await assertSucceeds(updateDoc(doc(db, `families/${FAM_A}/rewards/rw1`), { redeemedBy: BOB.uid, redeemedAt: Timestamp.now() }))
    await assertSucceeds(deleteDoc(doc(db, `families/${FAM_A}/rewards/rw2`)))
  })

  it('validates rewards and keeps them in the family', async () => {
    const db = dbFor(BOB)
    await assertFails(setDoc(doc(db, `families/${FAM_A}/rewards/x1`), { ...reward, cost: 0 }))
    await assertFails(setDoc(doc(db, `families/${FAM_A}/rewards/x2`), { ...reward, title: '' }))
    await assertFails(setDoc(doc(db, `families/${FAM_A}/rewards/x3`), { ...reward, hack: true }))
    await assertFails(setDoc(doc(dbFor(MALLORY), `families/${FAM_A}/rewards/x4`), reward))
  })
})

describe('appearance', () => {
  it('accepts a theme and a hex highlight color', async () => {
    const display = doc(dbFor(BOB), `families/${FAM_A}/settings/display`)
    await assertSucceeds(setDoc(display, { theme: 'dark', accentColor: '#2a6f97' }))
    await assertSucceeds(setDoc(display, { theme: 'system' }))
    await assertFails(setDoc(display, { theme: 'sepia' }))
    await assertFails(setDoc(display, { accentColor: 'blue' }))
  })

  it('requires person colors to be hex', async () => {
    const me = doc(dbFor(BOB), `families/${FAM_A}/members/${BOB.uid}`)
    await assertSucceeds(updateDoc(me, { color: '#A1B2C3' }))
    await assertFails(updateDoc(me, { color: 'red' }))
    await assertFails(updateDoc(me, { color: 'url(javascript:alert(1))' }))
  })
})

describe('cookbooks', () => {
  const book = { title: 'Salt Fat Acid Heat', format: 'pdf', storagePath: 'families/famA/cookbooks/bk1/original.pdf', sizeBytes: 1234, status: 'uploading', createdBy: BOB.uid }

  it('lets members add a book record for their own upload, and rename it', async () => {
    await assertSucceeds(setDoc(doc(dbFor(BOB), `families/${FAM_A}/cookbooks/bk1`), book))
    await assertSucceeds(updateDoc(doc(dbFor(ALICE), `families/${FAM_A}/cookbooks/bk1`), { title: 'SFAH' }))
    await assertSucceeds(getDocs(collection(dbFor(ALICE), `families/${FAM_A}/cookbooks`)))
  })

  it('keeps parse status, the file path, and deletion with the server', async () => {
    await assertFails(setDoc(doc(dbFor(BOB), `families/${FAM_A}/cookbooks/bk2`), { ...book, status: 'done' }))
    await assertFails(setDoc(doc(dbFor(BOB), `families/${FAM_A}/cookbooks/bk2`), { ...book, storagePath: 'families/famB/cookbooks/bk2/original.pdf' }))
    await assertFails(setDoc(doc(dbFor(BOB), `families/${FAM_A}/cookbooks/bk2`), { ...book, format: 'docx', storagePath: 'families/famA/cookbooks/bk2/original.docx' }))
    await assertFails(setDoc(doc(dbFor(BOB), `families/${FAM_A}/cookbooks/bk2`), { ...book, createdBy: ALICE.uid }))
    await assertSucceeds(setDoc(doc(dbFor(BOB), `families/${FAM_A}/cookbooks/bk1`), book))
    await assertFails(updateDoc(doc(dbFor(BOB), `families/${FAM_A}/cookbooks/bk1`), { status: 'done', recipeCount: 99 }))
    await assertFails(deleteDoc(doc(dbFor(BOB), `families/${FAM_A}/cookbooks/bk1`)))
    await assertFails(getDoc(doc(dbFor(BOB), `families/${FAM_A}/cookbooks/bk1/work/state`)))
  })

  it("keeps other families out", async () => {
    await assertFails(setDoc(doc(dbFor(MALLORY), `families/${FAM_A}/cookbooks/bk9`), { ...book, storagePath: 'families/famA/cookbooks/bk9/original.pdf', createdBy: MALLORY.uid }))
    await assertFails(getDocs(collection(dbFor(MALLORY), `families/${FAM_A}/cookbooks`)))
  })
})

describe('cooking sessions', () => {
  const session = { servings: 6, items: [0, 2], steps: [0], step: 1, startedBy: BOB.uid, expireAt: Timestamp.fromMillis(Date.now() + 86_400_000) }
  it('lets members share progress and clear it', async () => {
    const ref = (db: Firestore) => doc(db, `families/${FAM_A}/cookingSessions/r1`)
    await assertSucceeds(setDoc(ref(dbFor(BOB)), session))
    await assertSucceeds(getDoc(ref(dbFor(ALICE))))
    await assertSucceeds(setDoc(ref(dbFor(ALICE)), { ...session, startedBy: ALICE.uid, items: [0, 1, 2] }))
    await assertSucceeds(deleteDoc(ref(dbFor(ALICE))))
  })
  it('checks the shape and keeps other families out', async () => {
    const ref = (db: Firestore) => doc(db, `families/${FAM_A}/cookingSessions/r2`)
    await assertFails(setDoc(ref(dbFor(BOB)), { ...session, startedBy: ALICE.uid }))
    await assertFails(setDoc(ref(dbFor(BOB)), { ...session, items: 'all' }))
    await assertFails(setDoc(ref(dbFor(BOB)), { ...session, notes: 'x' }))
    await assertFails(setDoc(ref(dbFor(MALLORY)), { ...session, startedBy: MALLORY.uid }))
    await assertFails(getDoc(ref(dbFor(MALLORY))))
  })
})

describe('kitchen settings', () => {
  it('lets members keep pantry staples and recipe sites, and nothing else', async () => {
    const kitchen = (db: Firestore) => doc(db, `families/${FAM_A}/settings/kitchen`)
    await assertSucceeds(setDoc(kitchen(dbFor(BOB)), { staples: ['salt', 'butter'], sites: ['seriouseats.com'] }))
    await assertSucceeds(getDoc(kitchen(dbFor(ALICE))))
    await assertFails(setDoc(kitchen(dbFor(BOB)), { staples: 'salt', sites: [] }))
    await assertFails(setDoc(kitchen(dbFor(BOB)), { staples: [], sites: [], braveKey: 'x' }))
    await assertFails(setDoc(kitchen(dbFor(BOB)), { staples: [], sites: Array.from({ length: 31 }, (_, i) => `s${i}.com`) }))
    await assertFails(getDoc(kitchen(dbFor(MALLORY))))
  })

  it('keeps the search cache and usage counter server-only', async () => {
    await assertFails(getDoc(doc(dbFor(BOB), 'webCache/q_1')))
    await assertFails(setDoc(doc(dbFor(BOB), 'apiUsage/brave_2026-10'), { count: 0 }))
  })
})

describe('recipe index', () => {
  it('is readable by members and written only by the server', async () => {
    await assertSucceeds(getDocs(collection(dbFor(BOB), `families/${FAM_A}/recipeIndex`)))
    await assertFails(setDoc(doc(dbFor(BOB), `families/${FAM_A}/recipeIndex/s0`), { e: {} }))
    await assertFails(getDocs(collection(dbFor(MALLORY), `families/${FAM_A}/recipeIndex`)))
  })

  it('keeps the import politeness records server-only', async () => {
    await assertFails(getDoc(doc(dbFor(BOB), 'crawlHosts/example.com')))
    await assertFails(setDoc(doc(dbFor(BOB), 'crawlHosts/example.com'), { lastAt: 0 }))
  })
})

describe('recipes', () => {
  it('accept structured fields from cookbooks, and review edits', async () => {
    const parsed = {
      title: 'Banana Bread', ingredients: '3 bananas', steps: 'Bake.', createdBy: BOB.uid,
      source: { type: 'cookbook', bookId: 'bk1', bookTitle: 'Baking', location: 'p. 7' },
      items: [{ raw: '3 bananas', qty: 3, qtyMax: null, unit: null, name: 'bananas', note: '', key: 'banana', family: 'banana', known: true }],
      stepList: ['Bake.'], confidence: 0.5, needsReview: true, edited: false, favorite: false, yieldText: null,
      notes: 'Freezes well.', credit: 'Grandma',
    }
    await assertSucceeds(setDoc(doc(dbFor(BOB), `families/${FAM_A}/recipes/ck_1`), parsed))
    await assertSucceeds(updateDoc(doc(dbFor(ALICE), `families/${FAM_A}/recipes/ck_1`), { needsReview: false, edited: true, title: 'Grandma’s Banana Bread' }))
    await assertFails(setDoc(doc(dbFor(BOB), `families/${FAM_A}/recipes/ck_2`), { ...parsed, source: { type: 'scraped' } }))
    await assertFails(setDoc(doc(dbFor(BOB), `families/${FAM_A}/recipes/ck_3`), { ...parsed, needsReview: 'yes' }))
    await assertFails(setDoc(doc(dbFor(BOB), `families/${FAM_A}/recipes/ck_4`), { ...parsed, items: 'lots' }))
    await assertFails(setDoc(doc(dbFor(BOB), `families/${FAM_A}/recipes/ck_5`), { ...parsed, notes: 'x'.repeat(2001) }))
    // Favorites and hand-edited tags.
    await assertSucceeds(updateDoc(doc(dbFor(ALICE), `families/${FAM_A}/recipes/ck_1`), { favorite: true, tags: { meal: ['dinner'], cuisine: [], main: [], diet: [] }, tagsEdited: true }))
    await assertFails(updateDoc(doc(dbFor(ALICE), `families/${FAM_A}/recipes/ck_1`), { tags: 'dinner' }))
  })

  const recipe = {
    title: 'Chicken tacos',
    servings: 4,
    minutes: 30,
    ingredients: '1 lb chicken\n8 tortillas\n1 lime',
    steps: 'Season chicken.\nCook 12 minutes.\nServe.',
    url: 'https://example.com/tacos',
    createdBy: BOB.uid,
  }

  it('lets members save, edit, and delete recipes', async () => {
    const db = dbFor(BOB)
    await assertSucceeds(setDoc(doc(db, `families/${FAM_A}/recipes/r1`), recipe))
    await assertSucceeds(updateDoc(doc(db, `families/${FAM_A}/recipes/r1`), { servings: 6 }))
    await assertSucceeds(setDoc(doc(db, `families/${FAM_A}/recipes/r2`), { title: 'Toast', ingredients: '', steps: '', createdBy: BOB.uid }))
    await assertSucceeds(getDocs(collection(db, `families/${FAM_A}/recipes`)))
    await assertSucceeds(deleteDoc(doc(db, `families/${FAM_A}/recipes/r2`)))
  })

  it('validates recipes and keeps them in the family', async () => {
    const db = dbFor(BOB)
    await assertFails(setDoc(doc(db, `families/${FAM_A}/recipes/x1`), { ...recipe, title: '' }))
    await assertFails(setDoc(doc(db, `families/${FAM_A}/recipes/x2`), { ...recipe, url: 'javascript:alert(1)' }))
    await assertFails(setDoc(doc(db, `families/${FAM_A}/recipes/x3`), { ...recipe, servings: -2 }))
    await assertFails(setDoc(doc(db, `families/${FAM_A}/recipes/x4`), { ...recipe, extra: 1 }))
    await assertFails(getDocs(collection(dbFor(MALLORY), `families/${FAM_A}/recipes`)))
  })
})

describe('synced calendars', () => {
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore() as unknown as Firestore
      await setDoc(doc(db, `families/${FAM_A}/calendars/bob_work`), {
        ownerId: BOB.uid,
        calendarId: 'work123@group.calendar.google.com',
        name: 'Work',
        googleColor: '#9e69af',
        color: '#9e69af',
        enabled: true,
        primary: false,
        memberIds: [BOB.uid],
      })
    })
  })

  it('lets family members see everyone’s calendar list', async () => {
    await assertSucceeds(getDocs(collection(dbFor(ALICE), `families/${FAM_A}/calendars`)))
    await assertFails(getDocs(collection(dbFor(MALLORY), `families/${FAM_A}/calendars`)))
  })

  it('lets the owner hide, recolor, rename, and share their calendar', async () => {
    const ref = doc(dbFor(BOB), `families/${FAM_A}/calendars/bob_work`)
    await assertSucceeds(updateDoc(ref, { enabled: false }))
    await assertSucceeds(updateDoc(ref, { color: '#0f766e', alias: 'Office' }))
    await assertSucceeds(updateDoc(ref, { memberIds: [BOB.uid, ALICE.uid] }))
  })

  it('blocks everything else', async () => {
    const mine = doc(dbFor(BOB), `families/${FAM_A}/calendars/bob_work`)
    await assertFails(updateDoc(mine, { calendarId: 'other' }))
    await assertFails(updateDoc(mine, { color: 'purple' }))
    await assertFails(updateDoc(mine, { memberIds: 'everyone' }))
    await assertFails(updateDoc(doc(dbFor(ALICE), `families/${FAM_A}/calendars/bob_work`), { enabled: false }))
    await assertFails(setDoc(doc(dbFor(BOB), `families/${FAM_A}/calendars/fake`), { ownerId: BOB.uid, calendarId: 'x', name: 'x', enabled: true }))
    await assertFails(deleteDoc(mine))
  })

  it('accepts the colorEventsBy display setting', async () => {
    const display = doc(dbFor(BOB), `families/${FAM_A}/settings/display`)
    await assertSucceeds(setDoc(display, { colorEventsBy: 'calendar' }))
    await assertFails(setDoc(display, { colorEventsBy: 'mood' }))
  })
})

describe('photo records and screensaver settings', () => {
  const photo = {
    storagePath: `families/${FAM_A}/photos/p9.jpg`,
    url: 'https://firebasestorage.googleapis.com/v0/b/x/o/p9.jpg?alt=media&token=t',
    kind: 'image',
    width: 2048,
    height: 1536,
    caption: 'Lake weekend',
    uploadedBy: BOB.uid,
  }

  it('accepts a described photo or video and caption edits by the uploader', async () => {
    const db = dbFor(BOB)
    await assertSucceeds(setDoc(doc(db, `families/${FAM_A}/photos/p9`), photo))
    await assertSucceeds(setDoc(doc(db, `families/${FAM_A}/photos/v9`), { ...photo, kind: 'video', storagePath: `families/${FAM_A}/photos/v9.mp4` }))
    await assertSucceeds(updateDoc(doc(db, `families/${FAM_A}/photos/p9`), { caption: 'Lake weekend 2026' }))
  })

  it('rejects files outside the family folder, odd kinds, and extra fields', async () => {
    const db = dbFor(BOB)
    await assertFails(setDoc(doc(db, `families/${FAM_A}/photos/x1`), { ...photo, storagePath: 'families/famB/photos/p.jpg' }))
    await assertFails(setDoc(doc(db, `families/${FAM_A}/photos/x2`), { ...photo, kind: 'audio' }))
    await assertFails(setDoc(doc(db, `families/${FAM_A}/photos/x3`), { ...photo, caption: 'x'.repeat(201) }))
    await assertFails(setDoc(doc(db, `families/${FAM_A}/photos/x4`), { ...photo, hack: true }))
  })

  it('accepts screensaver settings', async () => {
    const display = doc(dbFor(BOB), `families/${FAM_A}/settings/display`)
    await assertSucceeds(setDoc(display, { screensaverEnabled: true, screensaverAfterMinutes: 5, screensaverSeconds: 12, screensaverShuffle: true }))
    await assertFails(setDoc(display, { screensaverAfterMinutes: 0 }))
    await assertFails(setDoc(display, { screensaverSeconds: 1 }))
  })
})

describe('side bar settings', () => {
  const display = (db: Firestore) => doc(db, `families/${FAM_A}/settings/display`)

  it('accepts hidden sections per device type', async () => {
    await assertSucceeds(setDoc(display(dbFor(BOB)), { hiddenTabs: { phone: ['rewards', 'recipes'], tablet: [], desktop: ['photos'] } }, { merge: true }))
  })

  it('rejects unknown device types, non-lists, and oversized lists', async () => {
    await assertFails(setDoc(display(dbFor(BOB)), { hiddenTabs: { watch: [] } }, { merge: true }))
    await assertFails(setDoc(display(dbFor(BOB)), { hiddenTabs: { phone: 'rewards' } }, { merge: true }))
    await assertFails(setDoc(display(dbFor(BOB)), { hiddenTabs: { phone: Array.from({ length: 13 }, (_, i) => `t${i}`) } }, { merge: true }))
    await assertFails(setDoc(display(dbFor(BOB)), { hiddenTabs: ['phone'] }, { merge: true }))
    await assertSucceeds(setDoc(display(dbFor(BOB)), { homePanels: { tablet: ['lists', 'tasks', 'calendar'], phone: ['tasks'] } }, { merge: true }))
    await assertFails(setDoc(display(dbFor(BOB)), { homePanels: { tv: [] } }, { merge: true }))
  })
})

describe('sleep mode settings', () => {
  it('accepts an on/off switch and HH:MM times', async () => {
    const display = doc(dbFor(BOB), `families/${FAM_A}/settings/display`)
    await assertSucceeds(setDoc(display, { sleepEnabled: true, sleepFrom: '21:00', sleepTo: '06:00' }))
    await assertFails(setDoc(display, { sleepFrom: '9pm' }))
    await assertFails(setDoc(display, { sleepTo: '24:00' }))
    await assertFails(setDoc(display, { sleepEnabled: 'yes' }))
  })
})

describe('lists', () => {
  const list = { title: 'Grocery List', kind: 'grocery', sections: false, order: 0, createdBy: BOB.uid }
  const item = { text: 'Milk', done: false, memberId: null, order: 1, createdBy: BOB.uid }

  it('lets members manage lists and their items', async () => {
    const db = dbFor(BOB)
    await assertSucceeds(setDoc(doc(db, `families/${FAM_A}/lists/l1`), list))
    await assertSucceeds(setDoc(doc(db, `families/${FAM_A}/lists/l1/items/i1`), item))
    await assertSucceeds(setDoc(doc(db, `families/${FAM_A}/lists/l1/items/i2`), { ...item, text: 'Hem dress', memberId: ALICE.uid }))
    await assertSucceeds(updateDoc(doc(db, `families/${FAM_A}/lists/l1/items/i1`), { done: true, doneAt: Timestamp.now(), expireAt: Timestamp.fromMillis(Date.now() + 30 * 86_400_000) }))
    // Categories inside a list, and editing / filing an item.
    await assertSucceeds(updateDoc(doc(db, `families/${FAM_A}/lists/l1`), { categories: [{ id: 'p', name: 'Produce' }] }))
    await assertSucceeds(updateDoc(doc(db, `families/${FAM_A}/lists/l1/items/i2`), { text: 'Hem the blue dress', categoryId: 'p', updatedAt: Timestamp.now() }))
    await assertFails(updateDoc(doc(db, `families/${FAM_A}/lists/l1/items/i2`), { categoryId: 7 }))
    await assertFails(updateDoc(doc(db, `families/${FAM_A}/lists/l1/items/i2`), { expireAt: 'soon' }))
    await assertFails(updateDoc(doc(db, `families/${FAM_A}/lists/l1`), { categories: 'Produce' }))
    await assertSucceeds(updateDoc(doc(db, `families/${FAM_A}/lists/l1`), { title: 'Groceries', sections: true }))
    await assertSucceeds(getDocs(collection(dbFor(ALICE), `families/${FAM_A}/lists/l1/items`)))
    await assertSucceeds(deleteDoc(doc(db, `families/${FAM_A}/lists/l1/items/i1`)))
    await assertSucceeds(deleteDoc(doc(db, `families/${FAM_A}/lists/l1`)))
  })

  it('validates lists and items and keeps them in the family', async () => {
    const db = dbFor(BOB)
    await assertFails(setDoc(doc(db, `families/${FAM_A}/lists/x1`), { ...list, title: '' }))
    await assertFails(setDoc(doc(db, `families/${FAM_A}/lists/x2`), { ...list, kind: 'secret' }))
    await setDoc(doc(db, `families/${FAM_A}/lists/l2`), list)
    await assertFails(setDoc(doc(db, `families/${FAM_A}/lists/l2/items/x3`), { ...item, text: '' }))
    await assertFails(setDoc(doc(db, `families/${FAM_A}/lists/l2/items/x4`), { ...item, text: 'x'.repeat(301) }))
    await assertFails(setDoc(doc(db, `families/${FAM_A}/lists/l2/items/x5`), { ...item, done: 'yes' }))
    await assertFails(setDoc(doc(db, `families/${FAM_A}/lists/l2/items/x6`), { ...item, extra: 1 }))
    await assertFails(getDocs(collection(dbFor(MALLORY), `families/${FAM_A}/lists`)))
    await assertFails(getDocs(collection(dbFor(MALLORY), `families/${FAM_A}/lists/l2/items`)))
    await assertFails(setDoc(doc(dbFor(MALLORY), `families/${FAM_A}/lists/l2/items/x7`), { ...item, createdBy: MALLORY.uid }))
  })
})

describe('repeating chores', () => {
  const base = { title: 'Water the plants', assigneeId: null, dueDate: '2026-09-28', dueTime: '08:00', done: false, points: 2 }

  it('accepts a repeat rule, per-day completions, and who did an up-for-grabs chore', async () => {
    const db = dbFor(BOB)
    const ref = doc(db, `families/${FAM_A}/chores/r1`)
    await assertSucceeds(setDoc(ref, { ...base, repeat: { freq: 'weekly', interval: 1, days: [0, 3] } }))
    await assertSucceeds(updateDoc(ref, { completions: { '2026-09-28': BOB.uid } }))
    await assertSucceeds(setDoc(doc(db, `families/${FAM_A}/chores/r2`), { ...base, repeat: { freq: 'daily', interval: 1 } }))
    await assertSucceeds(setDoc(doc(db, `families/${FAM_A}/chores/o1`), { ...base, done: true, doneBy: ALICE.uid }))
  })

  it('rejects malformed repeat rules', async () => {
    const db = dbFor(BOB)
    await assertFails(setDoc(doc(db, `families/${FAM_A}/chores/x1`), { ...base, repeat: { freq: 'hourly', interval: 1 } }))
    await assertFails(setDoc(doc(db, `families/${FAM_A}/chores/x2`), { ...base, repeat: { freq: 'daily', interval: 0 } }))
    await assertFails(setDoc(doc(db, `families/${FAM_A}/chores/x3`), { ...base, repeat: { freq: 'weekly', interval: 1, days: 'mon' } }))
    await assertFails(setDoc(doc(db, `families/${FAM_A}/chores/x4`), { ...base, completions: 'yesterday' }))
  })
})
