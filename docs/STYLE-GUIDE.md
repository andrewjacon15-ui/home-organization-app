# Family Organizer — Style Guide

How the app looks and why. Every value below is a token in `src/index.css` (`:root`);
use the token, never a raw value, so light/dark, text size, and the family's accent
color keep working.

## Principles

1. **Glanceable first.** The wall tablet is read from across a room. Dates, times, and
   event titles get the weight; everything else steps back.
2. **One of everything.** One typeface, one icon set, one accent color, one corner
   radius per size of thing. Consistency is what makes it feel designed.
3. **Content is the color.** Paperwhite neutrals for the chrome, like an e-reader page;
   color comes only from people and calendars (events, avatars) and the single accent
   (selection, today, primary action).
4. **Panels, not pages.** The side bar and the main panel are separate surfaces that
   scroll on their own. The page itself never scrolls or stretches.
5. **Fit the device.** Phone, tablet, and computer each get their own layout
   (see *Devices*), not one layout squeezed.

## Typography

One family: **Inter** (variable, self-hosted via `@fontsource-variable/inter`).
No serif, no italics, no all-caps labels, no monospace (`<code>` is set in Inter too).

| Token | Size (at 16px root) | Use |
|---|---|---|
| `--fs-display` | 30px | Page titles, header date and clock |
| `--fs-title` | 22px | Section titles, day numbers |
| `--fs-lead` | 17px | Card titles, person names, list names |
| `--fs-body` | 15px | Body text, inputs, buttons |
| `--fs-small` | 13px | Event text, meta, hints |
| `--fs-label` | 12px | Captions, nav labels, weekday names |
| `--fs-micro` | 10px | Initials inside tiny badges only |

- **Headings:** `h2` is `--fs-title`, `h3` is `--fs-lead`; inside a settings section a sub-heading is
  `--fs-body` 600, one step below the section title. Never the browser's default sizes.
- **Weights:** 400 regular (body), 500 medium (labels, nav, buttons), 600 semibold
  (titles, names, the selected item). Nothing else.
- **Tracking:** −0.02em on display sizes, −0.015em on titles, 0 elsewhere.
- **Numbers:** `tabular-nums` for clocks, times, and counts so they don't jitter.
- **Case:** sentence case everywhere ("Add event", not "ADD EVENT").
- **Root size:** 16px (15 small / 19 large via Settings → Display, or per kind of device in
  Settings → Device & side bar). Tablets get 17px.

## Color

**Paperwhite**: warm e-reader paper and near-black ink (the default), with a warm
**Night** variant for dark. Every color has both values.

| Token | Paperwhite | Night | Use |
|---|---|---|---|
| `--paper` | `#f3f0e8` | `#151412` | The page behind panels |
| `--surface` | `#faf8f2` | `#1c1b18` | Cards, side bar, sheets (a shade lighter than the page) |
| `--paper-2` | `#e9e5da` | `#23211d` | Hover, segmented track, subtle fills |
| `--ink` | `#1c1b18` | `#ece7dc` | Primary text |
| `--ink-2` | `#5a564d` | `#aca596` | Secondary text, icons |
| `--ink-3` | `#9a9588` | `#736d61` | Placeholders, counts, disabled |
| `--rule` | `#dfdacd` | `#2e2c27` | Borders, dividers |
| `--rule-strong` | `#c8c1b2` | `#3d3a33` | Input borders, hover borders |
| `--danger` | `#b42318` | `#f97066` | Late chores, destructive actions |
| `--rain` | `#2f6fb3` | `#6aa8e0` | Chance of rain/snow in the forecast (bars, percentages) |
| `--warn` | `#b45309` | `#f5a524` | Needs attention (a recipe to review, warning badges), favorites |

**Accent** (`--accent`, chosen in Settings → Appearance) marks *selection and now*:
the active nav item, today's date, primary buttons, focus rings, links.
`--accent-soft` (accent at 12%) is the tinted background for selected things;
`--accent-text` is accent lifted toward white in dark mode so it stays readable.
Both are computed in `App.tsx` with 8-digit hex, **not** `color-mix()` — the wall
tablet's browser (Chrome 109) doesn't support it.

**People and calendar colors** (12 presets in `src/lib/colors.ts`, or custom hex) appear
as: a 3px bar on the left of an event, a soft tint behind it (12%; 22% for all-day),
filled avatar circles, and a 3px top edge on a person's column. Tints are drawn by an
`::after` layer at low opacity, so any hex works without `color-mix()`.

Contrast: body text ≥ 4.5:1 on its surface in both themes; `readableOn()` picks black
or white text for anything filled with a person or accent color.

## Shape, depth, spacing

- **Radius:** `--r` 8px for controls, chips, inputs, events; `--r-lg` 14px for cards and
  panels; 12px for nav items; `999px` for pills, avatars, and today's date.
- **Borders:** 1px `--rule`. No heavy rules, no double lines.
- **Depth:** paper doesn't cast shadows. Resting cards and buttons are drawn with
  hairlines (`--shadow-sm` is none; `--shadow` is a 1px rule ring). Only things that
  float above the page (sheets, dialogs, menus) get `--shadow-lg`.
- **Centering:** anything that floats in a shape (the family letter, today's date,
  avatars, counts, icons in buttons, ticks in circles) is centered on both axes with
  flex/grid, `line-height: 1`, and equal width/height. Never nudge with padding or
  pixel offsets. A control at the edge of a card gets the same space on every side.
- **Spacing:** a 4px grid — 4, 8, 12, 16, 20, 24, 32. Page gutter `--gutter` (24px;
  16px on phones). Cards pad 12–16px; settings sections 18–20px.
- **Touch targets:** `--tap` (48px; 52px on tablets) for anything tappable. A control drawn smaller (a corner ✕, an inline "Recipe ›") gets an invisible
  `::before` hit area around it, so it still takes a ~42px tap without moving anything.
- **Never wider than its column:** cards and rows can shrink (`min-width: 0`); on phones a
  settings row wraps its control under the label rather than running off the card.

## Icons

**Lucide** (`lucide-react`), always through `src/components/Icons.tsx`:
24px grid, **1.75 stroke**, rounded caps and joins, `currentColor`.

- Nav icons at 22px; inline icons (weather in day headers) at 15px.
- Icons inherit text color: `--ink-2` at rest, accent when selected.
- Weather uses Lucide's sun/cloud/rain set (`WeatherBadges.tsx`), not emoji — emoji
  render differently on every device.
- Buttons use icons for arrows, add/remove, ticks, and close (`BackIcon`, `NextIcon`,
  `AddIcon`, `RemoveIcon`, `DoneIcon`, `CloseIcon`), not text characters like ‹ › → + − ✓ or ✕.
- Decorative icons are `aria-hidden`; icon-only buttons need an `aria-label`.
- Every icon is a named export of `Icons.tsx` (`PencilIcon`, `MapPinIcon`…), never imported
  from `lucide-react` in a feature. The weather set, picked per forecast code, comes from
  `components/weatherGlyphs.ts`.

## Components

- **Side bar (rail):** a `--surface` panel with a 1px right border. Items are icon over
  label, 12px radius. Selected item: `--accent-soft` background, accent icon and text,
  600 weight. The family initial sits on top in an accent square. Scrolls on its own.
- **Main panel:** its own scroller; content centers up to 1360px wide.
- **Header:** weekday (600) + date (400, `--ink-2`) at display size; clock (600,
  tabular); weather as a pill chip.
- **Cards:** `--surface`, 1px `--rule`, `--r-lg`, `--shadow-sm`. Columns for people get a
  3px top edge in the person's color.
- **Buttons:** secondary = surface + border; primary = accent fill, `--accent-ink` text.
  Text-only links use accent, no underline.
- **Segmented control:** a `--paper-2` track; the selected segment is a raised surface.
- **Inputs:** surface, 1px `--rule-strong` on hover, accent border + 3px `--accent-soft`
  ring on focus. 16px text on phones (iOS zooms below that).
- **Switches:** 44×26 rounded track; accent when on; white knob with a small shadow.
- **Checkboxes and radios:** drawn by the app (22px, 6px radius / round), accent fill
  with an `--accent-ink` tick when on. Never rely on the system's own colors: Android
  ignores some of them.
- **Dropdowns:** always `components/Select` (never a native `<select>`, whose list Android
  draws in its own colors). The open list is a floating surface; the chosen option has an
  `--accent-soft` background and a check; it opens upward near the bottom of the screen.
- **Sheets & dialogs:** floating, 18px radius, `--shadow-lg`, dimmed backdrop. On phones a
  dialog fills the screen, and a short one (the welcome tour) is a bottom sheet.

### Calendar

- A week is **one card**; days are columns split by hairlines.
- **Today:** the date sits in a filled accent circle and the column gets a faint
  `--accent-soft` wash.
- **Events:** rounded chips — 3px left bar + soft tint in the owner's/calendar's color;
  title 600, time in `--ink-2`; past events at reduced opacity.
- **Views per device:** every device gets Day, 3 Day, Week, Month, and a list (Schedule;
  "List" on phones). On a phone, Week and 3 Day stack the days, and Month is a grid of dots
  (tap a day to see its events underneath). Swipe left or right to page.
- **Busy days** scroll inside their column with a faded edge and a "Scroll for more"
  cue — never a page scroll, and never cut off at a count. The Home calendar does the same.
- **Home calendar:** 3 days from today by default; 1 or 7 days from the panel's switch or
  Settings → Home screen. The last tile sums up the following week.

### Recipes

- **Our recipes:** the list is its own scrolling box beside the open recipe (above it on a
  phone), never a page that runs on; more rows load as it scrolls.
- **Amounts:** ½× / 1× / 2× (a small segmented control), a servings stepper with round
  − / + buttons, and a Metric switch, above the ingredients and in cooking mode. Whatever is
  shown is what goes to the grocery list.
- **Steps** all show by default; "Step by step" is a button, never the starting view.

### Daily summary (Home)

Home tells the day rather than repeating the other tabs. Top to bottom (one column on phones;
two on tablets and computers, fitting the screen with only the timeline scrolling):

- **Countdowns** in a row under the headline: the same cards as the Countdowns panel (big day
  count in `--accent-text`, title and date), scrolling sideways when there are more, and a dashed
  **+** that opens Settings → Countdowns. Google Calendar birthdays join them (Settings switch).
- A greeting in `--ink-2` and **one sentence for the day** at `--fs-display` ("3 events, 4 chores
  to do and tacos for dinner."), with the weather as a pill: now, high/low, and when rain is likely.
- **Up next** on an `--accent-soft` card: title at `--fs-title`, "in 25 min" in accent, place and
  people; "Happening now" adds a thin progress bar.
- **Today:** one timeline of timed events and timed chores (dashed edge, with a tick to check off),
  all-day events as chips above it, past rows faded, and an accent "now" line.
- **Chores:** a ring per person in their color that fills as they finish.
- **Dinner** and **Grocery list** tiles, and **Coming up** (tomorrow).

Under the headline, an amber notice says when someone's Google Calendar stopped updating (their
access expired, or no sync for 6 hours); it opens Calendar. Home stays empty until its first data
arrives (at most 3 seconds) rather than saying "Nothing today" for a moment.

Every part opens its own tab. Settings → Home screen switches a kind of device back to panels.

### Lists

- **Tap** an item's words to edit it; **press and hold** (about half a second) anywhere on it to pick
  it up and drag it, within its category or into another (a person's section too). Mouse, finger and
  pen work the same. A lifted item is a floating card with an accent outline and `--shadow-lg`; the
  section it's over gets an `--accent-soft` wash and a 4px accent line marks where it lands. Nothing
  else moves when an item lifts. Near the panel's top or bottom edge, the panel scrolls.
- **Grocery lists file themselves** into store aisles (Produce, Meat & Seafood, Dairy & Eggs, Bakery,
  Pantry, Snacks & Drinks, Frozen, Household), on the device, with no outside service: what the
  household taught it by moving items, then everyday words and brands read from the end of the phrase,
  then the recipe dictionary, then typos. Other lists never file items themselves.
- **No repeats.** Adding what's already there (grocery items by the thing itself: "2 bunches of
  bananas" is bananas) adds nothing and says so, with **Add anyway**; adding something checked off
  puts it back where it was, as typed, with Undo. The recipe and meal-plan grocery buttons skip
  pantry staples and what's on the list, and say how many.

### Meals

- **One place for planning.** The week grid, templates, randomize and groceries all live in the Meals
  tab. Toolbar: Templates · Randomize empty dinners · Groceries for upcoming meals (on phones,
  side by side as Templates · Randomize · Groceries; the full names stay for screen readers).
- **Randomize** picks from the recipe book: dinner takes recipes tagged dinner or untagged, breakfast
  and lunch their own tags first; never sides, desserts, drinks, recipes needing review, or anything on
  Settings → Kitchen's "Never pick recipes with". No repeats in a week, nothing from the last two
  weeks while there's anything else, favorites twice as likely, and the main ingredient spread out.
  A small dice button sits at the end of each meal's label row (today on); every randomize offers Undo.
- **Templates** are made from scratch or from the week on screen, in an editor: name, "Cooking for"
  (as each recipe is written, or 1–12 people), Breakfast / Lunch / Dinner switches (at least one), a row
  per weekday with recipe suggestions and a dice per meal, and "Randomize empty meals". Templates can
  be edited and copied by anyone in the household. Use: This week / Next week, Fill empty meals /
  Replace the week, Cooking for, and "Make a grocery list for it"; the planner jumps to that week, and
  the change offers Undo.
- **Grocery review** before anything is added: the combined list, scaled to "Cooking for", each line
  with the meals it's for in `--ink-2`, every line ticked; untick what you have, then "Add N to the
  grocery list". Pantry staples and what's already on the list are left off and counted.

### Undo, not "are you sure?"

Deleting happens at once and shows a dark floating message along the bottom ("Deleted “Trash
out”" · Undo) for 7 seconds. Only things Undo can't bring back still ask first (photos, redeeming
stars, removing a calendar link, the admin's household tools).

### When something goes wrong

- **Offline:** an amber "Offline" pill beside the clock once the device can't reach the server
  (at once if it loses its connection, after 15 seconds otherwise). Everything still works on the
  saved copy; changes go out when it's back.
- **A page breaks:** the page shows a card ("Something went wrong here." · Try again · Reload the
  app, then the error in `--ink-2`) and tries again by itself a minute later; the side bar and the
  other pages keep working. A page whose files a new release replaced reloads into that release
  (once per 5 minutes at most).
- **Can't reach the household at startup:** the same card, retrying every 5–60 seconds and as soon
  as the device is back online.

### Settings

A search box sits above the section index; it hides the sections (and index entries) whose words
don't match. The admin sees a **Household | Admin** switch: Usage, Households (find, sort, rename,
remove a person, delete), Invite links and Starting households.

### Countdowns

Big day counts on Home: one-time countdowns, birthdays and anniversaries (they repeat every
year, with "turns 60" or "30th anniversary" beside the date), and US holidays for the next two
months (Settings → Home screen). Holidays can't be removed one by one; the switch hides them all.

### Event details

Tapping an event anywhere (calendar, Home) opens a sheet: title at `--fs-title`, when, who
(avatars), where with a Directions link, its calendar, and "Open in Google Calendar". The chip
itself looks the same; its text is the button.

### Welcome tour

New household members get a short tour, one card at a time: a "1 of 7" count in accent,
a `--fs-title` heading, body text in `--ink-2`, an optional "Open …" link, progress dots,
and Skip / Back / Next. The last card is about setting up their kind of device.

## Devices

`<html data-device>` is `phone`, `tablet`, or `desktop` (see `src/lib/device.ts`).

| | Phone | Tablet (wall display) | Computer |
|---|---|---|---|
| Navigation | Bottom bar (4 + More sheet) | Side bar | Side bar |
| Layout | Lists, one column, today first | Fits the screen; nothing scrolls the page | Full layout |
| Hover styles | Off | Off (taps would leave things highlighted) | On |
| Scrollbars | Hidden | Hidden | Thin, visible |

Hover styles live in `@media (hover: hover)` so touch screens never get stuck hover states.

## Motion

Short and functional: 120–180ms ease-out for hover, toggles, and sheets. The photo
slideshow is the one slow place: a 1.6s cross-fade and a gentle drift (zoom plus a small
pan, a different way each photo) that lasts the photo's whole time on screen. Its clock
and date never move. Respect `prefers-reduced-motion`.

## Don't

- Add a second font, italics, or uppercase-with-tracking labels.
- Use raw hex or px font sizes in components — add or reuse a token.
- Use `color-mix()`, CSS nesting, or other features newer than Chrome 109.
- Put emoji in UI chrome (they're fine in user content like reward names).
- Let anything scroll the page itself; scroll the panel or the region.
