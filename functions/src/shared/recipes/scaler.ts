/**
 * Serving scaler: rewrites only the amount at the start of an ingredient line, in kitchen
 * fractions, and leaves the rest as the cook wrote it ("2 (14-ounce) cans tomatoes" × 2 →
 * "4 (14-ounce) cans tomatoes"). Lines without an amount ("Salt, to taste") stay as they are.
 */
import { cleanLine } from './ingredient.js'
import { formatRange, readQuantity } from './quantity.js'

export function scaleLine(raw: string, factor: number): string {
  if (!Number.isFinite(factor) || factor <= 0 || Math.abs(factor - 1) < 1e-9) return raw.trim()
  const s = cleanLine(raw)
  const q = readQuantity(s)
  if (!q) return raw.trim()
  const amount = formatRange(q.value * factor, q.max != null ? q.max * factor : null)
  return `${amount} ${s.slice(q.length).trim()}`.trim()
}

/** The factor from the recipe's servings to the servings wanted (1 when either is unknown). */
export function scaleFactor(base: number | null | undefined, wanted: number | null | undefined): number {
  return base && wanted && base > 0 && wanted > 0 ? wanted / base : 1
}
