/**
 * Development logging. Plain console.log with a tag, so the terminal shows WHICH code is running and WITH WHAT data.
 *   [API] POST /api/assignments  -> submitAssignment   (every controller call, see asyncHandler)
 *   [certificate] ...                                  (business steps inside services/controllers)
 * Anything that looks like a secret (password, token, hash) is hidden, and file bodies only show their size.
 */
const SECRET = /password|token|secret|hash/i;

export function redact(value: unknown, depth = 0): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Buffer.isBuffer(value)) return `<${value.length} bytes>`;
  if (depth > 3) return '[…]';
  if (Array.isArray(value)) return value.slice(0, 10).map((v) => redact(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = SECRET.test(k) ? '[hidden]' : redact(v, depth + 1);
  return out;
}

export function log(tag: string, message: string, data?: unknown): void {
  if (data === undefined) console.log(`[${tag}] ${message}`);
  else console.log(`[${tag}] ${message}`, redact(data));
}
