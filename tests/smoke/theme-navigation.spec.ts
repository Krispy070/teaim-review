import { expect, test, type Page } from "@playwright/test";

async function stubApi(page: Page) {
  await page.route("**/api/**", async (route) => {
    try {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "{}",
      });
    } catch {
      await route.abort();
    }
  });
}

test.describe("TEAIM theme + navigation smoke", () => {
  test("theme toggle cycles dark → light → system", async ({ page }) => {
    await stubApi(page);
    await page.goto("/");

    const toggle = page.getByTestId("theme-toggle");
    await expect(toggle).toBeVisible();

    await toggle.click();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.dataset.theme))
      .toBe("dark");
    await expect
      .poll(() => page.evaluate(() => window.localStorage.getItem("teaim.theme")))
      .toBe("dark");

    await toggle.click();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.dataset.theme))
      .toBe("light");
    await expect
      .poll(() => page.evaluate(() => window.localStorage.getItem("teaim.theme")))
      .toBe("light");

    await toggle.click();
    await expect
      .poll(() => page.evaluate(() => window.localStorage.getItem("teaim.theme")))
      .toBe("system");
    const resolved = await page.evaluate(() => document.documentElement.dataset.theme);
    expect(["light", "dark"]).toContain(resolved);
  });

  test("public routes render header", async ({ page }) => {
    await stubApi(page);

    await page.goto("/");
    await expect(page.getByTestId("link-request-beta")).toBeVisible();
    await expect(page.getByTestId("theme-toggle")).toBeVisible();

    await page.goto("/login");
    await expect(page.getByTestId("input-email")).toBeVisible();
    await expect(page.getByTestId("button-magic-link")).toBeVisible();
  });

  test("dashboard exposes a single Actions link that routes to insights", async ({ page }) => {
    await stubApi(page);

    await page.goto("/dashboard");
    await page.waitForURL(/\/projects\/.+\/dashboard/);

    const actionsLinks = page.getByRole("link", { name: "Actions" });
    await expect(actionsLinks).toHaveCount(1);

    await actionsLinks.first().click();
    await page.waitForURL(/\/projects\/.+\/insights\/actions/);
    await expect(page.locator("body")).toContainText(/Action/i);
  });
});
