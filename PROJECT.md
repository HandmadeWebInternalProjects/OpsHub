# Spec: Internal Client Operations Platform ("OpsHub")

Below is a detailed, implementation-ready spec you can drop into your OpenCode harness as `PROJECT.md` (or split into `PROJECT.md` + `MILESTONES.md`). It is structured so an AI coding agent can implement it incrementally, with clear boundaries on what to build and what not to build.

---

## 1. Overview

**Project name:** OpsHub (working title)
**Purpose:** An internal-only web application that orchestrates and observes client projects hosted on Ploi-managed Vultr infrastructure. It is the single source of truth for the lifecycle of every client site (content backend — Payload or Strapi — plus an Astro frontend).

**Primary user:** Internal operations engineers and developers on the team. **Not** a client-facing portal (explicitly deferred).

**Core value delivered:**
1. **Provisioning:** A wizard that creates a new client project end-to-end via the Ploi API.
2. **Fleet visibility:** A single dashboard showing the health, page scores, and recent security activity of every client project.
3. **Audit trail:** A summary of content-backend audit events per client, surfaced in the dashboard.
4. **State of record:** A canonical database mapping clients → projects → Ploi server/site IDs → domains.

**Non-goals (explicitly out of scope for v1):**
- Client login / white-label portal
- Billing, invoicing, or CRM features
- Full log aggregation, search, or a SIEM
- Building an APM / distributed tracing system
- Building a full uptime checker (integrate an existing one)
- Multi-tenant content backends (assume one instance per client for v1)

---

## 2. Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | **Next.js 15 (App Router)** | Server Actions for mutations; Route Handlers for webhooks |
| Language | **TypeScript** (strict) | |
| Database | **PostgreSQL 16** | Same VPS or managed Postgres |
| ORM | **Drizzle ORM** | Type-safe, migrations via drizzle-kit |
| Auth | **Auth.js (NextAuth v5)** | Credentials provider only; no public signup |
| UI | **shadcn/ui + Tailwind CSS** | Dark mode default |
| Validation | **Zod** | Shared between client and server |
| Background jobs | **DB-backed job queue** (simple: `jobs` table + cron worker) | Avoid BullMQ/Redis for v1; upgrade later if needed |
| HTTP client | Native `fetch` with typed wrappers | |
| Testing | **Vitest** (unit) + **Playwright** (smoke) | |
| Linting | ESLint + Prettier | |
| Package manager | **pnpm** | |

**Deployment target for OpsHub itself:** Ploi-managed Vultr VPS (Node.js site). Database on the same server or a separate managed instance.

---

## 3. Architecture

```
┌─────────────────────────────────────────────────────┐
│  OpsHub (Next.js)                                   │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────┐  │
│  │  Dashboard  │  │  Wizard UI   │  │  Settings  │  │
│  └──────┬──────┘  └──────┬───────┘  └─────┬──────┘  │
│         │                │                │         │
│         └────────────────┴────────────────┘         │
│                          │                          │
│              ┌───────────▼───────────┐              │
│              │   Server Actions /    │              │
│              │   Route Handlers      │              │
│              └───────────┬───────────┘              │
│                          │                          │
│              ┌───────────▼───────────┐              │
│              │   Integration Layer   │              │
│              │  (Ploi, Lighthouse,   │              │
│              │   CMS, Uptime)        │              │
│              └───────────┬───────────┘              │
│                          │                          │
│              ┌───────────▼───────────┐              │
│              │   PostgreSQL (Drizzle)│              │
│              └───────────────────────┘              │
└─────────────────────────────────────────────────────┘
                          │
        ┌─────────────────┼──────────────────┐
        ▼                 ▼                  ▼
    Ploi API         Lighthouse CI      CMS audit
   (external)        (webhook in)       (API pull)
```

**Key principle:** OpsHub **collects and aggregates**; it does not run monitoring itself. All metrics come from external sources (Ploi, Lighthouse, content-backend plugins) via API pulls or webhooks.

---

## 4. Data Model (Drizzle Schema)

Define these tables. Use `uuid` PKs, `created_at`/`updated_at` timestamps everywhere.

```ts
// clients
{
  id: uuid PK
  name: text
  slug: text unique
  contact_email: text nullable
  notes: text nullable
  status: enum('active', 'paused', 'archived')
}

// projects  (one client may have multiple projects)
{
  id: uuid PK
  client_id: uuid FK -> clients
  name: text
  slug: text unique
  domain: text unique
  cms_type: enum('payload', 'strapi', 'other')  // content backend
  ploi_server_id: integer nullable
  ploi_site_id: integer nullable
  cms_url: text nullable
  astro_repo_url: text nullable
  cms_repo_url: text nullable
  status: enum('draft', 'provisioning', 'deploying', 'live', 'failed', 'archived')
  provisioning_job_id: uuid nullable
}

// servers (cached from Ploi)
{
  id: uuid PK
  ploi_server_id: integer unique
  name: text
  provider: text
  ip_address: text
  last_synced_at: timestamp
  raw_json: jsonb  // full Ploi response for debugging
}

// metrics_snapshots  (lightweight; daily rollups only)
{
  id: uuid PK
  server_id: uuid FK -> servers
  captured_at: timestamp
  cpu_pct: numeric nullable
  ram_used_mb: integer nullable
  disk_used_pct: numeric nullable
  load_avg_1m: numeric nullable
}

// page_scores  (from Lighthouse CI)
{
  id: uuid PK
  project_id: uuid FK -> projects
  captured_at: timestamp
  url: text
  performance: integer  // 0-100
  accessibility: integer
  best_practices: integer
  seo: integer
  report_url: text nullable
}

// audit_summaries  (rolled up from the content backend)
{
  id: uuid PK
  project_id: uuid FK -> projects
  captured_at: timestamp
  event_type: text  // 'login_failed', 'content_deleted', 'permission_changed', etc.
  actor: text nullable
  ip_address: text nullable
  summary: text
}

// jobs  (simple DB-backed queue)
{
  id: uuid PK
  type: enum('provision_site', 'trigger_deploy', 'sync_servers', 'sync_server_metrics', 'pull_audit_logs', 'pull_page_scores')
  payload: jsonb
  status: enum('pending', 'running', 'succeeded', 'failed')
  attempts: integer default 0
  error: text nullable
  scheduled_for: timestamp
  started_at: timestamp nullable
  finished_at: timestamp nullable
}

// users  (internal team only)
{
  id: uuid PK
  email: text unique
  password_hash: text
  role: enum('admin', 'engineer', 'viewer')
}

// integration_config  (encrypted secrets)
{
  id: uuid PK
  key: text unique  // 'ploi_api_token', 'lighthouse_webhook_secret', etc.
  encrypted_value: text
  updated_at: timestamp
}
```

---

## 5. External Integrations

### 5.1 Ploi API

**Base URL:** `https://ploi.io/api`
**Auth:** Bearer token (`Authorization: Bearer <token>`)
**Docs:** https://ploi.io/documentation/api — **the agent should verify exact endpoint shapes against these docs before implementing.**

**Endpoints to integrate:**

| Purpose | Method + Path | Used by |
|---|---|---|
| List all monitored servers with stats | `GET /servers/monitored` | Metrics sync job, fleet overview |
| Get single server | `GET /servers/{id}` | Dashboard detail |
| List sites on a server | `GET /servers/{id}/sites` | Fleet sync |
| Create a site | `POST /servers/{id}/sites` | Provisioning wizard |
| Trigger deploy | `POST /sites/{id}/deploy` | Deploy action |
| Get site | `GET /servers/{server}/sites/{id}` | Status check |

**Required Ploi API scopes on the token:** servers read, sites read/write, deployments write.

**Implementation notes:**
- Wrap all Ploi calls in `lib/ploi/client.ts` with typed request/response models.
- Include a `PloiError` class that surfaces HTTP status + body.
- Add a **circuit breaker**: after 3 consecutive failures, pause the sync job and alert.
- Rate-limit: Ploi has per-minute limits; use a simple token bucket (5 req/sec cap).

### 5.2 Lighthouse CI (page scores)

**Flow:**
1. Each client's Astro build pipeline (on their CI, e.g., GitHub Actions) runs `lhci autorun` against the built preview.
2. The pipeline POSTs the score JSON to `OpsHub` at `POST /api/webhooks/lighthouse/{project_id}` with an HMAC signature header (`X-OpsHub-Signature`).
3. OpsHub validates the signature, stores a `page_scores` row.

**Alternative for repos you control:** OpsHub also exposes `GET /api/lighthouse/config/{project_id}` returning the LHCI config the pipeline should fetch (optional, phase 2).

**Acceptance:** A malformed or unsigned payload is rejected with 401. A valid payload creates exactly one `page_scores` row and triggers a dashboard revalidation.

### 5.3 Content-backend audit logs

OpsHub pulls audit/activity events through a provider interface in `lib/cms/`,
mirroring the uptime provider (§5.4):

    interface CmsProvider {
      listAuditEvents(project, since): Promise<AuditEvent[]>
    }

Implementations: `PayloadProvider` (default), `StrapiProvider` (uses the
community plugin `strapi-cms-audit-log`), and `NullCmsProvider` for projects
without an audit source (v1 default).

**Flow:** A recurring job (`pull_audit_logs`) runs every 15 minutes per project.
For each project with a `cms_url` and a configured API token:
1. Fetch the last 50 audit events since the last successful sync.
2. Map to `audit_summaries` rows (deduplicated by the backend event ID — the
   `external_id` column).
3. Store only the summary fields; do not store raw diffs.

**Phase 2:** Store secrets per-project in `integration_config` keyed by
`cms_token_{project_id}`.

**Payload:** its audit/activity source is TBD. M7 ships behind
`NullCmsProvider` until the Payload adapter is defined and verified against
Payload's docs.

### 5.4 Uptime monitoring (deferred integration point)

Reserve a `lib/uptime/` module with a `UptimeProvider` interface:
```ts
interface UptimeProvider {
  listMonitors(): Promise<Monitor[]>
  getStatus(monitorId: string): Promise<Status>
}
```
Implement `NullUptimeProvider` for v1. A future `CheckmateProvider` or `OhDearProvider` can be added without touching the dashboard.

---

## 6. Features by Milestone

Each milestone is **independently shippable** and should be reviewed before starting the next.

### M0 — Foundation
- Next.js 15 app with App Router, TypeScript strict, Tailwind, shadcn/ui.
- PostgreSQL connection + Drizzle migrations for all tables in §4. We are running PostgresSQL 18 locally on our mac
- Auth.js credentials provider. Seed script creates first admin user.
- Base layout: sidebar nav (Dashboard, Clients, Projects, Servers, Settings), user menu.
- Health check endpoint `GET /api/health` returning DB status.
- **Done when:** you can log in and see an empty dashboard.

### M1 — Client & Project CRUD
- CRUD pages for `clients` and `projects`.
- Project detail page shows domain, status, links to the content-backend admin / Git repo (if set).
- Server Actions for create/update/archive.
- **Done when:** you can manually create a client and a project (without Ploi integration) and see it listed.

### M2 — Ploi read-only integration
- `lib/ploi/client.ts` with typed wrappers for the read endpoints in §5.1.
- A `sync_servers` job runs on demand (manual button) and every 5 min (cron).
- Servers page lists Ploi servers with their cached stats.
- A project can be linked to an existing Ploi server + site via a dropdown.
- **Done when:** clicking "Sync now" populates the `servers` table and the UI shows live data.

### M3 — Provisioning wizard
The centerpiece. A multi-step wizard at `/projects/new`:

**Step 1 — Client:** Select existing client or create inline.
**Step 2 — Project details:** Name, domain, repo URLs (CMS + Astro).
**Step 3 — Infrastructure:**
  - Select existing Ploi server, **or** check "Provision new server" (v1: show a message that manual Vultr provisioning is required; auto-provision is Phase 2).
  - Select web server template (dropdown populated from Ploi, cached).
**Step 4 — Review & Confirm:** Shows what will be created. Confirm triggers a `provision_site` job.

**Job `provision_site`:**
1. Create `project` row with status `provisioning`.
2. Call `POST /servers/{id}/sites` with the domain, `project_type`, system user, webhook URL.
3. Poll `GET /sites/{id}` until the site exists (max 5 min, exponential backoff).
4. Update project with `ploi_site_id`, set status `deploying`.
5. Trigger deploy via `POST /sites/{id}/deploy` (if repo configured).
6. Ploi's site webhook (`/api/webhooks/ploi/deploy-complete`) updates status to `live` or `failed`.

**UI:** Wizard step transitions use Server Actions + optimistic UI. Job progress shown via polling `/api/jobs/{id}` every 3s.

**Done when:** A wizard run creates a real site on Ploi and the project status transitions to `live`.

### M4 — Deployment status & webhooks
- `POST /api/webhooks/ploi/deploy-complete` route handler validates Ploi's webhook signature and updates `project.status`.
- Project detail page shows a deploy timeline (last 20 events, from a new `deploy_events` table).
- Manual "Redeploy" button triggers `POST /sites/{id}/deploy`.
- **Done when:** pushing to the client's repo (or clicking Redeploy) updates the project status in real time.

### M5 — Fleet vitals dashboard
- `/dashboard` shows:
  - **Fleet summary:** N servers, N projects live, N failing.
  - **Server cards:** CPU, RAM, disk, load — each with a sparkline from `metrics_snapshots` (last 7 days).
  - **Project health:** table of projects with status, last deploy, latest page score.
- `sync_server_metrics` job runs every 5 min, calls `GET /servers/monitored`, writes one `metrics_snapshots` row per server per run (downsampled by job to one every 5 min; prune >90 days).
- **Done when:** dashboard shows live-ish stats for all servers, refreshed on a 5-min cadence.

### M6 — Page scores
- Lighthouse webhook endpoint (§5.2).
- A "Page Score" panel on the project detail page showing the latest 30 days as a line chart (use `recharts`).
- Add a small script (in `scripts/lighthouse-reporter.mjs`) the agent should also commit — it is the **reference client** that the client's CI pipeline will copy. It reads `LHCI_*` env vars and POSTs to OpsHub.
- **Done when:** a test POST via the reference script populates the chart.

### M7 — Audit summaries
- `pull_audit_logs` job runs every 15 min for projects with a `cms_url` + token.
- Project detail page shows "Recent security activity" (last 20 events).
- Settings page for per-project CMS API token (stored in `integration_config`, encrypted with a key from env).
- **Done when:** a login-failure on a test content backend appears in OpsHub within 15 min.

### M8 — Alerting
- Alert rules stored in a new `alert_rules` table: `(project_id nullable, rule_type, threshold, channel)`.
- Rule types: `server_disk_pct > X`, `page_score_performance < X`, `deploy_failed`, `audit_login_failed_count > X in 1h`.
- Delivery: generic webhook (Slack/Discord-compatible) + email (Resend or similar).
- Alerts shown in an "Alerts" sidebar section with acknowledge action.
- **Done when:** a test rule fires and delivers to a Slack webhook.

---

## 7. File Structure

```
opshub/
├── app/
│   ├── (auth)/login/page.tsx
│   ├── (app)/
│   │   ├── layout.tsx                    # sidebar + header
│   │   ├── dashboard/page.tsx            # M5
│   │   ├── clients/…                     # M1
│   │   ├── projects/
│   │   │   ├── page.tsx                  # list
│   │   │   ├── new/page.tsx              # M3 wizard
│   │   │   └── [id]/page.tsx             # detail + page scores + audit
│   │   ├── servers/page.tsx              # M2
│   │   └── settings/page.tsx
│   ├── api/
│   │   ├── health/route.ts
│   │   ├── jobs/[id]/route.ts            # polling
│   │   └── webhooks/
│   │       ├── ploi/deploy-complete/route.ts
│   │       └── lighthouse/[projectId]/route.ts
│   └── actions/                          # server actions
│       ├── clients.ts
│       ├── projects.ts
│       └── provision.ts
├── lib/
│   ├── db/
│   │   ├── schema.ts                     # §4
│   │   ├── index.ts                      # drizzle client
│   │   └── migrations/
│   ├── ploi/
│   │   ├── client.ts
│   │   └── types.ts
│   ├── cms/
│   │   ├── provider.ts                   # CmsProvider interface + types
│   │   ├── null-provider.ts              # v1 default
│   │   ├── payload.ts                    # M7
│   │   └── strapi.ts                     # M7
│   ├── uptime/
│   │   ├── provider.ts                   # interface
│   │   └── null-provider.ts
│   ├── jobs/
│   │   ├── runner.ts                     # worker loop
│   │   └── handlers/
│   │       ├── provision-site.ts
│   │       ├── sync-server-metrics.ts
│   │       ├── pull-audit-logs.ts
│   │       └── trigger-deploy.ts
│   ├── crypto.ts                         # encrypt/decrypt integration_config
│   ├── auth.ts                           # Auth.js config
│   └── env.ts                            # Zod-validated env
├── components/
│   ├── ui/                               # shadcn
│   ├── wizard/                           # M3
│   ├── charts/                           # recharts wrappers
│   └── health-badge.tsx
├── scripts/
│   ├── seed.ts
│   ├── run-worker.ts                     # job worker entrypoint
│   └── lighthouse-reporter.mjs           # M6 reference client
├── drizzle.config.ts
├── .env.example
├── package.json
└── PROJECT.md                            # this spec
```

---

## 8. Environment Variables (`.env.example`)

```bash
# Core
DATABASE_URL=postgres://…
NEXTAUTH_SECRET=
NEXTAUTH_URL=http://localhost:3000
ENCRYPTION_KEY=            # 32-byte base64, for integration_config

# Ploi
PLOI_API_TOKEN=
PLOI_API_BASE=https://ploi.io/api

# Lighthouse webhook
LIGHTHOUSE_WEBHOOK_SECRET=

# Alert delivery
SLACK_WEBHOOK_URL=
RESEND_API_KEY=

# Worker
WORKER_POLL_INTERVAL_MS=10000
```

All validated through `lib/env.ts` with Zod. The app **must fail fast** on startup if any required variable is missing.

---

## 9. Non-Functional Requirements

- **Type safety:** No `any` in `lib/`, `app/api/`, or `app/actions/`. Zod at every external boundary (webhooks, Ploi responses).
- **Idempotency:** All webhook handlers and job handlers must be idempotent (use `external_id` / `job_id` uniqueness).
- **Secrets:** Never log tokens, passwords, or `integration_config` values. Use a `redact()` helper in the logger.
- **Error UX:** Server Actions return `{ ok, error }` discriminated unions; no thrown exceptions reaching the client.
- **Testing:** Unit tests for `lib/ploi/client.ts` (mocked), `lib/crypto.ts`, and job handlers. One Playwright smoke test: login → create client → create project (Ploi mocked).
- **Observability:** Structured JSON logs (pino). Every job writes a `jobs` row with `error` on failure.
- **Performance:** Dashboard TTI < 2s on the VPS. Use Next.js caching for server lists (revalidate 60s).

---

## 10. Development Workflow (for the OpenCode agent)

1. **Work one milestone at a time.** Open a branch `feat/m{N}-<slug>`. Commit incrementally.
2. **Before implementing any external integration (Ploi, Payload/Strapi), fetch the current API docs** at the URL in §5.1 / §5.3 and adjust the typed client if shapes differ. Do not invent endpoints.
3. **Provide a mock adapter** for each external service (`lib/ploi/mock.ts`) so the app runs locally without real credentials. Env var `USE_MOCKS=true` switches the DI container.
4. **Every milestone ends with:** migrations applied, seed data exists, README section updated, and a demoable UI state.
5. **Ask before adding dependencies** beyond the §2 stack. Prefer small, well-maintained packages.
6. **Do not build** anything in §1 Non-goals. If a task seems to require it, flag it as a question first.

---

## 11. Acceptance Checklist (project complete when…)

- [ ] A new admin can be seeded, log in, and see an empty dashboard.
- [ ] A user can create a client, then run the wizard to provision a real Ploi site, and watch status go `provisioning → deploying → live`.
- [ ] The dashboard shows live server vitals for every Ploi server.
- [ ] A Lighthouse POST to the webhook appears as a page score on the correct project.
- [ ] A content-backend login failure appears in the project's audit panel within 15 minutes.
- [ ] A configured alert rule delivers to Slack.
- [ ] All secrets are encrypted at rest; no secret appears in logs or client bundles.
- [ ] `pnpm test` and `pnpm test:e2e` pass in CI.
- [ ] The app deploys cleanly to a Ploi Node.js site via Git push.

---

### How to use this with OpenCode

Drop this file in as `PROJECT.md`. Then start a session with:

> "Read PROJECT.md. Implement M0. Do not proceed to M1 until I confirm. Ask me any clarifying questions about the Ploi API shapes or stack choices before writing code."

This sequencing (one milestone per session, explicit stop points, mocks for external services) keeps the agent focused and lets you review meaningful chunks of work before it compounds. If you want, I can also produce a shorter `MILESTONES.md` that just lists the acceptance criteria per milestone — useful as a checklist the agent can't drift from.