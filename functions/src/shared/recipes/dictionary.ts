/**
 * Ingredient dictionary: canonical names (singular), their synonyms, and a parent family,
 * so "scallions" = "green onion", "chicken thighs" belongs to "chicken", "cilantro" = "coriander".
 * Format per line: `canonical: synonym, synonym > parent`. Edit freely; tests cover the shape.
 */
const DATA = `
chicken: chicken meat
chicken breast > chicken
chicken thigh > chicken
chicken drumstick: chicken leg > chicken
chicken wing > chicken
whole chicken > chicken
ground chicken > chicken
turkey
ground turkey > turkey
beef
ground beef: minced beef, hamburger meat > beef
steak: sirloin, ribeye, flank steak, skirt steak, strip steak > beef
beef chuck: chuck roast, stewing beef, stew meat > beef
short rib > beef
pork
pork chop > pork
pork shoulder: pork butt > pork
pork tenderloin > pork
ground pork > pork
bacon: streaky bacon > pork
pancetta > pork
ham > pork
prosciutto > pork
sausage: sausages, italian sausage, chorizo > pork
lamb
ground lamb > lamb
lamb chop > lamb
fish
salmon > fish
cod > fish
halibut > fish
tilapia > fish
tuna > fish
trout > fish
anchovy > fish
sardine > fish
shrimp: prawn > seafood
scallop > seafood
crab > seafood
lobster > seafood
mussel > seafood
clam > seafood
squid: calamari > seafood
seafood
tofu
tempeh
egg: eggs
egg yolk > egg
egg white > egg
milk: whole milk, skim milk
buttermilk
cream: heavy cream, double cream, whipping cream, heavy whipping cream
half and half
sour cream
creme fraiche
yogurt: yoghurt, greek yogurt
butter: unsalted butter, salted butter
ghee
cheese
cheddar: cheddar cheese > cheese
mozzarella: mozzarella cheese > cheese
parmesan: parmigiano reggiano, parmigiano, parmesan cheese > cheese
pecorino: pecorino romano > cheese
feta: feta cheese > cheese
goat cheese: chevre > cheese
ricotta: ricotta cheese > cheese
cream cheese > cheese
gruyere > cheese
swiss cheese > cheese
monterey jack: jack cheese > cheese
blue cheese: gorgonzola > cheese
halloumi > cheese
cottage cheese > cheese
onion: yellow onion, brown onion, white onion
red onion > onion
shallot > onion
green onion: scallion, spring onion > onion
leek > onion
garlic: garlic clove
ginger: fresh ginger, ginger root
tomato: tomatoes, roma tomato, plum tomato
cherry tomato: grape tomato > tomato
canned tomato: diced tomato, crushed tomato, whole peeled tomato, tinned tomato > tomato
tomato paste: tomato puree > tomato
tomato sauce: passata, marinara > tomato
potato: russet potato, yukon gold potato, white potato
sweet potato: yam
carrot
celery: celery stalk
bell pepper: capsicum, red pepper, green pepper, yellow pepper, sweet pepper
chili pepper: chile, chili, chilli, jalapeno, serrano, thai chili, red chili, green chili
zucchini: courgette
eggplant: aubergine
cucumber
mushroom: cremini, button mushroom, shiitake, portobello, baby bella
spinach: baby spinach
kale
lettuce: romaine, iceberg, butter lettuce
arugula: rocket
cabbage: red cabbage, napa cabbage, savoy cabbage
broccoli
cauliflower
brussels sprout
asparagus
green bean: string bean, haricot vert
pea: peas, green pea, frozen pea
corn: sweetcorn, corn kernel, maize
avocado
beet: beetroot
radish
squash: butternut squash, acorn squash, pumpkin
fennel
artichoke
okra
bok choy: pak choi
lemon
lime
orange
apple
banana
berry
strawberry > berry
blueberry > berry
raspberry > berry
blackberry > berry
cranberry > berry
grape
peach
pear
plum
cherry
mango
pineapple
coconut
coconut milk > coconut
date
raisin
rice: white rice, jasmine rice, basmati rice, long grain rice
brown rice > rice
arborio rice: risotto rice > rice
pasta: spaghetti, penne, fusilli, linguine, fettuccine, rigatoni, macaroni, orzo, farfalle, tagliatelle, lasagna noodle, lasagne sheet
noodle: egg noodle, rice noodle, ramen, udon, soba
quinoa
couscous
bulgur
farro
barley
oat: oats, rolled oat, old fashioned oat, oatmeal
bread: sourdough, baguette, loaf
breadcrumb: panko, bread crumb
tortilla: flour tortilla, corn tortilla
pita
flour: all purpose flour, plain flour, ap flour
bread flour > flour
whole wheat flour > flour
cornmeal: polenta
cornstarch: cornflour, corn starch
sugar: granulated sugar, white sugar, caster sugar
brown sugar: light brown sugar, dark brown sugar > sugar
powdered sugar: icing sugar, confectioners sugar > sugar
honey
maple syrup
molasses
baking soda: bicarbonate of soda, bicarb
baking powder
yeast: active dry yeast, instant yeast
vanilla: vanilla extract, vanilla bean
chocolate: dark chocolate, semisweet chocolate, chocolate chip, bittersweet chocolate
cocoa: cocoa powder, unsweetened cocoa
salt: kosher salt, sea salt, table salt, flaky salt
pepper: black pepper, ground black pepper, peppercorn, white pepper
oil: vegetable oil, canola oil, neutral oil, sunflower oil
olive oil: extra virgin olive oil, evoo > oil
sesame oil > oil
coconut oil > oil
vinegar: white vinegar
red wine vinegar > vinegar
balsamic vinegar > vinegar
apple cider vinegar: cider vinegar > vinegar
rice vinegar > vinegar
soy sauce: tamari, shoyu
fish sauce
oyster sauce
hoisin sauce
worcestershire sauce
sriracha: hot sauce, chili sauce
mustard: dijon, dijon mustard, whole grain mustard
ketchup
mayonnaise: mayo
pesto
tahini
peanut butter
miso
stock: broth
chicken stock: chicken broth > stock
beef stock: beef broth > stock
vegetable stock: vegetable broth > stock
wine
white wine > wine
red wine > wine
beer
water
bean: beans
black bean > bean
kidney bean > bean
cannellini bean: white bean, navy bean, great northern bean > bean
pinto bean > bean
chickpea: garbanzo bean, chick pea > bean
lentil: red lentil, green lentil, brown lentil
almond
walnut
pecan
cashew
peanut
pine nut
pistachio
hazelnut
sesame seed
basil
parsley: flat leaf parsley, italian parsley
cilantro: coriander leaf, fresh coriander
mint
dill
thyme
rosemary
oregano
sage
chive
bay leaf
tarragon
cumin
coriander: ground coriander, coriander seed
paprika: smoked paprika, sweet paprika
chili powder
cayenne: cayenne pepper
red pepper flake: chili flake, crushed red pepper
cinnamon
nutmeg
clove spice: ground cloves
turmeric
curry powder
garam masala
cardamom
allspice
five spice
italian seasoning: dried herbs, herbes de provence
garlic powder
onion powder
`

export interface DictEntry {
  key: string
  parent: string | null
}

const entries = new Map<string, DictEntry>()
const phrases = new Map<string, string>() // phrase (singular words) → canonical key
let maxWords = 0

/** Parses DATA on first use (after the plural tables below exist). */
function built() {
  if (entries.size) return
  for (const raw of DATA.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    const [left, parentPart] = line.split('>').map((x) => x.trim())
    const [canonical, synonyms = ''] = left.split(':').map((x) => x.trim())
    const key = canonical.toLowerCase()
    entries.set(key, { key, parent: parentPart ? parentPart.toLowerCase() : null })
    for (const p of [canonical, ...synonyms.split(',')].map((x) => x.trim()).filter(Boolean)) {
      const phrase = singularPhrase(p.toLowerCase())
      phrases.set(phrase, key)
      maxWords = Math.max(maxWords, phrase.split(' ').length)
    }
  }
}

/** Longest synonym, in words (for n-gram lookups). */
export function maxPhraseWords(): number {
  built()
  return maxWords
}

const NO_SINGULAR = new Set(['asparagus', 'hummus', 'couscous', 'swiss', 'molasses', 'grits', 'oats', 'brussels', 'chickpeas', 'peas', 'lemongrass', 'bass', 'glass', 'harissa', 'citrus', 'octopus', 'series', 'species', 'quinoa'])
const IRREGULAR: Record<string, string> = { leaves: 'leaf', halves: 'half', loaves: 'loaf', knives: 'knife', cookies: 'cookie', anchovies: 'anchovy', potatoes: 'potato', tomatoes: 'tomato', mangoes: 'mango', chilies: 'chili', chillies: 'chilli', radishes: 'radish', dishes: 'dish', peaches: 'peach', oats: 'oat', peas: 'pea', chickpeas: 'chickpea', brussels: 'brussels', beans: 'bean' }

/** "berries" → "berry", "tomatoes" → "tomato", "leaves" → "leaf", "asparagus" stays. */
export function singular(word: string): string {
  const w = word.toLowerCase()
  if (IRREGULAR[w]) return IRREGULAR[w]
  if (NO_SINGULAR.has(w) || w.length <= 3) return w
  if (w.endsWith('ies')) return w.slice(0, -3) + 'y'
  if (w.endsWith('oes')) return w.slice(0, -2)
  if (/(ch|sh|x|zz)es$/.test(w)) return w.slice(0, -2)
  if (w.endsWith('ss') || w.endsWith('us') || w.endsWith('is')) return w
  if (w.endsWith('s')) return w.slice(0, -1)
  return w
}

/** "jalapeño" → "jalapeno", "crème" → "creme". */
export function foldAccents(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

export function singularPhrase(phrase: string): string {
  return foldAccents(phrase)
    .split(/\s+/)
    .filter(Boolean)
    .map(singular)
    .join(' ')
}

export function entry(key: string): DictEntry | undefined {
  built()
  return entries.get(key)
}

/** The family a key belongs to ("chicken thigh" → "chicken"); a key with no parent is its own family. */
export function familyOf(key: string): string {
  built()
  return entries.get(key)?.parent ?? key
}

/** Exact dictionary lookup for a whole (singularized) phrase. */
export function lookupPhrase(phrase: string): string | undefined {
  built()
  return phrases.get(singularPhrase(phrase.toLowerCase()))
}

export function allKeys(): string[] {
  built()
  return [...entries.keys()]
}
