/**
 * Recipes every household starts with: one for each meal in the starter templates (starters.ts),
 * titled exactly as the template names the meal, so a template's grocery list comes from them.
 * Dinners are adapted from published recipes (credited, with a link); the steps are written
 * here, in our own words. Breakfasts and the chicken-and-rice lunches are simple assembly
 * recipes written for the app. Big-batch dinners are sized for about five dinners for four:
 * "serves" is per dinner, so a grocery list scales with how many you cook for.
 */
export interface StarterRecipe {
  /** Stable id: saved as starter_<id>, so a household gets each one once. */
  id: string
  title: string
  servings: number
  minutes: number
  ingredients: string[]
  steps: string[]
  notes?: string
  yieldText?: string
  /** Where it's adapted from (none: written for the app). */
  from?: { siteName: string; url: string }
}

/** Bump when recipes are added, so households that already have the older set get the new ones. */
export const STARTER_RECIPES_VERSION = 1

const BATCH = 'Big batch: about 5 dinners for 4. “Serves” is per dinner, so the grocery list scales with how many you cook for. Keeps 4 days in the fridge; freeze the rest.'

const bowl = (id: string, title: string, sauce: string[], veg: string[], extra: string[], steps: string[]): StarterRecipe => ({
  id,
  title,
  servings: 4,
  minutes: 35,
  ingredients: ['1 1/2 lb boneless chicken thighs', '1 1/2 cups long-grain rice', '1 tbsp olive oil', ...veg, ...sauce, ...extra],
  steps: [
    'Cook the rice.',
    'Season the chicken with salt and pepper and cook it in the oil over medium-high heat, 5 to 6 minutes a side, until done. Rest it, then slice.',
    ...steps,
    'Pack into four containers: rice, vegetables, chicken, sauce on top or on the side.',
  ],
  notes: 'Meal-prep lunch: keeps 4 days in the fridge.',
})

export const STARTER_RECIPES: StarterRecipe[] = [
  // ---- Breakfasts --------------------------------------------------------
  {
    id: 'yogurt-granola-berries',
    title: 'Yogurt, granola and berries',
    servings: 4,
    minutes: 5,
    ingredients: ['3 cups Greek yogurt', '1 cup granola', '2 cups mixed berries', '2 tbsp honey'],
    steps: ['Spoon the yogurt into bowls.', 'Top with berries and granola, then drizzle with honey.'],
  },
  {
    id: 'avocado-toast-egg',
    title: 'Avocado toast with a fried egg',
    servings: 4,
    minutes: 10,
    ingredients: ['4 slices whole-grain bread', '2 avocados', '4 eggs', '1 tsp lemon juice', '1 tsp butter', 'chili flakes', 'salt and pepper'],
    steps: ['Toast the bread.', 'Mash the avocados with the lemon juice, salt and pepper, and spread on the toast.', 'Fry the eggs in the butter and lay one on each toast. Finish with chili flakes.'],
  },
  {
    id: 'avocado-toast-feta',
    title: 'Avocado toast with tomato and feta',
    servings: 4,
    minutes: 10,
    ingredients: ['4 slices whole-grain bread', '2 avocados', '2 tomatoes', '1/2 cup crumbled feta', '1 tsp lemon juice', 'salt and pepper'],
    steps: ['Toast the bread.', 'Mash the avocados with the lemon juice, salt and pepper, and spread on the toast.', 'Top with sliced tomato and feta.'],
  },
  {
    id: 'overnight-oats',
    title: 'Overnight oats with banana',
    servings: 4,
    minutes: 5,
    ingredients: ['2 cups rolled oats', '2 cups milk', '1 cup Greek yogurt', '2 tbsp chia seeds', '2 tbsp maple syrup', '2 bananas'],
    steps: ['The night before, stir the oats, milk, yogurt, chia and maple syrup together and divide into four jars.', 'Refrigerate overnight.', 'In the morning, top with sliced banana.'],
  },
  {
    id: 'fruit-bowl-eggs',
    title: 'Fruit bowl and hard-boiled eggs',
    servings: 4,
    minutes: 15,
    ingredients: ['8 eggs', '2 apples', '2 oranges', '2 cups grapes', '1 cup strawberries'],
    steps: ['Boil the eggs for 10 minutes, then cool them in cold water and peel.', 'Cut the fruit into bite-size pieces and serve alongside.'],
    notes: 'Boil a dozen eggs on Sunday and they cover two breakfasts.',
  },
  {
    id: 'berry-smoothie',
    title: 'Berry smoothie',
    servings: 4,
    minutes: 5,
    ingredients: ['2 bananas', '2 cups frozen mixed berries', '2 cups spinach', '1 cup Greek yogurt', '2 cups milk'],
    steps: ['Blend everything until smooth, adding a splash more milk if it is too thick.'],
  },
  {
    id: 'mango-smoothie',
    title: 'Mango pineapple smoothie',
    servings: 4,
    minutes: 5,
    ingredients: ['2 cups frozen mango', '1 cup frozen pineapple', '1 cup Greek yogurt', '1 1/2 cups milk', '1 tbsp honey'],
    steps: ['Blend everything until smooth.'],
  },
  {
    id: 'banana-pancakes',
    title: 'Banana pancakes with berries',
    servings: 4,
    minutes: 25,
    ingredients: ['2 cups all-purpose flour', '2 tbsp sugar', '1 tbsp baking powder', '1/2 tsp salt', '1 3/4 cups milk', '2 eggs', '3 tbsp butter', '2 bananas', '1 cup berries', 'maple syrup'],
    steps: [
      'Whisk the flour, sugar, baking powder and salt in a bowl.',
      'Melt the butter; whisk it with the milk and eggs, then stir into the flour until just combined.',
      'Cook 1/4-cup scoops on a hot greased pan, laying banana slices on each before flipping.',
      'Serve with berries and maple syrup.',
    ],
  },

  // ---- Lunches: chicken, rice and a vegetable ------------------------------
  bowl('teriyaki-broccoli', 'Teriyaki chicken, rice and broccoli', ['1/2 cup teriyaki sauce', '1 tbsp sesame seeds'], ['1 head broccoli'], [], ['Steam or roast the broccoli florets.', 'Warm the teriyaki sauce and toss with the sliced chicken; sprinkle with sesame seeds.']),
  bowl('lemon-garlic-green-beans', 'Lemon garlic chicken, rice and green beans', ['2 lemons', '3 cloves garlic', '2 tbsp butter'], ['1 lb green beans'], [], ['Roast the green beans at 425°F for 15 minutes.', 'Melt the butter with the minced garlic, then add the lemon zest and juice; spoon over the chicken.']),
  bowl('buffalo-peppers', 'Buffalo chicken, rice and peppers', ['1/2 cup buffalo sauce', '1/2 cup ranch dressing'], ['3 bell peppers'], [], ['Slice and roast the peppers at 425°F for 15 minutes.', 'Toss the sliced chicken in the buffalo sauce; serve with ranch on the side.']),
  bowl('chimichurri-zucchini', 'Chimichurri chicken, rice and zucchini', ['1 cup parsley', '3 cloves garlic', '1/3 cup olive oil', '2 tbsp red wine vinegar', '1/2 tsp chili flakes'], ['2 zucchini'], [], ['Slice and roast the zucchini at 425°F for 15 minutes.', 'Chop the parsley and garlic finely and stir with the oil, vinegar and chili flakes for the chimichurri.']),
  bowl('tikka-cauliflower', 'Tikka chicken, rice and cauliflower', ['1 cup tikka masala sauce'], ['1 head cauliflower'], [], ['Roast the cauliflower florets at 425°F for 20 minutes.', 'Simmer the sliced chicken in the tikka sauce for 5 minutes.']),
  bowl('pesto-spinach', 'Pesto chicken, rice and spinach', ['1/2 cup basil pesto', '1/4 cup grated parmesan'], ['6 cups baby spinach'], [], ['Wilt the spinach in a hot pan for 2 minutes.', 'Toss the sliced chicken with the pesto and top with parmesan.']),
  bowl('lemon-herb-asparagus', 'Lemon herb chicken, rice and asparagus', ['2 lemons', '1 tbsp Italian seasoning', '2 tbsp olive oil'], ['1 lb asparagus'], [], ['Roast the asparagus at 425°F for 12 minutes.', 'Whisk the lemon juice, zest, oil and Italian seasoning; spoon over the chicken.']),
  bowl('honey-mustard-brussels', 'Honey mustard chicken, rice and Brussels sprouts', ['1/4 cup Dijon mustard', '1/4 cup honey'], ['1 lb Brussels sprouts'], [], ['Halve the Brussels sprouts and roast at 425°F for 20 minutes.', 'Whisk the mustard and honey and spoon over the chicken.']),
  bowl('bbq-green-beans', 'BBQ chicken, rice and green beans', ['1/2 cup barbecue sauce'], ['1 lb green beans'], [], ['Roast the green beans at 425°F for 15 minutes.', 'Toss the sliced chicken in the barbecue sauce.']),
  bowl('burrito-bowl', 'Chicken burrito bowl', ['1 cup salsa', '1/2 cup sour cream', '1 lime'], ['1 can black beans', '1 1/2 cups frozen corn', '2 cups shredded lettuce'], ['1 cup shredded cheddar', '1 tbsp taco seasoning'], ['Season the chicken with the taco seasoning before cooking.', 'Warm the drained beans and the corn.', 'Top each bowl with lettuce, cheese, salsa, sour cream and a squeeze of lime.']),
  bowl('sesame-ginger-bowl', 'Sesame ginger chicken bowl', ['1/4 cup soy sauce', '2 tbsp rice vinegar', '1 tbsp sesame oil', '1 tbsp honey', '1 tbsp grated ginger'], ['1 cucumber', '2 carrots', '1 1/2 cups frozen edamame'], [], ['Slice the cucumber, grate the carrots and cook the edamame.', 'Whisk the soy sauce, vinegar, sesame oil, honey and ginger for the dressing.']),
  bowl('peanut-bowl', 'Peanut chicken bowl', ['1/3 cup peanut butter', '3 tbsp soy sauce', '2 tbsp lime juice', '1 tbsp honey', '1 tsp sriracha'], ['4 heads baby bok choy', '2 carrots'], [], ['Halve the bok choy and sauté for 3 minutes; grate the carrots.', 'Whisk the peanut butter, soy sauce, lime juice, honey and sriracha with a splash of hot water for the sauce.']),
  bowl('sweet-chili-bowl', 'Sweet chili chicken bowl', ['1/2 cup sweet chili sauce', '1 tbsp soy sauce'], ['2 cups snap peas', '2 carrots'], [], ['Sauté the snap peas for 3 minutes; slice the carrots thinly.', 'Stir the sweet chili sauce with the soy sauce and toss with the chicken.']),

  // ---- Big-batch dinners ------------------------------------------------------
  {
    id: 'turkey-chili',
    title: 'Turkey chili (big batch)',
    servings: 4,
    minutes: 60,
    yieldText: 'About 20 servings',
    ingredients: [
      '3 lb ground turkey',
      '2 tbsp olive oil',
      '2 onions',
      '2 poblano peppers',
      '6 cloves garlic',
      '3 tbsp chili powder',
      '1 tbsp ground cumin',
      '2 tsp dried oregano',
      '2 cans black beans',
      '2 cans kidney beans',
      '2 cans pinto beans',
      '2 (28 oz) cans fire-roasted crushed tomatoes',
      '1 (6 oz) can tomato paste',
      '3 cups frozen corn',
      '4 cups chicken broth',
      'salt',
    ],
    steps: [
      'Dice the onions and poblanos and mince the garlic.',
      'In a large pot, brown the turkey in the oil, breaking it up. Add the onion, poblano and garlic and cook until soft.',
      'Stir in the chili powder, cumin, oregano and tomato paste and cook 1 minute.',
      'Add the drained beans, tomatoes, corn and broth. Simmer 30 minutes, stirring now and then. Season with salt.',
    ],
    notes: BATCH,
    from: { siteName: 'Budget Bytes', url: 'https://www.budgetbytes.com/turkey-chili/' },
  },
  {
    id: 'chicken-chickpea-curry',
    title: 'Chicken and chickpea curry (big batch)',
    servings: 4,
    minutes: 45,
    yieldText: 'About 20 servings',
    ingredients: [
      '5 lb boneless chicken breasts',
      '3 tbsp olive oil',
      '3 onions',
      '4 cloves garlic',
      '2 tbsp grated ginger',
      '1 tbsp turmeric',
      '3 tbsp curry powder',
      '3 tbsp flour',
      '3 (15 oz) cans chickpeas',
      '5 cups chicken broth',
      '10 oz baby spinach',
      '1/2 cup mango chutney',
      '1 1/2 cups plain yogurt',
      '4 cups basmati rice',
      'fresh cilantro',
    ],
    steps: [
      'Slice the onions, mince the garlic and cut the chicken into chunks.',
      'Soften the onions in the oil in a large pot; add the garlic, ginger, turmeric and curry powder and cook 1 minute.',
      'Stir in the flour, then the chicken, until it is coated. Add the drained chickpeas and broth and simmer 15 minutes, until the chicken is cooked.',
      'Stir in the spinach and chutney until the spinach wilts. Take off the heat and stir in the yogurt.',
      'Cook the rice and serve with cilantro.',
    ],
    notes: BATCH,
    from: { siteName: 'lovefood', url: 'https://www.lovefood.com/recipes/56841/chicken-and-chickpea-curry-recipe' },
  },
  {
    id: 'baked-ziti',
    title: 'Baked ziti (big batch)',
    servings: 4,
    minutes: 75,
    yieldText: 'Two 9x13 pans, about 20 servings',
    ingredients: [
      '2 1/2 lb ziti',
      '2 onions',
      '2 1/2 lb ground beef',
      '6 cloves garlic',
      '5 (24 oz) jars marinara sauce',
      '1 lb sliced provolone',
      '3 1/2 cups sour cream',
      '1 1/4 lb shredded mozzarella',
      '1 1/4 cups grated parmesan',
    ],
    steps: [
      'Heat the oven to 350°F and butter two 9x13 pans.',
      'Boil the ziti until just short of tender; drain.',
      'Brown the beef with the chopped onion and garlic; drain the fat and simmer with the sauce for 15 minutes.',
      'In each pan, layer half the ziti, the provolone, the sour cream, then half the sauce. Repeat with the rest of the ziti and sauce, and top with mozzarella and parmesan.',
      'Bake 30 minutes, until the cheese melts. Freeze the second pan, or keep it for later in the week.',
    ],
    notes: BATCH,
    from: { siteName: 'Food.com (Allrecipes “Baked Ziti I”)', url: 'https://www.food.com/recipe/baked-ziti-261650' },
  },

  // ---- Fun dinners --------------------------------------------------------------
  {
    id: 'pizza-night',
    title: 'Homemade pizza night',
    servings: 4,
    minutes: 120,
    ingredients: [
      '1 1/2 cups warm water',
      '2 tsp yeast',
      '2 tbsp sugar',
      '4 cups all-purpose flour',
      '2 tsp salt',
      '2 tbsp olive oil',
      '1 1/2 cups pizza sauce',
      '1 lb shredded mozzarella',
      '6 oz pepperoni',
      '1 bell pepper',
      '8 oz mushrooms',
    ],
    steps: [
      'Stir the yeast and sugar into the warm water and let it foam for 5 minutes.',
      'Mix the flour and salt, add the yeast water and oil, and knead about 5 minutes into a smooth dough. Let it rise, covered, for an hour.',
      'Heat the oven to 475°F. Split the dough into four and stretch each into a small pizza.',
      'Everyone tops their own with sauce, cheese and toppings. Bake 10 to 12 minutes.',
    ],
    notes: 'A double batch of dough: four personal pizzas.',
    from: { siteName: 'Budget Bytes (dough)', url: 'https://www.budgetbytes.com/pizza-dough/' },
  },
  {
    id: 'sushi-bowls',
    title: 'Make-your-own sushi bowls',
    servings: 4,
    minutes: 30,
    ingredients: [
      '1 lb salmon fillets',
      '1 cup sushi rice',
      '1 tsp rice vinegar',
      '1 cup frozen edamame',
      '1 avocado',
      '1 cucumber',
      '1 jalapeño',
      '1/4 cup diced red onion',
      '1/4 cup shredded carrots',
      '2 tbsp soy sauce',
      '1 tbsp sriracha',
      '1 tbsp honey',
      '4 sheets nori',
    ],
    steps: [
      'Cook the sushi rice and stir in the rice vinegar.',
      'Cook the salmon in a hot pan or at 400°F for 10 to 12 minutes, then flake it.',
      'Whisk the soy sauce, sriracha and honey for the sauce.',
      'Set out the rice, salmon, edamame, sliced avocado, cucumber and jalapeño, onion, carrot and torn nori, and let everyone build a bowl.',
    ],
    from: { siteName: 'USC Eat Well', url: 'https://workwell.usc.edu/eatwell-recipes/salmon-sushi-bowl/' },
  },
  {
    id: 'smash-burgers',
    title: 'Smash burger and fries night',
    servings: 4,
    minutes: 40,
    ingredients: [
      '1 1/4 lb ground chuck',
      '1/2 tsp garlic powder',
      '1/2 tsp onion powder',
      '1/2 tsp ground mustard',
      '1 tsp Worcestershire sauce',
      '1/2 tbsp vegetable oil',
      '3/4 tsp kosher salt',
      '1/2 tsp black pepper',
      '4 slices cheddar',
      '4 hamburger buns',
      '2 lb frozen fries',
      'lettuce, tomato, pickles, ketchup and mustard',
    ],
    steps: [
      'Bake the fries as the bag says.',
      'Gently mix the beef with the Worcestershire, garlic and onion powder and mustard; roll into 4 balls and chill 15 minutes.',
      'Heat a cast-iron pan very hot with the oil. Smash each ball flat with a spatula, season with salt and pepper, and cook 2 to 3 minutes.',
      'Flip, add cheese, and cook 1 minute more. Serve on toasted buns with the toppings.',
    ],
    from: { siteName: 'Once Upon a Chef', url: 'https://www.onceuponachef.com/recipes/smash-burgers.html' },
  },
]
