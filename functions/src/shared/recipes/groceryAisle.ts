/**
 * Grocery list filing: which store aisle an item belongs in, with no outside service.
 *
 * In order:
 *  1. What this household taught it: moving an item to another aisle remembers that
 *     item ("learned"), so the next time it files itself the same way.
 *  2. Words that decide on their own ("frozen", household goods).
 *  3. A grocery table of everyday items and store brands, read from the end of the
 *     phrase first, because the last word names the thing ("potato chips" are chips,
 *     "orange juice" is juice, "chicken broth" is broth).
 *  4. The recipe ingredient dictionary (aisles.ts).
 *  5. Typos: the closest word in the table, one or two letters off ("brocoli").
 */
import { aisleFor, type Aisle } from './aisles.js'

const P: Aisle = 'Produce'
const M: Aisle = 'Meat & Seafood'
const D: Aisle = 'Dairy & Eggs'
const B: Aisle = 'Bakery'
const A: Aisle = 'Pantry'
const S: Aisle = 'Snacks & Drinks'
const F: Aisle = 'Frozen'
const H: Aisle = 'Household'

/** Everyday grocery words and brands, singular, lowercase. Longer phrases win over their last word. */
const TABLE: Record<string, Aisle> = {}
const add = (aisle: Aisle, words: string) =>
  words
    .split(',')
    .map((w) => w.trim())
    .filter(Boolean)
    .forEach((w) => (TABLE[w] = aisle))

add(P, `apple, banana, orange, lemon, lime, grape, strawberry, blueberry, raspberry, blackberry, berry, cherry, peach, pear, plum, nectarine, mango, pineapple, kiwi, melon,
  watermelon, cantaloupe, honeydew, grapefruit, clementine, cutie, tangerine, pomegranate, avocado, tomato, cherry tomato, potato, sweet potato, yam, onion, red onion,
  green onion, scallion, shallot, garlic, ginger, carrot, baby carrot, celery, cucumber, zucchini, squash, butternut squash, pumpkin, eggplant, pepper, bell pepper,
  jalapeno, broccoli, cauliflower, cabbage, brussels sprout, asparagus, green bean, snap pea, pea pod, corn on the cob, mushroom, spinach, kale, lettuce, romaine,
  arugula, spring mix, salad, salad kit, bagged salad, coleslaw mix, herb, basil, cilantro, parsley, mint, dill, rosemary, thyme, beet, radish, turnip, leek, fennel,
  artichoke, okra, bok choy, sprout, fruit, veggie, vegetable, produce, fresh herb, guacamole, pico de gallo`)
add(M, `chicken, chicken breast, chicken thigh, chicken wing, drumstick, rotisserie chicken, turkey, ground turkey, beef, ground beef, steak, roast, brisket, pork,
  pork chop, pork loin, tenderloin, rib, ham, bacon, sausage, bratwurst, hot dog, kielbasa, pepperoni, salami, prosciutto, deli meat, lunch meat, deli turkey,
  sliced turkey, meatball, lamb, veal, fish, salmon, tilapia, cod, tuna steak, shrimp, scallop, crab, lobster, seafood, meat`)
add(D, `milk, whole milk, skim milk, 2% milk, oat milk, almond milk, soy milk, lactaid, half and half, creamer, coffee creamer, cream, heavy cream, whipping cream,
  whipped cream, sour cream, cream cheese, cottage cheese, ricotta, cheese, string cheese, shredded cheese, sliced cheese, cheddar, mozzarella, parmesan, feta,
  swiss, provolone, brie, goat cheese, yogurt, greek yogurt, yogurt cup, kefir, butter, margarine, egg, egg white, orange juice, juice box, chobani, yoplait,
  tillamook, kerrygold, babybel, go-gurt, pudding cup, refrigerated dough, biscuit dough, crescent roll, hummus, dip, tofu, tempeh`)
add(B, `bread, sandwich bread, sourdough, baguette, roll, dinner roll, hamburger bun, hot dog bun, bun, bagel, english muffin, muffin, croissant, tortilla, flour tortilla,
  corn tortilla, tortilla wrap, pita, naan, flatbread, cake, cupcake, donut, doughnut, pie, brownie, danish, bakery, birthday cake, bread crumb, dave's killer bread`)
add(A, `pasta, spaghetti, penne, macaroni, mac and cheese, noodle, ramen, rice, brown rice, quinoa, couscous, oat, oatmeal, cereal, granola, flour, sugar, brown sugar,
  powdered sugar, baking soda, baking powder, yeast, vanilla, chocolate chip, cocoa, oil, olive oil, vegetable oil, cooking spray, vinegar, salt, pepper corn, spice,
  seasoning, cinnamon, broth, stock, bouillon, soup, canned soup, canned tomato, tomato sauce, tomato paste, pasta sauce, marinara, salsa, bean, black bean, pinto bean,
  kidney bean, chickpea, refried bean, lentil, canned corn, canned tuna, tuna, peanut butter, almond butter, nutella, jelly, jam, honey, syrup, maple syrup, ketchup,
  mustard, mayo, mayonnaise, ranch, dressing, salad dressing, bbq sauce, hot sauce, soy sauce, sriracha, relish, pickle, olive, sauerkraut, coconut milk, condensed milk,
  evaporated milk, applesauce, canned fruit, dried fruit, raisin, nut, almond, walnut, pecan, cashew, peanut, trail mix, baby food, formula, pancake mix, cake mix,
  brownie mix, frosting, sprinkle, food coloring, taco shell, taco seasoning, stuffing, gravy, instant potato, cheerios, kraft, campbell's, barilla, ragu, prego, quaker`)
add(S, `chip, potato chip, tortilla chip, pretzel, popcorn, cracker, goldfish, cheez-it, ritz, cookie, oreo, chips ahoy, candy, chocolate, chocolate bar, gum, mint candy,
  granola bar, protein bar, fruit snack, rice cake, snack, beef jerky, jerky, doritos, cheetos, lays, pringles, tostitos, fritos, takis, m&m, skittles, reese's,
  kit kat, snickers, peanut butter cup, pop tart, soda, pop, coke, diet coke, pepsi, sprite, dr pepper, ginger ale, root beer, seltzer, sparkling water, la croix, bubly, water, bottled water,
  juice, apple juice, lemonade, iced tea, tea, coffee, k-cup, coffee pod, espresso, energy drink, red bull, monster, gatorade, powerade, sports drink, kombucha,
  beer, wine, seltzer water, hard seltzer, white claw, vodka, whiskey, tequila, liquor, mixer, drink, beverage`)
add(F, `ice cream, frozen pizza, pizza, frozen vegetable, frozen fruit, frozen berry, frozen pea, frozen corn, popsicle, ice pop, waffle, eggo, frozen waffle, tater tot,
  french fry, fries, hash brown, chicken nugget, nugget, fish stick, frozen dinner, tv dinner, lean cuisine, burrito, frozen burrito, pot pie, ice, bag of ice,
  ice cube, sorbet, gelato, frozen yogurt, cool whip, ben & jerry's, haagen-dazs, edamame, dumpling, potsticker, egg roll`)
add(H, `paper towel, toilet paper, tissue, kleenex, napkin, paper plate, plastic cup, plastic fork, utensil, aluminum foil, foil, plastic wrap, parchment paper, wax paper,
  sandwich bag, ziploc, storage bag, freezer bag, trash bag, garbage bag, dish soap, dishwasher detergent, dishwasher pod, cascade, dawn, sponge, scrubber,
  laundry detergent, detergent, tide, tide pod, fabric softener, dryer sheet, bleach, clorox, lysol, windex, cleaner, all purpose cleaner, disinfecting wipe, wipe,
  baby wipe, diaper, pull-up, swiffer, mop, broom, battery, light bulb, candle, air freshener, charmin, bounty, scott, shampoo, conditioner, body wash, soap,
  hand soap, toothpaste, toothbrush, floss, mouthwash, deodorant, razor, shaving cream, lotion, sunscreen, chapstick, lip balm, cotton ball, q-tip, band-aid,
  bandage, ibuprofen, advil, tylenol, acetaminophen, allergy medicine, cold medicine, cough drop, tums, tum, vitamin, multivitamin, medicine, feminine product, tampon, pad,
  gift wrap, wrapping paper, gift bag, card, greeting card, birthday card, dog food, cat food, dog treat, cat litter, litter, pet food, bird seed, charcoal, lighter, match`)

/** Words that only describe the thing ("organic", "family size") or its package. */
const FILLER = new Set(
  `a an the of some organic fresh large small big medium mini jumbo family size value pack bag bags box boxes can cans jar jars bottle bottles carton cartons gallon
  gallons half dozen lb lbs pound pounds oz ounce ounces ct count pk case roll rolls loaf loaves package packages pkg tub tubs container containers bunch bunches
  head heads sliced chopped diced whole low fat nonfat reduced sugar free gluten unsweetened sweetened plain original store brand kirkland great value`.split(/\s+/),
)
// (Not "frozen", "canned", "diet", "sparkling" or "ground": those change the aisle.)
const isFiller = (w: string) => FILLER.has(w) || FILLER.has(singular(w))

/** Words whose singular ends in -ie (cookies → cookie, not cooky). */
const IE = new Set(['cookie', 'brownie', 'veggie', 'smoothie', 'pie', 'hoagie', 'pierogie', 'rotie', 'beanie'])

/** "Strawberries" → "strawberry", "tomatoes" → "tomato", "boxes" → "box"; leaves "glass", "hummus" alone. */
export function singular(word: string): string {
  if (word.length <= 3 || /(ss|us|is)$/.test(word)) return word
  if (word.endsWith('ies')) return IE.has(word.slice(0, -1)) ? word.slice(0, -1) : `${word.slice(0, -3)}y`
  if (/(oes|ches|shes|xes|zes|sses)$/.test(word)) return word.slice(0, -2)
  if (word.endsWith('s')) return word.slice(0, -1)
  return word
}

/** The item as a list of plain words: no amounts, packages or describing words, each one singular. */
export function itemWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[\d½¼¾⅓⅔.,/]+\s*(x\b)?/g, ' ')
    .replace(/[^a-z&'%\- ]/g, ' ')
    .split(/\s+/)
    .map((w) => w.replace(/^[-']+|[-']+$/g, ''))
    .filter(Boolean)
    // Describing and package words go, except as the last word, where they're the thing ("sandwich bags", "dinner rolls").
    .filter((w, i, all) => !isFiller(w) || (i === all.length - 1 && all.length > 1 && !isFiller(all[i - 1])))
    .map(singular)
}

/** The key an item is remembered by ("2 bags Organic Strawberries" → "strawberry"). */
export const learnKey = (text: string) => itemWords(text).join(' ').slice(0, 80)

/** Phrases from the end of the item first, longest first: "the thing" is named last. */
function fromTable(words: string[]): Aisle | null {
  for (let end = words.length; end > 0; end--) {
    for (let start = 0; start < end; start++) {
      const hit = TABLE[words.slice(start, end).join(' ')]
      if (hit) return hit
    }
  }
  return null
}

/** Edit distance, stopping early once it's past `max`. */
function distance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    let best = i
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
      best = Math.min(best, cur[j])
    }
    if (best > max) return max + 1
    prev = cur
  }
  return prev[b.length]
}

const SINGLE_WORDS = Object.keys(TABLE).filter((k) => !k.includes(' '))

/** The closest table word to a misspelled one ("brocoli" → broccoli), if it's close enough. */
function fromTypo(words: string[]): Aisle | null {
  for (let i = words.length - 1; i >= 0; i--) {
    const w = words[i]
    if (w.length < 5) continue
    const max = w.length >= 8 ? 2 : 1
    let best: { d: number; key: string } | null = null
    for (const key of SINGLE_WORDS) {
      const d = distance(w, key, max)
      if (d <= max && (!best || d < best.d)) best = { d, key }
    }
    if (best) return TABLE[best.key]
  }
  return null
}

/** The store aisle for a grocery item, or null when it can't tell. */
export function groceryAisle(text: string): Aisle | null {
  if (/\bfrozen\b/i.test(text)) return F
  const fixed = aisleFor(text)
  if (fixed === 'Household') return fixed
  const words = itemWords(text)
  return fromTable(words) ?? fixed ?? fromTypo(words)
}

/**
 * Which of a grocery list's categories an item files itself under, or null (the list's top).
 * `learned` is what the household taught it by moving items: learnKey(text) → category id
 * ('' = keep it at the top). That wins; then the item's last word as taught ("yogurt" was
 * taught, so "vanilla yogurt" follows it); then the aisle, by name.
 */
export function groceryCategory(text: string, categories: { id: string; name: string }[], learned: Record<string, string> = {}): string | null {
  if (!categories.length) return null
  const ids = new Set(categories.map((c) => c.id))
  const words = itemWords(text)
  const key = words.join(' ')
  if (key in learned && (learned[key] === '' || ids.has(learned[key]))) return learned[key] || null
  // The end of the phrase as taught: "paper towels" taught, so "2 packs select-a-size paper towels"
  // follows; "yogurt" taught, so "vanilla yogurt" does.
  for (let start = 1; start < words.length; start++) {
    const tail = learned[words.slice(start).join(' ')]
    if (tail && ids.has(tail)) return tail
  }
  const aisle = groceryAisle(text)
  return aisle ? (categories.find((c) => c.name.trim().toLowerCase() === aisle.toLowerCase())?.id ?? null) : null
}
