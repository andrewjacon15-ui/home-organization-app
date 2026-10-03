/**
 * Metric view of a recipe: US volumes become millilitres, weights grams, inches centimetres,
 * and °F oven temperatures °C. Only what's written is converted (cups of flour stay a volume:
 * turning them into grams needs a density per ingredient, which we don't guess). Counts and
 * units like cans or cloves are left alone.
 */
import { cleanLine } from './ingredient.js'
import { readQuantity } from './quantity.js'
import { readUnit } from './units.js'

const ML: Record<string, number> = { tsp: 4.93, tbsp: 14.79, cup: 236.6, 'fl oz': 29.57, pint: 473.2, quart: 946.4, gallon: 3785 }
const GRAMS: Record<string, number> = { oz: 28.35, lb: 453.6 }

const trim = (n: number) => String(Math.round(n * 100) / 100)
const roundTo = (n: number, step: number) => Math.max(step, Math.round(n / step) * step)

/** 7.4 → "7.5 ml", 59 → "60 ml", 237 → "240 ml", 946 → "950 ml", 3785 → "3.8 L". */
export function formatMl(ml: number): string {
  if (ml >= 1000) return `${trim(Math.round(ml / 100) / 10)} L`
  if (ml >= 100) return `${roundTo(ml, 10)} ml`
  if (ml >= 10) return `${roundTo(ml, 5)} ml`
  return `${trim(roundTo(ml, 0.5))} ml`
}

/** 28 → "28 g", 113 → "115 g", 454 → "455 g", 1361 → "1.36 kg". */
export function formatGrams(g: number): string {
  if (g >= 1000) return `${trim(Math.round(g / 10) / 100)} kg`
  if (g >= 100) return `${roundTo(g, 5)} g`
  return `${Math.max(1, Math.round(g))} g`
}

const range = (value: number, max: number | null, factor: number, fmt: (n: number) => string) => {
  if (max == null || max === value) return fmt(value * factor)
  const [lo, hi] = [fmt(value * factor), fmt(max * factor)]
  const unit = hi.replace(/^[\d.]+\s*/, '')
  return lo.endsWith(unit) ? `${lo.slice(0, -unit.length).trim()}-${hi}` : `${lo}-${hi}`
}

const cm = (inches: number) => {
  const v = inches * 2.54
  return v < 5 ? trim(Math.round(v * 2) / 2) : String(Math.round(v))
}

/** A number written in a sentence: "2", "1.5", "1/4", "1 1/2" (never the tail of a fraction). */
const NUM = String.raw`(?<![\d/.])(\d+\s+\d+/\d+|\d+/\d+|\d+(?:\.\d+)?)`
const num = (text: string) => readQuantity(text)?.value ?? Number(text)
const inline = (unit: string) => new RegExp(`${NUM}(?:\\s*|-)(?:${unit})`, 'gi')

/** Converts amounts written inside a line: "350°F", "9x13-inch pan", "(14-ounce) can", "a 2-pound roast". */
export function metricText(text: string): string {
  return text
    .replace(/(\d{2,3})\s*(?:°|º|degrees?)\s*F(?:ahrenheit)?\b/gi, (_, f: string) => `${Math.round(((+f - 32) * 5) / 9 / 5) * 5}°C`)
    .replace(/(\d+(?:\.\d+)?)\s*(?:x|by|×)\s*(\d+(?:\.\d+)?)(?:\s*|-)(?:inches|inch|in\.|")/gi, (_, a: string, b: string) => `${cm(+a)} x ${cm(+b)} cm`)
    .replace(inline(String.raw`inches|inch|in\.|"(?![a-z])`), (_, a: string) => `${cm(num(a))} cm`)
    .replace(inline(String.raw`ounces|ounce|oz\b\.?`), (_, a: string) => formatGrams(num(a) * GRAMS.oz))
    .replace(inline(String.raw`pounds|pound|lbs\b\.?|lb\b\.?`), (_, a: string) => formatGrams(num(a) * GRAMS.lb))
}

/** One ingredient line in metric: "1 1/2 cups milk" → "355 ml milk", "2 lb chicken" → "905 g chicken". */
export function toMetric(line: string): string {
  const s = cleanLine(line)
  const q = readQuantity(s)
  if (q) {
    const rest = s.slice(q.length).trimStart()
    const u = readUnit(rest)
    const per = u ? (ML[u.unit] ?? GRAMS[u.unit]) : undefined
    if (u && per) {
      const amount = range(q.value, q.max, per, u.unit in ML ? formatMl : formatGrams)
      return `${amount} ${metricText(rest.slice(u.length).trim())}`.trim()
    }
    // A count ("2 (14-ounce) cans"): keep the count, convert what's in the rest.
    return `${s.slice(0, q.length).trim()} ${metricText(rest)}`.trim()
  }
  return metricText(s)
}
