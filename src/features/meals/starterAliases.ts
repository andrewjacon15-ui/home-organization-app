import type { MealPlan } from '../../types'
import { STARTER_RECIPES } from './starterRecipes'
import { STARTER_TEMPLATES } from './starters'
import type { TemplateDraft } from './templates'

/** Sunday first: [breakfast, lunch, dinner, notes] for each day. */
type Week = [string, string, string, string][]

const week = (name: string, days: Week): TemplateDraft => ({
  name,
  days: days.map(([breakfast, lunch, dinner, notes]): MealPlan => ({ breakfast, lunch, dinner, notes })),
  people: null,
  meals: ['breakfast', 'lunch', 'dinner'],
})

/**
 * The starter templates as they first shipped (before every meal was named after a starter
 * recipe). Households that added them, or planned weeks from them, have these meal names.
 */
const FIRST: TemplateDraft[] = [
  week('Simple week: chili', [
    ['Greek yogurt, granola and berries', 'Chicken burrito bowl: rice, black beans, corn, salsa', 'Turkey chili (big batch)', 'Cook the chili; bake chicken and rice for the week’s lunches'],
    ['Avocado toast with a fried egg', 'Chicken, rice and broccoli with teriyaki', 'Turkey chili (reheat)', ''],
    ['Overnight oats with banana', 'Chicken, rice and green beans with lemon garlic', 'Turkey chili (reheat)', ''],
    ['Fruit bowl and hard-boiled eggs', 'Asian chicken bowl: rice, cucumber, carrot, edamame, sesame ginger', 'Turkey chili (reheat), over rice', ''],
    ['Greek yogurt, granola and berries', 'Chicken, rice and roasted peppers with buffalo sauce', 'Turkey chili (reheat), with cornbread', ''],
    ['Avocado toast with everything seasoning', 'Chicken burrito bowl: rice, pinto beans, fajita peppers, guacamole', 'Homemade pizza night', 'Fun dinner: everyone makes their own pizza'],
    ['Banana pancakes with berries', 'Asian chicken bowl: rice, bok choy, peanut sauce', 'Leftovers or eat out', ''],
  ]),
  week('Simple week: curry', [
    ['Smoothie: banana, berries, spinach, yogurt', 'Asian chicken bowl: rice, snap peas, carrot, sweet chili', 'Chicken and chickpea curry (big batch)', 'Cook the curry; bake chicken and rice for the week’s lunches'],
    ['Greek yogurt, granola and honey', 'Chicken, rice and zucchini with chimichurri', 'Chicken and chickpea curry (reheat)', ''],
    ['Avocado toast with tomato and feta', 'Chicken burrito bowl: rice, black beans, corn, salsa verde', 'Chicken and chickpea curry (reheat), with naan', ''],
    ['Fruit bowl and cottage cheese', 'Chicken, rice and cauliflower with tikka sauce', 'Chicken and chickpea curry (reheat)', ''],
    ['Overnight oats with apple and cinnamon', 'Asian chicken bowl: rice, cucumber, edamame, teriyaki', 'Chicken and chickpea curry (reheat), over rice', ''],
    ['Greek yogurt, granola and berries', 'Chicken, rice and spinach with pesto', 'Leftovers or eat out', ''],
    ['Avocado toast with a poached egg', 'Chicken burrito bowl: rice, pinto beans, fajita peppers, pico', 'Make-your-own sushi bowls', 'Fun dinner: sushi rice, salmon or shrimp, avocado, cucumber, nori'],
  ]),
  week('Simple week: baked ziti', [
    ['Greek yogurt, granola and peaches', 'Chicken, rice and asparagus with lemon herb', 'Baked ziti (big batch)', 'Bake the ziti; bake chicken and rice for the week’s lunches'],
    ['Avocado toast with chili flakes', 'Asian chicken bowl: rice, broccoli, carrot, sesame ginger', 'Baked ziti (reheat), with a side salad', ''],
    ['Fruit bowl and a granola bar', 'Chicken burrito bowl: rice, black beans, corn, chipotle crema', 'Baked ziti (reheat)', ''],
    ['Overnight oats with peanut butter', 'Chicken, rice and Brussels sprouts with honey mustard', 'Baked ziti (reheat), with garlic bread', ''],
    ['Smoothie: mango, pineapple, yogurt', 'Asian chicken bowl: rice, bok choy, mushrooms, hoisin', 'Baked ziti (reheat)', ''],
    ['Greek yogurt, granola and berries', 'Chicken, rice and green beans with BBQ sauce', 'Smash burger and fries night', 'Fun dinner: smash burgers at home'],
    ['Avocado toast with a fried egg', 'Chicken burrito bowl: rice, pinto beans, peppers, guacamole', 'Leftovers or eat out', ''],
  ]),
]

export const FIRST_STARTER_TEMPLATES = FIRST

const titles = new Set(STARTER_RECIPES.map((r) => r.title.toLowerCase()))

/**
 * The first starters' meal names, lowercased, to the starter recipe now in the same place
 * ("asian chicken bowl: rice, cucumber, ..." to "Sesame ginger chicken bowl"), so meals planned
 * from them still find their recipe and their groceries.
 */
export const STARTER_ALIASES: Record<string, string> = Object.fromEntries(
  FIRST.flatMap((t, i) =>
    t.days.flatMap((d, day) =>
      (['breakfast', 'lunch', 'dinner'] as const).flatMap((s) => {
        const now = STARTER_TEMPLATES[i].days[day][s]
        return d[s] && d[s] !== now && titles.has(now.toLowerCase()) ? [[d[s].toLowerCase(), now]] : []
      }),
    ),
  ),
)

/** The current version of a template that is exactly a first starter (unchanged by the household), or null. */
export function isFirstStarter(t: Pick<TemplateDraft, 'name' | 'days'>): TemplateDraft | null {
  const i = FIRST.findIndex((f) => f.name.toLowerCase() === t.name.trim().toLowerCase())
  return i >= 0 && JSON.stringify(FIRST[i].days) === JSON.stringify(t.days) ? STARTER_TEMPLATES[i] : null
}
