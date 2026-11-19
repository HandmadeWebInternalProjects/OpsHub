# Milestones

**Current:** M2 complete ✅ — M3 (Provisioning Wizard) not started, awaiting confirmation

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

## M1 — Client & Project CRUD `[x]`

- [x] `clients` table CRUD: list, create, edit, archive (2026-11-19, 316f36c + fc3e72d)
- [x] `projects` table CRUD: list, create, edit, archive (2026-11-19, 316f36c + 4818c16)
- [x] Project detail page: domain, status, links (content-backend admin, Git repos) (2026-11-19, 4818c16)
- [x] Server Actions in `app/actions/clients.ts` and `projects.ts` (2026-11-19, 316f36c)
- [x] Form validation via Zod; error states render in UI (2026-11-19, 316f36c + 2d225a2)

**Acceptance:** A user can create a client, then a project linked to it, edit
both, archive both, and see state reflected in list and detail views. ✅
Verified 2026-11-19 in-browser: created `Acme Corp` → project `Acme Marketing
Site` (linked, domain + repo links shown) → lists reflect linkage → archived
project and client, both showing `Archived` in list/detail.

**Depends on:** M0

---

## M2 — Ploi read-only integration `[x]`

- [x] `lib/ploi/client.ts`: typed wrappers for
      `GET /servers/monitored`, `GET /servers/{id}`, `GET /servers/{id}/sites`,
      `GET /servers/{server}/sites/{id}` (2026-11-20, 8f08b60) — see Session Log:
      the documented `GET /sites/{id}` does not exist upstream
- [x] `lib/ploi/types.ts`: Zod schemas for responses (2026-11-20, 8f08b60)
- [x] `lib/ploi/mock.ts` mock adapter, switched by `USE_MOCKS=true` (2026-11-20, 8f08b60)
- [x] `PloiError` class; circuit breaker after 3 consecutive failures (2026-11-20, 8f08b60)
- [x] Rate limiter: token bucket, 5 req/sec cap (2026-11-20, 8f08b60)
- [x] `sync_servers` job: fetch `/servers/monitored`, upsert `servers` table (2026-11-20, d39d727 + bc8a51a)
- [x] Servers page lists Ploi servers with cached stats (2026-11-20, 02a183e)
- [x] Project can be linked to an existing Ploi server + site via dropdown (2026-11-20, 02a183e)
- [x] Manual "Sync now" button on Servers page enqueues `sync_servers` job (2026-11-20, 02a183e)

**Acceptance:** Clicking "Sync now" populates `servers` from Ploi; the UI
shows live data; linking a project to a Ploi site persists the IDs. ✅
Verified 2026-11-20 in-browser (mock adapter): clicked "Sync now" → action
enqueued a `sync_servers` job → worker upserted 2 servers → Servers page
rendered cached stats (CPU/RAM/Disk/Load); linked project `285a44b6…` to
server `1001` / site `501`, persisted in the DB.

**Depends on:** M1

---

## M3 — Provisioning Wizard `[ ]`

- [ ] Wizard scaffold at `/projects/new`, 4 steps, Server Action transitions
- [ ] Step 1: select existing client or create inline
- [ ] Step 2: project name, domain, repo URLs (CMS + Astro)
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

- [ ] Settings page: per-project CMS API token (stored encrypted in
      `integration_config`)
- [ ] `pull_audit_logs` job: every 15 min per project, fetch last 50 events
      since last sync via a `lib/cms` provider, upsert `audit_summaries`
      (dedupe on `external_id`)
- [ ] `PayloadProvider` (default) and `StrapiProvider` behind the
      `NullCmsProvider` fallback
- [ ] Project detail page: "Recent security activity" panel (last 20 events)
- [ ] Content-backend audit setup documented in README

**Acceptance:** A login failure on a test content backend appears in OpsHub
within 15 minutes.

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

### 2026-11-20 — M2 Ploi read-only integration (built; acceptance verification in progress)
- **`lib/ploi/`**: `types.ts` (Zod, loose objects that tolerate extra fields),
  `client.ts` (read-only GET wrappers), `mock.ts` (`USE_MOCKS=true`),
  `errors.ts` (`PloiError`, `PloiCircuitOpenError`), `rate-limiter.ts`
  (token bucket), `circuit-breaker.ts`, and a singleton `getPloiClient()`.
- **Jobs**: `lib/jobs/` — DB-backed runner (claims with
  `FOR UPDATE SKIP LOCKED`, retries ×3 with exponential backoff), `enqueueJob`,
  `sync_servers` handler (idempotent upsert on `ploi_server_id`), and
  `scripts/run-worker.ts` (`pnpm worker`). The worker enqueues `sync_servers`
  every 5 min via an `enqueueIfStale` guard.
- **UI**: Servers page (cached list + latest stats + **Sync now**), and a
  "Ploi infrastructure" card on the project detail page to link a Ploi
  server + site (sites fetched live via `listServerSites`).
- **Testing**: added **Vitest** + `pnpm test` (11 unit tests: client parse /
  HTTP error / network error / circuit-open, rate limiter, circuit breaker).
  `tsc --noEmit`, `pnpm lint`, `pnpm build`, `pnpm test`, `pnpm test:e2e` all pass.
- **Docs verification (important)** — Ploi API fetched 2026-11-20:
  - Docs moved to **https://developers.ploi.io**; the URL in PROJECT.md §5.1
    (`ploi.io/documentation/api`) now 404s.
  - **`GET /sites/{id}` (PROJECT.md §5.1) did not exist.** The real endpoint is
    `GET /servers/{server}/sites/{id}`. Implemented the real path and updated the
    PROJECT.md §5.1 table accordingly (approved 2026-11-20).
  - `GET /servers/monitored` is **not** paginated (bare `data` array);
    `GET /servers` and `GET /servers/{id}/sites` **are** (`data` + `meta`).
    Monitored `statistics` values are strings (`cpu`, `ram`, `disk`,
    `load_average`).
  - Monitored/list endpoints do **not** expose the server `provider`, so
    `servers.provider` (NOT NULL) is stored as `"unknown"`. Flagged for M5.
- **Spec change**: added `sync_servers` to the `jobs.type` enum in PROJECT.md §4
  — it was missing even though §6/M2 require the job. Minimal one-line fix +
  migration `0001_slippery_maria_hill.sql`.
- **Verified**: a one-off worker run (USE_MOCKS=true) enqueued + ran
  `sync_servers`, upserting 2 mock servers; a second run was a no-op (recurrence
  guard + idempotent upsert). **In-browser acceptance done** 2026-11-20 (mock
  adapter): Sync now → job → worker → 2 servers with stats; project linked to
  server 1001 / site 501 and persisted. `tsc`, `lint`, `build`, `test`,
  `test:e2e` all pass.

### 2026-11-19 — Backend-agnostic CMS (Payload/Strapi)
- Generalised the content backend per approved PROJECT.md change: added
  `projects.cms_type` enum `('payload','strapi','other')` (default `payload`),
  renamed `strapi_url`→`cms_url` and `strapi_repo_url`→`cms_repo_url`.
- Added `lib/cms/`: `provider.ts` (`CmsProvider` + `AuditEvent`),
  `null-provider.ts`, and a `getCmsProvider(type)` factory. Payload/Strapi
  adapters land in M7; everything currently resolves to `NullCmsProvider`.
- UI: project form gains a CMS select (Payload/Strapi/Other) and neutral
  labels ("CMS", "CMS URL", "CMS repo URL"); detail page shows "CMS admin"/
  "CMS repo" links. Validation + Server Actions updated.
- Migration **squashed**: deleted the old `0000_*` and regenerated a single
  `0000_*` migration from the current schema (pre-deployment, demo data only).
- `pnpm lint` / `build` / `test:e2e` pass after the change.

### 2026-11-19 — M1 complete
- Clients & projects CRUD via Server Actions in `app/actions/clients.ts` /
  `projects.ts` (Zod-validated, `{ ok, data } | { ok, error }`), list/create/
  edit/archive pages, project detail with Strapi/Git links, shared
  `StatusBadge`, and archive confirm dialogs.
- New shared modules: `lib/action-result.ts`, `lib/validation.ts`,
  `lib/db/errors.ts` (unique/FK violation detection).
- Verified acceptance in-browser: created client `Acme Corp` → project `Acme
  Marketing Site` (linked) → archived both; lists/details reflect state.
- Fix: Base UI `Select` needs an `items` label map or `SelectValue` renders the
  raw UUID (fixed in `2d225a2`).
- Notes:
  - Archive is a soft delete (`status = 'archived'`), matching the §4 status
    enums; no rows are deleted.
  - Project create/edit uses Zod URL checks for Strapi/repo URLs and a domain
    pattern; empty optional fields are stored as `NULL`.
  - Added **Playwright** with an M1 smoke test (`pnpm test:e2e`): login →
    create client → create linked project → assert in list. The web server is
    migrated + seeded automatically by `playwright.config.ts`. Vitest
    (`pnpm test`) is still pending (wired when `lib/ploi/client.ts` lands).

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