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
| **Hosting** | 10 GB stored, 360 MB/day transfer | About 1 MB of app, cached for a year by browsers | Bundle budget in CI (≈340 kB gzipped JS today, budget 430 kB) |
| **Artifact Registry** (function images) | 0.5 GB | Old images are deleted automatically | Cleanup policy: keep 7 days (set 2026-09-28) |
| **Cloud Build** (deploys) | 2,500 build-minutes | A few minutes per functions deploy | — |
| **Secret Manager** | 6 secret versions, 10k reads | 3 secrets (calendar, two for Gmail); read when a function instance starts | Worst case a few cents a month if instances start very often |
| **Eventarc** (Firestore triggers) | Google-source events are free | Recipe index, cookbook parsing | — |
| **Brave Search** (online recipe search) | $5 credit a month, about 1,000 searches | **Off** (`ONLINE_SEARCH = false`). If turned on: capped at 900 searches a month; repeat searches come from a 7-day cache | CI fails if the cap goes over 1,000 |
| **Open-Meteo** (weather) | Free for non-commercial use, 10k calls a day | A few calls an hour | — |
| **Gmail** (reminder emails) | Free (your own account, app password) | A handful a day | — |

**Expected bill: $0.00** for one household. The only charges that could reasonably happen
are a few cents of Secret Manager reads, or Storage above 5 GB if many large videos are
uploaded (the Photos page warns at 4 GB).

## Not used, and checked

- No AI or other paid APIs (OpenAI, Anthropic, Vertex, Vision, Maps, Twilio, SendGrid,
  Stripe…). CI fails if one is added to either `package.json`.
- No Cloud Tasks queues, no warm instances, no paid Firebase extensions.

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
