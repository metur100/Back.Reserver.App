import { expect, test, type Page } from '@playwright/test';
import { login, navTo } from '../helpers';

/** Visual sanity check: full-page screenshots of the main screens at 390 px and 1440 px (saved to ./screenshots). */
const widths = [390, 1440];
const dir = 'screenshots';

async function shoot(page: Page, name: string) {
  await page.waitForLoadState('networkidle');
  await expect(page.locator('[aria-label="Wird geladen …"]')).toHaveCount(0);
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${dir}/${name}-${width}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}

test('public screens', async ({ page }) => {
  await page.goto('/');
  await shoot(page, 'landing');
  await page.goto('/b/baeckerei-rheinblick');
  await expect(page.getByTestId('product-card').first()).toBeVisible();
  await shoot(page, 'bakery');
  await page.goto('/login');
  await shoot(page, 'login');
  await page.goto('/registrieren');
  await shoot(page, 'register');
});

test('admin screens (demo owner)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page, 'inhaber@rheinblick.example');
  await expect(page.getByText('Reservierungen heute')).toBeVisible();
  await shoot(page, 'admin-dashboard');
  for (const [label, name] of [
    ['Bestellungen', 'admin-orders'],
    ['Abholung', 'admin-pickup'],
    ['Produkte', 'admin-products'],
    ['Produktion', 'admin-production'],
    ['Standorte', 'admin-locations'],
    ['Mitarbeiter', 'admin-staff'],
    ['Auswertungen', 'admin-reports'],
    ['Einstellungen', 'admin-settings'],
  ] as const) {
    await navTo(page, label);
    await shoot(page, name);
  }
});
