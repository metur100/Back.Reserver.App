import { expect, test } from '@playwright/test';

const DEMO = '/b/baeckerei-rheinblick';

test.describe('public demo bakery page', () => {
  test('shows products with availability states and non-orderable days', async ({ page }) => {
    await page.goto(DEMO);
    await expect(page.getByRole('heading', { level: 1, name: 'Bäckerei Rheinblick' })).toBeVisible();

    const cards = page.getByTestId('product-card');
    await expect(cards.first()).toBeVisible();
    expect(await cards.count()).toBeGreaterThan(0);
    // Every card states its availability in text (never colour alone).
    for (const card of await cards.all()) {
      await expect(card.getByText(/^(Verfügbar|Nur noch \d+|Ausverkauft)$/).filter({ visible: true }).first()).toBeVisible();
    }

    // Days that can't be ordered are disabled and say why (e.g. today after the cutoff, Sundays closed).
    const disabledChip = page.locator('button[data-date]:disabled').first();
    await expect(disabledChip).toBeVisible();
    await expect(disabledChip).toContainText(/Bestellschluss vorbei|Geschlossen|Noch nicht buchbar|Keine Vorbestellung/);

    // Sold-out products (where applicable) can't be added.
    const soldOut = cards.filter({ hasText: 'Ausverkauft' });
    for (const card of await soldOut.all()) {
      await expect(card.getByRole('button', { name: /Ausverkauft/ })).toBeDisabled();
    }
  });

  test('never lists draft products', async ({ page, request }) => {
    await page.goto(DEMO);
    await expect(page.getByTestId('product-card').first()).toBeVisible();
    await expect(page.getByText('Kürbis-Cheesecake (Entwurf)')).toHaveCount(0);
    // Double-check against the API response for the selected day.
    const bakery = await (await request.get('/api/v1/public/bakeries/baeckerei-rheinblick')).json();
    const locationId = bakery.locations[0].id;
    const days = await (await request.get(`/api/v1/public/bakeries/baeckerei-rheinblick/availability?locationId=${locationId}`)).json();
    const date = days.find((d: { isOrderable: boolean }) => d.isOrderable).date;
    const list = await (await request.get(`/api/v1/public/bakeries/baeckerei-rheinblick/products?locationId=${locationId}&date=${date}`)).json();
    expect(list.products.map((p: { name: string }) => p.name)).not.toContain('Kürbis-Cheesecake (Entwurf)');
  });

  test('basket shows count and total and persists across reloads', async ({ page }) => {
    await page.goto(DEMO);
    const first = page.getByTestId('product-card').filter({ has: page.getByRole('button', { name: /in den Warenkorb legen/ }) }).first();
    await first.getByRole('button', { name: /in den Warenkorb legen/ }).click();
    const isMobile = (page.viewportSize()?.width ?? 1280) < 1024;
    const basket = isMobile ? page.getByTestId('basket-bar') : page.getByTestId('basket-panel');
    await expect(basket).toContainText('1 Artikel');
    await page.reload();
    await expect(basket).toContainText('1 Artikel');
    if (isMobile) {
      await basket.getByRole('link').click();
      await expect(page.getByRole('heading', { name: 'Warenkorb prüfen' })).toBeVisible();
    }
  });

  test('unknown bakery and invalid order link show friendly not-found pages', async ({ page }) => {
    await page.goto('/b/gibt-es-nicht-123');
    await expect(page.getByText('Bäckerei nicht gefunden')).toBeVisible();
    await page.goto('/bestellung/BR-ZZZZZZ#t=falsch');
    await expect(page.getByText('Bestellung nicht gefunden')).toBeVisible();
  });
});
