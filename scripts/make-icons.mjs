// Draws the app icons in the current style: the accent (cobalt) tile with the app's
// calendar mark (Lucide's calendar-days geometry, rounded strokes) in paper white.
// Run: node scripts/make-icons.mjs  (uses @napi-rs/canvas from functions/node_modules)
import { writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(new URL('../functions/package.json', import.meta.url))
const { createCanvas } = require('@napi-rs/canvas')

const ACCENT = '#1D4ED8'
const PAPER = '#FAF8F2'

/**
 * size: output pixels; glyph: fraction of the tile the 24-unit glyph spans;
 * radius: tile corner radius as a fraction (0 = full bleed for maskable/iOS).
 */
function icon(size, { glyph = 0.56, radius = 0.22 } = {}) {
  const c = createCanvas(size, size)
  const g = c.getContext('2d')
  g.fillStyle = ACCENT
  if (radius > 0) {
    g.beginPath()
    g.roundRect(0, 0, size, size, size * radius)
    g.fill()
  } else {
    g.fillRect(0, 0, size, size)
  }

  const unit = (size * glyph) / 24
  const ox = (size - 24 * unit) / 2
  const oy = (size - 24 * unit) / 2 + unit * 0.5
  const x = (v) => ox + v * unit
  const y = (v) => oy + v * unit
  g.strokeStyle = PAPER
  g.fillStyle = PAPER
  g.lineWidth = 2 * unit
  g.lineCap = 'round'
  g.lineJoin = 'round'

  // Body
  g.beginPath()
  g.roundRect(x(3), y(4), 18 * unit, 18 * unit, 2.5 * unit)
  g.stroke()
  // Rings
  for (const ring of [8, 16]) {
    g.beginPath()
    g.moveTo(x(ring), y(2))
    g.lineTo(x(ring), y(6))
    g.stroke()
  }
  // Header rule
  g.beginPath()
  g.moveTo(x(3), y(10))
  g.lineTo(x(21), y(10))
  g.stroke()
  // Days: two rows of three, the first one filled as "today"
  const days = [
    [8, 14],
    [12, 14],
    [16, 14],
    [8, 18],
    [12, 18],
    [16, 18],
  ]
  days.forEach(([dx, dy], i) => {
    g.beginPath()
    g.arc(x(dx), y(dy), (i === 0 ? 1.25 : 0.85) * unit, 0, Math.PI * 2)
    g.fill()
  })
  return c.toBuffer('image/png')
}

const out = (name, buf) => writeFileSync(new URL(`../public/${name}`, import.meta.url), buf)
out('pwa-192x192.png', icon(192))
out('pwa-512x512.png', icon(512))
// Android masks to a circle or squircle: full bleed, glyph inside the 80% safe zone.
out('pwa-maskable-512x512.png', icon(512, { glyph: 0.46, radius: 0 }))
// iOS rounds the corners itself and shows transparency as black: full bleed.
out('apple-touch-icon.png', icon(180, { glyph: 0.56, radius: 0 }))
// Google's sign-in screen logo (120 × 120, square).
out('logo-120.png', icon(120, { glyph: 0.56, radius: 0 }))
out('favicon-64.png', icon(64, { glyph: 0.62, radius: 0.22 }))
console.log('icons written')
