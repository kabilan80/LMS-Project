import type { CourseStatus } from '@lms/shared';
import { Pill } from '../Pill';

const MAP: Record<CourseStatus, { tone: 'ok' | 'wait' | 'bad' | 'info'; label: string }> = {
  DRAFT: { tone: 'info', label: 'Draft' },
  PENDING: { tone: 'wait', label: 'Waiting for approval' },
  PUBLISHED: { tone: 'ok', label: 'Published' },
  REJECTED: { tone: 'bad', label: 'Rejected' },
};

export function StatusPill({ status }: { status: CourseStatus }) {
  const s = MAP[status];
  return <Pill tone={s.tone}>{s.label}</Pill>;
}

export const LEVELS = [
  { value: 'BEGINNER', label: 'Beginner' },
  { value: 'INTERMEDIATE', label: 'Intermediate' },
  { value: 'ADVANCED', label: 'Advanced' },
] as const;
