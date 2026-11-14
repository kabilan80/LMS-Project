import { useEffect, useState } from 'react';
import { CERTIFICATE_MIN_PERCENT, MAX_ASSIGNMENT_MARKS, acceptAssignmentSchema, gradeAttempt, type AssignmentRow, type AssignmentStatus } from '@lms/shared';
import { AssignmentStatusPill } from '../../components/AssignmentStatus';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Pagination } from '../../components/Pagination';
import { EmptyState, ErrorBlock, LoadingBlock } from '../../components/Status';
import useApi from '../../hooks/useApi';
import { acceptAssignment, getAssignments, rejectAssignment, verifyAssignment, viewAssignment } from '../../services/assignmentService';
import { formatDate, formatFileSize } from '../../utils/format';

const TABS: { key: AssignmentStatus | ''; label: string }[] = [
  { key: '', label: 'All' },
  { key: 'SUBMITTED', label: 'Submitted' },
  { key: 'VERIFYING', label: 'Verifying' },
  { key: 'ACCEPTED', label: 'Accepted' },
  { key: 'REJECTED', label: 'Rejected' },
];

/** Instructor: assignments of the students assigned to you. Verify first, then grade with marks (accept) or reject with a reason. A grade is final; a failed attempt lets the student submit again. */
export function InstructorAssignmentsPage() {
  const [status, setStatus] = useState<AssignmentStatus | ''>('');
  const [page, setPage] = useState(1);
  const { data: assignments, loaded: assignmentsLoaded, error: assignmentsError, callAPI: getAssignmentsAPI } = useApi(getAssignments);
  const load = () => getAssignmentsAPI({ page, pageSize: 10, status: status || undefined }).catch(() => undefined);
  useEffect(() => { void load(); }, [page, status]);
  useEffect(() => {
    const t = window.setInterval(() => { if (!document.hidden) void load(); }, 20000);
    return () => window.clearInterval(t);
  }, [page, status]);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [rejecting, setRejecting] = useState<AssignmentRow | null>(null);
  const [reason, setReason] = useState('');
  const [accepting, setAccepting] = useState<AssignmentRow | null>(null);
  const [marks, setMarks] = useState('');
  const [feedback, setFeedback] = useState('');
  const marksCheck = acceptAssignmentSchema.safeParse({ marks: marks.trim() === '' ? undefined : Number(marks), feedback: feedback.trim() || undefined });
  const marksError = marks.trim() !== '' && !marksCheck.success ? marksCheck.error.issues.find((i) => i.path[0] === 'marks')?.message : undefined;
  const feedbackError = !marksCheck.success ? marksCheck.error.issues.find((i) => i.path[0] === 'feedback')?.message : undefined;
  // What the marks mean for the assignment, shown before saving.
  const outcome = accepting && marksCheck.success ? gradeAttempt(marksCheck.data.marks, accepting.passMark) : null;

  const { error: rejectError, callAPI: rejectAssignmentAPI, reset: resetReject } = useApi(rejectAssignment);
  const { error: viewError, callAPI: viewAssignmentAPI, reset: resetView } = useApi(viewAssignment);
  // The PDF being shown inside the page: which assignment and its temporary address.
  const [viewing, setViewing] = useState<{ id: number; url: string } | null>(null);
  useEffect(() => () => { if (viewing) URL.revokeObjectURL(viewing.url); }, [viewing]);
  const { error: verifyError, callAPI: verifyAssignmentAPI, reset: resetVerify } = useApi(verifyAssignment);
  const { error: acceptError, callAPI: acceptAssignmentAPI, reset: resetAccept } = useApi(acceptAssignment);

  async function run(id: number, action: () => Promise<unknown>) {
    setBusyId(id);
    resetReject();
    resetView();
    resetVerify();
    resetAccept();
    try {
      await action();
      await load();
      return true;
    } catch {
      return false;
    } finally {
      setBusyId(null);
    }
  }
  const actionError = rejectError ?? viewError ?? verifyError ?? acceptError;

  async function toggleView(a: AssignmentRow) {
    if (viewing?.id === a.id) { setViewing(null); return; }
    await run(a.id, async () => {
      const url = await viewAssignmentAPI(a);
      setViewing({ id: a.id, url });
    });
  }

  async function confirmReject() {
    if (!rejecting) return;
    if (await run(rejecting.id, () => rejectAssignmentAPI(rejecting.id, reason.trim()))) {
      setRejecting(null);
      setReason('');
    }
  }

  function openMarksDialog(a: AssignmentRow) {
    resetAccept();
    setMarks('');
    setFeedback('');
    setAccepting(a);
  }

  async function confirmAccept() {
    if (!accepting || !marksCheck.success) return;
    if (await run(accepting.id, () => 
      acceptAssignmentAPI(accepting.id, marksCheck.data))) {
      setAccepting(null);
      setMarks('');
      setFeedback('');
    }
  }

  const rows = assignments?.items ?? [];
  return (
    <>
      <div className="inline-flex w-fit flex-wrap rounded-ctl border border-line bg-card p-0.5" role="group" aria-label="Show assignments">
        {TABS.map((t) => (
          <button key={t.label} type="button" aria-pressed={status === t.key} onClick={() => { setStatus(t.key); setPage(1); }}
            className={`rounded-[6px] px-3 py-1 font-semibold ${status === t.key ? 'bg-navy text-white' : 'text-muted hover:text-ink'}`}>{t.label}</button>
        ))}
      </div>
      {actionError && <ErrorBlock message={actionError} />}

      {!assignmentsLoaded && !assignmentsError ? <LoadingBlock /> : assignmentsError ? <ErrorBlock message={assignmentsError} onRetry={() => void load()} /> :
        rows.length === 0 ? <EmptyState title="No assignments" message="Assignments from your assigned students appear here." /> : (
        <>
          <ul className="flex flex-col gap-2">
            {rows.map((a) => (
              <li key={a.id} className="card flex flex-col gap-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <b className="min-w-0 truncate">{a.title}</b>
                  <AssignmentStatusPill status={a.status} />
                </div>
                <span className="text-[11px] text-muted">{a.studentName} · {a.courseTitle} · {a.fileName} ({formatFileSize(a.fileSize)}) · {formatDate(a.createdAt)}</span>
                {a.note && <p className="whitespace-pre-line">{a.note}</p>}
                <span className="text-[11px] text-muted">Attempt {a.attemptNo} of {a.maxAttempts}</span>
                {a.marks !== null && (
                  <p><b>Marks: </b>{a.marks}/{MAX_ASSIGNMENT_MARKS}{a.status === 'REJECTED' && <span className="text-pill-bad"> (below the passing marks of {a.passMark})</span>}</p>
                )}
                {a.status === 'REJECTED' && a.rejectReason && <p className="rounded-nav bg-pill-bad-bg px-2.5 py-2 text-pill-bad"><b>Reason: </b>{a.rejectReason}</p>}
                {a.feedback && <p className="whitespace-pre-line"><b>Feedback: </b>{a.feedback}</p>}
                <div className="flex flex-wrap gap-2">
                  <button className="btn disabled:opacity-60" disabled={busyId === a.id} onClick={() => void toggleView(a)}>{viewing?.id === a.id ? 'Hide PDF' : 'View PDF'}</button>
                  {a.status === 'SUBMITTED' && (
                    <button className="btn btn-primary disabled:opacity-60" disabled={busyId === a.id} onClick={() => void run(a.id, () => verifyAssignmentAPI(a.id))}>Start verifying</button>
                  )}
                  {a.status === 'VERIFYING' && (
                    <>
                      <button className="btn btn-primary disabled:opacity-60" disabled={busyId === a.id} onClick={() => openMarksDialog(a)}>Accept</button>
                      <button className="btn disabled:opacity-60" disabled={busyId === a.id} onClick={() => { setReason(''); setRejecting(a); }}>Reject</button>
                    </>
                  )}
                </div>
                {viewing?.id === a.id && (
                  <iframe src={viewing.url} title={`Submitted PDF: ${a.fileName}`} className="h-[70vh] w-full rounded-nav border border-line" />
                )}
              </li>
            ))}
          </ul>
          {assignments && <Pagination page={assignments.page} pageSize={assignments.pageSize} total={assignments.total} onChange={setPage} />}
        </>
      )}

      {accepting && (
        <ConfirmDialog title="Grade this assignment" confirmLabel="Save" cancelLabel="Cancel" busy={busyId === accepting.id}
          confirmDisabled={!marksCheck.success} onConfirm={() => void confirmAccept()} onCancel={() => setAccepting(null)}>
          <p><b>{accepting.title}</b> by {accepting.studentName} · attempt {accepting.attemptNo} of {accepting.maxAttempts}</p>
          <label className="flex flex-col gap-1">Marks for the student (0 to {MAX_ASSIGNMENT_MARKS})
            {/* Plain text box that keeps digits only: a "number" box reacts to the mouse wheel, arrows and letters like "e". */}
            <input type="text" inputMode="numeric" autoComplete="off" maxLength={3} className="input" value={marks}
              aria-invalid={marksError ? true : undefined} onChange={(e) => setMarks(e.target.value.replace(/\D/g, ''))} />
            {marksError && <span className="text-[11px] text-pill-bad" role="alert">{marksError}</span>}
          </label>
          {outcome && (
            <p className={`text-[11px] ${outcome.passed ? 'text-pill-ok' : 'text-pill-bad'}`} role="status">
              {outcome.passed ? 'This passes. The assignment will be accepted.' : `Below the passing marks (${outcome.passMark}). This attempt fails and the student can submit again if attempts are left.`}
            </p>
          )}
          <label className="flex flex-col gap-1">Feedback (optional, the student will see this)
            <textarea rows={3} className="input" maxLength={1000} value={feedback} aria-invalid={feedbackError ? true : undefined} onChange={(e) => setFeedback(e.target.value)} />
            {feedbackError && <span className="text-[11px] text-pill-bad" role="alert">{feedbackError}</span>}
          </label>
          {acceptError && <p className="text-[11px] text-pill-bad" role="alert">{acceptError}</p>}
          <p className="text-[11px] text-muted">A certificate needs average assignment marks of {CERTIFICATE_MIN_PERCENT} or more.</p>
        </ConfirmDialog>
      )}

      {rejecting && (
        <ConfirmDialog title="Reject this assignment?" confirmLabel="Reject assignment" cancelLabel="Cancel" busy={busyId === rejecting.id}
          confirmDisabled={reason.trim().length < 3} onConfirm={() => void confirmReject()} onCancel={() => setRejecting(null)}>
          <p><b>{rejecting.title}</b> by {rejecting.studentName}</p>
          <label className="flex flex-col gap-1">Reason (the student will see this)
            <textarea rows={4} className="input" maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
        </ConfirmDialog>
      )}
    </>
  );
}
