/**
 * Reads parameters from the URL fragment (e.g. "#uid=…&token=…") and immediately removes the fragment from the
 * address bar, so capability tokens don't linger in history, screenshots or bookmarks.
 */
export function consumeHashParams(): URLSearchParams {
  const raw = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash;
  const params = new URLSearchParams(raw);
  if (raw) {
    window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
  }
  return params;
}
