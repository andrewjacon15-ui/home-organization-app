import type { MealPlan } from '../../types'
import type { TemplateDraft } from './templates'

/** Sunday first: [breakfast, lunch, dinner, notes] for each day. */
type Week = [string, string, string, string][]

const week = (name: string, days: Week): TemplateDraft => ({
  name,
  days: days.map(([breakfast, lunch, dinner, notes]): MealPlan => ({ breakfast, lunch, dinner, notes })),
  people: null,
  meals: ['breakfast', 'lunch', 'dinner'],
})

// Every meal is named exactly as a starter recipe (starterRecipes.ts), so the grocery list comes
// from it; the reheated dinners say "(leftovers)" so the batch isn't bought twice.
const YOGURT = 'Yogurt, granola and berries'
const AVO_EGG = 'Avocado toast with a fried egg'
const AVO_FETA = 'Avocado toast with tomato and feta'
const OATS = 'Overnight oats with banana'
const FRUIT = 'Fruit bowl and hard-boiled eggs'
const BERRY = 'Berry smoothie'
const MANGO = 'Mango pineapple smoothie'
const PANCAKES = 'Banana pancakes with berries'
const BURRITO = 'Chicken burrito bowl'
const SESAME = 'Sesame ginger chicken bowl'
const PEANUT = 'Peanut chicken bowl'
const SWEET_CHILI = 'Sweet chili chicken bowl'
const OUT = 'Leftovers or eat out'
const PREP = 'Cook the big batch; make the week’s chicken and rice lunches'

/**
 * Starter templates every household can add with one tap (Meals → Templates), then change.
 * Plain on purpose: easy breakfasts, chicken-rice-and-vegetable lunches that change only the
 * vegetable and the sauce (with burrito-bowl and Asian-bowl days), one big dinner cooked on
 * Sunday and reheated through the week, and one fun dinner at the end of it.
 */
export const STARTER_TEMPLATES: TemplateDraft[] = [
  week('Simple week: chili', [
    [YOGURT, BURRITO, 'Turkey chili (big batch)', PREP],
    [AVO_EGG, 'Teriyaki chicken, rice and broccoli', 'Turkey chili (leftovers)', ''],
    [OATS, 'Lemon garlic chicken, rice and green beans', 'Turkey chili (leftovers)', ''],
    [FRUIT, SESAME, 'Turkey chili (leftovers)', ''],
    [YOGURT, 'Buffalo chicken, rice and peppers', 'Turkey chili (leftovers)', ''],
    [AVO_FETA, BURRITO, 'Homemade pizza night', 'Fun dinner: everyone makes their own pizza'],
    [PANCAKES, PEANUT, OUT, ''],
  ]),
  week('Simple week: curry', [
    [BERRY, SWEET_CHILI, 'Chicken and chickpea curry (big batch)', PREP],
    [YOGURT, 'Chimichurri chicken, rice and zucchini', 'Chicken and chickpea curry (leftovers)', ''],
    [AVO_FETA, BURRITO, 'Chicken and chickpea curry (leftovers)', ''],
    [FRUIT, 'Tikka chicken, rice and cauliflower', 'Chicken and chickpea curry (leftovers)', ''],
    [OATS, SESAME, 'Chicken and chickpea curry (leftovers)', ''],
    [YOGURT, 'Pesto chicken, rice and spinach', OUT, ''],
    [AVO_EGG, BURRITO, 'Make-your-own sushi bowls', 'Fun dinner: everyone builds a bowl'],
  ]),
  week('Simple week: baked ziti', [
    [YOGURT, 'Lemon herb chicken, rice and asparagus', 'Baked ziti (big batch)', PREP],
    [AVO_EGG, SESAME, 'Baked ziti (leftovers)', ''],
    [FRUIT, BURRITO, 'Baked ziti (leftovers)', ''],
    [OATS, 'Honey mustard chicken, rice and Brussels sprouts', 'Baked ziti (leftovers)', ''],
    [MANGO, PEANUT, 'Baked ziti (leftovers)', ''],
    [YOGURT, 'BBQ chicken, rice and green beans', 'Smash burger and fries night', 'Fun dinner: smash burgers at home'],
    [AVO_FETA, BURRITO, OUT, ''],
  ]),
]
