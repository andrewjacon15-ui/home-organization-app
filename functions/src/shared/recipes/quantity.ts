/**
 * Quantities in ingredient lines: "1", "1.5", "½", "1½", "1 1/2", "1/2", "1-2", "1 to 2",
 * "a", "an", "half", "half a", "one", "two dozen". Pure functions shared by the
 * Cloud Functions (cookbook parsing) and the web app (editing, scaling).
 */

export interface Quantity {
  /** The amount (or the low end of a range). */
  value: number
  /** High end of a range ("1-2" → 2), else null. */
  max: number | null
  /** How many characters of the input it used. */
  length: number
}

const UNICODE_FRACTIONS: Record<string, number> = {
  '½': 1 / 2,
  '⅓': 1 / 3,
  '⅔': 2 / 3,
  '¼': 1 / 4,
  '¾': 3 / 4,
  '⅕': 1 / 5,
  '⅖': 2 / 5,
  '⅗': 3 / 5,
  '⅘': 4 / 5,
  '⅙': 1 / 6,
  '⅚': 5 / 6,
  '⅛': 1 / 8,
  '⅜': 3 / 8,
  '⅝': 5 / 8,
  '⅞': 7 / 8,
}

const WORD_NUMBERS: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  dozen: 12,
  half: 0.5,
  quarter: 0.25,
}

/** Turns unicode fractions into ASCII ("1½" → "1 1/2", "⅓" → "1/3") and normalizes dashes and the fraction slash. */
export function normalizeFractions(text: string): string {
  return text
    .replace(/[⁄∕]/g, '/')
    .replace(/[‒–—−]/g, '-')
    .replace(/(\d)([½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])/g, '$1 $2')
    .replace(/[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]/g, (c) => fractionText(UNICODE_FRACTIONS[c]))
}

function fractionText(v: number): string {
  for (let d = 2; d <= 8; d++) {
    const n = Math.round(v * d)
    if (Math.abs(n / d - v) < 1e-9) return `${n}/${d}`
  }
  return String(v)
}

/** One number: "1", "1.5", "1/2", "1 1/2". Returns value and length, or null. */
function readNumber(s: string): { value: number; length: number } | null {
  const mixed = /^(\d+)\s+(\d+)\/(\d+)(?![\d/])/.exec(s)
  if (mixed && +mixed[3] !== 0) return { value: +mixed[1] + +mixed[2] / +mixed[3], length: mixed[0].length }
  const frac = /^(\d+)\/(\d+)(?![\d/])/.exec(s)
  if (frac && +frac[2] !== 0) return { value: +frac[1] / +frac[2], length: frac[0].length }
  const dec = /^(\d+(?:[.,]\d+)?|\.\d+)/.exec(s)
  if (dec) return { value: parseFloat(dec[1].replace(',', '.')), length: dec[0].length }
  return null
}

/** Reads a quantity at the start of `text` (after unicode normalization). */
export function readQuantity(input: string): Quantity | null {
  const text = normalizeFractions(input)
  const lead = text.match(/^\s*/)![0].length
  const s = text.slice(lead)

  const num = readNumber(s)
  if (num) {
    // Range: "1-2", "1 - 2", "1 to 2", "1 or 2"
    const rest = s.slice(num.length)
    const range = /^\s*(?:-|to|or)\s*/i.exec(rest)
    if (range) {
      const hi = readNumber(rest.slice(range[0].length))
      if (hi && hi.value >= num.value) return { value: num.value, max: hi.value, length: lead + num.length + range[0].length + hi.length }
    }
    // "2 dozen"
    const dozen = /^\s+dozen\b/i.exec(rest)
    if (dozen) return { value: num.value * 12, max: null, length: lead + num.length + dozen[0].length }
    return { value: num.value, max: null, length: lead + num.length }
  }

  // Words: "half a", "a half", "an", "one", "two dozen", "a dozen"
  const words = /^(half\s+an?|a\s+half|an?\s+dozen|half\s+a\s+dozen|a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|half|quarter|dozen)\b(\s+dozen\b)?/i.exec(s)
  if (words) {
    const w = words[1].toLowerCase().replace(/\s+/g, ' ')
    let value: number
    if (w === 'half a dozen') value = 6
    else if (w === 'a dozen' || w === 'an dozen') value = 12
    else if (w.startsWith('half') || w === 'a half') value = 0.5
    else value = WORD_NUMBERS[w]
    if (words[2]) value *= 12
    return { value, max: null, length: lead + words[0].length }
  }
  return null
}

/** Pretty kitchen text for a number: 1.5 → "1 1/2", 0.333 → "1/3", 2 → "2", 0.1 → "0.1". */
export function formatQuantity(value: number): string {
  if (!isFinite(value) || value <= 0) return ''
  const whole = Math.floor(value + 1e-9)
  const frac = value - whole
  if (frac < 0.02) return String(whole)
  const common: [number, string][] = [
    [1 / 8, '1/8'],
    [1 / 4, '1/4'],
    [1 / 3, '1/3'],
    [3 / 8, '3/8'],
    [1 / 2, '1/2'],
    [5 / 8, '5/8'],
    [2 / 3, '2/3'],
    [3 / 4, '3/4'],
    [7 / 8, '7/8'],
  ]
  for (const [v, t] of common) if (Math.abs(frac - v) < 0.02) return whole ? `${whole} ${t}` : t
  if (frac > 0.98) return String(whole + 1)
  return String(Math.round(value * 100) / 100)
}

/** "1-2" style text for a quantity with an optional range end. */
export function formatRange(value: number, max: number | null): string {
  return max != null && max !== value ? `${formatQuantity(value)}-${formatQuantity(max)}` : formatQuantity(value)
}
