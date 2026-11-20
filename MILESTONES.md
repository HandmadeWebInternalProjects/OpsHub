# Milestones

**Current:** M5 complete ✅ — M6 (Page scores) not started

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

## M3 — Provisioning Wizard `[x]`

- [x] Wizard scaffold at `/projects/new`, 4 steps, Server Action transitions (2026-11-20, 8d361eb)
- [x] Step 1: select existing client or create inline (2026-11-20, 8d361eb)
- [x] Step 2: project name, domain, repo URLs (CMS + Astro) (2026-11-20, 8d361eb)
- [x] Step 3: select existing Ploi server + web server template (cached from Ploi) (2026-11-20, 8d361eb + 77c11ac)
- [x] Step 4: review screen + confirm enqueues `provision_site` job (2026-11-20, 8d361eb + 77c11ac)
- [x] `lib/jobs/handlers/provision-site.ts`:
      create project row (status `provisioning`) → `POST /servers/{server}/sites`
      → poll `GET /servers/{server}/sites/{id}` until `active` (5 min max,
      exponential backoff) → set `ploi_site_id`, status `deploying` →
      `POST /servers/{server}/sites/{id}/deploy` → poll
      `GET /servers/{server}/sites/{site}/deployments/{deployment}` → `live`/`failed` (2026-11-20, cc0758f)
- [x] `GET /api/jobs/{id}` polling endpoint; wizard polls every 3s (2026-11-20, 77c11ac)
- [x] Job progress UI: current step, spinner, error surface (2026-11-20, 8d361eb)

**Acceptance:** A wizard run creates a real site on Ploi; project status
transitions `provisioning → deploying → live`; failure surfaces clearly.
✅ Verified 2026-11-20 **live against Ploi** (`brutus-vps`, server 37668): a
browser wizard run created site **436829 `opshub.handmadeweb.com.au`**
(`active`, `/public`, no repository) and drove the project
`provisioning → deploying → live`; the project detail page then showed the
live site id `436829`. Read-only re-check confirmed the 5 pre-existing sites
on the server were untouched. Also verified earlier the same day against the
**mock adapter** (e2e wizard→worker→`live`, plus one-off create+deploy runs
and idempotency: 3 runs, exactly 1 site). A real-data bug surfaced during live
recon — the API returns `deploy_script` as script text, not a boolean; fixed
in `b802c6f`.

**Depends on:** M2

---

## M4 — Deployment status & webhooks `[x]`

- [x] `deploy_events` table (project_id, event, status, timestamp, message) (2026-11-20, b6c0464)
- [x] `POST /api/webhooks/ploi/deploy-complete`: authenticate the callback,
      update `project.status`, insert `deploy_events` row (idempotent)
      (2026-11-20, 869d1c9) — Ploi sends **no** HMAC signature, so the endpoint
      is token-authenticated (secret embedded in the callback URL) and
      reconciles the real status via `GET .../deployments`
- [x] Project detail page: deploy timeline (last 20 events) (2026-11-20, 869d1c9)
- [x] Manual "Redeploy" button → `POST /servers/{server}/sites/{id}/deploy`
      (2026-11-20, a0b4d8d + 869d1c9)

**Acceptance:** A repo push (or Redeploy click) updates project status in real
time; the deploy timeline reflects the sequence accurately. ✅ Verified
2026-11-20: the **Redeploy** path end-to-end under the mock adapter (Playwright:
wizard project → `trigger_deploy` job → project `live` + a `Deployment completed`
timeline entry), and the **webhook** handler driven directly against the local DB
(started → `deploying`; completed → API reconcile → `deploy_completed` event +
`live`; a repeated notification was idempotent — deduped on the Ploi deployment
id). The live Ploi panel notification URL was **not** exercised (needs a real
client repo + a manual Ploi-panel step) — see Session Log.

**Depends on:** M3

---

## M5 — Fleet vitals dashboard `[x]`

- [x] `/dashboard` fleet summary: N servers, N live projects, N failing
      (2026-11-20, bf1ab9e)
- [x] Server cards: CPU, RAM, disk, load with 7-day sparkline
      (2026-11-20, bf1ab9e) — inline SVG (`components/charts/sparkline.tsx`);
      RAM is a percentage (see Session Log: `metrics_snapshots.ram_pct`)
- [x] `sync_server_metrics` job: every 5 min, `GET /servers/monitored`,
      write one `metrics_snapshots` row per server per run
      (2026-11-20, bf1ab9e)
- [x] Metrics retention: prune rows older than 90 days (2026-11-20, bf1ab9e)
- [x] Project health table: status, last deploy, latest page score
      (2026-11-20, bf1ab9e)

**Acceptance:** Dashboard shows live-ish stats for all servers, refreshed on
a 5-minute cadence; the sparklines trend correctly. ✅ Verified 2026-11-20
under the **mock adapter**: the worker's `sync_server_metrics` job wrote
`metrics_snapshots` rows (checked in the DB, `cpu_pct`/`ram_pct` populated) and
`pnpm test:e2e` (3 passed) renders the fleet summary, a server card and a live
sparkline. The 5-minute cadence is wired the same way as M2's accepted
`sync_servers` recurrence; a real 5-minute window was not observed over time.

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

### 2026-11-20 — M5 Fleet vitals dashboard (built; acceptance verified)
- **Added:** `/dashboard` (fleet summary, a card per cached server with CPU/RAM/
  disk/load + 7-day sparklines, project-health table). `sync_server_metrics`
  handler: latest datapoint per server → one `metrics_snapshots` row per run
  (idempotent on `(server_id, captured_at)`), prune >90 days. Worker enqueues it
  every 5 min alongside `sync_servers`. `lib/servers.ts` (shared
  monitored-server upsert, now used by `sync_servers` too), `lib/metrics.ts`
  (statistic parser + retention constants),
  `components/charts/sparkline.tsx` (dependency-free inline SVG),
  `components/dashboard/server-metrics-card.tsx`.
- **Spec change (user-approved 2026-11-20):** added `metrics_snapshots.ram_pct`
  (migration `0003_clammy_alex_power.sql`). Ploi's monitored endpoint reports RAM
  as a **percentage** (`"36.32"`), not MB, so §4's `ram_used_mb integer` cannot
  hold it; `ram_used_mb` is kept for real MB data. Approved by the user
  2026-11-20 and **applied to PROJECT.md §4** (recorded in a follow-up docs
  commit).
- **Doc verification (2026-11-20):** confirmed `statistics[]` shape/units against
  developers.ploi.io (servers/monitored): `cpu`/`ram`/`disk` are percentage
  strings, `load_average` a load number, `date` UTC.
- **Mock:** `listMonitoredServers` now emits recent (per-minute) datapoints that
  advance each call, so the metrics job accumulates a series and sparklines trend
  locally. Mock deploy ids gained a per-process suffix to fix a real collision:
  a leftover `deploy_events.external_id` (e.g. `mock-deploy-1`) from an earlier
  session silently swallowed a fresh redeploy event via `onConflictDoNothing`
  (the M4 log's known gap) and broke the M4 e2e tail.
- **Decisions / deviations:**
  - No charting dependency in M5 — sparklines are inline SVG; `recharts` is a
    §6/§7 dependency for M6 and will be added there.
  - The metrics job upserts the server cache itself, so it works even if it runs
    before `sync_servers` (both are enqueued on worker start).
  - `cpu_pct`/`ram_pct`/`disk_used_pct`/`load_avg_1m` store Ploi's numbers as
    given; `ram_used_mb` is unused for now.
- **Commits:** `bf1ab9e` (schema + migration + jobs + dashboard + tests + README).
- **Verification (2026-11-20, mock adapter):** `tsc`, `eslint`, `prettier`,
  `pnpm test` (31), `pnpm build`, `pnpm test:e2e` (3 passed — incl. a new
  dashboard test asserting the fleet summary, a server card and a rendered
  sparkline). Checked the local DB directly: `sync_server_metrics` wrote rows
  with `cpu_pct`/`ram_pct` populated.
- **Outstanding / follow-up:**
  - Live Ploi cadence not observed over real time (the account has one monitored
    server; monitoring may not be installed). The 5-min schedule is the same
    mechanism as M2's accepted `sync_servers`.
  - No unit test for the `sync_server_metrics` handler (DB test harness still
    missing — same gap as `sync_servers` / `provision_site`).
  - PROJECT.md §4 `ram_pct` line **applied** (see the Spec change note above).

### 2026-11-20 — M4 Deployment status & webhooks (built; acceptance verified)
- **Added:** `deploy_events` table + `deploy_event_type` enum (migration
  `0002_magenta_wonder_man.sql`). `lib/deploy.ts` (`mapDeploymentStatus`,
  `insertDeployEvent`, `recordDeployment`, `pollDeploymentStatus`,
  `parsePloiDate`) shared by the job handler and the webhook.
  `lib/jobs/handlers/trigger-deploy.ts`; `PloiApi.listDeployments`
  (`GET /servers/{server}/sites/{site}/deployments`) + mock support.
  `POST /api/webhooks/ploi/deploy-complete` (token-authenticated, reconciles via
  the API, idempotent). `redeployProject` action + `Redeploy` button +
  `DeployTimeline`. New `PLOI_WEBHOOK_SECRET` env var.
- **Spec change (approved by user 2026-11-20):** the M4 checklist's "validate
  Ploi's webhook signature" is not implementable — Ploi sends no HMAC / signing
  secret (verified against developers.ploi.io). M4 instead authenticates the
  callback with `PLOI_WEBHOOK_SECRET` embedded in the URL and treats the
  notification as a trigger that re-reads the authoritative deployment state.
  `deploy_events` added to PROJECT.md §4 and `PLOI_WEBHOOK_SECRET` to §8.
- **Also refactored:** `provision_site` now uses the shared
  `pollDeploymentStatus` / `recordDeployment`, so the initial provisioning
  deploy also appears on the timeline.
- **Commits:** `b6c0464` (schema + migration), `c118fd5` (PROJECT.md spec),
  `a0b4d8d` (deploy layer + `trigger_deploy`), `869d1c9` (webhook + UI),
  `6062ec5` (e2e), `7eec445` (README).
- **Verification (2026-11-20, mock adapter):** `tsc`, `eslint`, `prettier`,
  `pnpm test` (25), `pnpm build`, `pnpm test:e2e` (2 passed, incl. Redeploy →
  worker → status + timeline) all green. The webhook handler was driven directly
  against the local DB: a `started` notification set `deploying`; a `completed`
  notification reconciled the mock deployment → `deploy_completed` event +
  `live`; a repeated completion was deduped (idempotent).
- **Outstanding / follow-up:**
  - **Live Ploi webhook not exercised.** Pointing the site Notifications tab at
    OpsHub needs a real repo + a manual Ploi-panel step + a real deploy, which
    the mock adapter cannot cover. README documents the exact URL.
  - No unit test for the `trigger_deploy` handler (DB test harness still
    missing — same gap as `sync_servers` / `provision_site`).
  - `deploy_events.external_id` is globally unique (Ploi deployment ids are
    global); the mock reuses `mock-deploy-N` per process, which can collide
    across ad-hoc local runs only.

### 2026-11-20 — M4 recon: Ploi has no signed deploy-complete webhook (BLOCKER)
- **M4 has not been started.** This entry records a spec discrepancy found while
  verifying external API shapes before writing code (agent contract: never
  assume an API shape; stop and ask).
- **Verified against developers.ploi.io (2026-11-20):**
  - **There is no documented signed (HMAC) outbound “deploy-complete” webhook.**
    M4’s checklist says the route handler must “validate signature”; Ploi
    documents no signature/secret header on anything it sends to us.
  - What Ploi *does* send toward us:
    1. **Site `webhook_url`** (set on `POST /servers/{server}/sites`): a
       **one-shot** “site created/installed” POST — payload
       `{ message, server:{id,name}, site:{id,domain,ip,paths} }`. Explicitly no
       retry, and it fires on **site creation**, not on deploy completion.
    2. **Notification channels** (Slack/Discord/Teams/Google Chat/Rocket.Chat/
       Telegram/Pushover/Email/Mobile), configured **per site in the Ploi
       panel** (not via the API), with events `Deployment started` /
       `Deployment completed` / `Deployment failed`. A site can point the
       “webhook” notification_url at a custom URL; the marketing docs show a
       sample payload `{ "data": { "server_id", "site_id",
       "latest_deploy_log", "root_domain" } }` — **no signature**, and the
       success/failure signal is inside log text, not a clean status field.
  - The “Deploy webhook URL” (`ploi.io/webhooks/.../deploy?token=…`) is
    **inbound** (we POST to Ploi to trigger a deploy); it is not a callback.
- **Implication:** `POST /api/webhooks/ploi/deploy-complete` cannot be built to
  “validate Ploi’s webhook signature” as written. A decision is needed (see
  questions raised to the user) on the webhook auth model and/or whether M4’s
  real-time path is the per-site custom notification URL vs. polling.
- **Other findings:**
  - Ploi now documents **`GET /servers/{server}/sites/{site}/deployments`**
    (history, newest first, statuses `success|failed|scheduled|cancelled`,
    `meta` pagination; `?include_logs=true` adds `log_content`) and
    **Get deployment log**. Useful for M4’s timeline and to reconcile deploys
    without a webhook. (Current `PloiApi` only has `getDeployment`.)
  - The `deploy_events` table M4 requires is **not in PROJECT.md §4** — it exists
    only as the M4 checklist line. Adding it is a schema addition that needs a
    §4 proposal/approval.
- **Status:** M4 blocked pending a user decision; no code written.
- **Resolution (user, 2026-11-20):** confirmed the Notifications-tab model — a
  site can have custom webhook URLs for *deployment started* and *deployment
  finished*; Ploi POSTs plain JSON (`server_id`, `site_id`, `latest_deploy_log`,
  `root_domain`) with **no HMAC and no signing secret**. M4 will therefore be
  built against reality, not the “validate signature” wording: authenticate the
  endpoint with an OpsHub-owned secret embedded in the callback URL, and treat
  the webhook as a trigger that re-reads `GET .../deployments` for the
  authoritative status (the log text is not a reliable success/failure field).

### 2026-11-20 — M3 live acceptance (milestone complete)
- **Live Ploi verification done** (user-approved write, 2026-11-20): ran the
  wizard in-browser against `brutus-vps` (server 37668) with `USE_MOCKS=false`.
  Created client `Handmade Web` inline → project `OpsHub` / domain
  `opshub.handmadeweb.com.au` → web directory `/public` → **Confirm**.
  - Site **436829** `opshub.handmadeweb.com.au` created on Ploi; the project
    went `provisioning → deploying → live`; the project detail page then showed
    the live site id `436829` (from a live `GET /servers/37668/sites`).
  - Read-only re-check: 6 sites on the server — the 5 pre-existing ones
    unchanged, plus the new one (`active`, `has_repository: false`,
    `system_user: ploi`).
  - No repository was configured, so (as designed) no deploy was triggered.
- **Real-data bug found + fixed** (`b802c6f`): `ploiSiteSchema.deploy_script`
  was `boolean`, but the live API returns the deploy script **text**, so
  `listSites`/`getSite` failed schema validation against real data (M2 was only
  ever verified against mocks). Now `union([boolean, string])`, with a
  regression assertion in `client.test.ts`.
- **Live vs mock differences**: the account has no saved webserver templates
  (`GET /webserver-templates` → `[]`), so the wizard's template dropdown is
  empty (Ploi default); `GET /servers/monitored` returns only `brutus-vps`.
- **Cleanup owed (local dev DB only)**: leftover rows from earlier mock/e2e
  runs — servers `mock-web-01/02` and projects `Wizard …`/`E2E …`/`Verify …`.
  The live run also left real site `436829`, which cannot be deleted.
- M3 marked `[x]`; acceptance criteria met.

### 2026-11-20 — M3 Provisioning Wizard (built; verified)
- **Added**: Ploi write surface (`types.ts`/`client.ts`/`mock.ts`): `createSite`,
  `deploySite`, `getDeployment`, `listWebserverTemplates`, `listSystemUsers` +
  Zod schemas. `lib/jobs/errors.ts` (`JobAbortError` — terminal failures are
  not retried; runner updated). `lib/jobs/handlers/provision-site.ts`.
  `GET /api/jobs/{id}`. `app/actions/provision.ts` (`startProvisioning`) and two
  wizard reads in `app/actions/servers.ts`.
  `components/wizard/{provision-wizard,job-progress}.tsx`; `/projects/new` is
  now the wizard. `provisionWizardSchema` in `lib/validation.ts`.
  Client unit tests for the new write methods.
- **Decisions / deviations:**
  - The **job** creates the project row (PROJECT.md §6 step 1), so the action
    only validates + enqueues; `projectId` is generated in the action and
    carried on the payload so retries and polling agree on one row.
  - M3 reaches `live`/`failed` itself by polling the new **Get deployment**
    endpoint, so acceptance no longer depends on M4's webhook.
  - Deploy is attempted only when a repo URL was given. There is **no endpoint
    to attach a repository to a site**, so a freshly created site has none and
    Ploi answers `422`; that `422` is treated as a benign "no repository
    attached" outcome — the project is marked `live` and the job summary says
    so. Any other deploy error retries/fails normally.
  - Wizard step 3 fetches webserver templates (and, once a server is chosen, its
    system users) **live** via Server Actions, mirroring M2's live
    `listServerSites` dropdown; PROJECT.md §4 has no template-cache table.
  - `project_type` is left unset: Ploi's allowed values (laravel, nodejs,
    statamic, craft-cms, symfony, wordpress, octobercms, cakephp) do not fit
    Astro/Payload client sites.
- **Decision change (agent, 2026-11-20)**: the plain M1 create form is **kept**
  at `/projects/new?manual=1` (toggle link), not deleted, so projects that must
  not create a Ploi site stay possible and the M1 smoke test remains meaningful.
  The wizard is the default at `/projects/new`. This revises the earlier
  "retire the form" call.
- **Commits**: `2aae42c` (ploi writes), `cc0758f` (handler + `JobAbortError`),
  `77c11ac` (polling API + action), `8d361eb` (wizard UI).
- **Verification (2026-11-20, mock adapter)**: `tsc`, `eslint`, `prettier`,
  `pnpm test` (15), `pnpm build`, `pnpm test:e2e` (2 passed, incl. a
  wizard → worker → `live` run) all green. One-off worker runs confirmed the
  create+deploy path → `live`, and idempotency across 3 runs (exactly 1 site).
- **Outstanding**:
  - ~~Live Ploi acceptance~~ — **done** later the same day (site 436829);
    see the live acceptance entry above.
  - No unit test yet for the `provision_site` handler (needs a DB test harness;
    same gap as M2's `sync_servers` handler).
  - `provision_site` polls inside the handler, so one worker is blocked for up
    to ~5–15 min per run; acceptable for v1, revisit for throughput.
  - The local dev DB now contains extra `Verify …` / `E2E …` / `Wizard …` rows.

### 2026-11-20 — M3 prep: Ploi write-endpoint verification + spec corrections
- **Docs**: Ploi API docs are at **https://developers.ploi.io** (the
  `ploi.io/documentation/api` URL in PROJECT.md §5.1 404s). Updated the §5.1
  prose URL and the endpoint table (approved by user 2026-11-20).
- **Endpoint corrections (verified 2026-11-20 against developers.ploi.io):**
  - Trigger deploy is **`POST /servers/{server}/sites/{id}/deploy`**, *not*
    `POST /sites/{id}/deploy`. Returns `{ message, deployment_id }`; `422` when
    the site has no repo / is already deploying / is WordPress.
  - New **`GET /servers/{server}/sites/{site}/deployments/{deployment}`**
    (added upstream 2026-11-11) reports `deploying` → `success`/`failed`. Added
    to §5.1 — M3 uses it to drive `deploying → live`/`failed` itself.
  - Site creation is **`POST /servers/{server}/sites`** with required
    `root_domain` + `web_directory`; optional `project_type`, `system_user`,
    `webserver_template`, `webhook_url`, `tags`, `deployment_type`.
  - **`GET /webserver-templates`** (account-scoped) and
    **`GET /servers/{server}/system-users`** added to §5.1 for wizard step 3.
  - Rate limits are **60/120/240 req/min** (1–4 req/sec), not the 5 req/sec in
    the old note; §5.1 now says to stay within the account tier and honour
    `Retry-After` + `X-RateLimit-*`.
- **Open question resolved**: M3's acceptance (`→ live`) no longer depends on
  the M4 webhook — the deployment-poll path reaches `live`/`failed` inside M3;
  M4's webhook remains the real-time reconciliation path.
- **Decisions (user, 2026-11-20):** acceptance verification may **create the
  site on live Ploi** (§5.1/§6 authorise the two M3 writes); include the
  "Provision new server" checkbox (manual-Vultr message, §6 M3 step 3); the
  plain M1 create form at `/projects/new` was planned to be **retired** in
  favour of the wizard (agent's call) — later revised to keep it at
  `?manual=1`, see the entry above.
- **Scope note**: `project_type` options are `laravel`, `nodejs`, `statamic`,
  `craft-cms`, `symfony`, `wordpress`, `octobercms`, `cakephp` — none is
  Astro/Payload; the wizard will leave `project_type` unset (or `nodejs`) for
  provider-agnostic client sites. Flag if this needs to be narrower.
- **Status**: docs/spec updated only at the time (M3 code followed — see the entry above). Doc correction committed as `a581d49`.

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