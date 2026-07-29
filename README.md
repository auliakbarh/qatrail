# QATrail

App/Project → Feature → Test Case → Record → Issue tracker with an engineer review
workflow, SLA tracking, analytics, and role-based access.

## Tech stack

| Layer | Tech |
|---|---|
| API | Node.js + TypeScript, Apollo Server (GraphQL) over Express, `graphql-ws` subscriptions |
| ORM / DB | Prisma · PostgreSQL |
| Auth | JWT (single active session), bcrypt, AES-256-GCM for secrets at rest |
| Frontend | React 18 + Vite + TypeScript, React Router, Apollo Client |
| State / forms | Zustand · React Hook Form |
| UI | Tailwind CSS v4 · lucide-react icons |
| i18n | i18next / react-i18next (en/id) |
| Logging | pino |
| Tooling | npm workspaces, Docker Compose (Postgres), PM2 (deploy) |

## Requirements

- **Node.js** ≥ 20 and **npm** ≥ 10
- **PostgreSQL** ≥ 14 (local via Docker, or a managed instance)
- **Docker** + Docker Compose (for the local Postgres in `docker-compose.yml`)
- For deployment: **PM2** (`npm i -g pm2`), optionally **nginx** (reverse proxy + TLS) and **serve** (`npm i -g serve`) if serving the client via PM2

## Features

- Hierarchy: Project → Feature → Test Case → Record Test (PASS / FAIL / BLOCKED); pass %/coverage & readiness (an open issue keeps a case out of the pass count)
- Issues: Defect/Bug, full workflow (accept/reject/need-clarify/solve+postmortem/review), retest-to-close, SLA per priority (production), notifications (live)
- Session tests (SIT/UAT): one testing event per date with stakeholders, apps under test (linked app test or typed by hand, versions snapshotted), agreed target pass %, close-with-summary and a printable sign-off report
- Human keys: `ISSUE-/REC-/FEAT-/TC-/APP-/ST-<n>`; deep links `/issues/:id`, `/session-tests/:id`
- Views: All issues & Assigned-to-me with search, status/priority/type/SLA filters, group-by (collapsible), sort, row numbers
- Test cases movable across features/projects; attachment previews (image, playable video + download, markdown/json/csv formatted in the right panel)
- Full English/Indonesian i18n (language toggle in the sidebar)
- Analytics: totals, resolution rate, avg resolve, SLA compliance, created-vs-resolved (date range), status donut, key coverage — scopeable to a project, feature or one testing session
- Roles: super admin / admin / QA / engineer, plus **viewer** — read-only (sign in, change own password, see everything, act on nothing)
- Admin: users, maintenance, SLA config, Discord webhook; forgot/reset password
- Prepared seams: Microsoft SSO, SharePoint attachments, JIRA comment post

## Quick start

```bash
cp server/.env.example server/.env   # adjust if needed
npm run setup                        # install + db up + db push + seed
npm run dev                          # server :4000/graphql + client :5173
```

`npm run setup` seeds the super admin (`SUPER_ADMIN_EMAIL`, default `it@hpam.co.id`). If `SUPER_ADMIN_PASSWORD` is blank, a temporary password is generated and printed once in the server log — sign in, then change it.

## Scripts

| Command | What |
|---|---|
| `npm run dev` | Run server + client together |
| `npm run db:up` / `db:down` | Start / stop Postgres (docker) |
| `npm run db:push` | Apply Prisma schema |
| `npm run db:seed` | Seed super admin + SLA + settings |
| `npm run build` | Build server + client |
| `npm run release 1.2.0` | Bump `package.json`, commit, tag `v1.2.0` (no arg = print current version) |

DB: Postgres on `localhost:5434` (see `docker-compose.yml`). API: `http://localhost:4000/graphql`. Web: `http://localhost:5173`.

## Versioning

The version in the sidebar footer and on `/health` (UI + API) is the newest git
tag — `v1.2.3` shows as `1.2.3`; no source file is edited per release. The UI
value is baked in by vite at build time, the API reads it at boot. Order:
`APP_VERSION` env → newest tag → `package.json`.

```bash
./scripts/version.sh            # show the version a build would use
npm run release 1.2.0           # bump package.json, commit, tag v1.2.0
git push --follow-tags
```

Tags created in the GitHub UI work the same — `./scripts/redeploy.sh` fetches
tags before building. Details in `docs/DEPLOY.md`.

## Deploy (PM2)

On the server (Node ≥20, Postgres reachable, `npm i -g pm2`):

```bash
git clone <repo-url> qatrail && cd qatrail
npm install

# 1. Server env
cp server/.env.example server/.env
#   set at least: DATABASE_URL, JWT_SECRET (non-default), NODE_ENV=production,
#   CORS_ORIGINS + FRONTEND_BASE_URL (your domain), SUPER_ADMIN_* , SECRET_ENC_KEY

# 2. Client build-time API URL
echo 'VITE_API_URL="https://qatrail.example.com/graphql"' > client/.env.production

# 3. Database + build
npm run db:push        # or: npm -w server run db:migrate:deploy
npm run db:seed        # first deploy only (seeds super admin + SLA + settings)
npm run build          # server (dist) + client (client/dist)

# 4. Run with PM2 (ecosystem.config.cjs = API + optional static client)
pm2 start ecosystem.config.cjs
pm2 save && pm2 startup   # survive reboots
```

Ops: `pm2 status` · `pm2 logs qar-server` · `pm2 reload ecosystem.config.cjs` (after `git pull && npm install && npm run build`).

**Recommended:** put nginx in front — serve `client/dist` statically and proxy `/graphql` (HTTP + WebSocket) to `127.0.0.1:4000`; then set `VITE_API_URL` and `CORS_ORIGINS` to your HTTPS domain. Environment-variable reference lives in `server/.env.example`.

Health check after deploy: open `/health` in the browser, or
`curl -s -X POST https://qatrail.example.com/graphql -H 'content-type: application/json' -d '{"query":"{health{status apiVersion}}"}'`.
