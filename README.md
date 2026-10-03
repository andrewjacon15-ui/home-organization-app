# home-organization-app

Family organizer for the kitchen wall tablet and everyone's phones: chores,
meal planning, a merged Google Calendar, photo screensaver, and reminder emails.
React + Vite PWA on Firebase (Hosting, Firestore, Auth, Functions, Storage).

- Firebase project: `home-organization-app-dkcbl`
- Live: https://home-organization-app-dkcbl.web.app

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server. Create `.env.development.local` with `VITE_USE_EMULATORS=true` to use local emulators. |
| `npm run dev:emulators` | Auth, Firestore, and Storage emulators (UI at http://localhost:4000). New families need `config/access` → `familyCreators` in the emulator too. For Cloud Functions, run `firebase emulators:start --only auth,firestore,functions`; that needs `functions/.secret.local` containing `GOOGLE_OAUTH_CLIENT_SECRET=anything`. |
| `npm test` | Component tests, Cloud Functions tests (Google and Admin SDK mocked), then security-rules tests against the Firestore and Storage emulators. |
| `npm run lint` | oxlint, plus a typecheck of `functions/`. |
| `npm run build` | Typecheck + production build (with service worker). |
| `npm run deploy` | lint, test, build, then deploy Hosting, rules, and Functions. CI deploys hosting + rules automatically; see [docs/DEPLOY.md](docs/DEPLOY.md). |

Security rules tests (`tests/rules/`) are written before rule changes. Change
the test first, watch it fail, then edit `firestore.rules`.

The Firebase CLI is a dev dependency: use `npx firebase …` from the repo.

Design rules (type, color, icons, components, devices): [docs/STYLE-GUIDE.md](docs/STYLE-GUIDE.md).

## Wall tablet

See [docs/TABLET-SETUP.md](docs/TABLET-SETUP.md) to turn an Android tablet
(a Skylight Calendar 15" or an ordinary one like a Galaxy Tab A9+) into the
kitchen display (no rooting needed).

## How families work

Only accounts on the `config/access` allowlist can create a family (so a stranger's
Google account can't use this project). The owner invites others by Google email in
**Settings → Family**; they sign in and join automatically. Each email belongs to one family.

## Google Calendar

Each person clicks **Connect my Google Calendar** on the Calendar tab. Google's
popup gives the browser a one-time code; the `connectCalendar` function trades it
for a refresh token stored at `families/{id}/members/{uid}/private/tokens`, which
security rules block from every client. `syncCalendars` runs every 15 minutes and
mirrors each person's calendars (30 days back, 120 ahead) into `events`.
If Google rejects a token, the person sees a **Reconnect** button.

The OAuth client secret is a Functions secret:
`npx firebase functions:secrets:set GOOGLE_OAUTH_CLIENT_SECRET`.

## Reminder emails

`sendReminderEmails` runs every 5 minutes: before-event emails and a daily digest, per
person (Settings → Email reminders). It sends through Gmail with two secrets,
`GMAIL_ADDRESS` and `GMAIL_APP_PASSWORD` (an app password, not the account password).
