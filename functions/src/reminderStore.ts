import { Timestamp, type Firestore } from 'firebase-admin/firestore'
import type { Mailer, ReminderChore, ReminderEvent, ReminderPrefs, ReminderStore } from './reminders.js'

const toDate = (v: unknown) => (v instanceof Timestamp ? v.toDate() : new Date(v as string))

/** Admin SDK implementation of what the reminder job reads and writes. */
export function firestoreReminderStore(db: Firestore): ReminderStore {
  const col = (familyId: string, name: string) => db.collection(`families/${familyId}/${name}`)
  return {
    async listFamilies() {
      const snap = await db.collection('families').get()
      return snap.docs.map((d) => ({ id: d.id, name: d.get('name') ?? '', timezone: d.get('timezone') }))
    },

    async listMembers(familyId) {
      const snap = await col(familyId, 'members').get()
      return snap.docs.map((d) => ({ id: d.id, displayName: d.get('displayName') ?? '', email: d.get('email') ?? '' }))
    },

    async listPrefs(familyId) {
      const snap = await col(familyId, 'reminderPrefs').get()
      return new Map(snap.docs.map((d) => [d.id, d.data() as ReminderPrefs]))
    },

    async listCalendarOwners(familyId) {
      const snap = await col(familyId, 'calendars').get()
      return new Map(snap.docs.map((d) => [d.id, (d.get('memberIds') as string[] | undefined) ?? []]))
    },

    async listEvents(familyId, from, to) {
      const snap = await col(familyId, 'events').where('start', '>=', from).where('start', '<', to).get()
      return snap.docs.map((d) => {
        const x = d.data()
        return {
          id: d.id,
          title: x.title ?? '(untitled)',
          start: toDate(x.start),
          end: toDate(x.end),
          allDay: !!x.allDay,
          startDate: x.startDate,
          endDate: x.endDate,
          location: x.location,
          sourceUserId: x.sourceUserId ?? x.createdBy ?? '',
          calendarKey: x.calendarKey,
          memberIds: x.memberIds,
        } satisfies ReminderEvent
      })
    },

    async listChores(familyId) {
      const snap = await col(familyId, 'chores').get()
      return snap.docs.map((d) => ({ ...(d.data() as Omit<ReminderChore, 'id'>), id: d.id }))
    },

    async getMeals(familyId, dateKey) {
      const snap = await col(familyId, 'mealPlans').doc(dateKey).get()
      return snap.exists ? (snap.data() as Record<string, string>) : null
    },

    async claim(familyId, key, expireAt) {
      try {
        // create() fails if the doc exists, which makes the claim atomic across overlapping runs.
        await col(familyId, 'emailLog').doc(key).create({ sentAt: Timestamp.now(), expireAt: Timestamp.fromDate(expireAt) })
        return true
      } catch (err) {
        if ((err as { code?: number }).code === 6) return false // ALREADY_EXISTS
        throw err
      }
    },
  }
}

/** Sends through Gmail with an app password (Google Account → Security → App passwords). */
export async function gmailMailer(address: string, appPassword: string): Promise<Mailer> {
  const { createTransport } = await import('nodemailer')
  const transport = createTransport({ service: 'gmail', auth: { user: address, pass: appPassword.replace(/\s+/g, '') } })
  return {
    async send(email) {
      await transport.sendMail({ from: { name: 'Family Organizer', address }, ...email })
    },
  }
}
