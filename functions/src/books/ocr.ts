/**
 * OCR for scanned cookbook pages with tesseract.js (classic OCR, not AI text generation).
 * One English worker per function instance, reused across pages; the model downloads once
 * into /tmp.
 */
import { createWorker, type Worker } from 'tesseract.js'

let worker: Promise<Worker> | null = null

function getWorker(): Promise<Worker> {
  worker ??= createWorker('eng', 1, { cachePath: '/tmp/tesseract' }).catch((err) => {
    worker = null
    throw err
  })
  return worker
}

/** PNG of a page → its text lines, in reading order, blank lines dropped. */
export async function ocrPng(png: Buffer): Promise<string[]> {
  const w = await getWorker()
  const { data } = await w.recognize(png)
  return data.text
    .split('\n')
    .map((l) => fixOcrLine(l.replace(/\s+/g, ' ').trim()))
    .filter((l) => l.length > 1)
}

/**
 * Classic OCR digit mix-ups at the start of an ingredient line: "[1/2 cups" or "l 1/2 cups"
 * for "1 1/2 cups", "I tsp" for "1 tsp", "O.5" for "0.5".
 */
export function fixOcrLine(line: string): string {
  return line
    .replace(/^[[\]|lI](?=\d)/, '1 ')
    .replace(/^[[\]|lI](?=\s+[\d½¼¾⅓⅔]|\s+(?:cups?|tbsp|tsp|tablespoons?|teaspoons?|oz|lb|g|kg|ml|egg|clove)\b)/i, '1')
    .replace(/^[oO](?=[.,]\d)/, '0')
}
