import { beforeEach, describe, expect, it } from 'vitest'
import { openEpub } from './books/epub.js'
import { makeEpub, makeTwoColumnPdf } from './books/fixtures.js'
import { openPdf } from './books/pdf.js'
import { BookError, type BookReader } from './books/reader.js'
import {
  CookbookError,
  deleteCookbook,
  kickStalled,
  processChunk,
  resetReaderCache,
  shouldProcess,
  startParse,
  tidyTitle,
  type BookDoc,
  type CookbookDeps,
  type CookbookStore,
  type ParseState,
  type RecipeWrite,
} from './cookbooks.js'

const FAM = 'fam'
const ME = 'andrew'

class FakeStore implements CookbookStore {
  members = new Set([ME])
  books = new Map<string, BookDoc>()
  states = new Map<string, ParseState>()
  recipes = new Map<string, Record<string, unknown>>()
  writes = 0

  async isMember(_f: string, uid: string) {
    return this.members.has(uid)
  }
  async getBook(_f: string, b: string) {
    return this.books.get(b) ?? null
  }
  async updateBook(_f: string, b: string, changes: Partial<BookDoc>) {
    this.books.set(b, { ...this.books.get(b)!, ...changes })
  }
  async getState(_f: string, b: string) {
    return this.states.get(b) ?? null
  }
  async setState(_f: string, b: string, s: ParseState) {
    this.states.set(b, structuredClone(s))
  }
  async claim(_f: string, b: string, runId: string, next: number, until: number, now: number) {
    const s = this.states.get(b)
    if (!s || s.runId !== runId || s.next !== next || s.phase !== 'parsing' || (s.lease && s.lease.until > now)) return null
    const claimed = { ...s, lease: { next, until } }
    this.states.set(b, claimed)
    return structuredClone(claimed)
  }
  async keptRecipeIds(_f: string, ids: string[]) {
    return new Set(ids.filter((id) => this.recipes.get(id)?.edited || this.recipes.get(id)?.favorite))
  }
  async writeRecipes(_f: string, list: RecipeWrite[]) {
    this.writes += list.length
    for (const r of list) this.recipes.set(r.id, r.data)
  }
  async deleteBookRecipes(_f: string, bookId: string, keepEdited: boolean) {
    let n = 0
    for (const [id, r] of this.recipes) {
      if ((r.source as { bookId?: string })?.bookId !== bookId) continue
      if (keepEdited && (r.edited || r.favorite)) continue
      this.recipes.delete(id)
      n++
    }
    return n
  }
  async countBookRecipes(_f: string, bookId: string) {
    const mine = [...this.recipes.values()].filter((r) => (r.source as { bookId?: string })?.bookId === bookId)
    return { total: mine.length, review: mine.filter((r) => r.needsReview).length }
  }
  async deleteBook(_f: string, b: string) {
    this.books.delete(b)
    this.states.delete(b)
  }
  async listParsing(olderThan: number) {
    return [...this.states].filter(([, s]) => s.phase === 'parsing' && s.updatedAt < olderThan).map(([bookId, state]) => ({ familyId: FAM, bookId, state }))
  }
}

let store: FakeStore
let files: Map<string, Buffer>
let clock: number
let deps: CookbookDeps

beforeEach(() => {
  resetReaderCache()
  store = new FakeStore()
  files = new Map()
  clock = 1_000_000
  deps = {
    store,
    files: {
      read: async (p) => {
        const f = files.get(p)
        if (!f) throw new Error('missing file')
        return f
      },
      write: async (p, data) => void files.set(p, data),
      remove: async (prefix) => {
        for (const k of [...files.keys()]) if (k.startsWith(prefix)) files.delete(k)
      },
    },
    open: (format, data) => (format === 'epub' ? openEpub(data) : openPdf(data, async () => [])),
    now: () => clock,
    newRunId: () => 'run1',
  }
})

async function addBook(id: string, format: 'epub' | 'pdf', data: Buffer) {
  const storagePath = `families/${FAM}/cookbooks/${id}/original.${format}`
  files.set(storagePath, data)
  store.books.set(id, { title: 'Uploaded book', format, storagePath, status: 'uploading', createdBy: ME })
}

/** Runs chunks the way the trigger would, until the state stops asking for more. */
async function drain(bookId: string, max = 20) {
  let before: ParseState | null = null
  for (let i = 0; i < max; i++) {
    const after = store.states.get(bookId) ?? null
    if (!shouldProcess(before, after)) break
    before = structuredClone(after)
    await processChunk(deps, FAM, bookId, after!)
  }
}

describe('cookbook parsing', () => {
  it('parses an EPUB end to end: recipes saved with source, progress, counts, cover', async () => {
    await addBook('b1', 'epub', await makeEpub())
    await startParse(deps, ME, { familyId: FAM, bookId: 'b1' })
    expect(store.books.get('b1')?.status).toBe('queued')
    await drain('b1')

    const book = store.books.get('b1')!
    expect(book).toMatchObject({ status: 'done', recipeCount: 2, ocr: false, author: 'Test Cook', progress: { done: 2, total: 2, unit: 'chapters' } })
    expect(book.coverPath).toBe(`families/${FAM}/cookbooks/b1/cover.png`)
    const titles = [...store.recipes.values()].map((r) => r.title).sort()
    expect(titles).toEqual(['Banana Bread', 'Lemon Garlic Chicken'])
    const chicken = [...store.recipes.values()].find((r) => r.title === 'Lemon Garlic Chicken')!
    expect(chicken).toMatchObject({
      source: { type: 'cookbook', bookId: 'b1', bookTitle: 'Uploaded book', location: 'Weeknight Dinners' },
      servings: 4,
      minutes: 35,
      needsReview: false,
      edited: false,
    })
    // Meals and the grocery list still read the plain-text fields.
    expect(String(chicken.ingredients).split('\n')).toHaveLength(4)
    expect(String(chicken.steps).split('\n')).toHaveLength(3)
  })

  it('reads a PDF page by page', async () => {
    await addBook('p1', 'pdf', makeTwoColumnPdf())
    await startParse(deps, ME, { familyId: FAM, bookId: 'p1' })
    await drain('p1')
    expect(store.books.get('p1')).toMatchObject({ status: 'done', recipeCount: 1, progress: { unit: 'pages', total: 1 } })
  })

  it('works in chunks and resumes from the saved cursor', async () => {
    // A fake 40-page book: a recipe every 4 pages, one spanning a chunk boundary.
    const pages = Array.from({ length: 40 }, (_, i) =>
      i % 4 === 0
        ? [{ kind: 'heading' as const, text: `Recipe ${i / 4 + 1}` }, { kind: 'text' as const, text: '2 cups flour' }]
        : i % 4 === 1
          ? [{ kind: 'text' as const, text: '1 tsp salt' }, { kind: 'text' as const, text: '3 eggs' }]
          : i % 4 === 2
            ? [{ kind: 'text' as const, text: 'Mix everything together and bake for half an hour.' }]
            : [{ kind: 'text' as const, text: 'Serve warm with butter and plenty of jam on the side.' }],
    )
    const reader: BookReader = { format: 'pdf', title: null, author: null, units: 40, unitName: 'pages', cover: async () => null, readUnit: async (i) => ({ blocks: pages[i], ocr: false }) }
    deps.open = async () => reader
    await addBook('big', 'pdf', Buffer.from('x'))
    await startParse(deps, ME, { familyId: FAM, bookId: 'big' })

    // One chunk = 15 pages; the cursor is saved and the book shows progress.
    await processChunk(deps, FAM, 'big', store.states.get('big')!)
    expect(store.states.get('big')).toMatchObject({ next: 15, lease: null })
    expect(store.books.get('big')?.progress).toEqual({ done: 15, total: 40, unit: 'pages' })
    expect(store.states.get('big')!.carry[0].text).toBe('Recipe 4') // page 12-15: unfinished, carried over

    await drain('big')
    expect(store.books.get('big')).toMatchObject({ status: 'done', recipeCount: 10 })
  })

  it('does nothing when another run holds the lease (duplicate trigger delivery)', async () => {
    await addBook('b1', 'epub', await makeEpub())
    await startParse(deps, ME, { familyId: FAM, bookId: 'b1' })
    const state = store.states.get('b1')!
    await store.claim(FAM, 'b1', state.runId, 0, clock + 60_000, clock)
    expect(await processChunk(deps, FAM, 'b1', state)).toBe('busy')
    expect(store.recipes.size).toBe(0)
  })

  it('re-parsing replaces recipes but keeps the ones you edited or favorited', async () => {
    await addBook('b1', 'epub', await makeEpub())
    await startParse(deps, ME, { familyId: FAM, bookId: 'b1' })
    await drain('b1')
    const [bananaId] = [...store.recipes].find(([, r]) => r.title === 'Banana Bread')!
    store.recipes.set(bananaId, { ...store.recipes.get(bananaId)!, title: 'Grandma’s Banana Bread', edited: true })
    store.recipes.set('ck_stale', { title: 'Old wrong one', source: { bookId: 'b1' } })

    await startParse(deps, ME, { familyId: FAM, bookId: 'b1' })
    await drain('b1')
    expect(store.recipes.has('ck_stale')).toBe(false)
    expect(store.recipes.get(bananaId)?.title).toBe('Grandma’s Banana Bread')
    expect(store.books.get('b1')?.recipeCount).toBe(2)
  })

  it('reports unreadable files clearly instead of retrying', async () => {
    deps.open = async () => {
      throw new BookError("Can't read this file: it's DRM-protected.")
    }
    await addBook('drm', 'epub', Buffer.from('x'))
    await startParse(deps, ME, { familyId: FAM, bookId: 'drm' })
    await drain('drm')
    expect(store.books.get('drm')).toMatchObject({ status: 'error', error: "Can't read this file: it's DRM-protected." })
  })

  it('retries unexpected failures, then gives up with a message', async () => {
    deps.open = async () => {
      throw new Error('boom')
    }
    await addBook('bad', 'pdf', Buffer.from('x'))
    await startParse(deps, ME, { familyId: FAM, bookId: 'bad' })
    await drain('bad')
    expect(store.books.get('bad')?.status).toBe('error')
    expect(store.books.get('bad')?.error).toMatch(/re-parsing/)
  })

  it('restarts a parse whose instance died', async () => {
    await addBook('b1', 'epub', await makeEpub())
    await startParse(deps, ME, { familyId: FAM, bookId: 'b1' })
    const s = store.states.get('b1')!
    await store.claim(FAM, 'b1', s.runId, 0, clock + 60_000, clock) // claimed, then the instance crashed
    clock += 15 * 60_000
    expect(await kickStalled(deps)).toBe(1)
    await drain('b1')
    expect(store.books.get('b1')?.status).toBe('done')
  })
})

describe('cookbook callables', () => {
  it('only lets household members start or delete', async () => {
    await addBook('b1', 'epub', await makeEpub())
    await expect(startParse(deps, 'stranger', { familyId: FAM, bookId: 'b1' })).rejects.toBeInstanceOf(CookbookError)
    await expect(deleteCookbook(deps, undefined, { familyId: FAM, bookId: 'b1' })).rejects.toThrow(/Sign in/)
    await expect(startParse(deps, ME, { familyId: FAM, bookId: 'nope' })).rejects.toThrow(/no longer exists/)
  })

  it('deletes the file and record, and its recipes only when asked', async () => {
    await addBook('b1', 'epub', await makeEpub())
    await startParse(deps, ME, { familyId: FAM, bookId: 'b1' })
    await drain('b1')
    expect(await deleteCookbook(deps, ME, { familyId: FAM, bookId: 'b1', removeRecipes: false })).toEqual({ removedRecipes: 0 })
    expect(store.recipes.size).toBe(2)
    expect([...files.keys()].some((k) => k.includes('/b1/'))).toBe(false)
    expect(store.books.has('b1')).toBe(false)

    await addBook('b2', 'epub', await makeEpub())
    await startParse(deps, ME, { familyId: FAM, bookId: 'b2' })
    await drain('b2')
    expect(await deleteCookbook(deps, ME, { familyId: FAM, bookId: 'b2', removeRecipes: true })).toEqual({ removedRecipes: 2 })
  })
})

describe('helpers', () => {
  it('tidies shouty titles only', () => {
    expect(tidyTitle('BANANA BREAD')).toBe('Banana Bread')
    expect(tidyTitle('SOUP OF THE DAY')).toBe('Soup of the Day')
    expect(tidyTitle('Pad Thai')).toBe('Pad Thai')
  })

  it('only processes real progress, not lease bookkeeping', () => {
    const base: ParseState = { runId: 'r', phase: 'parsing', next: 0, total: 0, carry: [], ocr: false, attempts: 0, kick: 0, lease: null, updatedAt: 0 }
    expect(shouldProcess(null, base)).toBe(true)
    expect(shouldProcess(base, { ...base, lease: { next: 0, until: 1 } })).toBe(false)
    expect(shouldProcess(base, { ...base, next: 15 })).toBe(true)
    expect(shouldProcess(base, { ...base, kick: 1 })).toBe(true)
    expect(shouldProcess(base, { ...base, phase: 'done' })).toBe(false)
    expect(shouldProcess(base, { ...base, updatedAt: 5 })).toBe(false)
  })
})
