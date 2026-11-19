import { spawn, type ChildProcess } from "node:child_process";

import { expect, test } from "@playwright/test";

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "admin@opshub.local";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "admin1234";

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
  await page.getByRole("button", { name: "Next" }).click();

  // Step 2 — project details.
  await page.getByLabel("Project name").fill(projectName);
  await page.getByLabel("Domain").fill(domain);
  await page.getByRole("button", { name: "Next" }).click();

  // Step 3 — infrastructure.
  await page.locator("#ploiServerId").click();
  await page.getByRole("option", { name: /mock-web-01/ }).click();
  await page.getByRole("button", { name: "Next" }).click();

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
});
