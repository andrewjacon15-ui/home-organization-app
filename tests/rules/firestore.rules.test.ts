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
})

describe('photos', () => {
  it('lets members add photos as themselves and only the uploader or owner delete', async () => {
    const photo = { storagePath: 'families/famA/photos/p1.jpg', uploadedBy: BOB.uid, caption: '', createdAt: 1 }
    await assertSucceeds(setDoc(doc(dbFor(BOB), `families/${FAM_A}/photos/p1`), photo))
    await assertFails(setDoc(doc(dbFor(BOB), `families/${FAM_A}/photos/p2`), { ...photo, uploadedBy: ALICE.uid }))
    await assertSucceeds(deleteDoc(doc(dbFor(ALICE), `families/${FAM_A}/photos/p1`)))
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
