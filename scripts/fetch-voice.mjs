#!/usr/bin/env node
/**
 * Voice for the wall tablet (runs before every build).
 *
 * Fully Kiosk's browser has no speech-to-text, so the tablet uses Vosk instead: a free,
 * offline speech recognizer that runs in the page (Apache-2.0, not generative AI). This puts
 * its two files in public/voice/, which the app serves itself:
 *   - vosk-<version>.js: the recognizer (WebAssembly inside), copied from node_modules;
 *   - the small US English model (~41 MB), downloaded once into .cache/voice/ and checked
 *     against its SHA-256, so a changed or broken download never ships.
 * Neither file is committed. Phones and computers never load them (they have speech built in).
 */
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const VOSK_VERSION = JSON.parse(readFileSync(join(root, 'node_modules/vosk-browser/package.json'), 'utf8')).version
export const MODEL = {
  name: 'vosk-model-small-en-us-0.15',
  // vosk-browser's own copy of Alpha Cephei's model, packed the way it loads models (Apache-2.0).
  url: 'https://ccoreilly.github.io/vosk-browser/models/vosk-model-small-en-us-0.15.tar.gz',
  sha256: 'f0b24bb92a48ca575b6a96500d6b543f0f079c573dfe85bbe16001fc0404e1d8',
  bytes: 41184862,
}

const out = join(root, 'public/voice')
const cache = join(root, '.cache/voice')
mkdirSync(out, { recursive: true })
mkdirSync(cache, { recursive: true })

const sha = (buf) => createHash('sha256').update(buf).digest('hex')

// 1. The recognizer.
copyFileSync(join(root, 'node_modules/vosk-browser/dist/vosk.js'), join(out, `vosk-${VOSK_VERSION}.js`))

// 2. The model: from the cache when it's already there and intact, else downloaded once.
const cached = join(cache, `${MODEL.name}.tar.gz`)
let model = existsSync(cached) ? readFileSync(cached) : null
if (!model || sha(model) !== MODEL.sha256) {
  console.log(`Downloading the voice model (${Math.round(MODEL.bytes / 1e6)} MB, once)…`)
  const res = await fetch(MODEL.url, { headers: { 'User-Agent': 'FamilyOrganizer/1.0 (build; voice model)' } })
  if (!res.ok) throw new Error(`Voice model download failed: HTTP ${res.status}`)
  model = Buffer.from(await res.arrayBuffer())
  if (sha(model) !== MODEL.sha256) throw new Error('Voice model checksum mismatch: not shipping it.')
  writeFileSync(cached, model)
}
copyFileSync(cached, join(out, `${MODEL.name}.tar.gz`))
console.log(`Voice: vosk-${VOSK_VERSION}.js and ${MODEL.name}.tar.gz ready in public/voice/.`)
