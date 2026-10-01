import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/https'
import * as logger from 'firebase-functions/logger'
import { defineSecret } from 'firebase-functions/params'
import { onDocumentWritten } from 'firebase-functions/firestore'
import { onSchedule } from 'firebase-functions/scheduler'
import { getStorage } from 'firebase-admin/storage'
import * as calendar from './calendar.js'
import * as cookbooks from './cookbooks.js'
import { firestoreCookbookStore, storageBookFiles } from './cookbookStore.js'
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

// ---------------------------------------------------------------------------
// Cookbooks: upload in the app, parse here in resumable chunks (see cookbooks.ts).

const cookbookDeps = (): cookbooks.CookbookDeps => ({
  store: firestoreCookbookStore(getFirestore()),
  files: storageBookFiles(getStorage()),
  // The PDF/EPUB/OCR libraries load only when a book is actually being read.
  async open(format, data) {
    if (format === 'epub') return (await import('./books/epub.js')).openEpub(data)
    const [{ openPdf }, { ocrPng }] = await Promise.all([import('./books/pdf.js'), import('./books/ocr.js')])
    return openPdf(data, ocrPng)
  },
  log: (msg, extra) => logger.error(msg, extra),
})

function cookbookCallable<T>(handler: (req: CallableRequest) => Promise<T>) {
  return onCall({ invoker: 'public', timeoutSeconds: 120 }, async (req) => {
    try {
      return await handler(req)
    } catch (err) {
      if (err instanceof cookbooks.CookbookError) throw new HttpsError(err.code, err.message)
      logger.error('cookbook callable failed', { error: String((err as Error)?.stack ?? err), uid: req.auth?.uid })
      throw new HttpsError('internal', 'Something went wrong. Please try again.')
    }
  })
}

export const cookbookParse = cookbookCallable((req) => cookbooks.startParse(cookbookDeps(), req.auth?.uid, req.data ?? {}))
export const cookbookDelete = cookbookCallable((req) => cookbooks.deleteCookbook(cookbookDeps(), req.auth?.uid, req.data ?? {}))

/** Each write of a book's parse state that advances it runs the next chunk. */
export const processCookbook = onDocumentWritten(
  { document: 'families/{familyId}/cookbooks/{bookId}/work/state', memory: '2GiB', cpu: 1, timeoutSeconds: 540, maxInstances: 3 },
  async (event) => {
    const before = (event.data?.before.data() as cookbooks.ParseState | undefined) ?? null
    const after = (event.data?.after.data() as cookbooks.ParseState | undefined) ?? null
    if (!cookbooks.shouldProcess(before, after)) return
    await cookbooks.processChunk(cookbookDeps(), event.params.familyId, event.params.bookId, after!)
  },
)

/** Restarts any parse whose instance died mid-chunk. */
export const cookbookWatchdog = onSchedule({ schedule: 'every 15 minutes', timeoutSeconds: 120 }, async () => {
  const kicked = await cookbooks.kickStalled(cookbookDeps())
  if (kicked) logger.warn('restarted stalled cookbook parses', { kicked })
})
