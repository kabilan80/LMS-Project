import type { AssignmentRow, AssignmentStatus, AssignmentTask, Paginated } from '@lms/shared';
import { api } from './api';

export const getAssignments = async (params: {
  page: number;
  pageSize: number;
  status?: AssignmentStatus | undefined;
}) => (await api.get<Paginated<AssignmentRow>>('/assignments', { params })).data;

/** Student: the assignments the instructor set for the courses they can open. */
export const getAssignmentTasks = async () =>
  (await api.get<{ items: AssignmentTask[] }>('/assignments/tasks')).data.items;

/** Sends the PDF as the request body; the details go in the query string. */
export const submitAssignment = async (input: {
  courseAssignmentId: number;
  note?: string | undefined;
  file: File;
}) =>
  (
    await api.post<{ id: number; attemptNo: number; maxAttempts: number }>('/assignments', input.file, {
      params: {
        courseAssignmentId: input.courseAssignmentId,
        ...(input.note ? { note: input.note } : {}),
        fileName: input.file.name,
      },
      headers: { 'Content-Type': 'application/pdf' },
    })
  ).data;

export const verifyAssignment = async (id: number) =>
  (await api.post(`/assignments/${id}/verify`)).data;

/** Grading needs the marks (0 to 100). Marks at or above the pass mark accept it; lower marks fail this attempt (the student can resubmit). */
export const acceptAssignment = async (id: number, input: { marks: number; feedback?: string | undefined }) =>
  (await api.post<{ ok: boolean; accepted: boolean; attemptsLeft: number }>(`/assignments/${id}/accept`, input)).data;

export const rejectAssignment = async (id: number, reason: string) =>
  (await api.post(`/assignments/${id}/reject`, { reason })).data;

/** Fetches the PDF with the sign-in token, then hands it to the browser as a download. */
export const downloadAssignment = async (a: Pick<AssignmentRow, 'id' | 'fileName'>) => {
  const res = await api.get<Blob>(`/assignments/${a.id}/file`, { responseType: 'blob' });
  const url = URL.createObjectURL(res.data);
  const link = document.createElement('a');
  link.href = url;
  link.download = a.fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

/** Fetches the PDF with the sign-in token and returns a temporary address to show it inside the page (an iframe). Revoke it when done. */
export const viewAssignment = async (a: Pick<AssignmentRow, 'id'>) => {
  const res = await api.get<Blob>(`/assignments/${a.id}/file`, { responseType: 'blob' });
  return URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
};
