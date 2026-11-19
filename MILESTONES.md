# Milestones

**Current:** M1 — Client & Project CRUD

Legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` blocked

Acceptance criteria at the end of each milestone must all be met before the
"Current" banner moves to the next milestone.

---

## M0 — Foundation `[x]`

- [x] Next.js 15 app: App Router, TypeScript strict, Tailwind, shadcn/ui (2026-11-19, 93de03b + 7d9c4d9)
- [x] `lib/env.ts` with Zod validation; app fails fast on missing vars (2026-11-19, 5f7390a)
- [x] PostgreSQL connection + Drizzle client (`lib/db/index.ts`) (2026-11-19, 7a9b8b4)
- [x] Drizzle schema for all tables in PROJECT.md §4 (2026-11-19, 7a9b8b4)
- [x] Initial migration generated and applied (2026-11-19, 7a9b8b4)
- [x] Auth.js credentials provider; no public signup (2026-11-19, 93e6ee8)
- [x] `scripts/seed.ts` creates first admin user (2026-11-19, bc293f7)
- [x] Base layout: sidebar (Dashboard, Clients, Projects, Servers, Settings) + header (2026-11-19, 63b8239)
- [x] `GET /api/health` returns `{ ok, db: 'up' | 'down' }` (2026-11-19, ec4b975)
- [x] `.env.example` matches PROJECT.md §8 (2026-11-19, 5f7390a)
- [x] Structured logger (`lib/logger.ts`) with `redact()` (2026-11-19, 5f7390a)

**Acceptance:** App boots, migrates cleanly, seeds an admin, logs in, and
renders an empty dashboard with working navigation. ✅ Verified 2026-11-19:
health `200`; credentials login `302 → /dashboard`; `/dashboard` renders with a
session and `307 → /login` without one.

---

## M1 — Client & Project CRUD `[ ]`

- [ ] `clients` table CRUD: list, create, edit, archive
- [ ] `projects` table CRUD: list, create, edit, archive
- [ ] Project detail page: domain, status, links (Strapi admin, Git repos)
- [ ] Server Actions in `app/actions/clients.ts` and `projects.ts`
- [ ] Form validation via Zod; error states render in UI

**Acceptance:** A user can create a client, then a project linked to it, edit
both, archive both, and see state reflected in list and detail views.

**Depends on:** M0

---

## M2 — Ploi read-only integration `[ ]`

- [ ] `lib/ploi/client.ts`: typed wrappers for
      `GET /servers/monitored`, `GET /servers/{id}`, `GET /servers/{id}/sites`,
      `GET /sites/{id}` (verify shapes against Ploi docs first)
- [ ] `lib/ploi/types.ts`: Zod schemas for responses
- [ ] `lib/ploi/mock.ts` mock adapter, switched by `USE_MOCKS=true`
- [ ] `PloiError` class; circuit breaker after 3 consecutive failures
- [ ] Rate limiter: token bucket, 5 req/sec cap
- [ ] `sync_servers` job: fetch `/servers/monitored`, upsert `servers` table
- [ ] Servers page lists Ploi servers with cached stats
- [ ] Project can be linked to an existing Ploi server + site via dropdown
- [ ] Manual "Sync now" button on Servers page enqueues `sync_servers` job

**Acceptance:** Clicking "Sync now" populates `servers` from Ploi; the UI
shows live data; linking a project to a Ploi site persists the IDs.

**Depends on:** M1

---

## M3 — Provisioning Wizard `[ ]`

- [ ] Wizard scaffold at `/projects/new`, 4 steps, Server Action transitions
- [ ] Step 1: select existing client or create inline
- [ ] Step 2: project name, domain, repo URLs (Strapi + Astro)
- [ ] Step 3: select existing Ploi server + web server template (cached from Ploi)
- [ ] Step 4: review screen + confirm enqueues `provision_site` job
- [ ] `lib/jobs/handlers/provision-site.ts`:
      create project row (status `provisioning`) → `POST /servers/{id}/sites`
      → poll `GET /sites/{id}` (5 min max, exponential backoff) → set
      `ploi_site_id`, status `deploying` → `POST /sites/{id}/deploy`
- [ ] `GET /api/jobs/{id}` polling endpoint; wizard polls every 3s
- [ ] Job progress UI: current step, spinner, error surface

**Acceptance:** A wizard run creates a real site on Ploi; project status
transitions `provisioning → deploying → live`; failure surfaces clearly.

**Depends on:** M2

---

## M4 — Deployment status & webhooks `[ ]`

- [ ] `deploy_events` table (project_id, event, status, timestamp, message)
- [ ] `POST /api/webhooks/ploi/deploy-complete`: validate signature,
      update `project.status`, insert `deploy_events` row (idempotent)
- [ ] Project detail page: deploy timeline (last 20 events)
- [ ] Manual "Redeploy" button → `POST /sites/{id}/deploy`

**Acceptance:** A repo push (or Redeploy click) updates project status in
real time; the deploy timeline reflects the sequence accurately.

**Depends on:** M3

---

## M5 — Fleet vitals dashboard `[ ]`

- [ ] `/dashboard` fleet summary: N servers, N live projects, N failing
- [ ] Server cards: CPU, RAM, disk, load with 7-day sparkline
- [ ] `sync_server_metrics` job: every 5 min, `GET /servers/monitored`,
      write one `metrics_snapshots` row per server per run
- [ ] Metrics retention: prune rows older than 90 days
- [ ] Project health table: status, last deploy, latest page score

**Acceptance:** Dashboard shows live-ish stats for all servers, refreshed on
a 5-minute cadence; the sparklines trend correctly.

**Depends on:** M2, M4

---

## M6 — Page scores `[ ]`

- [ ] `POST /api/webhooks/lighthouse/{projectId}`: validate HMAC
      `X-OpsHub-Signature`, insert `page_scores` row (idempotent)
- [ ] `scripts/lighthouse-reporter.mjs` reference client (reads `LHCI_*` env,
      POSTs to OpsHub)
- [ ] Project detail page: 30-day line chart of performance/accessibility/
      best-practices/SEO (recharts)
- [ ] Documented integration steps in README for client Astro CI pipelines

**Acceptance:** Running the reference script against a test project populates
the chart; malformed or unsigned payloads are rejected with 401.

**Depends on:** M1

---

## M7 — Audit summaries `[ ]`

- [ ] Settings page: per-project Strapi API token (stored encrypted in
      `integration_config`)
- [ ] `pull_audit_logs` job: every 15 min per project, fetch last 50 events
      since last sync, upsert `audit_summaries` (dedupe on `external_id`)
- [ ] Project detail page: "Recent security activity" panel (last 20 events)
- [ ] Plugin setup documented in README (`strapi-cms-audit-log`)

**Acceptance:** A login failure on a test Strapi appears in OpsHub within
15 minutes.

**Depends on:** M1

---

## M8 — Alerting `[ ]`

- [ ] `alert_rules` table: (project_id nullable, rule_type, threshold, channel)
- [ ] Rule types: `server_disk_pct`, `page_score_performance`, `deploy_failed`,
      `audit_login_failed_count`
- [ ] Delivery: webhook (Slack/Discord-compatible) + email (Resend)
- [ ] Alerts sidebar section with acknowledge action
- [ ] Evaluation runs on each metrics / audit / deploy event

**Acceptance:** A configured rule fires and delivers to Slack; the alert
appears in the UI with an acknowledge action.

**Depends on:** M5, M6, M7

---

## Session Log

Append entries here when you hit a blocker or complete a session. Newest
entries at the top.

### 2026-11-19 — M0 complete
- Built M0 from scratch: Next.js 15 (App Router, TS strict) + Tailwind +
  shadcn/ui; Drizzle schema for all §4 tables + initial migration applied;
  Auth.js credentials provider + `scripts/seed.ts` admin; sidebar/header shell
  with login + empty dashboard; `GET /api/health`; Zod env + pino logger.
- Verified acceptance end-to-end: health `200`; admin login `302 → /dashboard`
  (session cookie set); `/dashboard` `200` with session, `307 → /login` without.
- Decisions / notes:
  - Local DB is **Postgres.app Postgres 18** (spec §2 says 16). Database
    `opshub`; `DATABASE_URL` uses OS user `yohan` (trust auth on localhost).
  - Added **`tsx`** devDependency for standalone TS scripts (seed now, worker
    later) — approved by user. Node 22 native TS cannot resolve the `@/*`
    tsconfig alias.
  - shadcn/ui resolved to the new **base-nova** style on `@base-ui/react`
    (not Radix). Spec only requires "shadcn/ui + Tailwind".
  - `.env` is local-only (gitignored); secrets generated with `openssl rand`.
  - `pnpm test` / `pnpm test:e2e` / `pnpm worker` scripts not defined yet —
    Vitest / Playwright / worker arrive with the milestones that need them.
- Blocker (resolved): MILESTONES.md shipped claiming M0–M2 done with commit
  SHAs that did not exist; the user reset it before work began.

<!--
### YYYY-MM-DD
- What was attempted
- What failed / what's blocked
- What information is needed to proceed
-->