/**
 * EPUB → chapters of text blocks. Walks the OPF spine in reading order, names chapters from
 * the table of contents (nav.xhtml or toc.ncx), and turns XHTML into headings / paragraphs /
 * list items for the rule-based extractor.
 */
import * as cheerio from 'cheerio'
import JSZip from 'jszip'
import type { Block } from '../shared/recipes/extract.js'
import { BookError, type BookReader } from './reader.js'

const BLOCK_TAGS = new Set(['p', 'div', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'td', 'th', 'dt', 'dd', 'blockquote', 'figcaption', 'section', 'article', 'header', 'aside', 'tr', 'ul', 'ol', 'table', 'tbody', 'thead', 'body'])

/** Resolves `href` relative to the directory of `base` ("OEBPS/content.opf" + "text/ch1.xhtml"). */
function resolve(base: string, href: string): string {
  const parts = base.split('/').slice(0, -1)
  for (const seg of decodeURIComponent(href.split('#')[0]).split('/')) {
    if (seg === '..') parts.pop()
    else if (seg && seg !== '.') parts.push(seg)
  }
  return parts.join('/')
}

/** XHTML → blocks, keeping heading levels and list items; class names like "ingredient" help. */
export function xhtmlToBlocks(xhtml: string, loc: string): Block[] {
  const $ = cheerio.load(xhtml)
  $('script, style, nav[epub\\:type="toc"], aside[epub\\:type="footnote"]').remove()
  const blocks: Block[] = []
  const visit = (el: Parameters<typeof $>[0]) => {
    const node = $(el)
    const tag = (el as { tagName?: string }).tagName?.toLowerCase() ?? ''
    // Only leaf blocks become text: a block element with no block children.
    const hasBlockChild = node.children().toArray().some((c) => BLOCK_TAGS.has(((c as { tagName?: string }).tagName ?? '').toLowerCase()))
    if (BLOCK_TAGS.has(tag) && !hasBlockChild && tag !== 'body') {
      const text = node.text().replace(/\s+/g, ' ').trim()
      if (!text) return
      const cls = `${node.attr('class') ?? ''} ${node.attr('epub:type') ?? ''}`.toLowerCase()
      if (/^h[1-6]$/.test(tag)) blocks.push({ kind: 'heading', level: Number(tag[1]), text, loc })
      else if (/(recipe-?(title|name|head)|\brt\b|\bhd\b|title)/.test(cls) && text.length < 90) blocks.push({ kind: 'heading', level: 2, text, loc })
      else if (tag === 'li' || /ingredient|\bingr|\bing\b/.test(cls)) blocks.push({ kind: 'item', text, loc })
      else blocks.push({ kind: 'text', text, loc })
      return
    }
    node.children().each((_, c) => visit(c))
  }
  const body = $('body')[0]
  if (body) visit(body)
  return blocks
}

export async function openEpub(buffer: Buffer): Promise<BookReader> {
  let zip: JSZip
  try {
    zip = await JSZip.loadAsync(buffer)
  } catch {
    throw new BookError("This doesn't look like an EPUB file.")
  }
  const read = async (path: string) => {
    const f = zip.file(path)
    if (!f) throw new BookError(`The EPUB is missing ${path}.`)
    return f.async('string')
  }

  // DRM: Adobe/Apple/Kindle-style encryption of content documents (fonts alone are fine).
  const enc = zip.file('META-INF/encryption.xml')
  if (enc) {
    const xml = await enc.async('string')
    // Element names carry a namespace prefix (enc:CipherReference), so match the raw XML.
    const encrypted = [...xml.matchAll(/CipherReference[^>]*\bURI\s*=\s*"([^"]+)"/g)].map((m) => m[1])
    if (encrypted.some((uri) => /\.(x?html?|xml|ncx)$/i.test(uri))) throw new BookError("Can't read this file: it's DRM-protected.")
  }

  const container = cheerio.load(await read('META-INF/container.xml'), { xml: true })
  const opfPath = container('rootfile').attr('full-path')
  if (!opfPath) throw new BookError('The EPUB has no package file.')
  const opf = cheerio.load(await read(opfPath), { xml: true })

  const manifest = new Map<string, { href: string; type: string; props: string }>()
  opf('manifest > item').each((_, el) => {
    const i = opf(el)
    manifest.set(i.attr('id') ?? '', { href: resolve(opfPath, i.attr('href') ?? ''), type: i.attr('media-type') ?? '', props: i.attr('properties') ?? '' })
  })
  const spine = opf('spine > itemref')
    .toArray()
    .map((el) => manifest.get(opf(el).attr('idref') ?? ''))
    .filter((m): m is { href: string; type: string; props: string } => !!m && /html|xml/.test(m.type))

  // Chapter names from the TOC (EPUB 3 nav, else EPUB 2 NCX).
  const labels = new Map<string, string>()
  const navItem = [...manifest.values()].find((m) => m.props.split(/\s+/).includes('nav'))
  const ncxId = opf('spine').attr('toc')
  try {
    if (navItem) {
      const nav = cheerio.load(await read(navItem.href))
      nav('nav a').each((_, a) => {
        const href = nav(a).attr('href')
        if (href) labels.set(resolve(navItem.href, href), nav(a).text().replace(/\s+/g, ' ').trim())
      })
    } else if (ncxId && manifest.get(ncxId)) {
      const ncxPath = manifest.get(ncxId)!.href
      const ncx = cheerio.load(await read(ncxPath), { xml: true })
      ncx('navPoint').each((_, p) => {
        const src = ncx(p).children('content').attr('src')
        const text = ncx(p).children('navLabel').text().replace(/\s+/g, ' ').trim()
        if (src && !labels.has(resolve(ncxPath, src))) labels.set(resolve(ncxPath, src), text)
      })
    }
  } catch {
    // A broken TOC only costs us chapter names.
  }

  const coverId = opf('meta[name="cover"]').attr('content')
  const coverItem = [...manifest.values()].find((m) => m.props.split(/\s+/).includes('cover-image')) ?? (coverId ? manifest.get(coverId) : undefined)

  return {
    format: 'epub',
    title: opf('metadata title, metadata dc\\:title').first().text().trim() || null,
    author: opf('metadata creator, metadata dc\\:creator').first().text().trim() || null,
    units: spine.length,
    unitName: 'chapters',
    async cover() {
      if (!coverItem || !/^image\//.test(coverItem.type)) return null
      const data = await zip.file(coverItem.href)?.async('nodebuffer')
      return data ? { data, contentType: coverItem.type } : null
    },
    async readUnit(i) {
      const item = spine[i]
      const label = labels.get(item.href) ?? `Chapter ${i + 1}`
      return { blocks: xhtmlToBlocks(await read(item.href), label), ocr: false }
    },
  }
}
