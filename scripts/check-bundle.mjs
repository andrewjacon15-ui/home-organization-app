#!/usr/bin/env node
/**
 * Bundle check (runs in CI after `npm run build`, and before every deploy):
 *  - size budgets, gzipped, so the wall tablet keeps loading fast and hosting stays small;
 *  - the production build must never point at the local emulators (a stray .env.local);
 *  - no source maps or stray large files are shipped.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const dist = join(root, 'dist')
const kb = (n) => Math.round(n / 102.4) / 10

/** Budgets in kB, gzipped. Raise one only on purpose, with a reason in the commit. */
const BUDGET = {
  entry: 45, // index-*.js: the app shell
  react: 75,
  firebase: 215,
  chunk: 25, // any other (lazy) chunk
  totalJs: 430,
  css: 30,
}

function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)]))
}

let all
try {
  all = files(dist)
} catch {
  console.error('No dist/ folder: run `npm run build` first.')
  process.exit(1)
}

const problems = []
const rows = []
let totalJs = 0
let css = 0
for (const f of all) {
  const name = f.slice(dist.length + 1).replace(/\\/g, '/')
  const raw = readFileSync(f)
  if (name.endsWith('.map')) problems.push(`${name}: source maps shouldn't be deployed.`)
  if (/\.(js|css|html)$/.test(name)) {
    const text = raw.toString('utf8')
    // The emulator ports (auth 9099, Firestore 8080 with 127.0.0.1) only appear when built with VITE_USE_EMULATORS.
    if (/(127\.0\.0\.1|localhost):(9099|8080|9199|5001)/.test(text) || /connectAuthEmulator\([^)]*9099/.test(text)) {
      problems.push(`${name}: points at the local emulators. Remove .env.local (VITE_USE_EMULATORS) and build again.`)
    }
  }
  if (name.endsWith('.js')) {
    const gz = gzipSync(raw).length
    totalJs += gz
    const kind = /^assets\/index-/.test(name) ? 'entry' : /^assets\/react-/.test(name) ? 'react' : /^assets\/firebase-/.test(name) ? 'firebase' : 'chunk'
    rows.push({ name, kind, gz })
    if (kb(gz) > BUDGET[kind]) problems.push(`${name}: ${kb(gz)} kB gzipped, over the ${BUDGET[kind]} kB budget for ${kind === 'chunk' ? 'a lazy chunk' : `the ${kind} chunk`}.`)
  } else if (name.endsWith('.css')) {
    css += gzipSync(raw).length
  } else if (statSync(f).size > 600 * 1024) {
    problems.push(`${name}: ${kb(statSync(f).size)} kB; large files belong in Cloud Storage, not the app.`)
  }
}
if (kb(totalJs) > BUDGET.totalJs) problems.push(`All JavaScript: ${kb(totalJs)} kB gzipped, over the ${BUDGET.totalJs} kB budget.`)
if (kb(css) > BUDGET.css) problems.push(`CSS: ${kb(css)} kB gzipped, over the ${BUDGET.css} kB budget.`)

rows.sort((a, b) => b.gz - a.gz)
for (const r of rows.slice(0, 6)) console.log(`  ${String(kb(r.gz)).padStart(6)} kB  ${r.name}`)
console.log(`  JavaScript ${kb(totalJs)} / ${BUDGET.totalJs} kB · CSS ${kb(css)} / ${BUDGET.css} kB (gzipped)`)
if (problems.length) {
  console.error(`\nBundle check failed (${problems.length}):`)
  for (const p of problems) console.error(`  ✗ ${p}`)
  process.exit(1)
}
console.log('Bundle check passed.')
