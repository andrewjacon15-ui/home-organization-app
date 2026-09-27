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
| `npm run dev:emulators` | Auth + Firestore emulators (UI at http://localhost:4000). |
| `npm test` | Component tests, then security-rules tests against the Firestore emulator. |
| `npm run lint` | oxlint. |
| `npm run build` | Typecheck + production build (with service worker). |
| `npm run deploy` | lint, test, build, then deploy Hosting + Firestore rules. |

Security rules tests (`tests/rules/`) are written before rule changes. Change
the test first, watch it fail, then edit `firestore.rules`.

## How families work

The first person to sign in creates a family and becomes its owner. The owner
invites others by Google email in the **Family** tab; they sign in and join
automatically. Each email belongs to one family.
