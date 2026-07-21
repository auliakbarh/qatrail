# QA Reporting

App/Project → Feature → Test Case → Record → Issue tracker with an engineer review
workflow, SLA tracking, analytics, and role-based access.

Stack: Apollo GraphQL · Prisma · PostgreSQL · React + Vite · Zustand · Tailwind v4 · JWT · i18n.

## Features

- Hierarchy: Project → Feature → Test Case → Record Test; pass %/coverage & readiness (an open issue keeps a case out of the pass count)
- Issues: Defect/Bug, full workflow (accept/reject/need-clarify/solve+postmortem/review), retest-to-close, SLA per priority (production), notifications (live)
- Human keys: `ISSUE-/REC-/FEAT-/TC-<n>`; deep links `/issues/:id`
- Views: All issues & Assigned-to-me with search, status/priority/type/SLA filters, group-by (collapsible), sort, row numbers
- Analytics: totals, resolution rate, avg resolve, SLA compliance, created-vs-resolved (date range), status donut, key coverage
- Admin: users, maintenance, SLA config, Discord webhook; forgot/reset password
- Prepared seams: Microsoft SSO, SharePoint attachments, JIRA comment post

## Docs

`docs/` — [PLAN](docs/PLAN.md) · [DATABASE](docs/DATABASE.md) · [CHECKLIST](docs/CHECKLIST.md) · [DEPLOY (PM2)](docs/DEPLOY.md) · [UI mockup](docs/mockup.html). In-app **Help** page has a glossary + Defect vs Bug.

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

DB: Postgres on `localhost:5434` (see `docker-compose.yml`). API: `http://localhost:4000/graphql`. Web: `http://localhost:5173`.
