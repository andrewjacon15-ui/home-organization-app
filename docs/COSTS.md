# What this app costs (and how it stays at $0)

The Firebase project is on the **Blaze** (pay-as-you-go) plan, because Cloud Functions and
Cloud Storage need it. Blaze includes the same free allowances as the free plan; you pay
only for use above them. Everything below is sized for one household, and CI checks the
code on every pull request so a change can't quietly start costing money
(`npm run check:costs`, `npm run check:repo`, and `npm run check:bundle` after a build).

## Services, free allowances, and our use

| Service | Free each month (or day) | What we use | Guard |
|---|---|---|---|
| **Cloud Scheduler** | 3 jobs per billing account | 3 jobs: calendar sync (15 min), reminder emails (5 min), cookbook watchdog (15 min) | CI fails above 3 |
| **Cloud Functions** (2nd gen) | 2M requests, 180k vCPU-s, 360k GiB-s | ≈14,400 scheduled runs plus taps in the app; each run takes about a second | Global `maxInstances: 3`, no warm instances (`minInstances` is never set), memory ≤ 512 MiB except cookbook OCR (2 GiB, ≤ 3 at once) |
| **Firestore** | 50k reads, 20k writes, 20k deletes per day; 1 GiB stored | A few thousand reads a day. Calendar sync writes only events that changed, reminders read only what's due, and recipes browse from a small index | TTL deletes old web-search cache, finished cooking sessions, and checked-off list items |
| **Cloud Storage** | 5 GB stored, 100 GB downloads, 5k uploads, 50k reads | Photos (shrunk to 2560 px on upload, with 480 px thumbnails for the grid), cookbook files (≤ 300 MB each) | Upload size caps in `storage.rules`; photos cached by browsers for a year; the Photos page shows storage used and warns at 80% |
| **Hosting** | 10 GB stored, 360 MB/day transfer | About 1 MB of app, cached for a year by browsers; plus the tablet's voice files (~47 MB stored, downloaded once per tablet and kept there) | Bundle budget in CI (≈340 kB gzipped JS today, budget 430 kB) |
| **Artifact Registry** (function images) | 0.5 GB | Old images are deleted automatically | Cleanup policy: keep 7 days (set 2026-09-28) |
| **Cloud Build** (deploys) | 2,500 build-minutes | A few minutes per functions deploy | — |
| **Secret Manager** | 6 secret versions, 10k reads | 3 secrets (calendar, two for Gmail); read when a function instance starts | Worst case a few cents a month if instances start very often |
| **Eventarc** (Firestore triggers) | Google-source events are free | Recipe index, cookbook parsing | — |
| **Brave Search** (online recipe search) | $5 credit a month, about 1,000 searches | **On** since 2026-10-03. Capped at 900 searches a month for all households together; repeat searches come from a 7-day cache | CI fails if the cap goes over 1,000 |
| **Open-Meteo** (weather, air quality) | Free for non-commercial use, 10k calls a day | One forecast call per open screen every 15 minutes (plus air quality if turned on) | — |
| **National Weather Service** (alerts) | Free, no key | One call per open screen every 15 minutes | — |
| **Calendar links** (.ics / webcal) | Free (plain web requests) | Each link read about once an hour by the existing calendar job (no new scheduled job); only changed events are written | 5 MB per file, 3,000 events per link |
| **Gmail** (reminder emails) | Free (your own account, app password) | A handful a day | — |

**Expected bill: $0.00** for one household (see "More households" below for several). The only charges that could reasonably happen
are a few cents of Secret Manager reads, or Storage above 5 GB if many large videos are
uploaded (the Photos page warns at 4 GB).

## More households (invite links)

Every household shares the same free allowances. Measured on the live project, the week of
2026-09-28 (one household: wall tablet, two phones, about 180 calendar events):

| | Per day | Free per day |
|---|---|---|
| Firestore reads | 21k–37k before the October 3 sync fix, which removes about 17k of them | 50k |
| Firestore writes | 25–2k (18k before the September 30 sync fix) | 20k |
| Storage | 48 MB in total | 5 GB in total |

The scheduled jobs cost about the same however many households there are. The calendar sync
re-reads stored events only when Google's copy changed, plus once a day; the reminder job only
visits households with reminder settings. What grows with each household:

- **An always-on wall tablet:** about 3k–8k reads a day (each idle reload re-reads what's on
  screen).
- **Phones only:** about 1k–2k reads a day.
- **Calendar sync and reminders:** about 1k–2.5k reads a day.
- **Photos and cookbooks:** typically 0.1–0.5 GB per household.

**Rough limit before any charge:** about 5–8 households with wall tablets, or 15–20
phone-only households. Firestore reads run out first, then Storage at around 10–25
photo-heavy households. Past that it's still cheap: about $0.06 per extra 100k reads, so
twenty tablet households would cost roughly $2–4 a month. Settings → Households (admin only)
shows each household's size, and the $1 budget alert catches the first cent.

Limits that aren't money:
- Google lets an unverified sign-in app reach 100 users in total who connect Google Calendar.
- Reminder emails come from the administrator's Gmail account, which can send to about 500
  people a day.

## Not used, and checked

- No AI or other paid APIs (OpenAI, Anthropic, Vertex, Vision, Maps, Twilio, SendGrid,
  Stripe…). CI fails if one is added to either `package.json`.
- No Cloud Tasks queues, no warm instances, no paid Firebase extensions.
- The tablet's speech-to-text runs on the tablet (Vosk), not a paid speech API.

## Read-saving rules in the app

- Each screen reads only what it shows, and the Firestore cache on the device means a
  reload (the tablet reloads when idle) is charged only for what changed.
- In-app reminders watch the calendar only when event reminders are on, and chores only when
  chore reminders are on. Their calendar window moves once a day, not every hour (each move
  re-reads every event in it).
- The photo library is read on the wall tablet (for the screensaver) and while a photo screen
  is open, never in the background on phones.
- The Meals tab, while it's open, keeps the lists, the grocery list's items and the kitchen
  settings live (about 50–70 reads the first time, then only what changes), so adding up
  groceries and clearing meals need no reads of their own. Meal templates, and this week and
  next, load only while the templates sheet is open.
- Recipes for a grocery list come in one read per 30 and are kept for the visit.
- Home's daily summary reads what the panels did (the week's events, chores, countdowns) plus
  today's and tomorrow's meal plan, and only the grocery list's items, not every list.
- Reminder emails read the household's quiet hours only when a reminder is about to go out.
- The Admin tab measures storage (one file listing per household) only when it's opened or refreshed.

## Meal planning (checked 2026-10-23)

| Action | Firestore | How often |
|---|---|---|
| Starter recipes for a household | 27 existence checks + 27 writes, and 27 recipe-index trigger runs | Once per household, ever |
| Open the Meals tab | ≈ 70 reads first time, then changes only | Per visit |
| Plan a week from a template | ≤ 7 writes (+ 14 reads if the sheet's weeks weren't open yet) | Per use |
| Add a week's groceries | ≈ 50–70 writes, ≤ 21 recipe reads (cached for the visit) | Per use |
| Clear a day or a week | ≤ 7 writes + one delete per grocery item it takes off | Per use |

A household that plans a week a day stays under 1k operations a day for meal planning, a
few percent of the free daily allowance.

## Last checked (2026-10-03)

- Secret Manager: every secret version is in use (\`firebase functions:secrets:prune\` found
  nothing to remove).
- Artifact Registry: the cleanup policy deletes function images after 7 days.
- Cloud Scheduler: 3 of the 3 free jobs.
- Online search: capped at 900 searches a month (the free credit covers about 1,000).

## Set a budget alert (recommended, 2 minutes)

An alert can't stop spending, but it emails you as soon as anything is charged.

1. Open https://console.cloud.google.com/billing and choose the billing account for
   `home-organization-app-dkcbl`.
2. **Budgets & alerts → Create budget.** Name it "Family Organizer", scope it to this project.
3. Amount: **$1**. Thresholds: 50%, 90%, 100% (actual spend). Keep "Email alerts to
   billing admins" on.
4. Save.

## If you turn on online search

1. Create a Brave Search API key (it needs a card; the monthly $5 credit covers 1,000
   searches, and the app stops at 900).
2. `npx -y firebase-tools functions:secrets:set BRAVE_SEARCH_API_KEY --project home-organization-app-dkcbl`
3. Set `ONLINE_SEARCH = true` in `functions/src/shared/features.ts`, merge, and deploy
   functions and hosting.
