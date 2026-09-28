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
| `npm run dev:emulators` | Auth + Firestore emulators (UI at http://localhost:4000). For Cloud Functions, run `firebase emulators:start --only auth,firestore,functions`; that needs `functions/.secret.local` containing `GOOGLE_OAUTH_CLIENT_SECRET=anything`. |
| `npm test` | Component tests, Cloud Functions tests (Google and Admin SDK mocked), then security-rules tests against the Firestore emulator. |
| `npm run lint` | oxlint, plus a typecheck of `functions/`. |
| `npm run build` | Typecheck + production build (with service worker). |
| `npm run deploy` | lint, test, build, then deploy Hosting, Firestore rules, and Functions. |

Security rules tests (`tests/rules/`) are written before rule changes. Change
the test first, watch it fail, then edit `firestore.rules`.

## How families work

The first person to sign in creates a family and becomes its owner. The owner
invites others by Google email in the **Family** tab; they sign in and join
automatically. Each email belongs to one family.

## Google Calendar

Each person clicks **Connect my Google Calendar** on the Calendar tab. Google's
popup gives the browser a one-time code; the `connectCalendar` function trades it
for a refresh token stored at `families/{id}/members/{uid}/private/tokens`, which
security rules block from every client. `syncCalendars` runs every 15 minutes and
mirrors each person's primary calendar (30 days back, 120 ahead) into `events`.
If Google rejects a token, the person sees a **Reconnect** button.

The OAuth client secret is a Functions secret:
`firebase functions:secrets:set GOOGLE_OAUTH_CLIENT_SECRET`.
