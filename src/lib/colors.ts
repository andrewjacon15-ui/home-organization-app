/** Twelve person colors chosen to stay distinct from each other and readable on light and dark paper. */
export const PERSON_COLORS = [
  { hex: '#C2410C', name: 'Rust' },
  { hex: '#B91C1C', name: 'Brick' },
  { hex: '#BE185D', name: 'Raspberry' },
  { hex: '#7E22CE', name: 'Violet' },
  { hex: '#4338CA', name: 'Indigo' },
  { hex: '#1D4ED8', name: 'Cobalt' },
  { hex: '#0369A1', name: 'Ocean' },
  { hex: '#0F766E', name: 'Teal' },
  { hex: '#15803D', name: 'Green' },
  { hex: '#4D7C0F', name: 'Olive' },
  { hex: '#A16207', name: 'Ochre' },
  { hex: '#57534E', name: 'Stone' },
] as const

export const DEFAULT_ACCENT = '#1D4ED8'

export const isHex = (value: string) => /^#[0-9a-fA-F]{6}$/.test(value)

/** "#1d4ed8" at 12% → "#1d4ed81f" (8-digit hex works in every browser we support, unlike color-mix()). */
export function withAlpha(hex: string, alpha: number): string {
  return hex + Math.round(Math.min(1, Math.max(0, alpha)) * 255).toString(16).padStart(2, '0')
}

/** Blend two hex colors: t = 0 gives `a`, 1 gives `b`. */
export function mixHex(a: string, b: string, t: number): string {
  const ch = (h: string, i: number) => parseInt(h.slice(i, i + 2), 16)
  return '#' + [1, 3, 5].map((i) => Math.round(ch(a, i) + (ch(b, i) - ch(a, i)) * t).toString(16).padStart(2, '0')).join('')
}

/** "#abc" / "abc" / "#AABBCC" → "#aabbcc", or null if it isn't a color. */
export function normalizeHex(input: string): string | null {
  let v = input.trim().replace(/^#/, '')
  if (/^[0-9a-fA-F]{3}$/.test(v)) v = v.replace(/./g, (c) => c + c)
  return /^[0-9a-fA-F]{6}$/.test(v) ? `#${v.toLowerCase()}` : null
}

/** WCAG relative luminance. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Black or white, whichever reads better on `hex`. */
export function readableOn(hex: string): '#000000' | '#ffffff' {
  const l = luminance(hex)
  return (l + 0.05) / 0.05 > 1.05 / (l + 0.05) ? '#000000' : '#ffffff'
}
