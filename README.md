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

## Ploi integration & mocks

OpsHub talks to Ploi through a typed client (`lib/ploi/`). The M2 read endpoints
are joined by exactly two authorised writes — create site and trigger deploy
(M3/M4). No delete/destroy/stop/reboot/scale call exists anywhere in the client
(see the "Production safety" rule in `AGENTS.md`).

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

The worker also enqueues `sync_servers` and `sync_server_metrics` every 5
minutes automatically.

## Provisioning wizard (M3)

`/projects/new` is a 4-step wizard (client → project details → infrastructure →
review). Confirming enqueues a `provision_site` job; the **worker** performs the
actual Ploi writes, so the app process never holds a write in flight:

1. create the project row (`status = provisioning`);
2. create the site (`POST /servers/{server}/sites`);
3. poll the site until it is `active`;
4. set `deploying`, trigger a deploy if a repo URL was given, and poll the
   deployment to `live`/`failed`.

The wizard polls `GET /api/jobs/{id}` every 3s and shows each step. A site is
only ever created once: retries reuse the recorded `ploi_site_id`, or an
existing site with the same domain. Ploi only deploys sites with a repository
attached — if none is attached (this integration does not attach repos yet) the
project is marked `live` without a deploy and the job says so.

The plain create form is still available at `/projects/new?manual=1` for
projects that should not create a Ploi site.

To watch the full flow locally with no credentials, set `USE_MOCKS=true` and run
the worker alongside the app; the mock adapter creates a site and reports the
deployment as successful.

## Deploy status & webhook (M4)

A project's detail page shows a **deploy timeline** (the last 20 events) and a
**Redeploy** button. Redeploy enqueues a `trigger_deploy` job; the worker calls
`POST /servers/{server}/sites/{id}/deploy`, polls the deployment to a terminal
state, and records the outcome — updating `project.status`
(`deploying` → `live`/`failed`) and appending a `deploy_events` row.

### Ploi has no signed deploy webhook

Ploi does **not** sign its notifications (no HMAC, no shared secret header), so
the endpoint is authenticated with a secret you embed in the callback URL.
Configure it per site in the Ploi panel: **site → Notifications**, and point the
deployment channels at OpsHub:

```
Deployment started   →  POST {NEXTAUTH_URL}/api/webhooks/ploi/deploy-complete?token={PLOI_WEBHOOK_SECRET}&event=started
Deployment completed →  POST {NEXTAUTH_URL}/api/webhooks/ploi/deploy-complete?token={PLOI_WEBHOOK_SECRET}
```

Set `PLOI_WEBHOOK_SECRET` (a long random string) in `.env`. The endpoint rejects
a missing/incorrect token with `401` (and returns `503` if the secret is unset),
so keep the URL private. The callback payload is only a trigger: OpsHub re-reads
`GET /servers/{server}/sites/{site}/deployments` for the authoritative status, so
the recorded event is correct even though the notification carries no status
field. Writes are deduplicated on the Ploi deployment id, so a repeated
notification cannot double-count.

## Fleet vitals dashboard (M5)

`/dashboard` is the fleet overview:

- **Fleet summary** — cached servers, live projects and failing projects.
- **Server cards** — the latest CPU, RAM, disk and load for each cached server,
  each with a 7-day sparkline built from `metrics_snapshots`. The sparkline is a
  small inline SVG (`components/charts/sparkline.tsx`); `recharts` is used only
  for the M6 page-score chart.
- **Project health** — status, last deploy and latest page score per project.

The `sync_server_metrics` job runs every 5 minutes alongside `sync_servers`: it
reads `GET /servers/monitored`, upserts the server cache, writes one
`metrics_snapshots` row per server for the latest datapoint, and prunes rows
older than 90 days. Ploi reports RAM as a **percentage** (not MB), so it is
stored in `metrics_snapshots.ram_pct`; `ram_used_mb` remains for real MB data if
a source appears later. The mock adapter advances its datapoints over time, so
sparklines trend locally.

## Page scores (M6)

Each client Astro pipeline can report Lighthouse CI scores to OpsHub; the
project detail page then charts the last 30 days.

### Reference client

`scripts/lighthouse-reporter.mjs` is the reference client — copy it into the
client's CI. Run it after `lhci autorun` (it reads the local
`.lighthouseci/lhr-*.json` results), with these env vars:

| Variable                    | Purpose                                                                               |
| --------------------------- | ------------------------------------------------------------------------------------- |
| `OPSHUB_URL`                | OpsHub base URL (default `http://localhost:3000`)                                     |
| `OPSHUB_PROJECT_ID`         | the project's id (from `/projects/{id}`)                                              |
| `LIGHTHOUSE_WEBHOOK_SECRET` | must match the OpsHub env var                                                         |
| `OPSHUB_PAGE_URL`           | optional — only report the run for this URL                                           |
| `OPSHUB_EXTERNAL_ID`        | optional idempotency key (default `LHCI_BUILD_CONTEXT__EXTERNAL_BUILD_ID`)            |
| `OPSHUB_REPORT_URL`         | optional link to the hosted report (default `LHCI_BUILD_CONTEXT__EXTERNAL_BUILD_URL`) |
| `LHCI_RESULTS_DIR`          | optional results directory (default `./.lighthouseci`)                                |

```bash
# GitHub Actions, after `lhci autorun`
OPSHUB_URL=https://opshub.example.com \
OPSHUB_PROJECT_ID=<project-uuid> \
LIGHTHOUSE_WEBHOOK_SECRET=${{ secrets.OPSHUB_LIGHTHOUSE_SECRET }} \
node scripts/lighthouse-reporter.mjs
```

### Webhook

The reporter POSTs to `POST /api/webhooks/lighthouse/{projectId}` and signs the
raw body with HMAC-SHA256:

```
X-OpsHub-Signature: sha256=<hex hmac of the raw body>
```

Set `LIGHTHOUSE_WEBHOOK_SECRET` in `.env` (a long random string). The endpoint
rejects a missing/incorrect signature with `401` (and `503` if the secret is
unset). Writes are deduplicated on `page_scores.external_id` — the reporter's
`external_id` when sent, otherwise a hash of the body — so a repeated identical
POST cannot create a second row. The project detail page shows the score chart
over the last 30 days, and the dashboard's project-health table shows the latest
performance score.

## Status

**M0 — Foundation** complete: authentication, navigation shell, empty
dashboard, and a health check (`GET /api/health` → `{ ok, db: 'up' \| 'down' }`).
**M1 — Client & Project CRUD** complete: list/create/edit/archive for clients
and projects, plus a project detail page.
**M2 — Ploi read-only integration**: typed read-only Ploi client with a mock
adapter, token-bucket rate limiter, circuit breaker, the `sync_servers` job +
worker, a Servers page with **Sync now**, and project → Ploi server/site
linking.
**M3 — Provisioning wizard**: the `/projects/new` wizard, the `provision_site`
job (create site → wait → deploy), the `GET /api/jobs/{id}` polling endpoint,
and the job-progress UI.
**M4 — Deployment status & webhooks**: the `deploy_events` timeline, the
`trigger_deploy` job + **Redeploy** button, and the
`POST /api/webhooks/ploi/deploy-complete` callback (token-authenticated,
reconciled against the Ploi API, idempotent).
**M5 — Fleet vitals dashboard**: the `/dashboard` fleet summary, per-server
vitals with 7-day sparklines, the `sync_server_metrics` job (5-minute cadence,
90-day retention), and a project-health table.
**M6 — Page scores**: the signed `POST /api/webhooks/lighthouse/{projectId}` webhook, the reference CI client `scripts/lighthouse-reporter.mjs`, and a 30-day score chart on the project detail page. Later milestones are tracked in `MILESTONES.md`.
