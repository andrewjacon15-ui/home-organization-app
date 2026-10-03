/**
 * PDF → pages of text blocks, using pdf.js's text layer with positions:
 *  - lines are rebuilt from text items by baseline, and split where a wide gap separates columns,
 *  - side-by-side columns (a two-column page, or two columns of ingredients under a
 *    full-width title) are read left column then right,
 *  - lines in a bigger font than the page's body text become headings,
 *  - wrapped lines are joined back together by position (same indent, normal line spacing,
 *    the line above reaching the column's right edge), so a long ingredient that wraps
 *    stays one ingredient and a method paragraph stays one paragraph,
 *  - page numbers, running headers/footers, and contents pages are dropped.
 * Pages with no text layer (scans) are rendered and OCR'd (see ocr.ts).
 */
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import type { Block } from '../shared/recipes/extract.js'
import { ingredientLikeness } from '../shared/recipes/ingredient.js'
import { BookError, type BookReader } from './reader.js'

interface Item {
  str: string
  x: number
  y: number
  w: number
  size: number
}

export interface Line {
  text: string
  x: number
  y: number
  size: number
  /** Width; absent for OCR lines (no positions). */
  w?: number
}

/** Text items grouped by baseline, top to bottom, each row's items left to right. */
function rows(items: Item[]): Item[][] {
  const sorted = [...items].filter((i) => i.str.trim()).sort((a, b) => b.y - a.y || a.x - b.x)
  const out: { items: Item[]; y: number; size: number }[] = []
  for (const it of sorted) {
    const row = out.find((l) => Math.abs(l.y - it.y) <= Math.max(2, 0.5 * Math.min(l.size, it.size)))
    if (row) {
      row.items.push(it)
      row.size = Math.max(row.size, it.size)
    } else out.push({ items: [it], y: it.y, size: it.size })
  }
  return out.sort((a, b) => b.y - a.y).map((r) => r.items.sort((a, b) => a.x - b.x))
}

/** Joins a run of items into one line of text. */
function lineOf(parts: Item[]): Line {
  let text = ''
  let end = -Infinity
  for (const p of parts) {
    if (text && p.x - end > 0.15 * p.size && !text.endsWith(' ') && !p.str.startsWith(' ')) text += ' '
    text += p.str
    end = p.x + p.w
  }
  const x = parts[0].x
  return { text: text.replace(/\s+/g, ' ').trim(), x, y: Math.max(...parts.map((p) => p.y)), size: Math.max(...parts.map((p) => p.size)), w: end - x }
}

/**
 * Positioned text items → lines, top to bottom. A row with a wide gap in it is two lines
 * (side-by-side columns), so "5 chicken breasts" and "3/4 C brown sugar" printed in two
 * ingredient columns don't run together.
 */
export function itemsToLines(items: Item[]): Line[] {
  const out: Line[] = []
  for (const row of rows(items)) {
    let run: Item[] = []
    let end = -Infinity
    for (const p of row) {
      if (run.length && p.x - end > Math.max(8, 1.2 * p.size)) {
        out.push(lineOf(run))
        run = []
      }
      run.push(p)
      end = Math.max(end, p.x + p.w)
    }
    if (run.length) out.push(lineOf(run))
  }
  return out.filter((l) => l.text)
}

/**
 * Reading order. A page laid out entirely in two columns is read left column then right.
 * Otherwise the page is read top to bottom in stretches: wherever a row holds two or more
 * lines side by side (ingredients in two columns, a sidebar beside the method, two recipes
 * next to each other), that stretch's columns are read one after another, left first.
 * A stretch ends at a line that crosses its columns (a full-width title or paragraph), or at
 * a line that clearly starts something new (out of step with the columns and a different size).
 */
export function readingOrder(items: Item[], pageWidth: number): Line[] {
  const lines = itemsToLines(items)
  const end = (l: Line) => l.x + (l.w ?? 0)

  // A whole page in two columns whose rows needn't line up (each column has its own leading).
  const mid = pageWidth / 2
  const left = lines.filter((l) => end(l) < mid - 4)
  const right = lines.filter((l) => l.x > mid + 4)
  const crossing = lines.filter((l) => !left.includes(l) && !right.includes(l))
  if (left.length >= 6 && right.length >= 6 && crossing.length <= Math.max(1, 0.08 * lines.length)) {
    const top = Math.max(...left.map((l) => l.y), ...right.map((l) => l.y))
    return [...crossing.filter((l) => l.y > top), ...left, ...right, ...crossing.filter((l) => l.y <= top)]
  }

  interface Band {
    cols: number[]
    lines: { line: Line; col: number }[]
    lastY: number
    spacing: number
  }
  const out: Line[] = []
  let band: Band | null = null
  const flush = () => {
    if (band) out.push(...[...band.lines].sort((a, b) => a.col - b.col || b.line.y - a.line.y).map((x) => x.line))
    band = null
  }
  /** The band column a line sits in, or -1 when it crosses into the next column. */
  const colOf = (b: Band, l: Line) => {
    let c = -1
    b.cols.forEach((x, i) => {
      if (l.x >= x - 3) c = i
    })
    if (c < 0 || (c + 1 < b.cols.length && end(l) > b.cols[c + 1] + 4)) return -1
    return c
  }

  for (let i = 0; i < lines.length; ) {
    // One printed row: lines sharing a baseline.
    let j = i + 1
    while (j < lines.length && Math.abs(lines[j].y - lines[i].y) < 0.01) j++
    const row = lines.slice(i, j)
    const y = row[0].y
    i = j
    const b = band as Band | null
    if (b) {
      const cols = row.map((l) => colOf(b, l))
      let fits = cols.every((c) => c >= 0) && new Set(cols).size === cols.length
      if (fits && row.length === 1) {
        // A lone line out of step with its column, in another size, after a gap: something new.
        const l = row[0]
        const mates = b.lines.filter((x) => x.col === cols[0]).map((x) => x.line)
        const aligned = mates.some((m) => Math.abs(m.x - l.x) <= 3)
        const sameSize = mates.some((m) => Math.abs(m.size - l.size) <= 0.6)
        if (!aligned && (!sameSize || b.lastY - y > 1.6 * b.spacing)) fits = false
      }
      if (fits) {
        row.forEach((l, k) => b.lines.push({ line: l, col: cols[k] }))
        b.spacing = Math.min(b.spacing, b.lastY - y)
        b.lastY = y
        continue
      }
      flush()
    }
    if (row.length >= 2) band = { cols: row.map((l) => l.x), lines: row.map((line, col) => ({ line, col })), lastY: y, spacing: Infinity }
    else out.push(...row)
  }
  flush()
  return out
}

/** A contents page: most rows end in a page number ("Chicken Marsala 11"). */
export function isContentsPage(items: Item[]): boolean {
  const texts = rows(items).map((r) => lineOf(r).text)
  if (texts.length < 8) return false
  const numbered = texts.filter((t) => /^\D.*[\s.]\d{1,3}$/.test(t)).length
  return numbered / texts.length >= 0.5
}

/** Body text size: the size most of the page's characters are set in. */
function bodySize(lines: Line[]): number {
  const bySize = [...lines].sort((a, b) => a.size - b.size)
  const total = bySize.reduce((n, l) => n + l.text.length, 0)
  let seen = 0
  let body = bySize[0].size
  for (const l of bySize) {
    seen += l.text.length
    body = l.size
    if (seen >= total / 2) break
  }
  // A chapter-title page ("Desserts", alone and large) has no body text of its own.
  return total < 200 ? Math.min(body, 12) : body
}

/** Lines → blocks: headings by font size, wrapped lines joined, separate items kept apart. */
export function linesToBlocks(lines: Line[], loc: string): Block[] {
  if (!lines.length) return []
  const body = bodySize(lines)
  const sameCol = (a: Line, b: Line) => Math.abs(a.x - b.x) <= 3 && Math.abs(a.size - b.size) <= 0.6
  // Normal line spacing per column: the tighter gaps between consecutive lines of one column.
  const gapsBySize = new Map<number, number[]>()
  lines.forEach((l, i) => {
    const p = lines[i - 1]
    const dy = p ? p.y - l.y : 0
    if (p && sameCol(p, l) && dy > 0 && dy < 3 * l.size) gapsBySize.set(Math.round(l.size), [...(gapsBySize.get(Math.round(l.size)) ?? []), dy])
  })
  const lineGap = (l: Line) => {
    const g = (gapsBySize.get(Math.round(l.size)) ?? []).sort((a, b) => a - b)
    return g.length ? g[Math.floor(g.length / 4)] : 1.4 * l.size
  }
  // How far right a line may run: up to the next column beside it, else the page's text edge.
  const pageRight = Math.max(...lines.map((l) => l.x + (l.w ?? 0)))
  const limit = (l: Line) => {
    const end = l.x + (l.w ?? 0)
    const beside = lines.filter((o) => o.x >= end && Math.abs(o.y - l.y) <= 3 * l.size).map((o) => o.x - 0.5 * o.size)
    // A sentence-length line measures against its own column (a wide note elsewhere on the
    // page mustn't make every method line look short); a short item against the page.
    const own = l.text.split(' ').length >= 6 ? Math.max(...lines.filter((o) => sameCol(o, l)).map((o) => o.x + (o.w ?? 0))) : pageRight
    return Math.min(own, ...beside)
  }
  // A line was wrapped when the next line's first word wouldn't have fit after it.
  const wrapsInto = (a: Line, b: Line) => a.x + (a.w ?? 0) + 0.55 * a.size * (1 + (b.text.split(' ')[0]?.length ?? 0)) > limit(a)

  const blocks: Block[] = []
  let last: Line | null = null
  for (const l of lines) {
    const ratio = l.size / body
    const prev = blocks[blocks.length - 1]
    const dy = last ? last.y - l.y : 0
    const positioned = last?.w != null && l.w != null
    if (ratio >= 1.2 && l.text.length <= 90) {
      // A title set on two lines.
      if (prev?.kind === 'heading' && last && Math.abs(last.size - l.size) <= 0.6 && dy > 0 && dy <= 1.6 * l.size && prev.text.length + l.text.length <= 90) prev.text = `${prev.text} ${l.text}`
      else blocks.push({ kind: 'heading', level: ratio >= 1.8 ? 1 : ratio >= 1.4 ? 2 : 3, text: l.text, loc })
      last = l
      continue
    }
    let join = false
    if (prev?.kind === 'text' && last) {
      if (positioned) {
        const continues = sameCol(last, l) && dy > 0 && dy <= 1.3 * lineGap(l)
        const wrapped = wrapsInto(last, l)
        const prevLike = ingredientLikeness(prev.text)
        const lineLike = ingredientLikeness(l.text)
        // Prose carries on (even after a full stop), or a sentence carries onto a line that starts with a number…
        const prose = prevLike < 0.5 && (lineLike < 0.5 || (prev.text.length >= 60 && !/[.!?:;]$/.test(prev.text)))
        // …or an ingredient wrapped onto a second line ("1 whole chicken (washed, cut, ready to" / "grill)").
        const wrappedItem = /^[a-z)]/.test(l.text) && lineLike < 0.5
        join = continues && wrapped && (prose || wrappedItem)
      } else {
        // OCR lines have no positions: join lowercase continuations of prose.
        join = !/[.!?:]$/.test(prev.text) && /^[a-z(]/.test(l.text) && ingredientLikeness(l.text) < 0.5 && ingredientLikeness(prev.text) < 0.5
      }
    }
    if (join) prev.text = `${prev.text.replace(/-$/, '')}${prev.text.endsWith('-') ? '' : ' '}${l.text}`
    else blocks.push({ kind: 'text', text: l.text, loc })
    last = l
  }
  return blocks
}

const MARGIN_REPEAT = 0.07
const MARGIN_NUMBER = 0.1
/** Running header/footer text, compared with page numbers ignored. */
const marginKey = (s: string) => s.replace(/\d+/g, '#').replace(/\s+/g, ' ').trim().toLowerCase()

/**
 * Drops page furniture: page numbers near the top or bottom edge, and header/footer lines
 * that the neighbouring page repeats ("Licensed to …", the book's name, a chapter name).
 */
export function dropPageFurniture(items: Item[], height: number, neighbour: Item[]): Item[] {
  const edge = (it: Item, share: number) => it.y < share * height || it.y > (1 - share) * height
  const repeated = new Set(neighbour.filter((it) => edge(it, MARGIN_REPEAT)).map((it) => marginKey(it.str)))
  return items.filter((it) => {
    if (edge(it, MARGIN_NUMBER) && /^\s*(?:page\s*)?\d{1,4}\s*$/i.test(it.str)) return false
    if (edge(it, MARGIN_REPEAT) && repeated.has(marginKey(it.str))) return false
    return true
  })
}

type PdfjsModule = typeof import('pdfjs-dist/legacy/build/pdf.mjs')
let pdfjs: Promise<PdfjsModule> | null = null
const loadPdfjs = () => (pdfjs ??= import('pdfjs-dist/legacy/build/pdf.mjs'))

/** pdf.js needs the 14 standard PDF fonts' data to draw pages that use them (covers, OCR renders). */
const standardFontDataUrl = join(dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json')), 'standard_fonts') + '/'

export async function openPdf(buffer: Buffer, ocrPage: (png: Buffer) => Promise<string[]>): Promise<BookReader> {
  const lib = await loadPdfjs()
  let doc: Awaited<ReturnType<PdfjsModule['getDocument']>['promise']>
  try {
    doc = await lib.getDocument({ data: new Uint8Array(buffer), useSystemFonts: false, disableFontFace: true, standardFontDataUrl }).promise
  } catch (err) {
    const msg = String((err as Error)?.message ?? err)
    throw new BookError(/password/i.test(msg) ? "Can't read this PDF: it's password-protected." : "This doesn't look like a readable PDF file.")
  }
  const meta = await doc.getMetadata().catch(() => null)
  const info = (meta?.info ?? {}) as { Title?: string; Author?: string }

  const render = async (pageNumber: number, scale: number): Promise<Buffer> => {
    const page = await doc.getPage(pageNumber)
    const viewport = page.getViewport({ scale })
    const factory = (doc as unknown as { canvasFactory: { create(w: number, h: number): { canvas: { toBuffer(type: string): Buffer }; context: unknown } } }).canvasFactory
    const { canvas, context } = factory.create(Math.ceil(viewport.width), Math.ceil(viewport.height))
    await page.render({ canvasContext: context as CanvasRenderingContext2D, viewport, canvas: canvas as unknown as HTMLCanvasElement }).promise
    page.cleanup()
    return canvas.toBuffer('image/png')
  }

  /** A page's positioned text items. */
  const textOf = async (pageNumber: number) => {
    const page = await doc.getPage(pageNumber)
    const content = await page.getTextContent()
    const items: Item[] = []
    for (const raw of content.items) {
      if (!('str' in raw)) continue
      const [a, b, , , e, f] = raw.transform as number[]
      items.push({ str: raw.str, x: e, y: f, w: raw.width, size: Math.hypot(a, b) || raw.height })
    }
    const { width, height } = page.getViewport({ scale: 1 })
    page.cleanup()
    return { items, width, height }
  }

  /** Whether the page draws a picture (a scan) rather than being blank. */
  const hasImage = async (pageNumber: number) => {
    const page = await doc.getPage(pageNumber)
    const ops = await page.getOperatorList()
    page.cleanup()
    const paints = new Set([lib.OPS.paintImageXObject, lib.OPS.paintInlineImageXObject, lib.OPS.paintImageXObjectRepeat, lib.OPS.paintImageMaskXObject])
    return ops.fnArray.some((op) => paints.has(op))
  }

  return {
    format: 'pdf',
    title: info.Title?.trim() || null,
    author: info.Author?.trim() || null,
    units: doc.numPages,
    unitName: 'pages',
    async cover() {
      try {
        return { data: await render(1, 0.6), contentType: 'image/png' }
      } catch {
        return null
      }
    },
    async readUnit(i) {
      const pageNumber = i + 1
      const loc = `p. ${pageNumber}`
      const { items: raw, width, height } = await textOf(pageNumber)
      // The neighbouring page shows which header/footer lines repeat.
      const neighbour = doc.numPages > 1 ? (await textOf(pageNumber < doc.numPages ? pageNumber + 1 : pageNumber - 1)).items : []
      const items = dropPageFurniture(raw, height, neighbour)
      const chars = items.reduce((n, it) => n + it.str.trim().length, 0)
      if (chars >= 25) return { blocks: isContentsPage(items) ? [] : linesToBlocks(readingOrder(items, width), loc), ocr: false }

      // A page with a few words and no picture is a chapter page ("Desserts") or blank, not a scan.
      if (!(await hasImage(pageNumber))) return { blocks: linesToBlocks(readingOrder(items, width), loc), ocr: false }
      // No text layer: a scanned page. Render at ~300 dpi and OCR it.
      // OCR gives plain lines (no font sizes): same paragraph joining, no headings.
      const lines = await ocrPage(await render(pageNumber, 300 / 72))
      return { blocks: linesToBlocks(lines.map((text, n) => ({ text, x: 0, y: -n, size: 10 })), `${loc} (OCR)`), ocr: true }
    },
  }
}
