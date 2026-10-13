import { devices, expect, test, type Page } from '@playwright/test';
import { expectToast, extractAppLink, firstOrderableDate, login, navTo, uniqueSuffix, waitForMail } from '../helpers';

/**
 * End-to-end journey: a new bakery registers, sets everything up, a customer reserves on a phone,
 * the bakery processes and hands over the order, and another tenant cannot see it.
 * Steps share state, so they run serially in one worker.
 */
test.describe.configure({ mode: 'serial' });

const run = uniqueSuffix();
const owner = {
  firstName: 'Erika',
  lastName: 'Test',
  email: `owner+${run}@e2e.example`,
  password: `E2e-Passwort-${run}1`,
  bakery: `E2E Backstube ${run}`,
};
const customerEmail = `kunde+${run}@e2e.example`;
const products = { pretzel: `E2E Brezel ${run}`, croissant: `E2E Croissant ${run}`, draft: `E2E Entwurf ${run}` };

let ownerPage: Page;
let slug = '';
let pickupDate = '';
let reference = '';
let orderId = '';

test.afterAll(async () => {
  await ownerPage?.context().close();
});

test('1. owner registers, confirms the e-mail via the dev mailbox and logs in', async ({ browser, request }) => {
  const context = await browser.newContext();
  ownerPage = await context.newPage();
  const page = ownerPage;

  await page.goto('/registrieren');
  await page.locator('#firstName').fill(owner.firstName);
  await page.locator('#lastName').fill(owner.lastName);
  await page.locator('#email').fill(owner.email);
  await page.locator('#password').fill(owner.password);
  await page.locator('#bakeryName').fill(owner.bakery);
  await expect(page.getByText(/Ihre Bestellseite: .*\/b\/e2e-backstube-/)).toBeVisible();
  await page.locator('#acceptTerms').click();
  await page.screenshot({ path: 'screenshots/checkout-summary-390.png', fullPage: true });
  await page.getByRole('button', { name: 'Konto erstellen' }).click();
  await expect(page.getByRole('heading', { name: 'Bitte bestätigen Sie Ihre E-Mail-Adresse' })).toBeVisible();

  const mail = await waitForMail(request, owner.email, (m) => m.textBody.includes('/email-bestaetigen#') || m.htmlBody.includes('/email-bestaetigen#'));
  const link = extractAppLink(mail, '/email-bestaetigen');
  expect(link).toContain('#uid=');
  await page.goto(link);
  await expect(page.getByRole('heading', { name: 'E-Mail-Adresse bestätigt' })).toBeVisible();
  // Tokens must not linger in the address bar.
  expect(new URL(page.url()).hash).toBe('');

  await page.getByRole('link', { name: 'Zur Anmeldung' }).click();
  await page.locator('#email').fill(owner.email);
  await page.locator('#password').fill(owner.password);
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
  await page.waitForURL('**/admin');
  await expect(page.getByRole('heading', { name: `Guten Tag, ${owner.firstName}` })).toBeVisible();
  await expect(page.getByText('Erste Schritte')).toBeVisible();
});

test('2. owner creates a location and configures the pickup schedule', async () => {
  const page = ownerPage;
  await navTo(page, 'Standorte');
  await expect(page.getByText('Noch kein Standort angelegt.')).toBeVisible();
  await page.getByRole('button', { name: 'Neuer Standort' }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('#l-name').fill('Testfiliale Mitte');
  await dialog.locator('#l-street').fill('Teststraße 1');
  await dialog.locator('#l-zip').fill('40213');
  await dialog.locator('#l-city').fill('Düsseldorf');
  await dialog.getByRole('button', { name: 'Anlegen' }).click();
  await expectToast(page, 'Standort angelegt');
  await expect(page.getByRole('heading', { name: 'Testfiliale Mitte' })).toBeVisible();

  await page.getByRole('tab', { name: 'Abholzeiten' }).click();
  for (const day of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']) {
    await page.locator(`#s-${day}-maxOrdersPerSlot`).fill('8');
  }
  await page.getByRole('tabpanel').getByRole('button', { name: 'Speichern' }).click();
  await expectToast(page, 'Abholplan gespeichert.');
});

test('3. owner creates a category and products and publishes them', async () => {
  const page = ownerPage;
  await navTo(page, 'Produkte');
  await page.getByRole('button', { name: 'Kategorien verwalten' }).first().click();
  const categories = page.getByRole('dialog');
  await categories.locator('#new-category').fill('Laugengebäck');
  await categories.getByRole('button', { name: 'Hinzufügen' }).click();
  await expectToast(page, 'Kategorie gespeichert.');
  await expect(categories.locator('input[value="Laugengebäck"]')).toBeVisible();
  await page.keyboard.press('Escape');

  const createProduct = async (name: string, price: string) => {
    await page.getByRole('button', { name: 'Neues Produkt' }).first().click();
    const dialog = page.getByRole('dialog');
    await dialog.locator('#p-name').fill(name);
    await dialog.locator('#p-price').fill(price);
    await dialog.locator('#p-category').selectOption({ label: 'Laugengebäck' });
    await dialog.locator('#p-allergens').fill('Weizen (Gluten)');
    await dialog.locator('#p-default').fill('20');
    await dialog.getByRole('button', { name: 'Speichern' }).click();
    await expectToast(page, 'Produkt angelegt (Entwurf).');
    await expect(dialog).toBeHidden();
  };
  await createProduct(products.pretzel, '1,20');
  await createProduct(products.croissant, '2,10');
  await createProduct(products.draft, '3,00');

  for (const name of [products.pretzel, products.croissant]) {
    await page.getByRole('button', { name: `Veröffentlichen: ${name}` }).click();
    await expectToast(page, `„${name}“ ist veröffentlicht.`);
  }
  const draftRow = page.getByTestId('product-row').filter({ hasText: products.draft });
  await expect(draftRow.getByText('Entwurf', { exact: true })).toBeVisible();
});

test('4. owner publishes the order page and sets daily quantities for an orderable date', async ({ request }) => {
  const page = ownerPage;
  await navTo(page, 'Einstellungen');
  await page.getByRole('switch', { name: 'Bestellseite veröffentlichen' }).click();
  await page.getByRole('button', { name: 'Speichern' }).click();
  await expectToast(page, 'Einstellungen gespeichert.');
  const link = (await page.getByTestId('public-link').innerText()).trim();
  slug = link.split('/b/')[1]!;
  expect(slug).toMatch(/^e2e-backstube-/);

  ({ date: pickupDate } = await firstOrderableDate(request, slug));

  await navTo(page, 'Produktion');
  await page.locator('#production-date').fill(pickupDate);
  await expect(page.getByLabel(`Geplant: ${products.pretzel}`)).toBeVisible();
  await page.getByLabel(`Geplant: ${products.pretzel}`).fill('20');
  await page.getByLabel(`Geplant: ${products.croissant}`).fill('15');
  await page.getByLabel(`Geplant: ${products.draft}`).fill('10');
  await page.getByRole('button', { name: 'Mengen speichern' }).click();
  await expectToast(page, 'Tagesmengen gespeichert.');
  await expect(page.getByTestId('inventory-row').filter({ hasText: products.pretzel })).toContainText('20');
});

test('5+6. customer reserves on a phone and sees code, QR and the confirmation e-mail', async ({ browser, request }) => {
  const { defaultBrowserType: _ignored, ...iphone } = devices['iPhone 13'];
  const context = await browser.newContext({ ...iphone, locale: 'de-DE', timezoneId: 'Europe/Berlin' });
  const page = await context.newPage();

  await page.goto(`/b/${slug}?tag=${pickupDate}`);
  await expect(page.getByRole('heading', { name: owner.bakery })).toBeVisible();
  await expect(page.getByRole('heading', { name: products.pretzel })).toBeVisible();
  // Draft products are never shown publicly.
  await expect(page.getByRole('heading', { name: products.draft })).toHaveCount(0);

  await page.getByRole('button', { name: `${products.pretzel} in den Warenkorb legen` }).click();
  await page.getByRole('button', { name: `Menge von ${products.pretzel} erhöhen` }).click();
  await page.getByRole('button', { name: `${products.croissant} in den Warenkorb legen` }).click();
  const bar = page.getByTestId('basket-bar');
  await expect(bar).toContainText('3 Artikel');
  await expect(bar).toContainText('4,50');
  await bar.getByRole('link').click();

  await expect(page.getByRole('heading', { name: 'Warenkorb prüfen' })).toBeVisible();
  await page.getByRole('button', { name: 'Abholzeit wählen' }).click();
  await expect(page.getByRole('heading', { name: 'Abholzeit wählen' })).toBeVisible();
  await page.locator('label:has(input[name="slot"]:not([disabled]))').first().click();
  await page.screenshot({ path: 'screenshots/checkout-slots-390.png', fullPage: true });
  await page.getByRole('button', { name: 'Kontaktdaten' }).click();

  await page.locator('#firstName').fill('Karla');
  await page.locator('#lastName').fill('Kundin');
  await page.locator('#email').fill(customerEmail);
  await page.getByRole('button', { name: 'Übersicht & Bestätigen' }).click();

  await expect(page.getByText('Bezahlung bei Abholung – keine Online-Zahlung.')).toBeVisible();
  // Submitting without accepting the terms shows the validation message.
  await page.getByRole('button', { name: 'Bestellung bestätigen' }).click();
  await expect(page.getByText('Bitte bestätige die Bedingungen und Datenschutzhinweise.')).toBeVisible();
  await page.locator('#acceptTerms').click();
  await page.getByRole('button', { name: 'Bestellung bestätigen' }).click();

  await expect(page.getByRole('heading', { name: 'Reservierung erfolgreich' })).toBeVisible();
  reference = (await page.getByTestId('pickup-code').innerText()).trim();
  expect(reference).toMatch(/^BR-[2-9A-HJKMNP-Z]{6}$/);
  await expect(page.getByTestId('pickup-qr').locator('svg')).toBeVisible();
  expect(new URL(page.url()).pathname).toBe(`/bestellung/${reference}`);
  expect(new URL(page.url()).hash).toBe('');
  await expect(page.getByText('4,50').first()).toBeVisible();
  await page.screenshot({ path: 'screenshots/order-confirmation-390.png', fullPage: true });

  const mail = await waitForMail(request, customerEmail, (m) => m.textBody.includes(reference) || m.subject.includes(reference));
  expect(mail.textBody + mail.htmlBody).toContain(reference);

  // "Meine Bestellungen" keeps the order on this device.
  await page.goto('/meine-bestellungen');
  await expect(page.getByText(reference)).toBeVisible();
  await context.close();
});

test('7+8. owner sees the order and marks it as "In Vorbereitung"', async () => {
  const page = ownerPage;
  await navTo(page, 'Bestellungen');
  await page.locator('#orders-from').fill(pickupDate);
  const row = page.getByTestId('order-row').filter({ hasText: reference });
  await expect(row).toBeVisible();
  await expect(row).toContainText('Karla Kundin');
  await expect(row).toContainText('Bestätigt');

  await row.getByRole('link', { name: reference, exact: true }).click();
  await page.waitForURL(/\/admin\/bestellungen\/[0-9a-f-]+$/);
  orderId = page.url().split('/').pop()!;
  await expect(page.getByTestId('order-reference')).toHaveText(reference);
  await page.getByRole('button', { name: 'Bestellung vorbereiten' }).click();
  await expectToast(page, 'Status geändert: In Vorbereitung');
  await expect(page.locator('main [data-status="Preparing"]').first()).toBeVisible();
});

test('9. staff collects the order at the counter; a second attempt shows "bereits abgeholt"', async () => {
  const page = ownerPage;
  await navTo(page, 'Abholung');
  const code = reference.replace('BR-', '').toLowerCase();
  await page.locator('#pickup-code').fill(code);
  await page.getByRole('button', { name: 'Suchen' }).click();
  const result = page.getByTestId('pickup-result');
  await expect(result).toContainText('Karla Kundin');
  await expect(result).toContainText(products.pretzel);
  await page.screenshot({ path: 'screenshots/admin-pickup-result-1280.png', fullPage: true });

  // Report a pickup problem (recorded in the history without a status change).
  await result.getByRole('button', { name: 'Problem melden' }).click();
  await page.getByRole('dialog').locator('#problem-note').fill('Kundin wünscht eine Tüte extra');
  await page.getByRole('dialog').getByRole('button', { name: 'Problem melden' }).click();
  await expectToast(page, 'Problem wurde gemeldet.');

  await result.getByRole('button', { name: 'Als abgeholt markieren' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Als abgeholt markieren' }).click();
  await expectToast(page, `Abholung erfasst: ${reference}`);
  await expect(page.locator('#pickup-code')).toBeFocused();

  await page.locator('#pickup-code').fill(reference);
  await page.getByRole('button', { name: 'Suchen' }).click();
  await expect(result).toContainText('Diese Bestellung wurde bereits abgeholt.');
  await expect(result.getByRole('button', { name: 'Als abgeholt markieren' })).toHaveCount(0);

  // The history shows the problem note.
  await result.getByRole('link', { name: 'Details öffnen' }).click();
  await expect(page.getByText('Abholproblem: Kundin wünscht eine Tüte extra')).toBeVisible();
  await expect(page.locator('main [data-status="Collected"]').first()).toBeVisible();
});

test('10. another tenant cannot access the order', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await login(page, 'inhaber@donut-atelier.example');
  await navTo(page, 'Abholung');
  await page.locator('#pickup-code').fill(reference);
  await page.getByRole('button', { name: 'Suchen' }).click();
  await expect(page.getByText('Kein Auftrag mit diesem Abholcode gefunden.')).toBeVisible();

  await page.goto(`/admin/bestellungen/${orderId}`);
  await expect(page.getByText('Bestellung nicht gefunden')).toBeVisible();
  await expect(page.getByText('Karla Kundin')).toHaveCount(0);
  await context.close();
});
