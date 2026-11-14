import type { HomeCourseOption, HomePageData } from '@lms/shared';
import { api } from './api';

/** Public: no sign-in needed. */
export const getHomePage = async () => (await api.get<HomePageData>('/public/home')).data;

/** Admin: all published courses with their home page switch. */
export const getHomeCourseOptions = async () =>
  (await api.get<{ items: HomeCourseOption[]; max: number }>('/home-courses')).data;

export const setHomeCourseShown = async (id: number, show: boolean) =>
  (await api.patch(`/home-courses/${id}`, { show })).data;
