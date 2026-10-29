import { rewriteFragmentToken } from '@/utils/links';

/**
 * Rewrites incoming deep links / universal links before routing.
 * Confirmation e-mails link to https://reserver-app.gentlegroup.de/bestellung/{ref}#t={token}; fragments never reach the
 * router, so `#t=` is moved into the `?t=` query parameter read by the order screen.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    return rewriteFragmentToken(path);
  } catch {
    return path;
  }
}
