import { expect, test } from "@playwright/test";

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "admin@opshub.local";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "admin1234";

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

  // Create a project linked to that client (client is preselected).
  await page.getByRole("link", { name: "New project" }).click();
  await expect(page).toHaveURL(/\/projects\/new/);
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
