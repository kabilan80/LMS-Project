import type {
  AdminDashboard,
  InstructorDashboard,
  NotificationsResponse,
  StudentDashboard,
} from '@lms/shared';
import { api } from './api';

export const getStudentDashboard = async () =>
  (await api.get<StudentDashboard>('/dashboard/student')).data;

export const getInstructorDashboard = async () =>
  (await api.get<InstructorDashboard>('/dashboard/instructor')).data;

export const getAdminDashboard = async () =>
  (await api.get<AdminDashboard>('/dashboard/admin')).data;

export const getNotifications = async () =>
  (await api.get<NotificationsResponse>('/notifications')).data;

export const markNotificationRead = async (id: number) =>
  (await api.patch(`/notifications/${id}/read`)).data;

export const markAllNotificationsRead = async () =>
  (await api.post('/notifications/read-all')).data;
