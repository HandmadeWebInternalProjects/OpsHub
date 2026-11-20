import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "admin@opshub.local";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "admin1234";
const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

/**
 * The M6 reporter signs its POST with LIGHTHOUSE_WEBHOOK_SECRET. The web server
 * (next start) loads it from .env, so mirror process.env first then .env.
 */
function lighthouseSecret(): string {
  if (process.env.LIGHTHOUSE_WEBHOOK_SECRET) {
    return process.env.LIGHTHOUSE_WEBHOOK_SECRET;
  }
  try {
    const contents = readFileSync(resolve(process.cwd(), ".env"), "utf8");
    const match = contents.match(
      /^\s*LIGHTHOUSE_WEBHOOK_SECRET\s*=\s*(.*)\s*$/m,
    );
    if (match?.[1]) return match[1];
  } catch {
    // No .env file — fall through to the default.
  }
  return "e2e-lighthouse-secret";
}

/**
 * The M3 provisioning wizard enqueues a job; the worker (mock Ploi) does the
 * actual work. Start one worker for this file and stop it afterwards.
 */
let worker: ChildProcess | undefined;

test.beforeAll(() => {
  worker = spawn("pnpm", ["worker"], {
    env: { ...process.env, USE_MOCKS: "true" },
    stdio: "ignore",
  });
});

test.afterAll(() => {
  worker?.kill("SIGTERM");
});

test("login, create a client, then a linked project", async ({ page }) => {
  const suffix = Date.now().toString(36);
  const clientName = `E2E Client ${suffix}`;
  const projectName = `E2E Project ${suffix}`;
  const domain = `e2e-${suffix}.example`;

  // Log in with the seeded admin.
  await page.goto("/login");
  await page.getByLabel("Email").fill(ADMIN_EMAIL);
  await page.getByLabel("Password").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

  // Create a client.
  await page.goto("/clients/new");
  await page.getByLabel("Name").fill(clientName);
  await page.getByLabel("Contact email").fill("e2e@opshub.local");
  await page.getByRole("button", { name: "Create client" }).click();
  await expect(page).toHaveURL(/\/clients\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: clientName })).toBeVisible();

  // Create a project linked to that client via the plain (non-provisioning) form.
  await page.getByRole("link", { name: "New project" }).click();
  await expect(page).toHaveURL(/\/projects\/new/);
  await page.getByRole("link", { name: "Create without provisioning" }).click();
  await expect(page).toHaveURL(/manual=1/);
  await page.getByLabel("Name").fill(projectName);
  await page.getByLabel("Domain").fill(domain);
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: projectName })).toBeVisible();

  // The project list shows the project and its client link.
  await page.goto("/projects");
  await expect(page.getByRole("link", { name: projectName })).toBeVisible();
  await expect(
    page.getByRole("row", { name: new RegExp(projectName) }),
  ).toContainText(clientName);
});

test("provisioning wizard creates a project through the worker", async ({
  page,
}) => {
  const suffix = Date.now().toString(36);
  const clientName = `Wizard Client ${suffix}`;
  const projectName = `Wizard Project ${suffix}`;
  const domain = `wizard-${suffix}.example`;

  // Log in.
  await page.goto("/login");
  await page.getByLabel("Email").fill(ADMIN_EMAIL);
  await page.getByLabel("Password").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  // Make sure servers are cached (the worker syncs on start; nudge if needed).
  await page.goto("/servers");
  if (!(await page.getByText("mock-web-01").first().isVisible())) {
    await page.getByRole("button", { name: "Sync now" }).click();
  }
  await expect(page.getByText("mock-web-01").first()).toBeVisible({
    timeout: 30_000,
  });

  // Step 1 — create the client inline.
  await page.goto("/projects/new");
  const newClientToggle = page.getByLabel("Create a new client instead");
  if (await newClientToggle.isVisible()) {
    await newClientToggle.check();
  }
  await page.getByLabel("New client name").fill(clientName);
  await page.getByRole("button", { name: "Create client" }).click();
  await expect(page.getByText(clientName).first()).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();

  // Step 2 — project details.
  await page.getByLabel("Project name").fill(projectName);
  await page.getByLabel("Domain").fill(domain);
  await page.getByRole("button", { name: "Next", exact: true }).click();

  // Step 3 — infrastructure.
  await page.locator("#ploiServerId").click();
  await page.getByRole("option", { name: /mock-web-01/ }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();

  // Step 4 — review and confirm.
  await expect(page.getByText(domain)).toBeVisible();
  await page.getByRole("button", { name: "Confirm & provision" }).click();

  // The worker provisions via the mock Ploi adapter.
  await expect(page.getByText("Provisioning complete")).toBeVisible({
    timeout: 60_000,
  });
  await page.getByRole("link", { name: "Open project" }).click();

  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: projectName })).toBeVisible();
  await expect(page.getByText("Live", { exact: true })).toBeVisible();

  // Redeploy (M4): queue a trigger_deploy job and watch the worker finish it.
  await page.getByRole("button", { name: "Redeploy" }).click();
  await expect(page.getByText("Deployment succeeded.")).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByText("Deployment completed")).toBeVisible();
});

test("dashboard shows fleet vitals and project health", async ({ page }) => {
  // Log in.
  await page.goto("/login");
  await page.getByLabel("Email").fill(ADMIN_EMAIL);
  await page.getByLabel("Password").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  // Fleet summary.
  await expect(page.getByText("Projects live")).toBeVisible();
  await expect(page.getByText("Projects failing")).toBeVisible();

  // Server cards: the worker's sync_server_metrics job writes the mock
  // snapshots, so a 7-day sparkline appears for each metric.
  await expect(page.getByText("mock-web-01").first()).toBeVisible({
    timeout: 30_000,
  });
  await expect(
    page.locator('svg[aria-label*="over the last 7 days"]').first(),
  ).toBeVisible({ timeout: 30_000 });

  // Project health table.
  await expect(
    page.getByRole("heading", { name: "Project health" }),
  ).toBeVisible();
});

test("lighthouse reporter populates the page score chart", async ({ page }) => {
  const suffix = Date.now().toString(36);
  const clientName = `Lighthouse Client ${suffix}`;
  const projectName = `Lighthouse Project ${suffix}`;
  const domain = `lh-${suffix}.example`;

  // Log in.
  await page.goto("/login");
  await page.getByLabel("Email").fill(ADMIN_EMAIL);
  await page.getByLabel("Password").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  // A client + a plain project (M6 needs no Ploi provisioning).
  await page.goto("/clients/new");
  await page.getByLabel("Name").fill(clientName);
  await page.getByRole("button", { name: "Create client" }).click();
  await expect(page).toHaveURL(/\/clients\/[0-9a-f-]{36}$/);
  await page.getByRole("link", { name: "New project" }).click();
  await page.getByRole("link", { name: "Create without provisioning" }).click();
  await page.getByLabel("Name").fill(projectName);
  await page.getByLabel("Domain").fill(domain);
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/);
  const projectId = page.url().split("/").pop() as string;

  // Run the reference client (M6) against a fixture Lighthouse result.
  const result = spawnSync(
    process.execPath,
    ["scripts/lighthouse-reporter.mjs", "--lhr", "e2e/fixtures/lhr-test.json"],
    {
      env: {
        ...process.env,
        OPSHUB_URL: BASE_URL,
        OPSHUB_PROJECT_ID: projectId,
        OPSHUB_EXTERNAL_ID: `e2e-${suffix}`,
        LIGHTHOUSE_WEBHOOK_SECRET: lighthouseSecret(),
      },
      encoding: "utf8",
    },
  );
  expect(result.status, result.stderr || result.stdout).toBe(0);

  // Reload: the project detail page now renders the 30-day score chart.
  await page.reload();
  await expect(page.getByText("Page scores", { exact: true })).toBeVisible();
  await expect(page.getByText(/performance 92/)).toBeVisible();
  await expect(
    page.locator(
      '[role="img"][aria-label="Page score trend over the last 30 days"]',
    ),
  ).toBeVisible();
});

test("cms audit sync surfaces a login failure", async ({ page }) => {
  const suffix = Date.now().toString(36);
  const clientName = `Audit Client ${suffix}`;
  const projectName = `Audit Project ${suffix}`;
  const domain = `audit-${suffix}.example`;

  // Log in.
  await page.goto("/login");
  await page.getByLabel("Email").fill(ADMIN_EMAIL);
  await page.getByLabel("Password").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  // Client + a plain project with a CMS URL (the audit source).
  await page.goto("/clients/new");
  await page.getByLabel("Name").fill(clientName);
  await page.getByRole("button", { name: "Create client" }).click();
  await expect(page).toHaveURL(/\/clients\/[0-9a-f-]{36}$/);
  await page.getByRole("link", { name: "New project" }).click();
  await page.getByRole("link", { name: "Create without provisioning" }).click();
  await page.getByLabel("Name").fill(projectName);
  await page.getByLabel("Domain").fill(domain);
  await page.getByLabel("CMS URL").fill("https://cms.example.com");
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/);
  const projectId = page.url().split("/").pop() as string;

  // Configure the project's audit token on the project's Integrations tab.
  await page.goto(`/projects/${projectId}/integrations`);
  await page.getByLabel(/audit token/).fill("audit-token-e2e");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Token saved.")).toBeVisible();

  // Queue the pull from Settings; the worker (mock CMS) writes the events.
  await page.goto("/settings");
  await page.getByRole("button", { name: "Sync audit logs now" }).click();

  // The worker writes asynchronously; reload until the failure appears.
  await page.goto(`/projects/${projectId}`);
  await expect(async () => {
    await page.reload();
    await expect(page.getByText("Login failed")).toBeVisible({
      timeout: 2_000,
    });
  }).toPass({ timeout: 60_000, intervals: [2_000, 5_000] });
  await expect(page.getByText("Failed admin login")).toBeVisible();
});

test("an alert rule fires and can be acknowledged", async ({ page }) => {
  const suffix = Date.now().toString(36);
  const clientName = `Alert Client ${suffix}`;
  const projectName = `Alert Project ${suffix}`;
  const domain = `alert-${suffix}.example`;

  // Log in.
  await page.goto("/login");
  await page.getByLabel("Email").fill(ADMIN_EMAIL);
  await page.getByLabel("Password").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  // Client + a plain project with a CMS URL (the audit source).
  await page.goto("/clients/new");
  await page.getByLabel("Name").fill(clientName);
  await page.getByRole("button", { name: "Create client" }).click();
  await expect(page).toHaveURL(/\/clients\/[0-9a-f-]{36}$/);
  await page.getByRole("link", { name: "New project" }).click();
  await page.getByRole("link", { name: "Create without provisioning" }).click();
  await page.getByLabel("Name").fill(projectName);
  await page.getByLabel("Domain").fill(domain);
  await page.getByLabel("CMS URL").fill("https://cms.example.com");
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/);
  const projectId = page.url().split("/").pop() as string;

  // Configure the audit token on the project's Integrations tab.
  await page.goto(`/projects/${projectId}/integrations`);
  await page.getByLabel(/audit token/).fill("audit-token-e2e");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Token saved.")).toBeVisible();

  // Configure an alert rule: repeated failed logins for this project.
  await page.goto("/alerts/rules");
  await page.locator("#ruleType").click();
  await page.getByRole("option", { name: "Failed logins (1h)" }).click();
  await page.locator("#ruleProject").click();
  await page.getByRole("option", { name: projectName }).click();
  await page.locator("#threshold").fill("0");
  await page.getByRole("button", { name: "Create rule" }).click();
  await expect(page.getByText("Rule created.")).toBeVisible();

  // Queue the audit pull from Settings; the worker (mock CMS) writes a login
  // failure and the rule fires.
  await page.goto("/settings");
  await page.getByRole("button", { name: "Sync audit logs now" }).click();

  const alert = page
    .locator("[data-alert-id]")
    .filter({ hasText: projectName })
    .first();
  await expect(async () => {
    await page.goto("/alerts");
    await expect(alert).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 60_000, intervals: [2_000, 5_000] });

  await expect(alert.getByText("Open")).toBeVisible();
  await expect(alert.getByText(/Delivered/)).toBeVisible();

  // Acknowledge it; the status flips and the button disappears.
  await alert.getByRole("button", { name: "Acknowledge" }).click();
  await expect(alert.getByText("Acknowledged", { exact: true })).toBeVisible();
});
