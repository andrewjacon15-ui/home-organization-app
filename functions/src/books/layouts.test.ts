/**
 * Cookbook layouts the PDF reader must handle, built as real PDFs: a classic single-column
 * book, a magazine page with two recipes side by side, a book whose recipe titles are bold
 * body text (only chapter names are big), a sidebar layout, and a family cookbook with two
 * ingredient columns. Each has running headers and page numbers to ignore.
 */
import { describe, expect, it } from 'vitest'
import { extractRecipes, type Block, type ExtractedRecipe } from '../shared/recipes/extract.js'
import { makePdf, wrap, type PdfLine } from './fixtures.js'
import { openPdf } from './pdf.js'

const noOcr = async () => {
  throw new Error('should not OCR a page with text')
}

/** Lays lines down a column from the top, like a typesetter. */
class Column {
  lines: PdfLine[] = []
  constructor(
    public x: number,
    public y: number,
    public width: number,
  ) {}
  add(text: string, size = 10, gapAfter = 0.4) {
    for (const t of wrap(text, this.width, size)) {
      this.lines.push({ x: this.x, y: this.y, size, text: t })
      this.y -= size * 1.35
    }
    this.y -= size * gapAfter
    return this
  }
  space(pts: number) {
    this.y -= pts
    return this
  }
}

/** Page furniture every layout carries: a running header and a page number. */
const furniture = (n: number): PdfLine[] => [
  { x: 54, y: 760, size: 8, text: 'THE FAMILY TABLE' },
  { x: 300, y: 30, size: 8, text: String(n) },
]

async function recipesOf(pdf: Buffer): Promise<ExtractedRecipe[]> {
  const book = await openPdf(pdf, noOcr)
  const blocks: Block[] = []
  for (let i = 0; i < book.units; i++) blocks.push(...(await book.readUnit(i)).blocks)
  return extractRecipes(blocks, true).recipes
}

const allText = (r: ExtractedRecipe) => [r.title, ...r.ingredientLines, ...r.steps, ...r.notes].join('\n')

describe('cookbook layouts', () => {
  it('classic: labels, yield and times, numbered wrapped steps, a recipe running onto the next page', async () => {
    const p1 = new Column(72, 720, 468)
    p1.add('Weeknight Chili', 20, 0.6)
      .add('Serves 6 · Prep 15 min · Cook 45 min', 10, 1)
      .add('INGREDIENTS', 10)
      .add('2 tbsp olive oil')
      .add('1 large onion, chopped')
      .add('3 cloves garlic, minced')
      .add('2 lb ground beef')
      .add('2 tbsp chili powder')
      .add('1 (28-ounce) can crushed tomatoes')
      .add('2 (15-ounce) cans kidney beans, drained and rinsed')
      .space(10)
      .add('METHOD', 10)
      .add('1. Heat the oil in a large heavy pot over medium heat. Add the onion and cook, stirring often, until soft and golden, about 8 minutes.')
      .add('2. Add the garlic and the beef and cook, breaking up the meat with a spoon, until no pink remains.')
    const p2 = new Column(72, 720, 468)
    p2.add('3. Stir in the chili powder, tomatoes, and beans. Simmer, partly covered, for 30 minutes, stirring now and then.')
      .add('4. Taste, season with salt, and serve with your favorite toppings.')
      .space(24)
      .add('Cornbread', 20, 0.6)
      .add('Makes one 9-inch pan', 10, 1)
      .add('INGREDIENTS', 10)
      .add('1 cup cornmeal')
      .add('1 cup all-purpose flour')
      .add('1 tbsp baking powder')
      .add('1 cup milk')
      .add('2 eggs')
      .space(10)
      .add('METHOD', 10)
      .add('1. Heat the oven to 400°F and butter a 9-inch pan.')
      .add('2. Whisk the dry ingredients, then stir in the milk and eggs. Bake for 20 to 25 minutes.')
    const recipes = await recipesOf(makePdf([[...furniture(1), ...p1.lines], [...furniture(2), ...p2.lines]]))

    expect(recipes.map((r) => r.title)).toEqual(['Weeknight Chili', 'Cornbread'])
    const [chili, bread] = recipes
    expect(chili).toMatchObject({ servings: 6, prepMinutes: 15, cookMinutes: 45 })
    expect(chili.items.map((i) => i.key)).toEqual(['olive oil', 'onion', 'garlic', 'ground beef', 'chili powder', expect.any(String), expect.any(String)])
    expect(chili.steps).toHaveLength(4)
    expect(chili.steps[0]).toBe('Heat the oil in a large heavy pot over medium heat. Add the onion and cook, stirring often, until soft and golden, about 8 minutes.')
    expect(bread.items).toHaveLength(5)
    expect(bread.steps).toHaveLength(2)
    for (const r of recipes) expect(allText(r)).not.toMatch(/FAMILY TABLE|^\d+$/m)
  })

  it('magazine: two recipes side by side, each in its own column', async () => {
    const left = new Column(54, 720, 240)
    left
      .add('Lemon Bars', 16, 0.6)
      .add('1 cup flour')
      .add('1/2 cup butter, softened')
      .add('1/4 cup powdered sugar')
      .add('2 eggs')
      .add('1 cup sugar')
      .add('3 tbsp lemon juice')
      .space(8)
      .add('Press the flour, butter, and powdered sugar into a pan and bake for 20 minutes. Beat the eggs, sugar, and lemon juice, pour over the crust, and bake 25 minutes more.')
    const right = new Column(324, 720, 240)
    right
      .add('Iced Tea', 16, 0.6)
      .add('6 black tea bags')
      .add('8 cups water')
      .add('1/2 cup sugar')
      .add('1 lemon, sliced')
      .space(8)
      .add('Steep the tea bags in 4 cups of boiling water for 5 minutes. Stir in the sugar, add the cold water, and chill. Serve over ice with lemon.')
    const recipes = await recipesOf(makePdf([[...furniture(12), ...left.lines, ...right.lines]]))

    expect(recipes.map((r) => r.title)).toEqual(['Lemon Bars', 'Iced Tea'])
    expect(recipes[0].items.map((i) => i.key)).toEqual(['flour', 'butter', 'powdered sugar', 'egg', 'sugar', 'lemon'])
    expect(recipes[1].items).toHaveLength(4)
    expect(recipes[0].steps.join(' ')).toContain('bake 25 minutes more')
    expect(recipes[1].steps.join(' ')).not.toContain('bake')
  })

  it('bold titles: recipe names in body-size capitals under a big chapter heading', async () => {
    const col = new Column(72, 720, 468)
    col
      .add('Cookies', 24, 1)
      .add('Every holiday tin in our house starts with these.', 11, 1)
      .add('CHOCOLATE CHIP COOKIES', 11)
      .add('2 1/4 cups flour', 11, 0)
      .add('1 tsp baking soda', 11, 0)
      .add('1 cup butter, softened', 11, 0)
      .add('3/4 cup brown sugar', 11, 0)
      .add('2 eggs', 11, 0)
      .add('2 cups chocolate chips', 11)
      .add('Cream the butter and sugar, beat in the eggs, then stir in the flour, soda, and chips. Bake at 375°F for 10 minutes.', 11, 1.5)
      .add('SNICKERDOODLES', 11)
      .add('2 3/4 cups flour', 11, 0)
      .add('2 tsp cream of tartar', 11, 0)
      .add('1 cup butter', 11, 0)
      .add('1 1/2 cups sugar', 11, 0)
      .add('2 tbsp cinnamon sugar', 11)
      .add('Mix the dough, roll into balls, coat in cinnamon sugar, and bake at 400°F for 8 minutes.', 11)
    const recipes = await recipesOf(makePdf([[...furniture(40), ...col.lines]]))

    expect(recipes.map((r) => r.title)).toEqual(['CHOCOLATE CHIP COOKIES', 'SNICKERDOODLES'])
    expect(recipes[0].items).toHaveLength(6)
    expect(recipes[1].items).toHaveLength(5)
    expect(recipes[1].steps).toHaveLength(1)
  })

  it('sidebar: ingredients in a narrow left column beside numbered steps', async () => {
    const title = new Column(54, 720, 504).add('Roast Chicken', 20, 0.8)
    const side = new Column(54, title.y, 150)
    side.add('1 whole chicken (about 4 lb)').add('2 tbsp butter, softened').add('1 lemon, halved').add('4 sprigs thyme').add('Salt and pepper')
    const steps = new Column(230, title.y, 330)
    steps
      .add('1. Heat the oven to 425°F. Pat the chicken dry and rub it all over with the butter.')
      .add('2. Season well, tuck the lemon and thyme inside, and roast for 1 hour 15 minutes.')
      .add('3. Rest for 15 minutes before carving.')
    const recipes = await recipesOf(makePdf([[...furniture(7), ...title.lines, ...side.lines, ...steps.lines]]))

    expect(recipes).toHaveLength(1)
    expect(recipes[0].title).toBe('Roast Chicken')
    expect(recipes[0].items.map((i) => i.key)).toEqual(['whole chicken', 'butter', 'lemon', 'thyme', expect.any(String)])
    expect(recipes[0].items[0].note).toContain('about 4 lb')
    expect(recipes[0].steps).toHaveLength(3)
  })

  it('family cookbook: two ingredient columns, a wrapped ingredient, a note, and "Recipe by"', async () => {
    const page: PdfLine[] = [
      ...furniture(10),
      { x: 222, y: 651, size: 16, text: 'Honey Lime Chicken' },
      { x: 150, y: 622, size: 8, text: 'Grandma made this every Fourth of July.' },
      { x: 36, y: 596, size: 10, text: '2 1/2 C dry sherry' },
      { x: 36, y: 580, size: 10, text: '2 Tbs cinnamon' },
      { x: 289, y: 596, size: 10, text: '1/2 C + 2 Tbs lime juice' },
      { x: 289, y: 580, size: 10, text: '1 whole chicken (washed, dried, cut, ready to' },
      { x: 289, y: 564, size: 10, text: 'grill)' },
      { x: 289, y: 548, size: 10, text: '1 - 16oz can tomato sauce' },
      { x: 85, y: 520, size: 9, text: 'Mix marinade ingredients. Arrange chicken in a shallow pan; pour over marinade. Turn' },
      { x: 85, y: 508, size: 9, text: 'chicken, coating well. Refrigerate overnight. Grill or broil, basting with marinade, for' },
      { x: 85, y: 496, size: 9, text: '20 minutes.' },
      { x: 195, y: 470, size: 9, text: 'Yield: 6 servings | Recipe by Karen' },
    ]
    const [r] = await recipesOf(makePdf([page]))

    expect(r.title).toBe('Honey Lime Chicken')
    expect(r.ingredientLines).toEqual(['2 1/2 C dry sherry', '2 Tbs cinnamon', '1/2 C + 2 Tbs lime juice', '1 whole chicken (washed, dried, cut, ready to grill)', '1 - 16oz can tomato sauce'])
    expect(r.items[2]).toMatchObject({ qty: 0.5, unit: 'cup', key: 'lime' })
    expect(r.items[4]).toMatchObject({ qty: 1, unit: 'can', key: 'tomato sauce' })
    expect(r.notes).toEqual(['Grandma made this every Fourth of July.'])
    expect(r).toMatchObject({ credit: 'Karen', servings: 6, yieldText: 'Yield: 6 servings' })
    expect(r.steps.join(' ')).toContain('basting with marinade, for 20 minutes.')
  })

  it('skips a contents page', async () => {
    const toc: PdfLine[] = [{ x: 200, y: 720, size: 16, text: 'Contents' }]
    ;['Weeknight Chili', 'Cornbread', 'Lemon Bars', 'Iced Tea', 'Roast Chicken', 'Snickerdoodles', 'Pancakes', 'Pot Roast', 'Apple Pie'].forEach((t, i) =>
      toc.push({ x: 72, y: 680 - i * 18, size: 10, text: t }, { x: 500, y: 680 - i * 18, size: 10, text: String(10 + i * 3) }),
    )
    const book = await openPdf(makePdf([toc]), noOcr)
    expect((await book.readUnit(0)).blocks).toEqual([])
  })
})
