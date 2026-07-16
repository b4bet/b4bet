/** Lightweight HTML sanitizer for admin-provided custom payment HTML.
 *  Removes script tags/blocks, inline event handlers, and dangerous URL
 *  schemes (javascript:, data:text/html, etc.) while preserving benign
 *  formatting, images, links and styles.
 */
const DANGEROUS_SCHEMES = /^(javascript|vbscript|data:text\/html|data:application\/javascript|data:image\/svg\+xml)/i;

function isSafeUrl(url: string): boolean {
  return !DANGEROUS_SCHEMES.test(url.trim());
}

export function sanitizeHtml(html: string): string {
  if (!html) return '';

  // 1. Remove script blocks and stray script tags.
  let cleaned = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<script\b[^>]*>.*?<\/script>/gi, '')
    .replace(/<\/?script\b[^>]*>/gi, '');

  // 2. Remove inline event handlers (onerror, onclick, etc.).
  cleaned = cleaned.replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');

  // 3. Neutralize dangerous URL schemes in href/src/action attributes.
  cleaned = cleaned.replace(
    /\s(href|src|action|formaction)\s*=\s*(?:"([^"]*?)"|'([^']*?)'|([^\s>]+))/gi,
    (match, attr, dq, sq, unq) => {
      const raw = dq ?? sq ?? unq ?? '';
      return isSafeUrl(raw) ? match : ` ${attr}="javascript:void(0)"`;
    },
  );

  return cleaned;
}
