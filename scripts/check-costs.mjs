#!/usr/bin/env node
/**
 * Cost guard (runs in CI): fails when the code or config could start costing money.
 * Each check names the Google Cloud / Firebase free tier it protects; docs/COSTS.md has
 * the full picture. Static checks only — no credentials, nothing is called.
 */
import { fileURLToPath } from 'node:url'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = fileURLToPath(new URL('..', import.meta.url))
const read = (p) => readFileSync(join(root, p), 'utf8')
const problems = []
const notes = []
const fail = (msg) => problems.push(msg)

function walk(dir) {
  return readdirSync(join(root, dir), { withFileTypes: true }).flatMap((e) => {
    const p = `${dir}/${e.name}`
    if (e.isDirectory()) return e.name === 'node_modules' ? [] : walk(p)
    return /\.ts$/.test(e.name) && !/\.test\.ts$/.test(e.name) ? [p] : []
  })
}
const sources = walk('functions/src').map((p) => ({ p, text: read(p) }))
const all = sources.map((s) => s.text).join('\n')
const index = read('functions/src/index.ts')

// --- Cloud Scheduler: 3 jobs free per billing account; each onSchedule is one job.
const schedules = [...index.matchAll(/onSchedule\(\s*\{[^}]*schedule:\s*'([^']+)'/g)].map((m) => m[1])
if (schedules.length > 3) fail(`${schedules.length} scheduled functions: Cloud Scheduler's free tier is 3 jobs per billing account ($0.10/job/month after).`)
const perMonth = schedules.reduce((n, s) => {
  const m = /every (\d+) minutes?/.exec(s)
  const h = /every (\d+) hours?/.exec(s)
  return n + (m ? (30 * 24 * 60) / +m[1] : h ? (30 * 24) / +h[1] : 30)
}, 0)
notes.push(`scheduled jobs: ${schedules.length}/3 free (${schedules.join(', ')}) ≈ ${Math.round(perMonth).toLocaleString('en-US')} runs/month of 2,000,000 free invocations`)

// --- Functions: never keep instances warm; cap how far anything can scale.
if (/minInstances\s*:/.test(all)) fail('minInstances is set somewhere: a warm instance is billed around the clock.')
const global = /setGlobalOptions\(\{[^}]*maxInstances:\s*(\d+)/.exec(index)
if (!global) fail('functions/src/index.ts must call setGlobalOptions({ maxInstances }) so nothing scales without limit.')
else if (+global[1] > 10) fail(`Global maxInstances is ${global[1]}; keep it at 10 or less.`)
for (const m of all.matchAll(/maxInstances:\s*(\d+)/g)) if (+m[1] > 10) fail(`maxInstances ${m[1]} found; keep each function at 10 or less.`)

// --- Memory: only cookbook parsing (OCR) needs more than 512 MiB.
for (const m of index.matchAll(/export const (\w+) = \w+\(\s*\{([^}]*)\}/g)) {
  const mem = /memory:\s*'(\d+)(MiB|GiB)'/.exec(m[2])
  if (!mem) continue
  const mib = +mem[1] * (mem[2] === 'GiB' ? 1024 : 1)
  if (mib > 512 && m[1] !== 'processCookbook') fail(`${m[1]} asks for ${mem[1]}${mem[2]}; only processCookbook may use more than 512MiB.`)
  if (mib > 2048) fail(`${m[1]} asks for ${mem[1]}${mem[2]}; 2GiB is the most this app needs.`)
}

// --- Paid APIs: none of these belong in a household app on the free tier.
const PAID = ['openai', '@anthropic-ai/sdk', '@google-cloud/vertexai', '@google/generative-ai', '@google/genai', '@google-cloud/vision', '@google-cloud/translate', '@google-cloud/speech', '@google-cloud/text-to-speech', '@googlemaps/google-maps-services-js', 'twilio', '@sendgrid/mail', 'stripe', 'algoliasearch', '@google-cloud/tasks']
for (const pkg of ['package.json', 'functions/package.json']) {
  const deps = Object.keys({ ...JSON.parse(read(pkg)).dependencies })
  for (const d of deps) if (PAID.includes(d)) fail(`${pkg} depends on ${d}, a paid API. Ask the household first and note it in docs/COSTS.md.`)
}

// --- Brave Search: stays under the $5 monthly credit (1,000 searches).
const cap = /MONTHLY_CAP\s*=\s*(\d+)/.exec(read('functions/src/onlineSearch.ts'))
if (!cap || +cap[1] > 1000) fail('onlineSearch MONTHLY_CAP must be at most 1000 (Brave gives $5 of credit a month, about 1,000 searches).')
const flagFile = ['functions/src/shared/features.ts', 'functions/src/features.ts'].find((p) => {
  try {
    return !!read(p)
  } catch {
    return false
  }
})
const online = flagFile && /ONLINE_SEARCH\s*=\s*true/.test(read(flagFile))
notes.push(`online search: ${online ? `ON, capped at ${cap?.[1]} searches/month` : 'off'}`)

// --- Firestore: caches and finished items expire on their own (TTL deletes are free-tier deletes).
const ttl = JSON.parse(read('firestore.indexes.json')).fieldOverrides ?? []
for (const group of ['webCache', 'cookingSessions', 'items']) {
  if (!ttl.some((o) => o.collectionGroup === group && o.fieldPath === 'expireAt' && o.ttl)) fail(`firestore.indexes.json needs a TTL on ${group}.expireAt so old documents don't pile up.`)
}

// --- Cloud Storage: every upload has a size cap (5 GB stored is free).
const storage = read('storage.rules')
for (const m of storage.matchAll(/allow (?:create|write)[^;]*;/g)) {
  if (!/request\.resource\.size\s*</.test(m[0])) fail(`storage.rules: an upload rule has no size cap:\n    ${m[0].replace(/\s+/g, ' ').slice(0, 140)}`)
}

// --- Hosting: hashed assets cache for a year, so repeat visits don't download them again.
const hosting = JSON.parse(read('firebase.json')).hosting
const assetRule = (hosting.headers ?? []).find((h) => h.source === '/assets/**')
if (!assetRule?.headers?.some((h) => h.key === 'Cache-Control' && /immutable/.test(h.value))) fail('firebase.json: /assets/** needs a long, immutable Cache-Control (hosting downloads are free up to 10 GB/month).')

// --- Photos: uploaded with a long cache so the slideshow doesn't download them again.
if (!/'public, max-age=\d{7,}'/.test(read('src/features/photos/photosApi.ts'))) fail('Photo uploads must set a long cacheControl so the slideshow reuses downloaded photos.')

for (const n of notes) console.log(`  · ${n}`)
if (problems.length) {
  console.error(`\nCost check failed (${problems.length}):`)
  for (const p of problems) console.error(`  ✗ ${p}`)
  process.exit(1)
}
console.log('Cost check passed.')
