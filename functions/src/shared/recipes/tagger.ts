/**
 * Keyword auto-tagger: meal type, cuisine, main ingredient, and diet from a recipe's title,
 * parsed ingredients, and any category/cuisine/keywords a web page supplied. Rule-based;
 * the family can edit the result (recipes keep `tagsEdited` so re-tagging leaves it alone).
 */
import { familyOf } from './dictionary.js'

export interface RecipeTags {
  meal: string[]
  cuisine: string[]
  main: string[]
  diet: string[]
}

export const TAG_OPTIONS: Record<keyof RecipeTags, string[]> = {
  meal: ['breakfast', 'lunch', 'dinner', 'side', 'dessert', 'snack', 'drink'],
  cuisine: ['american', 'italian', 'mexican', 'chinese', 'japanese', 'korean', 'thai', 'vietnamese', 'indian', 'mediterranean', 'middle eastern', 'french'],
  main: ['chicken', 'beef', 'pork', 'lamb', 'turkey', 'fish', 'seafood', 'tofu', 'eggs', 'beans', 'pasta', 'rice', 'vegetables'],
  diet: ['vegetarian', 'vegan', 'gluten-free', 'dairy-free'],
}

export const TAG_LABELS: Record<keyof RecipeTags, string> = { meal: 'Meal', cuisine: 'Cuisine', main: 'Main ingredient', diet: 'Diet' }

export const emptyTags = (): RecipeTags => ({ meal: [], cuisine: [], main: [], diet: [] })

export interface TagInput {
  title: string
  /** Parsed ingredients (key + family from the dictionary; known = matched it). */
  items: { key: string; family: string; known: boolean }[]
  /** Words a web page gave us: recipeCategory, recipeCuisine, keywords. */
  hints?: string[]
}

// ---- meal type --------------------------------------------------------------

const MEAL_WORDS: Record<string, RegExp> = {
  breakfast: /\b(breakfast|brunch|pancakes?|waffles?|oatmeal|porridge|granola|omelett?es?|frittata|french toast|scrambled eggs|hash browns?|crepes?|breakfast burrito|overnight oats|shakshuka)\b/,
  dessert: /\b(desserts?|cakes?|cupcakes?|cookies?|brownies?|blondies?|pies?|tarts?|puddings?|ice cream|gelato|sorbet|cobbler|crisp|crumble|cheesecake|fudge|mousse|custard|tiramisu|truffles?|macarons?|meringues?|sweets?|frosting|cinnamon rolls?)\b/,
  snack: /\b(snacks?|dips?|hummus|popcorn|trail mix|energy (?:bites|balls)|guacamole|salsa|crackers?|chips|appetizers?|starters?|bruschetta|deviled eggs)\b/,
  side: /\b(side dish|sides?|coleslaw|slaw|mashed potatoes|roasted (?:vegetables|potatoes|carrots|broccoli)|pilaf|dinner rolls?|cornbread|garlic bread|gratin)\b/,
  drink: /\b(drinks?|beverages?|smoothies?|lemonade|cocktails?|mocktails?|punch|latte|milkshakes?|shake|sangria|iced tea|hot chocolate|cider)\b/,
  lunch: /\b(lunch|sandwich(?:es)?|wraps?|paninis?|quesadillas?|soups?|salads?|grain bowls?|burgers?)\b/,
  dinner: /\b(dinner|supper|main course|mains?|entr[eé]es?|casserole|roast|stew|curry|lasagn[ae]|pot pie)\b/,
}

const PROTEIN_FAMILIES = new Set(['chicken', 'beef', 'pork', 'lamb', 'turkey', 'fish', 'seafood', 'tofu', 'tempeh'])

// ---- cuisine ----------------------------------------------------------------

/** Words in the title or page hints that name a cuisine outright. */
const CUISINE_WORDS: Record<string, RegExp> = {
  italian: /\b(italian|risotto|lasagn[ae]|carbonara|bolognese|marinara|parmigiana|parmesan chicken|chicken parm|pesto|gnocchi|focaccia|bruschetta|tiramisu|minestrone|piccata|cacciatore|osso buco|arancini|caprese|ziti|pizza|calzone)\b/,
  mexican: /\b(mexican|tacos?|enchiladas?|burritos?|quesadillas?|fajitas?|tamales?|tostadas?|pozole|mole|carnitas|barbacoa|al pastor|chilaquiles|elote|salsa verde|guacamole|nachos)\b/,
  chinese: /\b(chinese|stir[- ]?fry|lo mein|chow mein|fried rice|kung pao|dumplings?|wontons?|szechuan|sichuan|mapo|char siu|general tso|orange chicken|bao|congee|hoisin)\b/,
  japanese: /\b(japanese|teriyaki|sushi|ramen|udon|soba|miso|tempura|katsu|yakitori|donburi|onigiri|gyoza|okonomiyaki)\b/,
  korean: /\b(korean|bulgogi|bibimbap|kimchi|gochujang|japchae|galbi|tteokbokki)\b/,
  thai: /\b(thai|pad thai|pad see ew|green curry|red curry|massaman|tom yum|tom kha|larb|satay)\b/,
  vietnamese: /\b(vietnamese|pho|banh mi|bun cha|spring rolls?|nuoc cham)\b/,
  indian: /\b(indian|tikka|masala|korma|vindaloo|biryani|dal|daal|dhal|paneer|naan|samosas?|chana|saag|tandoori|raita|chutney|aloo|curry)\b/,
  mediterranean: /\b(mediterranean|greek|souvlaki|gyros?|tzatziki|spanakopita|moussaka|horiatiki|orzo salad|paella|tapas|gazpacho|spanish)\b/,
  'middle eastern': /\b(middle eastern|lebanese|persian|turkish|moroccan|falafel|shawarma|hummus|tabbouleh|fattoush|baba ganoush|shakshuka|kofta|tagine|za'?atar|sumac|harissa)\b/,
  french: /\b(french|coq au vin|ratatouille|bouillabaisse|quiche|souffl[eé]|crepes?|cassoulet|boeuf bourguignon|bourguignon|gratin|nicoise|beurre blanc|croque|madeleines?|tarte)\b/,
  american: /\b(american|burgers?|bbq|barbecue|mac and cheese|meatloaf|pot roast|buffalo|sloppy joes?|cornbread|biscuits and gravy|chili con carne|fried chicken|pulled pork|cobbler|apple pie|pancakes?|clam chowder|jambalaya|gumbo|cajun|tex[- ]mex)\b/,
}

/** Ingredient keys that point toward a cuisine (weaker than a named dish). */
const CUISINE_INGREDIENTS: Record<string, string[]> = {
  italian: ['parmesan', 'pecorino', 'mozzarella', 'ricotta', 'basil', 'pasta', 'arborio rice', 'pancetta', 'prosciutto', 'balsamic vinegar', 'italian seasoning', 'pesto', 'tomato sauce'],
  mexican: ['tortilla', 'chili pepper', 'cilantro', 'lime', 'black bean', 'pinto bean', 'cumin', 'chili powder', 'avocado', 'monterey jack', 'corn'],
  chinese: ['soy sauce', 'hoisin sauce', 'oyster sauce', 'five spice', 'sesame oil', 'rice vinegar', 'bok choy', 'ginger', 'green onion'],
  japanese: ['miso', 'soy sauce', 'rice vinegar', 'noodle', 'sesame seed'],
  korean: ['sesame oil', 'soy sauce', 'green onion'],
  thai: ['fish sauce', 'coconut milk', 'lime', 'cilantro', 'peanut', 'chili pepper', 'rice noodle'],
  vietnamese: ['fish sauce', 'rice noodle', 'mint', 'cilantro', 'lime'],
  indian: ['garam masala', 'curry powder', 'turmeric', 'cumin', 'coriander', 'cardamom', 'ghee', 'lentil', 'chickpea', 'yogurt'],
  mediterranean: ['feta', 'olive oil', 'oregano', 'lemon', 'cucumber', 'chickpea', 'tahini'],
  'middle eastern': ['tahini', 'chickpea', 'cumin', 'mint', 'parsley', 'pistachio'],
  french: ['butter', 'shallot', 'white wine', 'tarragon', 'creme fraiche', 'gruyere', 'dijon'],
  american: [],
}

// ---- diet -------------------------------------------------------------------

const MEAT_FAMILIES = new Set(['chicken', 'beef', 'pork', 'lamb', 'turkey', 'fish', 'seafood'])
const MEAT_KEYS = new Set(['chicken stock', 'beef stock', 'fish sauce', 'oyster sauce', 'anchovy', 'worcestershire sauce', 'gelatin'])
const DAIRY = new Set(['milk', 'buttermilk', 'cream', 'half and half', 'sour cream', 'creme fraiche', 'yogurt', 'butter', 'ghee', 'cheese'])
const ANIMAL = new Set([...DAIRY, 'egg', 'honey', 'mayonnaise'])
const GLUTEN = new Set(['flour', 'bread', 'breadcrumb', 'pasta', 'couscous', 'bulgur', 'farro', 'barley', 'beer', 'pita', 'soy sauce', 'noodle'])

const hasWord = (text: string, re: RegExp) => re.test(text)

/** Meal, cuisine, main ingredient, and diet tags. Diet tags are only claimed when the ingredients are recognized. */
export function autoTag({ title, items, hints = [] }: TagInput): RecipeTags {
  const text = `${title} ${hints.join(' ')}`.toLowerCase()
  const titleOnly = title.toLowerCase()
  const keys = items.map((i) => i.key)
  const families = items.map((i) => familyOf(i.key) || i.family)
  const famSet = new Set(families)
  const keySet = new Set(keys)

  // Meal: named in the title or hints, else a protein-led recipe is dinner.
  const meal: string[] = []
  for (const [tag, re] of Object.entries(MEAL_WORDS)) if (hasWord(text, re)) meal.push(tag)
  if (meal.includes('dinner') && meal.includes('dessert') && !hasWord(titleOnly, MEAL_WORDS.dinner)) meal.splice(meal.indexOf('dinner'), 1)
  if (meal.length === 0 && families.some((f) => PROTEIN_FAMILIES.has(f))) meal.push('dinner')

  // Cuisine: a named dish wins; otherwise three or more signature ingredients.
  const cuisineScore = new Map<string, number>()
  for (const [tag, re] of Object.entries(CUISINE_WORDS)) if (hasWord(text, re)) cuisineScore.set(tag, (cuisineScore.get(tag) ?? 0) + 3)
  for (const [tag, list] of Object.entries(CUISINE_INGREDIENTS)) {
    const n = list.filter((k) => keySet.has(k) || famSet.has(k)).length
    if (n) cuisineScore.set(tag, (cuisineScore.get(tag) ?? 0) + n)
  }
  const cuisine = [...cuisineScore.entries()]
    .filter(([, s]) => s >= 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([t]) => t)

  // Main ingredient: the proteins (in recipe order), else the starch or vegetables.
  const main: string[] = []
  const add = (t: string) => !main.includes(t) && main.push(t)
  for (let i = 0; i < items.length; i++) {
    const f = families[i]
    if (MEAT_FAMILIES.has(f)) add(f)
    else if (f === 'tofu' || f === 'tempeh') add('tofu')
  }
  if (!main.length) {
    const eggs = items.filter((_, i) => families[i] === 'egg').length
    if (famSet.has('pasta') || famSet.has('noodle')) add('pasta')
    if (famSet.has('rice') && !meal.includes('dessert')) add('rice')
    if (['bean', 'lentil', 'chickpea'].some((k) => famSet.has(k) || keySet.has(k))) add('beans')
    if (eggs && (meal.includes('breakfast') || /\b(eggs?|omelett?e|frittata|quiche)\b/.test(titleOnly))) add('eggs')
  }
  if (!main.length && !meal.includes('dessert') && !meal.includes('drink') && items.length >= 3) add('vegetables')

  // Diet: only from a mostly-recognized ingredient list (unknown words could be anything).
  const diet: string[] = []
  const known = items.filter((i) => i.known).length
  const knownShare = items.length ? known / items.length : 0
  const allKnown = items.length > 0 && known === items.length
  const meatFree = !families.some((f) => MEAT_FAMILIES.has(f)) && !keys.some((k) => MEAT_KEYS.has(k))
  const meatyTitle = /\b(chicken|beef|pork|lamb|turkey|bacon|ham|sausage|fish|salmon|tuna|shrimp|prawns?|crab|lobster|anchov(?:y|ies)|steak|meat(?:balls|loaf)?)\b/.test(titleOnly)
  if (items.length >= 2 && knownShare >= 0.8 && meatFree && !meatyTitle) {
    diet.push('vegetarian')
    if (!families.some((f) => ANIMAL.has(f)) && !keys.some((k) => ANIMAL.has(k))) diet.push('vegan')
  }
  if (allKnown && items.length >= 2 && !families.some((f) => GLUTEN.has(f)) && !keys.some((k) => GLUTEN.has(k) || k.includes('flour'))) diet.push('gluten-free')
  if (allKnown && items.length >= 2 && !families.some((f) => DAIRY.has(f)) && !keys.some((k) => DAIRY.has(k))) diet.push('dairy-free')

  return { meal, cuisine, main: main.slice(0, 3), diet }
}

/** Tags the family set by hand win; otherwise the computed ones. */
export function cleanTags(raw: unknown): RecipeTags {
  const out = emptyTags()
  if (!raw || typeof raw !== 'object') return out
  for (const k of Object.keys(TAG_OPTIONS) as (keyof RecipeTags)[]) {
    const v = (raw as Record<string, unknown>)[k]
    if (Array.isArray(v)) out[k] = v.filter((x): x is string => typeof x === 'string' && TAG_OPTIONS[k].includes(x)).slice(0, 6)
  }
  return out
}
