# Deploying

Firebase project: `home-organization-app-dkcbl` · <https://home-organization-app-dkcbl.web.app>

## Checks run locally

GitHub only stores the code: no Actions workflows run, so no Actions minutes are used
(apart from Dependabot's monthly update run). Before merging any pull request, run every
check from its branch:

```bash
npm ci && npm --prefix functions ci
npm run verify
```

`verify` runs lint + functions typecheck, the cost and repository guards, web, functions and
security-rules tests (rules tests need Java for the emulators), both builds, the bundle budget
and a production dependency audit of both packages. Merge only when it exits 0.

| | When | What |
|---|---|---|
| **Dependabot** (`.github/dependabot.yml`) | Monthly | Grouped minor/patch dependency PRs. Check out the PR and run `npm run verify` before merging. |

## Deploying

Nothing deploys automatically. After a pull request is merged, deploy from `main`:

```bash
git checkout main
git pull
npm ci && npm --prefix functions ci
npm run deploy
```

`npm run deploy` ([scripts/deploy.mjs](../scripts/deploy.mjs)) refuses unless the checkout is clean and
exactly `origin/main`, and unless there's no `.env.local` / `.env.production` (`.env.local` turns on the
emulators). It builds, runs the bundle check, deploys, and then checks the live site serves the new build.

| Changed | Deploy |
|---|---|
| Web app (`src/`, `public/`, `index.html`) | `npm run deploy -- hosting` |
| `firestore.rules`, `firestore.indexes.json`, `storage.rules` | `npm run deploy -- firestore,storage` |
| Cloud Functions (`functions/`), or a secret | `npm run deploy -- functions` |
| Not sure | `npm run deploy` (hosting + rules), then functions if `functions/` changed |

Functions pin each secret's version at deploy time: after changing a secret
(`GOOGLE_OAUTH_CLIENT_SECRET`, `GMAIL_ADDRESS`, `GMAIL_APP_PASSWORD`), redeploy functions.

Devices pick up a new web app on their next reload (Settings → About → Check for updates).

## Local emulators

`npm run dev:emulators` runs Auth, Firestore and Storage locally; `npm run dev` with
`VITE_USE_EMULATORS=true` (in `.env.development.local`) points the app at them. The ports are off
Firebase's defaults so another project's emulators can run at the same time:

| Emulator | Port |
|---|---|
| Auth | 9109 |
| Firestore | 8180 |
| Storage | 9209 |
| Functions | 5011 |
| Hosting | 5010 |
| Emulator UI | 4010 |

They're set in `firebase.json` (→ `emulators`) and `src/firebase.ts`; change both together.

## Who can start a family

Only accounts listed in Firestore `config/access` → `familyCreators` (lowercase emails) can create
a family; everyone else joins by invite (Settings → Family). Clients can't read or change that doc —
edit it in the Firebase console (Firestore → `config` → `access`).
