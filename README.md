# OpsHub

Internal client operations platform. Orchestrates and observes client
content-backend (Payload or Strapi) + Astro projects hosted on Ploi-managed
Vultr infrastructure. See `PROJECT.md` for
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

| Command            | Description                                      |
| ------------------ | ------------------------------------------------ |
| `pnpm dev`         | Local dev server                                 |
| `pnpm build`       | Production build                                 |
| `pnpm start`       | Serve the production build                       |
| `pnpm lint`        | ESLint + Prettier check (`pnpm format` to fix)   |
| `pnpm test`        | Vitest unit tests                                |
| `pnpm db:generate` | Generate a Drizzle migration from the schema     |
| `pnpm db:migrate`  | Apply pending migrations                         |
| `pnpm db:seed`     | Seed the first admin user (idempotent)           |
| `pnpm worker`      | Run the background job worker (separate process) |
| `pnpm test:e2e`    | Playwright smoke test (migrates, seeds, tests)   |

Then open http://localhost:3000 and sign in.

## Ploi integration & mocks (M2)

OpsHub talks to Ploi through a typed, **read-only** client (`lib/ploi/`). M2
exposes only GET endpoints — it never mutates Ploi infrastructure (see the
"Production safety" rule in `AGENTS.md`).

- `USE_MOCKS=true` swaps in `lib/ploi/mock.ts`, so the app runs with no real
  Ploi credentials.
- With mocks off, set `PLOI_API_TOKEN` (and optionally `PLOI_API_BASE`).
- Server data is pulled by the `sync_servers` job. Click **Sync now** on the
  Servers page to enqueue it; the worker performs the actual Ploi read.

Because the jobs are DB-backed, run the worker alongside the app:

```bash
pnpm dev      # or pnpm start
pnpm worker   # in a second terminal
```

The worker also enqueues `sync_servers` every 5 minutes automatically.

## Status

**M0 — Foundation** complete: authentication, navigation shell, empty
dashboard, and a health check (`GET /api/health` → `{ ok, db: 'up' \| 'down' }`).
**M1 — Client & Project CRUD** complete: list/create/edit/archive for clients
and projects, plus a project detail page.
**M2 — Ploi read-only integration**: typed read-only Ploi client with a mock
adapter, token-bucket rate limiter, circuit breaker, the `sync_servers` job +
worker, a Servers page with **Sync now**, and project → Ploi server/site
linking. Later milestones are tracked in `MILESTONES.md`.
