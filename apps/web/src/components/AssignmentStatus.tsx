import type { AssignmentStatus } from '@lms/shared';
import { Pill } from './Pill';

const SHOW: Record<AssignmentStatus, { tone: 'ok' | 'wait' | 'bad' | 'info'; label: string }> = {
  SUBMITTED: { tone: 'wait', label: 'Submitted' },
  VERIFYING: { tone: 'info', label: 'Verifying' },
  ACCEPTED: { tone: 'ok', label: 'Accepted' },
  REJECTED: { tone: 'bad', label: 'Rejected' },
};

export const ASSIGNMENT_STATUS_LABEL = Object.fromEntries(Object.entries(SHOW).map(([k, v]) => [k, v.label])) as Record<AssignmentStatus, string>;

export function AssignmentStatusPill({ status }: { status: AssignmentStatus }) {
  return <Pill tone={SHOW[status].tone}>{SHOW[status].label}</Pill>;
}
