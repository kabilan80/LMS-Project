/**
 * Development logging for the browser console: which page / hook / request is running and with what data.
 *   [API →] / [API ←]   every request and response (services/api.ts)
 *   [useApi]            which service a page called, with its arguments and result (hooks/useApi.ts)
 *   [Page]              steps inside pages (clicks, form submits)
 * Secrets (password, token) are hidden and File objects only show their name and size.
 */
const SECRET = /password|token|secret|hash/i;

function clean(value: unknown, depth = 0): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (typeof File !== 'undefined' && value instanceof File) return `<File ${value.name}, ${value.size} bytes>`;
  if (typeof Blob !== 'undefined' && value instanceof Blob) return `<Blob ${value.size} bytes>`;
  if (depth > 3) return '[…]';
  if (Array.isArray(value)) return value.slice(0, 10).map((v) => clean(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = SECRET.test(k) ? '[hidden]' : clean(v, depth + 1);
  return out;
}

export function log(tag: string, message: string, data?: unknown): void {
  if (data === undefined) console.log(`[${tag}] ${message}`);
  else console.log(`[${tag}] ${message}`, clean(data));
}
