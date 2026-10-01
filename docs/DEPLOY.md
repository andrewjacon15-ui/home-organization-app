# Deploying

Firebase project: `home-organization-app-dkcbl` · <https://home-organization-app-dkcbl.web.app>

## What runs automatically

| Workflow | When | What |
|---|---|---|
| **CI** (`.github/workflows/ci.yml`) | Every PR and push to `main` | Lint + functions typecheck, web tests, functions tests, security-rules tests on the emulators, both builds, production dependency audit. The **CI passed** job summarizes them (use it for branch protection). |
| **Deploy** (`.github/workflows/deploy.yml`) | After CI passes on `main` (or run by hand) | Builds and deploys **hosting + Firestore/Storage rules** from the exact commit CI tested. Dormant until the `FIREBASE_SERVICE_ACCOUNT` secret exists. |
| **Dependabot** (`.github/dependabot.yml`) | Weekly | Grouped minor/patch dependency PRs, checked by CI. |

## Turning on automatic deploys (one time)

1. Google Cloud console → **IAM & Admin → Service Accounts** → *Create service account*
   named `github-deploy`.
2. Grant it: **Firebase Hosting Admin**, **Firebase Rules Admin**, **Cloud Datastore Index Admin**,
   **Service Usage Consumer**. (Nothing else — it can't read your data or deploy functions.)
3. On that account: **Keys → Add key → JSON**. A file downloads.
4. GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**:
   name `FIREBASE_SERVICE_ACCOUNT`, value = the whole JSON file. Then delete the downloaded file.
5. Optional: **Settings → Environments → production** → require a reviewer, if you want to approve each deploy.

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
