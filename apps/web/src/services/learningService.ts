import type {
  AdminCertificateRow,
  CertificateProgress,
  CertificateRow,
  CertificateTemplate,
  LearnState,
  LessonPlayback,
  MyStudentRow,
  Paginated,
  ProgressInput,
  ProgressResult,
  QuizStart,
  QuizResult,
  MyCourse,
  VerifyResponse,
} from '@lms/shared';
import { api } from './api';

export const getMyCourses = async () =>
  (await api.get<{ items: MyCourse[] }>('/me/courses')).data.items;

export const getLearnState = async (courseId: number) =>
  (await api.get<LearnState>(`/courses/${courseId}/learn`)).data;

export const getLesson = async (id: number) =>
  (await api.get<LessonPlayback>(`/lessons/${id}`)).data;

export const saveProgress = async (id: number, input: ProgressInput) =>
  (await api.put<ProgressResult>(`/lessons/${id}/progress`, input)).data;

export const startQuiz = async (courseId: number) =>
  (await api.post<QuizStart>(`/courses/${courseId}/quiz/start`)).data;

export const submitQuiz = async (
  attemptId: number,
  answers: { questionId: number; optionId: number | null }[],
) => (await api.post<QuizResult>(`/quiz-attempts/${attemptId}/submit`, { answers })).data;

export const getQuizAttempt = async (attemptId: number) =>
  (await api.get<QuizResult>(`/quiz-attempts/${attemptId}`)).data;

export const getCertificates = async () =>
  (await api.get<{ items: CertificateRow[] }>('/certificates')).data.items;

/** Student: the checklist toward each course's certificate. */
export const getCertificateProgress = async () =>
  (await api.get<{ items: CertificateProgress[] }>('/certificates/progress')).data.items;

/** Fetches the PDF with the sign-in token, then hands it to the browser as a download. */
export const downloadCertificate = async (c: Pick<CertificateRow, 'id' | 'code'>) => {
  const res = await api.get<Blob>(`/certificates/${c.id}/pdf`, { responseType: 'blob' });
  const url = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = `certificate-${c.code}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

export const getAdminCertificates = async (params: {
  page: number;
  pageSize: number;
  search?: string | undefined;
}) => (await api.get<Paginated<AdminCertificateRow>>('/admin/certificates', { params })).data;

export const getCertificateTemplate = async () =>
  (await api.get<CertificateTemplate>('/admin/certificate-template')).data;

export const saveCertificateTemplate = async (input: CertificateTemplate) =>
  (await api.put<CertificateTemplate>('/admin/certificate-template', input)).data;

export const verifyCertificate = async (code: string) =>
  (await api.get<VerifyResponse>(`/verify/${encodeURIComponent(code)}`)).data;

export const getMyStudents = async (params: {
  page: number;
  pageSize: number;
  search?: string | undefined;
}) => (await api.get<Paginated<MyStudentRow>>('/me/students', { params })).data;
