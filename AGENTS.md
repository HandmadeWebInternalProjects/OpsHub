# AGENTS.md — OpsHub

Ambient rules for every session, regardless of which agent is active.

## Project
Internal client operations platform. Next.js 15 (App Router) + TypeScript strict
+ PostgreSQL + Drizzle + Auth.js. Orchestrates Ploi-managed Vultr infrastructure
for client content-backend (Payload/Strapi) + Astro projects. See PROJECT.md for full spec.

## Source of truth
- **PROJECT.md** = the constitution. Scope, architecture, data model, integration
  contracts, non-goals. **Never edit without explicit approval.** If a spec change
  is needed, propose it and wait.
- **MILESTONES.md** = the working checklist. Read at session start, update as
  work completes, append blockers to the Session Log. **Always keep it accurate.**

## Build & test
- `pnpm dev`            — local dev server
- `pnpm build`          — production build
- `pnpm lint`           — ESLint + Prettier check
- `pnpm test`           — Vitest unit tests
- `pnpm test:e2e`       — Playwright smoke tests
- `pnpm db:generate`    — Drizzle migration from schema
- `pnpm db:migrate`     — apply migrations
- `pnpm db:seed`        — seed first admin user
- `pnpm worker`         — run the job worker (separate process)

## Code conventions
- TypeScript strict. **No `any`** in `lib/`, `app/api/`, `app/actions/`.
- Zod at every external boundary: webhook payloads, Ploi API responses,
  CMS API responses, form inputs.
- Server Actions return `{ ok: true, data } | { ok: false, error }`. Never throw
  to the client.
- All external API calls go through a typed wrapper in `lib/<service>/client.ts`.
- All job handlers must be idempotent. Dedupe on `external_id` or `job_id`.
- Every external integration has a mock adapter (`lib/<service>/mock.ts`),
  switched by `USE_MOCKS=true`.

## Security
- Never log tokens, passwords, or decrypted `integration_config` values.
  Use `redact()` from `lib/logger.ts`.
- Secrets live in `integration_config` (encrypted at rest) or env vars only.
  Never in code, never in client bundles, never in logs.

## Working with external APIs
- **Verify endpoint shapes against current docs before implementing.**
  Ploi: https://ploi.io/documentation/api
  Do not trust assumed signatures — fetch and confirm.
- If a docs shape differs from PROJECT.md, note it in MILESTONES.md Session Log
  and adjust the typed client accordingly.

## Scope discipline
- Do not build anything under "Non-goals" in PROJECT.md §1.
- Do not add dependencies beyond the stack in PROJECT.md §2 without asking.
- Work one milestone at a time. Do not start the next milestone until the
  current one's acceptance criteria are met and confirmed.