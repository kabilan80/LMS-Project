import axios, { isAxiosError } from 'axios';
import type { ApiError } from '@lms/shared';
import { useAuthStore } from '../store/authStore';
import { log } from '../utils/log';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api',
});

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  log('API →', `${config.method?.toUpperCase()} ${config.url}`, { params: config.params, body: config.data });
  return config;
});

api.interceptors.response.use(
  (res) => {
    log('API ←', `${res.status} ${res.config.method?.toUpperCase()} ${res.config.url}`, res.data);
    return res;
  },
  (error: unknown) => {
    if (isAxiosError(error)) log('API ✗', `${error.response?.status ?? 'no response'} ${error.config?.method?.toUpperCase()} ${error.config?.url}`, error.response?.data);
    // An expired or revoked session anywhere (except the login form itself) signs the user out.
    if (
      isAxiosError(error) &&
      error.response?.status === 401 &&
      !error.config?.url?.includes('/auth/login')
    ) {
      useAuthStore.getState().logout();
    }
    return Promise.reject(error);
  },
);

export function getErrorMessage(error: unknown): string {
  if (isAxiosError<ApiError>(error)) {
    if (!error.response) return 'Cannot reach the server. Check your connection and try again.';
    return error.response.data?.error?.message ?? 'Something went wrong';
  }
  return 'Something went wrong';
}

/** Field-level messages from a 422 response, keyed by field name. */
export function getFieldErrors(error: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (isAxiosError<ApiError>(error)) {
    const details = error.response?.data?.error?.details ?? {};
    for (const [k, v] of Object.entries(details)) if (v[0]) out[k] = v[0];
  }
  return out;
}
