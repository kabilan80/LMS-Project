import type { AuthUser, LoginResponse } from '@lms/shared';
import { api } from './api';

export const loginUser = async (email: string, password: string) =>
  (await api.post<LoginResponse>('/auth/login', { email, password })).data;

export const registerUser = async (input: {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
  acceptTerms: boolean;
}) => (await api.post<LoginResponse>('/auth/register', input)).data;

export const getMe = async () => (await api.get<{ user: AuthUser }>('/auth/me')).data.user;

export const changePassword = async (currentPassword: string, newPassword: string) =>
  (await api.post<LoginResponse>('/auth/change-password', { currentPassword, newPassword })).data;
