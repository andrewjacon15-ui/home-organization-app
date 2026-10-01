/**
 * A polite, safe page fetcher for recipe sites:
 *  - identifies itself (USER_AGENT) and obeys robots.txt;
 *  - one request per host every 2 seconds (shared across instances via crawlHosts/{host});
 *  - only public http(s) addresses: localhost, private networks, and the cloud metadata
 *    server are refused at connect time (checked on every redirect, so DNS tricks can't
 *    point it inward);
 *  - size and time limits.
 */
import { lookup as dnsLookup, type LookupAddress } from 'node:dns'
import http from 'node:http'
import https from 'node:https'
import { isIP, type LookupFunction } from 'node:net'
import zlib from 'node:zlib'

export const USER_AGENT = 'FamilyOrganizerRecipeImporter/1.0 (+https://home-organization-app-dkcbl.web.app; household recipe import)'
/** Our token in robots.txt groups. */
const ROBOTS_TOKEN = 'familyorganizerrecipeimporter'
export const HOST_GAP_MS = 2000
const ROBOTS_TTL_MS = 24 * 3600_000
const MAX_BYTES = 4 * 1024 * 1024
const TIMEOUT_MS = 12_000
const MAX_REDIRECTS = 5

export class FetchError extends Error {
  constructor(
    public reason: 'blocked-address' | 'robots' | 'http' | 'too-large' | 'not-html' | 'network' | 'bad-url',
    message: string,
  ) {
    super(message)
  }
}

// ---- addresses --------------------------------------------------------------

function ipv4ToInt(ip: string): number {
  return ip.split('.').reduce((n, p) => (n << 8) + Number(p), 0) >>> 0
}

const V4_BLOCKS: [string, number][] = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
]

/** True for loopback, private, link-local (incl. the metadata server), and other non-public addresses. */
export function isPrivateAddress(ip: string): boolean {
  const kind = isIP(ip)
  if (kind === 4) {
    const n = ipv4ToInt(ip)
    return V4_BLOCKS.some(([base, bits]) => (n >>> (32 - bits)) === (ipv4ToInt(base) >>> (32 - bits)))
  }
  if (kind === 6) {
    const v = ip.toLowerCase()
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v)
    if (mapped) return isPrivateAddress(mapped[1])
    return v === '::' || v === '::1' || /^f[cd]/.test(v) || /^fe[89ab]/.test(v) || /^ff/.test(v) || v.startsWith('64:ff9b:') || v.startsWith('2001:db8')
  }
  return true
}

/** DNS lookup that refuses non-public answers (used for every connection, so redirects are covered). */
export const safeLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, '', 0)
    const list = addresses as unknown as LookupAddress[]
    const bad = list.find((a) => isPrivateAddress(a.address))
    if (!list.length || bad) return callback(new FetchError('blocked-address', "That address isn't a public website."), '', 0)
    if ((options as { all?: boolean }).all) return (callback as unknown as (e: null, a: LookupAddress[]) => void)(null, list)
    callback(null, list[0].address, list[0].family)
  })
}

export function checkUrl(raw: string): URL {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    throw new FetchError('bad-url', "That doesn't look like a web address.")
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new FetchError('bad-url', 'Only http and https links can be imported.')
  if (u.username || u.password) throw new FetchError('bad-url', "Links with a user name or password can't be imported.")
  if (u.port && u.port !== '80' && u.port !== '443') throw new FetchError('blocked-address', "That address isn't a public website.")
  const host = u.hostname.toLowerCase()
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal') || host.endsWith('.local') || !host.includes('.')) {
    throw new FetchError('blocked-address', "That address isn't a public website.")
  }
  if (isIP(host.replace(/^\[|\]$/g, '')) && isPrivateAddress(host.replace(/^\[|\]$/g, ''))) throw new FetchError('blocked-address', "That address isn't a public website.")
  return u
}

// ---- robots.txt -------------------------------------------------------------

interface RobotsRule {
  allow: boolean
  path: string
}

/** The rules that apply to us: our own group if the site has one, else the `*` group. */
export function robotsRules(text: string, token = ROBOTS_TOKEN): RobotsRule[] {
  const groups: { agents: string[]; rules: RobotsRule[] }[] = []
  let current: { agents: string[]; rules: RobotsRule[] } | null = null
  let lastWasAgent = false
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*/, '').trim()
    const m = /^([a-z-]+)\s*:\s*(.*)$/i.exec(line)
    if (!m) continue
    const field = m[1].toLowerCase()
    const value = m[2].trim()
    if (field === 'user-agent') {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] }
        groups.push(current)
      }
      current.agents.push(value.toLowerCase())
      lastWasAgent = true
      continue
    }
    lastWasAgent = false
    if (!current) continue
    if (field === 'allow' || field === 'disallow') {
      if (field === 'disallow' && value === '') continue // "Disallow:" = allow everything
      current.rules.push({ allow: field === 'allow', path: value })
    }
  }
  const mine = groups.filter((g) => g.agents.some((a) => a !== '*' && token.includes(a)))
  const chosen = mine.length ? mine : groups.filter((g) => g.agents.includes('*'))
  return chosen.flatMap((g) => g.rules)
}

function ruleMatches(rulePath: string, path: string): boolean {
  const anchored = rulePath.endsWith('$')
  const body = anchored ? rulePath.slice(0, -1) : rulePath
  const re = new RegExp('^' + body.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + (anchored ? '$' : ''))
  return re.test(path)
}

/** Longest matching rule wins; Allow wins a tie. No rules = allowed. */
export function robotsAllows(rules: RobotsRule[], pathAndQuery: string): boolean {
  let best: RobotsRule | null = null
  for (const r of rules) {
    if (!ruleMatches(r.path, pathAndQuery)) continue
    if (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow)) best = r
  }
  return !best || best.allow
}

// ---- HTTP -------------------------------------------------------------------

export interface RawResponse {
  status: number
  url: string
  contentType: string
  body: string
}

/** One GET with redirects followed by hand (each hop re-checked), decompressed and size-capped. */
export type HttpGet = (url: string, accept: string) => Promise<RawResponse>

export const nodeHttpGet: HttpGet = async (start, accept) => {
  let url = checkUrl(start)
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await once(url, accept)
    if (res.status >= 300 && res.status < 400 && res.location) {
      url = checkUrl(new URL(res.location, url).toString())
      continue
    }
    return { status: res.status, url: url.toString(), contentType: res.contentType, body: res.body }
  }
  throw new FetchError('http', 'That page redirects too many times.')
}

function once(url: URL, accept: string): Promise<{ status: number; location?: string; contentType: string; body: string }> {
  const lib = url.protocol === 'https:' ? https : http
  return new Promise((resolve, reject) => {
    const req = lib.get(
      url,
      {
        lookup: safeLookup,
        timeout: TIMEOUT_MS,
        headers: { 'User-Agent': USER_AGENT, Accept: accept, 'Accept-Encoding': 'gzip, deflate, br', 'Accept-Language': 'en-US,en;q=0.8' },
      },
      (res) => {
        const status = res.statusCode ?? 0
        const contentType = String(res.headers['content-type'] ?? '')
        if (status >= 300 && status < 400) {
          res.resume()
          return resolve({ status, location: String(res.headers.location ?? ''), contentType, body: '' })
        }
        const enc = String(res.headers['content-encoding'] ?? '').toLowerCase()
        const stream = enc === 'gzip' ? res.pipe(zlib.createGunzip()) : enc === 'deflate' ? res.pipe(zlib.createInflate()) : enc === 'br' ? res.pipe(zlib.createBrotliDecompress()) : res
        const chunks: Buffer[] = []
        let size = 0
        stream.on('data', (c: Buffer) => {
          size += c.length
          if (size > MAX_BYTES) {
            req.destroy()
            reject(new FetchError('too-large', 'That page is too large to read.'))
            return
          }
          chunks.push(c)
        })
        stream.on('end', () => {
          const charset = /charset=([\w-]+)/i.exec(contentType)?.[1] ?? 'utf-8'
          let body: string
          try {
            body = new TextDecoder(charset).decode(Buffer.concat(chunks))
          } catch {
            body = Buffer.concat(chunks).toString('utf8')
          }
          resolve({ status, contentType, body })
        })
        stream.on('error', (e: Error) => reject(new FetchError('network', `Couldn't read that page (${e.message}).`)))
      },
    )
    req.on('timeout', () => req.destroy(new FetchError('network', 'That site took too long to answer.')))
    req.on('error', (e) => reject(e instanceof FetchError ? e : new FetchError('network', `Couldn't reach that site (${(e as NodeJS.ErrnoException).code ?? e.message}).`)))
  })
}

// ---- politeness (shared state) ----------------------------------------------

export interface HostRecord {
  robots: string | null
  robotsAt: number
}

/** Per-host robots.txt cache and request spacing, shared by every function instance. */
export interface HostStore {
  get(host: string): Promise<HostRecord | null>
  saveRobots(host: string, robots: string | null, at: number): Promise<void>
  /** Reserves the host's next request slot (≥ gap after the last); returns when it starts. */
  reserve(host: string, now: number, gap: number): Promise<number>
}

export interface FetcherDeps {
  get: HttpGet
  hosts: HostStore
  now?: () => number
  sleep?: (ms: number) => Promise<void>
}

/** robots.txt-checked, rate-limited HTML fetch. */
export async function fetchPage(deps: FetcherDeps, raw: string): Promise<{ url: string; html: string }> {
  const now = deps.now ?? Date.now
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  const url = checkUrl(raw)
  const host = url.host.toLowerCase()

  let rec = await deps.hosts.get(host)
  if (!rec || now() - rec.robotsAt > ROBOTS_TTL_MS) {
    let robots: string | null = null
    try {
      const res = await deps.get(`${url.protocol}//${url.host}/robots.txt`, 'text/plain')
      // 4xx = no robots.txt (everything allowed); 5xx = treat as "try later".
      if (res.status >= 500) throw new FetchError('http', `${host} isn't answering right now. Try again later.`)
      robots = res.status === 200 ? res.body.slice(0, 500_000) : null
    } catch (e) {
      if (e instanceof FetchError && (e.reason === 'blocked-address' || e.reason === 'http' || e.reason === 'bad-url')) throw e
      robots = null
    }
    await deps.hosts.saveRobots(host, robots, now())
    rec = { robots, robotsAt: now() }
  }
  if (rec.robots && !robotsAllows(robotsRules(rec.robots), url.pathname + url.search)) {
    throw new FetchError('robots', `${host.replace(/^www\./, '')} asks automated tools not to read this page, so it can't be imported. You can add the recipe by hand.`)
  }

  const start = await deps.hosts.reserve(host, now(), HOST_GAP_MS)
  if (start > now()) await sleep(start - now())

  const res = await deps.get(url.toString(), 'text/html,application/xhtml+xml')
  if (res.status === 401 || res.status === 403) throw new FetchError('http', `${host.replace(/^www\./, '')} didn't let the importer in (it may block automated tools). You can add the recipe by hand.`)
  if (res.status === 404 || res.status === 410) throw new FetchError('http', "That page doesn't exist anymore.")
  if (res.status >= 400) throw new FetchError('http', `${host.replace(/^www\./, '')} answered with an error (${res.status}). Try again later.`)
  if (res.contentType && !/html|xml/i.test(res.contentType)) throw new FetchError('not-html', "That link isn't a web page (it might be a PDF or image).")
  return { url: res.url, html: res.body }
}
