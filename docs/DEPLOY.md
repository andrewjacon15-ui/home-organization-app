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

## Manual deploys

Always from `main` (or a tree identical to it). The Firebase CLI is a dev dependency, so `npx firebase` works from the repo.

```bash
npm ci && npm --prefix functions ci
npm run build
npx firebase deploy --only hosting,firestore,storage --project home-organization-app-dkcbl
```

**Cloud Functions** deploy by hand (they need secrets and broader permissions):

```bash
FUNCTIONS_DISCOVERY_TIMEOUT=60 npx firebase deploy --only functions --project home-organization-app-dkcbl
```

Functions pin each secret's version at deploy time: after changing a secret
(`GOOGLE_OAUTH_CLIENT_SECRET`, `GMAIL_ADDRESS`, `GMAIL_APP_PASSWORD`), redeploy functions.

## Who can start a family

Only accounts listed in Firestore `config/access` → `familyCreators` (lowercase emails) can create
a family; everyone else joins by invite (Settings → Family). Clients can't read or change that doc —
edit it in the Firebase console (Firestore → `config` → `access`).
