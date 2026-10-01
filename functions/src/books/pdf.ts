/**
 * PDF → pages of text blocks, using pdf.js's text layer with positions:
 *  - lines are rebuilt from text items by baseline,
 *  - two-column pages are read left column then right,
 *  - lines in a bigger font than the page's body text become headings,
 *  - wrapped paragraph lines are joined (ingredient lines are kept apart).
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
}

/** Groups positioned text items into lines (top to bottom, left to right). */
export function itemsToLines(items: Item[]): Line[] {
  const sorted = [...items].filter((i) => i.str.trim()).sort((a, b) => b.y - a.y || a.x - b.x)
  const lines: { items: Item[]; y: number; size: number }[] = []
  for (const it of sorted) {
    const line = lines.find((l) => Math.abs(l.y - it.y) <= Math.max(2, 0.5 * Math.min(l.size, it.size)))
    if (line) {
      line.items.push(it)
      line.size = Math.max(line.size, it.size)
    } else lines.push({ items: [it], y: it.y, size: it.size })
  }
  return lines
    .sort((a, b) => b.y - a.y)
    .map((l) => {
      const parts = l.items.sort((a, b) => a.x - b.x)
      let text = ''
      let end = -Infinity
      for (const p of parts) {
        if (text && p.x - end > 0.15 * p.size && !text.endsWith(' ') && !p.str.startsWith(' ')) text += ' '
        text += p.str
        end = p.x + p.w
      }
      return { text: text.replace(/\s+/g, ' ').trim(), x: parts[0].x, y: l.y, size: l.size }
    })
    .filter((l) => l.text)
}

/**
 * Two columns: most items sit wholly left or right of the page middle and few cross it.
 * Then each column is read top to bottom, left column first.
 */
export function readingOrder(items: Item[], pageWidth: number): Line[] {
  const mid = pageWidth / 2
  const left = items.filter((i) => i.x + i.w < mid - 4)
  const right = items.filter((i) => i.x > mid + 4)
  const crossing = items.filter((i) => i.x <= mid + 4 && i.x + i.w >= mid - 4 && i.str.trim().length > 2)
  const twoColumn = left.length >= 8 && right.length >= 8 && crossing.length <= Math.max(2, 0.08 * items.length)
  if (!twoColumn) return itemsToLines(items)
  // A full-width title above the columns stays first.
  const top = Math.max(...left.map((i) => i.y), ...right.map((i) => i.y))
  const header = crossing.filter((i) => i.y > top)
  return [...itemsToLines(header), ...itemsToLines(left), ...itemsToLines(right)]
}

/** Lines → blocks: headings by font size, wrapped paragraph lines joined, ingredient lines kept apart. */
export function linesToBlocks(lines: Line[], loc: string): Block[] {
  if (!lines.length) return []
  const sizes = lines.map((l) => l.size).sort((a, b) => a - b)
  const body = sizes[Math.floor(sizes.length / 2)]
  const blocks: Block[] = []
  for (const l of lines) {
    const ratio = l.size / body
    if (ratio >= 1.2 && l.text.length <= 90) {
      blocks.push({ kind: 'heading', level: ratio >= 1.8 ? 1 : ratio >= 1.4 ? 2 : 3, text: l.text, loc })
      continue
    }
    const prev = blocks[blocks.length - 1]
    const joinable =
      prev &&
      prev.kind === 'text' &&
      !/[.!?:]$/.test(prev.text) &&
      /^[a-z(]/.test(l.text) &&
      ingredientLikeness(l.text) < 0.5 &&
      ingredientLikeness(prev.text) < 0.5
    if (joinable) prev.text = `${prev.text.replace(/-$/, '')}${prev.text.endsWith('-') ? '' : ' '}${l.text}`
    else blocks.push({ kind: 'text', text: l.text, loc })
  }
  return blocks
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
      const page = await doc.getPage(pageNumber)
      const content = await page.getTextContent()
      const items: Item[] = []
      for (const raw of content.items) {
        if (!('str' in raw)) continue
        const [a, b, , , e, f] = raw.transform as number[]
        items.push({ str: raw.str, x: e, y: f, w: raw.width, size: Math.hypot(a, b) || raw.height })
      }
      const chars = items.reduce((n, it) => n + it.str.trim().length, 0)
      const width = page.getViewport({ scale: 1 }).width
      page.cleanup()
      if (chars >= 25) return { blocks: linesToBlocks(readingOrder(items, width), loc), ocr: false }

      // No text layer: a scanned page. Render at ~300 dpi and OCR it.
      // OCR gives plain lines (no font sizes): same paragraph joining, no headings.
      const lines = await ocrPage(await render(pageNumber, 300 / 72))
      return { blocks: linesToBlocks(lines.map((text, n) => ({ text, x: 0, y: -n, size: 10 })), `${loc} (OCR)`), ocr: true }
    },
  }
}
