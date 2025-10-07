import { test, expect } from "@playwright/test";
import { mintDevToken, primeBrowser, gotoProject } from "./utils";

test.beforeEach(async ({ page, request }) => {
  const tok = await mintDevToken(request);
  await primeBrowser(page, tok);
});

test("Project Overview dashboard renders real tiles + recent sections", async ({ page }) => {
  await gotoProject(page, "/dashboard");

  await expect(page.getByRole("heading", { name: "Project Overview" })).toBeVisible();
  await expect(page.getByText("Documents")).toBeVisible();
  await expect(page.getByText("Storage")).toBeVisible();
  await expect(page.getByText("Actions")).toBeVisible();
  await expect(page.getByText("Tests")).toBeVisible();

  await expect(page.getByText("Program Timeline").first()).toHaveCount(0);

  await expect(page.getByText("Recent Documents")).toBeVisible();
  await expect(page.getByText("Latest Actions")).toBeVisible();
  await expect(page.getByText("Upcoming Timeline")).toBeVisible();
});
