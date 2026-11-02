/**
 * Public legal and help pages on the BackReserve website (repository metur100/Back.Reserver.Landing).
 * Linked from the start page, the checkout, the team sign-in and the account screen
 * (App Store Guideline 5.1.1(i): the privacy policy must be reachable inside the app).
 */
export const LEGAL_BASE_URL = 'https://reserver.gentlegroup.de';

export const legalUrls = {
  privacy: `${LEGAL_BASE_URL}/datenschutz.html`,
  imprint: `${LEGAL_BASE_URL}/impressum.html`,
  support: `${LEGAL_BASE_URL}/support.html`,
  deleteAccount: `${LEGAL_BASE_URL}/konto-loeschen.html`,
} as const;

export type LegalLinkKey = keyof typeof legalUrls;
