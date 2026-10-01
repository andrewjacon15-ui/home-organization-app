/**
 * Cookbook parsing, chunked and resumable. A book's parse state lives in
 * families/{f}/cookbooks/{b}/work/state; each chunk reads a few pages/chapters, saves the
 * recipes it finished, and writes the next cursor, which triggers the next chunk (index.ts).
 * A lease stops duplicate trigger deliveries from double-processing; a watchdog re-kicks
 * anything stalled (a crashed instance). All rule-based: see shared/recipes/.
 */
import { BookError, type BookReader } from './books/reader.js'
import { extractRecipes, REVIEW_THRESHOLD, type Block, type ExtractedRecipe } from './shared/recipes/extract.js'

export type BookStatus = 'uploading' | 'queued' | 'parsing' | 'done' | 'error'

export interface BookDoc {
  title: string
  author?: string | null
  format: 'epub' | 'pdf'
  storagePath: string
  coverPath?: string | null
  status: BookStatus
  progress?: { done: number; total: number; unit: 'chapters' | 'pages' } | null
  ocr?: boolean
  recipeCount?: number
  reviewCount?: number
  error?: string | null
  createdBy: string
}

export interface ParseState {
  runId: string
  phase: 'parsing' | 'done' | 'error'
  next: number
  total: number
  carry: Block[]
  ocr: boolean
  attempts: number
  kick: number
  lease: { next: number; until: number } | null
  updatedAt: number
}

export interface RecipeWrite {
  id: string
  data: Record<string, unknown>
}

export interface CookbookStore {
  isMember(familyId: string, uid: string): Promise<boolean>
  getBook(familyId: string, bookId: string): Promise<BookDoc | null>
  updateBook(familyId: string, bookId: string, changes: Partial<BookDoc>): Promise<void>
  getState(familyId: string, bookId: string): Promise<ParseState | null>
  /** Writing the state is what triggers the next chunk. */
  setState(familyId: string, bookId: string, state: ParseState): Promise<void>
  /** Atomically takes the lease for chunk `next`; null if someone else holds it or the run moved on. */
  claim(familyId: string, bookId: string, runId: string, next: number, until: number, now: number): Promise<ParseState | null>
  /** Of these recipe IDs, the ones the family has edited or favorited (re-parsing must not overwrite them). */
  keptRecipeIds(familyId: string, ids: string[]): Promise<Set<string>>
  writeRecipes(familyId: string, recipes: RecipeWrite[]): Promise<void>
  /** Removes a book's recipes, keeping edited/favorited ones when asked. Returns how many were removed. */
  deleteBookRecipes(familyId: string, bookId: string, keepEdited: boolean): Promise<number>
  countBookRecipes(familyId: string, bookId: string): Promise<{ total: number; review: number }>
  deleteBook(familyId: string, bookId: string): Promise<void>
  /** Books whose parse may have stalled (state 'parsing' not updated for a while). */
  listParsing(olderThan: number): Promise<{ familyId: string; bookId: string; state: ParseState }[]>
}

export interface BookFiles {
  read(path: string): Promise<Buffer>
  write(path: string, data: Buffer, contentType: string): Promise<void>
  remove(prefix: string): Promise<void>
}

export interface CookbookDeps {
  store: CookbookStore
  files: BookFiles
  open(format: 'epub' | 'pdf', data: Buffer): Promise<BookReader>
  now?: () => number
  newRunId?: () => string
  log?: (msg: string, extra?: object) => void
}

export class CookbookError extends Error {
  constructor(
    public code: 'permission-denied' | 'invalid-argument' | 'not-found' | 'failed-precondition',
    message: string,
  ) {
    super(message)
  }
}

/** Work per chunk: stays well inside the 9-minute trigger limit. */
const BUDGET_MS = 6 * 60_000
const MAX_TEXT_UNITS = 15
const MAX_OCR_UNITS = 3
const LEASE_MS = 9.5 * 60_000
/** Carried text that never reaches a new title (a huge index, say) is flushed past this size. */
const MAX_CARRY = 600
const MAX_ATTEMPTS = 3

async function requireMember(store: CookbookStore, familyId: unknown, uid: string | undefined): Promise<string> {
  if (!uid) throw new CookbookError('permission-denied', 'Sign in first.')
  if (typeof familyId !== 'string' || !familyId) throw new CookbookError('invalid-argument', 'familyId is required.')
  if (!(await store.isMember(familyId, uid))) throw new CookbookError('permission-denied', 'Not a member of this family.')
  return familyId
}

const str = (v: unknown, name: string): string => {
  if (typeof v !== 'string' || !v || v.length > 100) throw new CookbookError('invalid-argument', `${name} is required.`)
  return v
}

/** FNV-1a, base36: short stable IDs. */
export function hash(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193)
  return (h >>> 0).toString(36)
}

/** "BANANA BREAD" → "Banana Bread"; already mixed-case titles are left alone. */
export function tidyTitle(title: string): string {
  const t = title.replace(/\s+/g, ' ').trim()
  if (t !== t.toUpperCase() || !/[A-Z]/.test(t)) return t
  const small = new Set(['a', 'an', 'and', 'or', 'of', 'the', 'with', 'in', 'on', 'for', 'to'])
  return t
    .toLowerCase()
    .split(' ')
    .map((w, i) => (i > 0 && small.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ')
}

const intIn = (v: number | null, lo: number, hi: number) => (v != null && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : null)

/** A recipe document for families/{f}/recipes. The ID is the dedupe key, so re-saving overwrites. */
export function toRecipeDoc(r: ExtractedRecipe, bookId: string, book: BookDoc, ocrBook: boolean): RecipeWrite {
  const title = tidyTitle(r.title).slice(0, 120)
  const id = `ck_${hash(`${bookId}|${title.toLowerCase()}|${r.items.slice(0, 3).map((i) => i.key).join(',')}`)}`
  const minutes = r.totalMinutes ?? (r.prepMinutes != null || r.cookMinutes != null ? (r.prepMinutes ?? 0) + (r.cookMinutes ?? 0) : null)
  const needsReview = r.confidence < REVIEW_THRESHOLD || (ocrBook && r.confidence < 0.75)
  return {
    id,
    data: {
      title,
      ingredients: r.ingredientLines.join('\n').slice(0, 5000),
      steps: r.steps.join('\n').slice(0, 10000),
      servings: intIn(r.servings, 1, 100),
      minutes: intIn(minutes, 0, 10000),
      url: null,
      source: { type: 'cookbook', bookId, bookTitle: book.title.slice(0, 200), location: r.loc?.slice(0, 120) ?? null },
      dedupeKey: id,
      yieldText: r.yieldText?.slice(0, 120) ?? null,
      prepMinutes: intIn(r.prepMinutes, 0, 10000),
      cookMinutes: intIn(r.cookMinutes, 0, 10000),
      totalMinutes: intIn(r.totalMinutes, 0, 10000),
      items: r.items.slice(0, 80).map((i) => ({
        raw: i.raw.slice(0, 300),
        qty: i.qty,
        qtyMax: i.qtyMax,
        unit: i.unit,
        name: i.name.slice(0, 120),
        note: i.note.slice(0, 200),
        key: i.key.slice(0, 80),
        family: i.family.slice(0, 80),
        known: i.known,
      })),
      stepList: r.steps.slice(0, 80).map((s) => s.slice(0, 2000)),
      confidence: r.confidence,
      needsReview,
      edited: false,
      favorite: false,
      createdBy: book.createdBy,
    },
  }
}

/** Callable: start (or redo) parsing a book. Re-parsing removes the book's recipes except edited/favorited ones. */
export async function startParse(deps: CookbookDeps, uid: string | undefined, data: { familyId?: unknown; bookId?: unknown }) {
  const familyId = await requireMember(deps.store, data.familyId, uid)
  const bookId = str(data.bookId, 'bookId')
  const book = await deps.store.getBook(familyId, bookId)
  if (!book) throw new CookbookError('not-found', 'That cookbook no longer exists.')
  const previous = await deps.store.getState(familyId, bookId)
  if (previous) await deps.store.deleteBookRecipes(familyId, bookId, true)
  const now = (deps.now ?? Date.now)()
  await deps.store.updateBook(familyId, bookId, { status: 'queued', progress: null, error: null, ocr: false })
  await deps.store.setState(familyId, bookId, {
    runId: (deps.newRunId ?? (() => `${now.toString(36)}${Math.random().toString(36).slice(2, 8)}`))(),
    phase: 'parsing',
    next: 0,
    total: 0,
    carry: [],
    ocr: false,
    attempts: 0,
    kick: 0,
    lease: null,
    updatedAt: now,
  })
  return { ok: true }
}

/** Callable: delete a book (file, cover, record), and optionally its recipes. */
export async function deleteCookbook(deps: CookbookDeps, uid: string | undefined, data: { familyId?: unknown; bookId?: unknown; removeRecipes?: unknown }) {
  const familyId = await requireMember(deps.store, data.familyId, uid)
  const bookId = str(data.bookId, 'bookId')
  const removed = data.removeRecipes === true ? await deps.store.deleteBookRecipes(familyId, bookId, false) : 0
  await deps.files.remove(`families/${familyId}/cookbooks/${bookId}/`)
  await deps.store.deleteBook(familyId, bookId)
  return { removedRecipes: removed }
}

let cached: { path: string; reader: Promise<BookReader> } | null = null

async function readerFor(deps: CookbookDeps, book: BookDoc): Promise<BookReader> {
  if (cached?.path !== book.storagePath) {
    const reader = deps.files.read(book.storagePath).then((data) => deps.open(book.format, data))
    cached = { path: book.storagePath, reader }
    reader.catch(() => {
      if (cached?.reader === reader) cached = null
    })
  }
  return cached.reader
}

/** For tests: forget the cached open book. */
export function resetReaderCache() {
  cached = null
}

/** One chunk of work, run by the state-document trigger. */
export async function processChunk(deps: CookbookDeps, familyId: string, bookId: string, state: ParseState): Promise<'busy' | 'continued' | 'done' | 'error' | 'gone'> {
  const now = deps.now ?? Date.now
  const started = now()
  const claimed = await deps.store.claim(familyId, bookId, state.runId, state.next, started + LEASE_MS, started)
  if (!claimed) return 'busy'
  const book = await deps.store.getBook(familyId, bookId)
  if (!book) return 'gone'

  const fail = async (message: string) => {
    await deps.store.updateBook(familyId, bookId, { status: 'error', error: message })
    await deps.store.setState(familyId, bookId, { ...claimed, phase: 'error', lease: null, updatedAt: now() })
    return 'error' as const
  }

  try {
    const reader = await readerFor(deps, book)
    let next = claimed.next
    if (next === 0) {
      // First chunk: fill in what the file knows about itself, and a cover.
      const changes: Partial<BookDoc> = { status: 'parsing', progress: { done: 0, total: reader.units, unit: reader.unitName } }
      if (reader.author && !book.author) changes.author = reader.author.slice(0, 200)
      const cover = await reader.cover().catch(() => null)
      if (cover) {
        const ext = cover.contentType.includes('png') ? 'png' : 'jpg'
        const path = `families/${familyId}/cookbooks/${bookId}/cover.${ext}`
        await deps.files.write(path, cover.data, cover.contentType)
        changes.coverPath = path
      }
      await deps.store.updateBook(familyId, bookId, changes)
    }

    const blocks: Block[] = [...claimed.carry]
    let ocr = claimed.ocr
    let textUnits = 0
    let ocrUnits = 0
    while (next < reader.units && textUnits < MAX_TEXT_UNITS && ocrUnits < MAX_OCR_UNITS && now() - started < BUDGET_MS) {
      const unit = await reader.readUnit(next)
      blocks.push(...unit.blocks)
      if (unit.ocr) {
        ocr = true
        ocrUnits++
      } else textUnits++
      next++
    }

    const final = next >= reader.units
    let { recipes, carry } = extractRecipes(blocks, final)
    if (carry.length > MAX_CARRY) {
      recipes = [...recipes, ...extractRecipes(carry, true).recipes]
      carry = []
    }
    const docs = recipes.map((r) => toRecipeDoc(r, bookId, book, ocr))
    const kept = await deps.store.keptRecipeIds(familyId, docs.map((d) => d.id))
    await deps.store.writeRecipes(familyId, docs.filter((d) => !kept.has(d.id)))

    if (final) {
      const counts = await deps.store.countBookRecipes(familyId, bookId)
      await deps.store.updateBook(familyId, bookId, {
        status: 'done',
        ocr,
        progress: { done: reader.units, total: reader.units, unit: reader.unitName },
        recipeCount: counts.total,
        reviewCount: counts.review,
        error: null,
      })
      await deps.store.setState(familyId, bookId, { ...claimed, phase: 'done', next, total: reader.units, carry: [], ocr, lease: null, updatedAt: now() })
      return 'done'
    }
    const counts = await deps.store.countBookRecipes(familyId, bookId)
    await deps.store.updateBook(familyId, bookId, {
      status: 'parsing',
      ocr,
      progress: { done: next, total: reader.units, unit: reader.unitName },
      recipeCount: counts.total,
      reviewCount: counts.review,
    })
    // Writing the advanced cursor triggers the next chunk.
    await deps.store.setState(familyId, bookId, { ...claimed, next, total: reader.units, carry, ocr, attempts: 0, lease: null, updatedAt: now() })
    return 'continued'
  } catch (err) {
    if (err instanceof BookError) return fail(err.message)
    deps.log?.('cookbook chunk failed', { familyId, bookId, next: claimed.next, error: String((err as Error)?.stack ?? err) })
    if (claimed.attempts + 1 >= MAX_ATTEMPTS) return fail("Something went wrong reading this book. Try re-parsing it; if it keeps failing, the file may be damaged.")
    // Release the lease and retry this chunk.
    await deps.store.setState(familyId, bookId, { ...claimed, attempts: claimed.attempts + 1, kick: claimed.kick + 1, lease: null, updatedAt: now() })
    return 'continued'
  }
}

/** Scheduled: re-kick parses whose instance died mid-chunk (lease expired, nothing written since). */
export async function kickStalled(deps: CookbookDeps): Promise<number> {
  const now = (deps.now ?? Date.now)()
  const stalled = await deps.store.listParsing(now - 12 * 60_000)
  for (const { familyId, bookId, state } of stalled) {
    if (state.lease && state.lease.until > now) continue
    await deps.store.setState(familyId, bookId, { ...state, kick: state.kick + 1, lease: null, updatedAt: now })
  }
  return stalled.length
}

/** True when a state write should start a chunk: a new cursor, a new run, or a kick (not lease bookkeeping). */
export function shouldProcess(before: ParseState | null, after: ParseState | null): boolean {
  if (!after || after.phase !== 'parsing' || after.lease) return false
  if (!before) return true
  return before.runId !== after.runId || before.next !== after.next || before.kick !== after.kick || before.phase !== after.phase
}
