import { expect, type APIRequestContext, type Page } from '@playwright/test';

/** The API is called directly (not through the Vite proxy) for setup/verification helpers. */
export const API = process.env.E2E_API_URL ?? 'http://localhost:5280';
export const DEMO_PASSWORD = 'BackReserve-Demo-2026';

export interface MailMessage {
  to: string;
  subject: string;
  textBody: string;
  htmlBody: string;
  category: string;
  sentAt: string;
}

export const uniqueSuffix = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Polls the development mailbox (GET /api/v1/dev/mailbox) until a message matches. */
export async function waitForMail(request: APIRequestContext, to: string, match: (m: MailMessage) => boolean, timeoutMs = 30_000): Promise<MailMessage> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await request.get(`${API}/api/v1/dev/mailbox`, { params: { to } });
    expect(res.ok(), 'dev mailbox must be enabled (Development environment)').toBeTruthy();
    const messages = (await res.json()) as MailMessage[];
    const found = messages.find(match);
    if (found) return found;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`No matching e-mail for ${to} within ${timeoutMs} ms`);
}

/** Extracts a link with the given path from a mail body and returns path + fragment (host independent). */
export function extractAppLink(mail: MailMessage, path: string): string {
  const body = `${mail.textBody}\n${mail.htmlBody.replace(/&amp;/g, '&')}`;
  const match = body.match(new RegExp(`https?://[^\\s"'<>]+${path.replace('/', '\\/')}[^\\s"'<>]*`));
  if (!match) throw new Error(`Link ${path} not found in mail "${mail.subject}"`);
  const url = new URL(match[0]);
  return `${url.pathname}${url.search}${url.hash}`;
}

/** First orderable pickup date of a published bakery (from the public availability endpoint). */
export async function firstOrderableDate(request: APIRequestContext, slug: string): Promise<{ date: string; locationId: string }> {
  const bakery = await (await request.get(`${API}/api/v1/public/bakeries/${slug}`)).json();
  const locationId = bakery.locations[0].id as string;
  const dates = (await (await request.get(`${API}/api/v1/public/bakeries/${slug}/availability`, { params: { locationId } })).json()) as {
    date: string;
    isOrderable: boolean;
  }[];
  const first = dates.find((d) => d.isOrderable);
  if (!first) throw new Error(`No orderable date for ${slug}`);
  return { date: first.date, locationId };
}

/** Logs in through the UI and waits for the dashboard (or platform) page. */
export async function login(page: Page, email: string, password = DEMO_PASSWORD) {
  await page.goto('/login');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
  await page.waitForURL(/\/(admin|platform)/);
}

/** Client-side navigation through the sidebar (avoids a full reload and thus an extra token refresh). */
export async function navTo(page: Page, label: string) {
  await page.getByRole('navigation', { name: 'Hauptnavigation' }).getByRole('link', { name: label, exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
}

export async function expectToast(page: Page, text: string | RegExp) {
  await expect(page.locator('[data-sonner-toast]').filter({ hasText: text }).first()).toBeVisible();
}
