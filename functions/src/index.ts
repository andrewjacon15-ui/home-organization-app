import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/https'
import * as logger from 'firebase-functions/logger'
import { defineSecret } from 'firebase-functions/params'
import { onDocumentWritten } from 'firebase-functions/firestore'
import { setGlobalOptions } from 'firebase-functions/options'
import { onSchedule } from 'firebase-functions/scheduler'
import { getStorage } from 'firebase-admin/storage'
import * as calendar from './calendar.js'
import * as cookbooks from './cookbooks.js'
import * as feeds from './feeds.js'
import { firestoreCookbookStore, storageBookFiles } from './cookbookStore.js'
import { googleApi } from './google.js'
import * as reminders from './reminders.js'
import { firestoreReminderStore, gmailMailer } from './reminderStore.js'
import * as recipeIndex from './recipeIndex.js'
import { INDEX_VERSION } from './shared/recipes/catalogIndex.js'
import { firestoreFeedStore, firestoreStore } from './store.js'
import { nodeHttpGet } from './web/fetcher.js'
import * as webRecipes from './webRecipes.js'
import { ONLINE_SEARCH } from './shared/features.js'
import * as onlineSearch from './onlineSearch.js'
import { firestoreHostStore, firestoreSearchStore, firestoreWebRecipeStore } from './webStore.js'

initializeApp()

// Cost guard: a household needs one or two instances of anything, so no function may scale
// past three (unless it sets its own, smaller-or-similar cap), and none keeps an instance warm
// (minInstances stays unset: idle costs nothing). scripts/check-costs.mjs enforces this in CI.
setGlobalOptions({ maxInstances: 3 })

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
    // Calendar links ride along on this job (Cloud Scheduler's 3 free jobs are all in use).
    const links = await feeds.syncAllFeeds({ ...feedDeps(), log: (msg, extra) => logger.warn(msg, extra) })
    logger.info('calendar sync done', { ...result, links })
  },
)

const feedDeps = () => ({ store: firestoreFeedStore(getFirestore()), fetchFeed: feeds.httpFeedFetch })

/** Calendar links (.ics / webcal): add, refresh now, remove. No secrets needed. */
function feedCallable<T>(handler: (req: CallableRequest) => Promise<T>) {
  return onCall({ invoker: 'public', timeoutSeconds: 60 }, async (req) => {
    try {
      return await handler(req)
    } catch (err) {
      if (err instanceof calendar.CalendarError) throw new HttpsError(err.code, err.message)
      logger.warn('calendar link failed', { error: String(err), uid: req.auth?.uid })
      throw new HttpsError('unavailable', 'Couldn’t reach that calendar link. Check it opens in a browser, then try again.')
    }
  })
}

export const addCalendarFeed = feedCallable((req) => feeds.addFeed(feedDeps(), req.auth?.uid, req.data ?? {}))
export const refreshCalendarFeed = feedCallable((req) => feeds.refreshFeed(feedDeps(), req.auth?.uid, req.data ?? {}))
export const removeCalendarFeed = feedCallable((req) => feeds.removeFeed(feedDeps(), req.auth?.uid, req.data ?? {}))

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

// ---------------------------------------------------------------------------
// Recipe catalog: import from a link, and the compact index the app browses.

export const importRecipeUrl = onCall({ invoker: 'public', timeoutSeconds: 60, memory: '512MiB' }, async (req) => {
  const db = getFirestore()
  try {
    return await webRecipes.importRecipeUrl({ store: firestoreWebRecipeStore(db), fetcher: { get: nodeHttpGet, hosts: firestoreHostStore(db) } }, req.auth?.uid, req.data ?? {})
  } catch (err) {
    if (err instanceof webRecipes.ImportError) throw new HttpsError(err.code, err.message)
    logger.error('importRecipeUrl failed', { error: String((err as Error)?.stack ?? err), uid: req.auth?.uid })
    throw new HttpsError('internal', "Couldn't import that recipe. Please try again.")
  }
})

/** Every recipe write updates its one-line entry in the index (skipped when nothing it shows changed). */
export const indexRecipe = onDocumentWritten({ document: 'families/{familyId}/recipes/{recipeId}', maxInstances: 5 }, async (event) => {
  const change = recipeIndex.indexChange(event.data?.before.data() ?? null, event.data?.after.data() ?? null)
  await recipeIndex.applyIndexChange(getFirestore(), event.params.familyId, event.params.recipeId, change)
})

/** Builds the index once for a family that predates it (or after its format changes). */
export const recipeIndexRebuild = onCall({ invoker: 'public', timeoutSeconds: 120 }, async (req) => {
  const db = getFirestore()
  const uid = req.auth?.uid
  const familyId = (req.data ?? {}).familyId
  if (!uid) throw new HttpsError('permission-denied', 'Sign in first.')
  if (typeof familyId !== 'string' || !familyId || familyId.length > 100) throw new HttpsError('invalid-argument', 'familyId is required.')
  if (!(await db.doc(`families/${familyId}/members/${uid}`).get()).exists) throw new HttpsError('permission-denied', 'Not a member of this family.')
  const meta = await db.doc(`families/${familyId}/recipeIndex/meta`).get()
  if ((meta.get('v') ?? 0) >= INDEX_VERSION) return { rebuilt: false }
  return { rebuilt: true, count: await recipeIndex.rebuildIndex(db, familyId) }
})

// ---------------------------------------------------------------------------
// "What can I make?" → Online (Brave Search). Off until ONLINE_SEARCH is true in features.ts AND
// the BRAVE_SEARCH_API_KEY secret exists: Firebase checks every declared secret on each deploy,
// so the secret is only declared when the feature is on. While off, the app says online search
// isn't set up and catalog matching still works.

const braveKey = ONLINE_SEARCH ? defineSecret('BRAVE_SEARCH_API_KEY') : null

const onlineHandler = onCall({ invoker: 'public', timeoutSeconds: 90, memory: '512MiB', secrets: braveKey ? [braveKey] : [], maxInstances: 3 }, async (req) => {
  const db = getFirestore()
  const key = braveKey?.value()
  try {
    return await onlineSearch.findOnlineRecipes(
      { store: firestoreSearchStore(db), fetcher: { get: nodeHttpGet, hosts: firestoreHostStore(db) }, search: key ? onlineSearch.braveSearch(key) : null },
      req.auth?.uid,
      req.data ?? {},
    )
  } catch (err) {
    if (err instanceof onlineSearch.SearchError) throw new HttpsError(err.code, err.message)
    logger.error('findOnlineRecipes failed', { error: String((err as Error)?.stack ?? err), uid: req.auth?.uid })
    throw new HttpsError('internal', "Online search didn't work. Please try again.")
  }
})

/** Only registered (and deployed) when the feature is on. */
export const findOnlineRecipes = ONLINE_SEARCH ? onlineHandler : undefined
