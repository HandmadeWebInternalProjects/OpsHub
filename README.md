# OpsHub

Internal client operations platform. Orchestrates and observes client Strapi +
Astro projects hosted on Ploi-managed Vultr infrastructure. See `PROJECT.md` for
the full spec and `MILESTONES.md` for the working checklist.

## Stack

Next.js 15 (App Router) · TypeScript (strict) · PostgreSQL + Drizzle ·
Auth.js (NextAuth v5) · Tailwind + shadcn/ui · Zod · pino.

## Prerequisites

- Node 22
- pnpm
- PostgreSQL (developed against Postgres 18; spec §2 says 16)

## Setup

```bash
pnpm install
cp .env.example .env   # then fill in values
```

Required env vars: `DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`,
`ENCRYPTION_KEY` (32-byte base64, e.g. `openssl rand -base64 32`). Everything
else is optional until the milestone that uses it. Env is validated by
`lib/env.ts` and the app fails fast on a missing required value.

Create the database and apply migrations, then seed the first admin:

```bash
createdb opshub        # or point DATABASE_URL at an existing database
pnpm db:migrate
pnpm db:seed           # defaults: admin@opshub.local / admin1234
```

Override seed credentials with `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`.

## Scripts

| Command            | Description                                    |
| ------------------ | ---------------------------------------------- |
| `pnpm dev`         | Local dev server                               |
| `pnpm build`       | Production build                               |
| `pnpm start`       | Serve the production build                     |
| `pnpm lint`        | ESLint + Prettier check (`pnpm format` to fix) |
| `pnpm db:generate` | Generate a Drizzle migration from the schema   |
| `pnpm db:migrate`  | Apply pending migrations                       |
| `pnpm db:seed`     | Seed the first admin user (idempotent)         |
| `pnpm test:e2e`    | Playwright smoke test (migrates, seeds, tests) |

Then open http://localhost:3000 and sign in.

## Status

**M0 — Foundation** complete: authentication, navigation shell, empty
dashboard, and a health check (`GET /api/health` → `{ ok, db: 'up' \| 'down' }`).
**M1 — Client & Project CRUD** complete: list/create/edit/archive for clients
and projects, plus a project detail page. Later milestones are tracked in
`MILESTONES.md`.
