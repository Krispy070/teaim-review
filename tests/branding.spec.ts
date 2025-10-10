import { test, expect } from '@playwright/test';

const NAVY_RGB = 'rgb(11, 15, 26)';
const SURFACE_RGB = 'rgb(18, 24, 38)';
const PRIMARY_RGB = 'rgb(255, 153, 0)';

async function getBodyBackground(page: import('@playwright/test').Page) {
  return page.evaluate(() => getComputedStyle(document.body).backgroundColor);
}

async function getHeaderBackground(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const header = document.querySelector('header');
    return header ? getComputedStyle(header as HTMLElement).backgroundColor : null;
  });
}

test.describe('TEAIM branding surfaces', () => {
  test('root route renders dark chrome', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(200);

    const bodyBg = await getBodyBackground(page);
    expect(bodyBg).toBe(NAVY_RGB);

    const headerBg = await getHeaderBackground(page);
    if (headerBg) {
      expect(headerBg).toBe(SURFACE_RGB);
    }
  });

  test('login page uses TEAIM colors', async ({ page }) => {
    await page.goto('/login');
    await page.waitForTimeout(200);

    const bodyBg = await getBodyBackground(page);
    expect(bodyBg).toBe(NAVY_RGB);

    const headerBg = await getHeaderBackground(page);
    if (headerBg) {
      expect(headerBg).toBe(SURFACE_RGB);
    }

    const cta = page.locator('.teaim-cta').first();
    await expect(cta).toBeVisible();
    const ctaBackground = await cta.evaluate((el) => getComputedStyle(el as HTMLElement).backgroundColor);
    expect(ctaBackground).toBe(PRIMARY_RGB);

    const ghost = page.locator('.teaim-cta-ghost').first();
    await expect(ghost).toBeVisible();
    const ghostBorder = await ghost.evaluate((el) => getComputedStyle(el as HTMLElement).borderTopColor);
    expect(ghostBorder).toBe(PRIMARY_RGB);
  });
});
