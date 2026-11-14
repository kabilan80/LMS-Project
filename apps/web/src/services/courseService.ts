import type {
  CourseAssignmentInput,
  CourseDetail,
  CourseInput,
  CourseLevel,
  CourseListItem,
  CourseStatus,
  LessonInput,
  Paginated,
  QuizInput,
  UpdateCourseInput,
  UpdateLessonInput,
} from '@lms/shared';
import { api } from './api';

export interface ListCoursesParams {
  page?: number;
  pageSize?: number;
  search?: string | undefined;
  status?: CourseStatus | undefined;
  category?: string | undefined;
  level?: CourseLevel | undefined;
  sort?: 'newest' | 'title' | undefined;
  scope?: 'all' | 'teaching' | undefined;
}

export const getCourses = async (params: ListCoursesParams) =>
  (await api.get<Paginated<CourseListItem>>('/courses', { params })).data;

export const getCourse = async (id: number) => (await api.get<CourseDetail>(`/courses/${id}`)).data;

export const createCourse = async (input: CourseInput) =>
  (await api.post<{ id: number }>('/courses', input)).data.id;

export const updateCourse = async (id: number, input: UpdateCourseInput) =>
  (await api.patch(`/courses/${id}`, input)).data;

export const submitCourse = async (id: number) => (await api.post(`/courses/${id}/submit`)).data;

export const publishCourse = async (id: number) => (await api.post(`/courses/${id}/publish`)).data;

export const approveCourse = async (id: number) => (await api.post(`/courses/${id}/approve`)).data;

export const rejectCourse = async (id: number, reason: string) =>
  (await api.post(`/courses/${id}/reject`, { reason })).data;

export const unpublishCourse = async (id: number) =>
  (await api.post(`/courses/${id}/unpublish`)).data;

export const createModule = async (courseId: number, title: string) =>
  (await api.post(`/courses/${courseId}/modules`, { title })).data;

export const updateModule = async (id: number, title: string) =>
  (await api.patch(`/modules/${id}`, { title })).data;

export const deleteModule = async (id: number) => (await api.delete(`/modules/${id}`)).data;

export const reorderModules = async (courseId: number, orderedIds: number[]) =>
  (await api.post(`/courses/${courseId}/modules/reorder`, { orderedIds })).data;

export const createLesson = async (moduleId: number, input: LessonInput) =>
  (await api.post(`/modules/${moduleId}/lessons`, input)).data;

export const updateLesson = async (id: number, input: UpdateLessonInput) =>
  (await api.patch(`/lessons/${id}`, input)).data;

export const deleteLesson = async (id: number) => (await api.delete(`/lessons/${id}`)).data;

export const reorderLessons = async (moduleId: number, orderedIds: number[]) =>
  (await api.post(`/modules/${moduleId}/lessons/reorder`, { orderedIds })).data;

export const saveCourseQuiz = async (courseId: number, input: QuizInput) =>
  (await api.put(`/courses/${courseId}/quiz`, input)).data;

export const createCourseAssignment = async (courseId: number, input: CourseAssignmentInput) =>
  (await api.post(`/courses/${courseId}/assignments`, input)).data;

export const updateCourseAssignment = async (id: number, input: CourseAssignmentInput) =>
  (await api.patch(`/course-assignments/${id}`, input)).data;

export const deleteCourseAssignment = async (id: number) => (await api.delete(`/course-assignments/${id}`)).data;

export const reorderCourseAssignments = async (courseId: number, orderedIds: number[]) =>
  (await api.post(`/courses/${courseId}/assignments/reorder`, { orderedIds })).data;
