import { API_URL } from './env';

export interface Reply<T = any> {
  status: number;
  body: T;
}

/** Plain HTTP call to the API (used to set up data fast and to check what the server allows). */
export async function call<T = any>(method: string, path: string, token?: string | null, body?: unknown): Promise<Reply<T>> {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await res.text();
  let parsed: unknown = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
  return { status: res.status, body: parsed as T };
}

/** Same as call() but throws a readable error unless the status is 2xx. */
export async function must<T = any>(method: string, path: string, token?: string | null, body?: unknown): Promise<T> {
  const r = await call<T>(method, path, token, body);
  if (r.status < 200 || r.status >= 300) {
    throw new Error(`${method} ${path} -> ${r.status} ${JSON.stringify(r.body)}`);
  }
  return r.body;
}

export const login = (email: string, password: string) =>
  must<{ token: string; user: { id: number; role: string; name: string; email: string } }>('POST', '/auth/login', null, { email, password });
