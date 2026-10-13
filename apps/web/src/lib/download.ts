/** Extracts the file name from a Content-Disposition header (RFC 6266, incl. filename*=UTF-8''…). */
export function fileNameFromContentDisposition(header: string | null, fallback: string): string {
  if (!header) return fallback;
  const star = /filename\*\s*=\s*(?:UTF-8|utf-8)''([^;]+)/.exec(header);
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1].trim().replace(/^"|"$/g, ''));
    } catch {
      /* fall through to plain filename */
    }
  }
  const plain = /filename\s*=\s*("?)([^";]+)\1/.exec(header);
  return plain?.[2]?.trim() || fallback;
}

/** Triggers a browser download for a Blob via a temporary object URL. */
export function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Reads a fetch Response as Blob and saves it under the server-provided (or fallback) file name. */
export async function downloadResponse(res: Response, fallbackName: string): Promise<string> {
  const name = fileNameFromContentDisposition(res.headers.get('Content-Disposition'), fallbackName);
  const blob = await res.blob();
  saveBlob(blob, name);
  return name;
}
