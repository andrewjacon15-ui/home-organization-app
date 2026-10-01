import { describe, expect, it } from 'vitest'
import { extractRecipes, type Block } from '../shared/recipes/extract.js'
import { openEpub } from './epub.js'
import { makeEpub, makeScannedPdf, makeTwoColumnPdf } from './fixtures.js'
import { openPdf } from './pdf.js'
import { BookError } from './reader.js'

async function allBlocks(reader: Awaited<ReturnType<typeof openEpub>>): Promise<Block[]> {
  const out: Block[] = []
  for (let i = 0; i < reader.units; i++) out.push(...(await reader.readUnit(i)).blocks)
  return out
}

describe('EPUB reader', () => {
  it('walks the spine, names chapters from the TOC, and finds every recipe', async () => {
    const book = await openEpub(await makeEpub())
    expect(book).toMatchObject({ format: 'epub', title: 'Family Suppers', author: 'Test Cook', units: 2, unitName: 'chapters' })
    expect(await book.cover()).toMatchObject({ contentType: 'image/png' })
    const { recipes } = extractRecipes(await allBlocks(book), true)
    expect(recipes.map((r) => r.title)).toEqual(['Lemon Garlic Chicken', 'Banana Bread'])
    expect(recipes[0]).toMatchObject({ servings: 4, prepMinutes: 10, cookMinutes: 25, loc: 'Weeknight Dinners' })
    expect(recipes[0].steps).toHaveLength(3)
    expect(recipes[1].items.map((i) => i.key)).toEqual(['banana', 'butter', 'sugar', 'egg', 'baking soda', 'flour'])
    expect(recipes[1].loc).toBe('Baking')
  })

  it('refuses DRM-protected books with a clear message', async () => {
    await expect(openEpub(await makeEpub({ encrypted: true }))).rejects.toThrow(/DRM/)
    await expect(openEpub(Buffer.from('not a zip'))).rejects.toBeInstanceOf(BookError)
  })
})

describe('PDF reader', () => {
  const noOcr = async () => {
    throw new Error('should not OCR a page with text')
  }

  it('reads a two-column page left column first, with the big title as a heading', async () => {
    const book = await openPdf(makeTwoColumnPdf(), noOcr)
    expect(book).toMatchObject({ format: 'pdf', units: 1, unitName: 'pages' })
    const { blocks, ocr } = await book.readUnit(0)
    expect(ocr).toBe(false)
    expect(blocks[0]).toMatchObject({ kind: 'heading', text: 'Simple Tomato Soup' })
    const { recipes } = extractRecipes(blocks, true)
    expect(recipes).toHaveLength(1)
    expect(recipes[0].items.map((i) => i.key)).toEqual(['butter', 'onion', 'canned tomato', 'vegetable stock', 'cream', 'sugar', expect.any(String), 'basil'])
    // Wrapped method lines are joined back into sentences.
    expect(recipes[0].steps[0]).toBe('Melt the butter in a large pot over medium heat and cook the onion until soft, about 8 minutes.')
    expect(recipes[0].confidence).toBeGreaterThanOrEqual(0.6)
  })

  it('rejects files that are not PDFs', async () => {
    await expect(openPdf(Buffer.from('nope'), noOcr)).rejects.toBeInstanceOf(BookError)
  })

  it('sends pages without a text layer to OCR and marks them', async () => {
    const book = await openPdf(await makeScannedPdf(), async (png) => {
      expect(png.subarray(1, 4).toString()).toBe('PNG')
      return ['Pancakes', '1 1/2 cups flour', '2 tbsp sugar', '2 tsp baking powder', '1 1/4 cups milk', '1 egg', 'Whisk the dry ingredients, add the milk, egg and butter,', 'and cook on a hot griddle until golden on both sides.']
    })
    const { blocks, ocr } = await book.readUnit(0)
    expect(ocr).toBe(true)
    expect(blocks[0].loc).toBe('p. 1 (OCR)')
    const { recipes } = extractRecipes(blocks, true)
    expect(recipes[0].title).toBe('Pancakes')
    expect(recipes[0].steps[0]).toContain('cook on a hot griddle')
  })
})

// Real OCR downloads the English model (~10 MB); run with RUN_OCR=1.
describe.runIf(process.env.RUN_OCR === '1')('real OCR', () => {
  it('reads a scanned page with tesseract', async () => {
    const { ocrPng } = await import('./ocr.js')
    const book = await openPdf(await makeScannedPdf(), ocrPng)
    const { blocks } = await book.readUnit(0)
    const { recipes } = extractRecipes(blocks, true)
    expect(recipes[0].title).toMatch(/Pancakes/i)
    expect(recipes[0].items.length).toBeGreaterThanOrEqual(5)
  }, 120_000)
})

describe('OCR cleanup', () => {
  it('fixes digit mix-ups at the start of ingredient lines', async () => {
    const { fixOcrLine } = await import('./ocr.js')
    expect(fixOcrLine('[1/2 cups flour')).toBe('1 1/2 cups flour')
    expect(fixOcrLine('l 1/2 cups flour')).toBe('1 1/2 cups flour')
    expect(fixOcrLine('I tsp salt')).toBe('1 tsp salt')
    expect(fixOcrLine('Iceberg lettuce')).toBe('Iceberg lettuce')
    expect(fixOcrLine('lemon juice')).toBe('lemon juice')
  })
})
