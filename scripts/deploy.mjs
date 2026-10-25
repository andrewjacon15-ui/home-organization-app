#!/usr/bin/env node
/**
 * Deploys to production, only from what's on GitHub's main:
 *  - the checkout is clean and exactly origin/main (merged pull requests passed `npm run verify`);
 *  - no .env file that changes the production build (.env.local turns on the emulators);
 *  - builds, runs the bundle check (which also refuses an emulator build), deploys;
 *  - then checks the live site serves the build just made.
 *
 *   npm run deploy                     hosting + Firestore and Storage rules
 *   npm run deploy -- hosting          only the web app
 *   npm run deploy -- functions        Cloud Functions (secrets are pinned at deploy time)
 *   npm run deploy -- hosting,functions
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const PROJECT = 'home-organization-app-dkcbl'
const SITE = `https://${PROJECT}.web.app/`
const TARGETS = ['hosting', 'firestore', 'storage', 'functions']

const only = (process.argv[2] ?? 'hosting,firestore,storage').split(',').map((t) => t.trim()).filter(Boolean)
const unknown = only.filter((t) => !TARGETS.includes(t))
if (unknown.length) fail(`Unknown deploy target: ${unknown.join(', ')} (use ${TARGETS.join(', ')}).`)

function fail(message) {
  console.error(`\n✗ ${message}`)
  process.exit(1)
}
const git = (...args) => execFileSync('git', args, { cwd: root }).toString('utf8').trimEnd()
/** Runs a command in the repo, showing its output; stops the deploy if it fails. */
function run(cmd, args, env = {}) {
  console.log(`\n› ${cmd} ${args.join(' ')}`)
  // npm and npx are .cmd files on Windows, which only start through a shell.
  const r = spawnSync(cmd, args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32', env: { ...process.env, ...env } })
  if (r.status !== 0) fail(`${cmd} ${args[0]} failed.`)
}

// 1. Exactly main, as merged.
git('fetch', '--quiet', 'origin', 'main')
const head = git('rev-parse', 'HEAD')
const main = git('rev-parse', 'origin/main')
if (head !== main) fail(`This checkout is at ${head.slice(0, 7)}, not origin/main (${main.slice(0, 7)}). Deploy only what's merged: check out main and pull.`)
const dirty = git('status', '--porcelain')
if (dirty) fail(`The checkout has changes that aren't on main:\n${dirty}`)

// 2. No local settings in the production build (Vite reads these for `vite build`).
const envFiles = readdirSync(root).filter((f) => /^\.env(\.local|\.production|\.production\.local)?$/.test(f))
if (envFiles.length) fail(`${envFiles.join(', ')} would change the production build (.env.local turns on the emulators). Move it aside and run again.`)

// 3. Build and check what will be deployed.
if (only.includes('hosting')) {
  run('npm', ['run', 'build'])
  run('npm', ['run', 'check:bundle'])
}
if (only.includes('functions')) run('npm', ['run', 'build', '--prefix', 'functions'])

// 4. Deploy.
run('npx', ['firebase', 'deploy', '--only', only.join(','), '--project', PROJECT], only.includes('functions') ? { FUNCTIONS_DISCOVERY_TIMEOUT: '60' } : {})

// 5. The live site serves this build.
if (only.includes('hosting')) {
  const built = readFileSync(join(root, 'dist', 'index.html'), 'utf8').match(/assets\/index-[\w-]+\.js/)?.[0]
  const live = await fetch(SITE, { cache: 'no-store' }).then((r) => r.text()).then((t) => t.match(/assets\/index-[\w-]+\.js/)?.[0], () => null)
  if (!built || built !== live) fail(`The live site serves ${live ?? 'nothing readable'}, not this build's ${built}. Check the Firebase console.`)
  console.log(`\n✓ ${SITE} serves ${built} (main ${head.slice(0, 7)}).`)
  console.log('  Devices pick up the new web app on their next reload (Settings → About → Check for updates).')
}
console.log(`✓ Deployed ${only.join(', ')} from main ${head.slice(0, 7)}.`)
