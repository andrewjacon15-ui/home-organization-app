import type { Block } from '../shared/recipes/extract.js'

/** A cookbook opened for reading, one unit (EPUB chapter or PDF page) at a time. */
export interface BookReader {
  format: 'epub' | 'pdf'
  title: string | null
  author: string | null
  /** How many chapters / pages. */
  units: number
  unitName: 'chapters' | 'pages'
  cover(): Promise<{ data: Buffer; contentType: string } | null>
  /** Blocks for one unit; `ocr` when the text came from OCR (a scanned page). */
  readUnit(index: number): Promise<{ blocks: Block[]; ocr: boolean }>
}

/** A problem with the file itself; shown to the family as-is. */
export class BookError extends Error {}
