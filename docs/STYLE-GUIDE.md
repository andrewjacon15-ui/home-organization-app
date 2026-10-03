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
No serif, no italics, no all-caps labels.

| Token | Size (at 16px root) | Use |
|---|---|---|
| `--fs-display` | 30px | Page titles, header date and clock |
| `--fs-title` | 22px | Section titles, day numbers |
| `--fs-lead` | 17px | Card titles, person names, list names |
| `--fs-body` | 15px | Body text, inputs, buttons |
| `--fs-small` | 13px | Event text, meta, hints |
| `--fs-label` | 12px | Captions, nav labels, weekday names |
| `--fs-micro` | 10px | Initials inside tiny badges only |

- **Weights:** 400 regular (body), 500 medium (labels, nav, buttons), 600 semibold
  (titles, names, the selected item). Nothing else.
- **Tracking:** −0.02em on display sizes, −0.015em on titles, 0 elsewhere.
- **Numbers:** `tabular-nums` for clocks, times, and counts so they don't jitter.
- **Case:** sentence case everywhere ("Add event", not "ADD EVENT").
- **Root size:** 16px (15 small / 19 large via Settings → General). Tablets get 17px.

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
- **Touch targets:** `--tap` (48px; 52px on tablets) for anything tappable.

## Icons

**Lucide** (`lucide-react`), always through `src/components/Icons.tsx`:
24px grid, **1.75 stroke**, rounded caps and joins, `currentColor`.

- Nav icons at 22px; inline icons (weather in day headers) at 15px.
- Icons inherit text color: `--ink-2` at rest, accent when selected.
- Weather uses Lucide's sun/cloud/rain set (`WeatherBadges.tsx`), not emoji — emoji
  render differently on every device.
- Buttons use icons for arrows and "add" (`BackIcon`, `NextIcon`, `AddIcon`), not text
  characters like ‹ › or +.
- Decorative icons are `aria-hidden`; icon-only buttons need an `aria-label`.

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
- **Sheets & dialogs:** floating, 18px radius, `--shadow-lg`, dimmed backdrop.

### Calendar

- A week is **one card**; days are columns split by hairlines.
- **Today:** the date sits in a filled accent circle and the column gets a faint
  `--accent-soft` wash.
- **Events:** rounded chips — 3px left bar + soft tint in the owner's/calendar's color;
  title 600, time in `--ink-2`; past events at reduced opacity.
- **Busy days** scroll inside their column with a faded edge and a "Scroll for more"
  cue — never a page scroll.

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

Short and functional: 120–180ms ease-out for hover, toggles, and sheets; a slow
cross-fade only in the photo slideshow. Respect `prefers-reduced-motion`.

## Don't

- Add a second font, italics, or uppercase-with-tracking labels.
- Use raw hex or px font sizes in components — add or reuse a token.
- Use `color-mix()`, CSS nesting, or other features newer than Chrome 109.
- Put emoji in UI chrome (they're fine in user content like reward names).
- Let anything scroll the page itself; scroll the panel or the region.
