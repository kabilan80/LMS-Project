import type {
  BundleInput,
  BundleItem,
  CheckoutInput,
  CheckoutOrder,
  CheckoutResult,
  CourseOption,
  GrantRow,
  GrantStudent,
  MyAccess,
  Paginated,
  PlanItem,
  PlanType,
  PurchaseRow,
  SalesSummary,
  UpdateBundleInput,
  UpdatePlanInput,
} from '@lms/shared';
import { api } from './api';

export const getPlans = async () => (await api.get<PlanItem[]>('/plans')).data;

export const updatePlan = async (type: PlanType, input: UpdatePlanInput) =>
  (await api.patch<PlanItem>(`/plans/${type}`, input)).data;

export const getBundles = async (courseId?: number) =>
  (await api.get<BundleItem[]>('/bundles', { params: courseId ? { courseId } : {} })).data;

export const createBundle = async (input: BundleInput) =>
  (await api.post<BundleItem>('/bundles', input)).data;

export const updateBundle = async (id: number, input: UpdateBundleInput) =>
  (await api.patch<BundleItem>(`/bundles/${id}`, input)).data;

export const getPurchases = async (page: number, pageSize = 10) =>
  (await api.get<Paginated<PurchaseRow>>('/purchases', { params: { page, pageSize } })).data;

export const getSalesSummary = async () => (await api.get<SalesSummary>('/purchases/summary')).data;

export const createCheckout = async (input: CheckoutInput) =>
  (await api.post<CheckoutOrder>('/checkout', input)).data;

export const confirmPayment = async (orderId: string, simulate: 'success' | 'decline') =>
  (await api.post<CheckoutResult>('/checkout/confirm', { orderId, simulate })).data;

export const getMyAccess = async () => (await api.get<MyAccess>('/me/access')).data;

export const getCourseOptions = async () =>
  (await api.get<CourseOption[]>('/courses/options')).data;

export const getCategories = async () => (await api.get<string[]>('/courses/categories')).data;

export interface ListGrantsParams {
  page?: number;
  pageSize?: number;
  search?: string | undefined;
  status?: 'active' | 'inactive' | undefined;
}

export const getGrants = async (params: ListGrantsParams) =>
  (await api.get<Paginated<GrantRow>>('/grants', { params })).data;

export const getGrantStudents = async (search: string) =>
  (await api.get<GrantStudent[]>('/grants/students', { params: { search } })).data;

export const createGrant = async (input: {
  studentId: number;
  courseId: number;
  reason?: string | undefined;
  expiresAt?: string | undefined;
}) => (await api.post<GrantRow>('/grants', input)).data;

export const revokeGrant = async (id: number) => (await api.post(`/grants/${id}/revoke`)).data;
