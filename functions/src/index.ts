import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/https'
import * as logger from 'firebase-functions/logger'
import { defineSecret } from 'firebase-functions/params'
import { onSchedule } from 'firebase-functions/scheduler'
import * as calendar from './calendar.js'
import { googleApi } from './google.js'
import * as reminders from './reminders.js'
import { firestoreReminderStore, gmailMailer } from './reminderStore.js'
import { firestoreStore } from './store.js'

initializeApp()

/** The "Calendar connect" OAuth client. The ID is public; the secret lives in Secret Manager. */
export const GOOGLE_CLIENT_ID = '254203364485-vj57g7ocoo1p7qen3nttc61vusrsg44c.apps.googleusercontent.com'
const clientSecret = defineSecret('GOOGLE_OAUTH_CLIENT_SECRET')

const deps = () => ({
  store: firestoreStore(getFirestore()),
  google: googleApi(GOOGLE_CLIENT_ID, clientSecret.value()),
})

/** Turns our errors into the callable protocol's errors; logs anything unexpected. */
function callable<T>(handler: (req: CallableRequest) => Promise<T>) {
  // invoker: 'public' makes every deploy (not just the first create) let browsers reach
  // the function; the handlers do their own auth checks. Without it, a retried deploy
  // left connectCalendar returning Google's 403 page, which the SDK reports as "internal [0]".
  return onCall({ secrets: [clientSecret], invoker: 'public' }, async (req) => {
    try {
      return await handler(req)
    } catch (err) {
      if (err instanceof calendar.CalendarError) throw new HttpsError(err.code, err.message)
      if (calendar.isInvalidGrant(err)) throw new HttpsError('failed-precondition', 'Google rejected the sign-in. Please try connecting again.')
      const detail = calendar.googleErrorDetail(err)
      logger.error('calendar callable failed', { error: detail, uid: req.auth?.uid })
      throw new HttpsError('internal', `Google Calendar error: ${detail}`)
    }
  })
}

export const connectCalendar = callable((req) => calendar.connectCalendar(deps(), req.auth?.uid, req.data ?? {}))
export const syncMyCalendar = callable((req) => calendar.syncMine(deps(), req.auth?.uid, req.data ?? {}))
export const disconnectCalendar = callable((req) => calendar.disconnectCalendar(deps(), req.auth?.uid, req.data ?? {}))

export const syncCalendars = onSchedule(
  { schedule: 'every 15 minutes', secrets: [clientSecret], timeoutSeconds: 300 },
  async () => {
    const result = await calendar.syncAll({ ...deps(), log: (msg, extra) => logger.warn(msg, extra) })
    logger.info('calendar sync done', result)
  },
)

/** Gmail account the reminder emails come from, and an app password for it (both in Secret Manager). */
const gmailAddress = defineSecret('GMAIL_ADDRESS')
const gmailAppPassword = defineSecret('GMAIL_APP_PASSWORD')

export const sendReminderEmails = onSchedule(
  { schedule: 'every 5 minutes', secrets: [gmailAddress, gmailAppPassword], timeoutSeconds: 120, retryCount: 0 },
  async () => {
    const result = await reminders.sendDueEmails({
      store: firestoreReminderStore(getFirestore()),
      mailer: await gmailMailer(gmailAddress.value(), gmailAppPassword.value()),
      log: (msg, extra) => logger.warn(msg, extra),
    })
    if (result.eventEmails || result.digests || result.failures) logger.info('reminder emails sent', result)
  },
)
