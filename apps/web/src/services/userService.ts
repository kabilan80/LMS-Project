import type {
  CreateUserInput,
  CreatedUser,
  InstructorRow,
  Paginated,
  PermissionMatrix,
  UpdateUserInput,
  UserRow,
} from '@lms/shared';
import { api } from './api';

export interface ListUsersParams {
  page?: number;
  pageSize?: number;
  search?: string | undefined;
  role?: 'ADMIN' | 'INSTRUCTOR' | 'STUDENT' | undefined;
  active?: 'true' | 'false' | undefined;
  unassigned?: 'true' | 'false' | undefined;
  instructorId?: number | undefined;
}

export const getUsers = async (params: ListUsersParams) =>
  (await api.get<Paginated<UserRow>>('/users', { params })).data;

export const createUser = async (input: CreateUserInput) =>
  (await api.post<CreatedUser>('/users', input)).data;

export const updateUser = async (id: number, input: UpdateUserInput) =>
  (await api.patch<{ user: UserRow }>(`/users/${id}`, input)).data.user;

export const resetUserPassword = async (id: number) =>
  (await api.post<{ temporaryPassword: string }>(`/users/${id}/reset-password`)).data
    .temporaryPassword;

export const assignInstructor = async (studentId: number, instructorId: number | null) =>
  (await api.patch(`/students/${studentId}/instructor`, { instructorId })).data;

export const assignInstructorToMany = async (studentIds: number[], instructorId: number) =>
  (await api.post<{ assigned: number }>('/students/assign-bulk', { studentIds, instructorId }))
    .data;

export const getInstructors = async () =>
  (await api.get<{ items: InstructorRow[] }>('/instructors/load')).data.items;

export const getPermissions = async () => (await api.get<PermissionMatrix>('/permissions')).data;

export const savePermissions = async (
  changes: { role: 'INSTRUCTOR' | 'STUDENT'; permissionKey: string; allowed: boolean }[],
) => (await api.patch<PermissionMatrix>('/permissions', { changes })).data;
