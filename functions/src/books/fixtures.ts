/** Builds small real EPUB and PDF files for tests (no binary fixtures in the repo). */
import JSZip from 'jszip'

export async function makeEpub(opts: { encrypted?: boolean } = {}): Promise<Buffer> {
  const zip = new JSZip()
  zip.file('mimetype', 'application/epub+zip')
  zip.file('META-INF/container.xml', `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`)
  if (opts.encrypted) {
    zip.file('META-INF/encryption.xml', `<encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container" xmlns:enc="http://www.w3.org/2001/04/xmlenc#"><enc:EncryptedData><enc:CipherData><enc:CipherReference URI="OEBPS/text/ch1.xhtml"/></enc:CipherData></enc:EncryptedData></encryption>`)
  }
  zip.file(
    'OEBPS/content.opf',
    `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Family Suppers</dc:title><dc:creator>Test Cook</dc:creator></metadata>
<manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="c1" href="text/ch1.xhtml" media-type="application/xhtml+xml"/><item id="c2" href="text/ch2.xhtml" media-type="application/xhtml+xml"/><item id="cover" href="images/cover.png" media-type="image/png" properties="cover-image"/></manifest>
<spine><itemref idref="c1"/><itemref idref="c2"/></spine></package>`,
  )
  zip.file('OEBPS/nav.xhtml', `<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><body><nav epub:type="toc"><ol><li><a href="text/ch1.xhtml">Weeknight Dinners</a></li><li><a href="text/ch2.xhtml">Baking</a></li></ol></nav></body></html>`)
  zip.file(
    'OEBPS/text/ch1.xhtml',
    `<html xmlns="http://www.w3.org/1999/xhtml"><body><h1>Weeknight Dinners</h1><p>Quick food for busy nights.</p>
<h2>Lemon Garlic Chicken</h2><p class="yield">Serves 4</p><p>Prep time: 10 minutes. Cook time: 25 minutes</p>
<h3>Ingredients</h3><ul><li>1½ lb boneless skinless chicken thighs</li><li>3 tbsp olive oil</li><li>4 cloves garlic, minced</li><li>1 lemon, zested and juiced</li></ul>
<h3>Method</h3><ol><li>Season the chicken with salt and pepper.</li><li>Brown the chicken in the oil, about 6 minutes per side.</li><li>Add garlic and lemon and simmer until cooked through.</li></ol></body></html>`,
  )
  zip.file(
    'OEBPS/text/ch2.xhtml',
    `<html xmlns="http://www.w3.org/1999/xhtml"><body><h1>Baking</h1><div class="recipe"><p class="recipe-title">Banana Bread</p><p class="ingredient">3 ripe bananas, mashed</p><p class="ingredient">1/3 cup melted butter</p><p class="ingredient">¾ cup sugar</p><p class="ingredient">1 egg</p><p class="ingredient">1 tsp baking soda</p><p class="ingredient">1 ½ cups flour</p><p>Mix everything together, pour into a loaf pan, and bake for 1 hour at 350°F.</p></div></body></html>`,
  )
  zip.file('OEBPS/images/cover.png', Buffer.from('89504e470d0a1a0a', 'hex'))
  return zip.generateAsync({ type: 'nodebuffer' })
}

/** Escapes text for a PDF string literal. */
const pdfText = (s: string) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')

/** Assembles a PDF from page content streams (Helvetica), with a valid xref table. */
function buildPdf(pages: { content: string; xobject?: { name: string; data: Buffer; width: number; height: number } }[]): Buffer {
  const objects: (string | Buffer)[] = []
  const add = (body: string | Buffer) => {
    objects.push(body)
    return objects.length
  }
  const font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')
  const pagesId = objects.length + 1 + pages.length * 3 + 1 // placeholder, fixed below
  const pageIds: number[] = []
  const pendingPages: { content: number; xobj?: number; name?: string }[] = []
  for (const p of pages) {
    const stream = Buffer.from(p.content, 'latin1')
    const content = add(Buffer.concat([Buffer.from(`<< /Length ${stream.length} >>\nstream\n`), stream, Buffer.from('\nendstream')]))
    let xobj: number | undefined
    if (p.xobject) {
      const { data, width, height } = p.xobject
      xobj = add(Buffer.concat([Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${data.length} >>\nstream\n`), data, Buffer.from('\nendstream')]))
    }
    pendingPages.push({ content, xobj, name: p.xobject?.name })
  }
  void pagesId
  const pagesObj = objects.length + pendingPages.length + 1
  for (const p of pendingPages) {
    const res = p.xobj ? `/Font << /F1 ${font} 0 R >> /XObject << /${p.name} ${p.xobj} 0 R >>` : `/Font << /F1 ${font} 0 R >>`
    pageIds.push(add(`<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 612 792] /Contents ${p.content} 0 R /Resources << ${res} >> >>`))
  }
  add(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`)
  const catalog = add(`<< /Type /Catalog /Pages ${pagesObj} 0 R >>`)

  const chunks: Buffer[] = [Buffer.from('%PDF-1.4\n')]
  const offsets: number[] = []
  let pos = chunks[0].length
  objects.forEach((body, i) => {
    offsets.push(pos)
    const buf = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`), typeof body === 'string' ? Buffer.from(body, 'latin1') : body, Buffer.from('\nendobj\n')])
    chunks.push(buf)
    pos += buf.length
  })
  const xref = [`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`, ...offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`)].join('')
  chunks.push(Buffer.from(`${xref}trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${pos}\n%%EOF\n`))
  return Buffer.concat(chunks)
}

/** Text lines at positions → a content stream. */
function textOps(lines: { x: number; y: number; size: number; text: string }[]): string {
  return lines.map((l) => `BT /F1 ${l.size} Tf ${l.x} ${l.y} Td (${pdfText(l.text)}) Tj ET`).join('\n')
}

/** One two-column page: a big title across the top, ingredients left, method right. */
export function makeTwoColumnPdf(): Buffer {
  const left = ['2 tbsp butter', '1 onion, diced', '2 cans whole peeled tomatoes', '2 cups vegetable stock', '1/2 cup heavy cream', '1 tsp sugar', 'Salt and pepper, to taste', 'Fresh basil, to serve']
  const right = [
    'Melt the butter in a large pot',
    'over medium heat and cook the',
    'onion until soft, about 8 minutes.',
    'Add the tomatoes and the stock',
    'and simmer for 20 minutes.',
    'Blend until smooth, then stir in',
    'the cream and the sugar.',
    'Season and serve with basil.',
  ]
  const lines = [
    { x: 72, y: 720, size: 22, text: 'Simple Tomato Soup' },
    ...left.map((text, i) => ({ x: 72, y: 670 - i * 16, size: 11, text })),
    ...right.map((text, i) => ({ x: 330, y: 670 - i * 16, size: 11, text })),
  ]
  return buildPdf([{ content: textOps(lines) }])
}

/** A "scanned" page: the recipe drawn into an image, no text layer. */
export async function makeScannedPdf(): Promise<Buffer> {
  const { createCanvas } = await import('@napi-rs/canvas')
  const width = 1275
  const height = 1650
  const canvas = createCanvas(width, height)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  ctx.fillStyle = '#000000'
  ctx.font = 'bold 64px sans-serif'
  ctx.fillText('Pancakes', 150, 200)
  ctx.font = '40px sans-serif'
  const lines = ['1 1/2 cups flour', '2 tbsp sugar', '2 tsp baking powder', '1 1/4 cups milk', '1 egg', '3 tbsp melted butter', 'Whisk the dry ingredients, add the milk, egg and butter,', 'and cook on a hot griddle until golden on both sides.']
  lines.forEach((l, i) => ctx.fillText(l, 150, 320 + i * 70))
  const jpeg = await canvas.encode('jpeg', 92)
  const content = `q 612 0 0 792 0 0 cm /Im1 Do Q`
  return buildPdf([{ content, xobject: { name: 'Im1', data: Buffer.from(jpeg), width, height } }])
}
