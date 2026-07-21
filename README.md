# QA Reporting

App/Project → Feature → Test Case → Record → Issue tracker with review workflow, SLA, analytics. See `docs/` for PLAN, DATABASE, CHECKLIST, and the UI mockup.

Stack: Apollo GraphQL · Prisma · PostgreSQL · React + Vite · Zustand · Tailwind v4 · JWT · i18n.

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
