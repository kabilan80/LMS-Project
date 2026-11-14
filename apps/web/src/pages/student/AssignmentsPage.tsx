import { useEffect, useRef, useState, type FormEvent } from 'react';
import { MAX_ASSIGNMENT_BYTES, MAX_ASSIGNMENT_MARKS, type AssignmentTask } from '@lms/shared';
import { AssignmentStatusPill } from '../../components/AssignmentStatus';
import { Pagination } from '../../components/Pagination';
import { EmptyState, ErrorBlock, LoadingBlock } from '../../components/Status';
import useApi from '../../hooks/useApi';
import { downloadAssignment, getAssignments, getAssignmentTasks, submitAssignment } from '../../services/assignmentService';
import { formatDate, formatFileSize } from '../../utils/format';
import { log } from '../../utils/log';

/** Student: submit a PDF assignment and follow its status (Submitted, Verifying, Accepted or Rejected). Like quizzes, each assignment has a limited number of attempts. */
export function StudentAssignmentsPage() {
  const [page, setPage] = useState(1);
  const { data: assignments, error: assignmentsError, callAPI: getAssignmentsAPI } = useApi(getAssignments);
  const { data: tasksData, loading: tasksLoading, callAPI: getTasksAPI } = useApi(getAssignmentTasks);
  const { error: downloadAssignmentError, callAPI: downloadAssignmentAPI } = useApi(downloadAssignment);
  const downloadError = downloadAssignmentError;

  const load = () => getAssignmentsAPI({ page, pageSize: 10 }).catch(() => undefined);
  useEffect(() => { void load(); }, [page]);
  // Background refresh every 20 s while the tab is visible.
  useEffect(() => {
    const t = window.setInterval(() => { if (!document.hidden) void load(); }, 20000);
    return () => window.clearInterval(t);
  }, [page]);
  const loadTasks = () => getTasksAPI().catch(() => undefined);
  useEffect(() => { void loadTasks(); }, []);
  const downloadFile = (a: Parameters<typeof downloadAssignment>[0]) => { downloadAssignmentAPI(a).catch(() => undefined); };

  return (
    <div className="grid items-start gap-3 lg:grid-cols-[320px_1fr]">
      <SubmitForm tasks={tasksData ?? []} loadingTasks={tasksLoading && !tasksData} onDone={() => { setPage(1); void load(); void loadTasks(); }} />

      <section className="min-w-0" aria-label="My assignments">
        <h3 className="mb-2 font-heading text-[14px] font-bold">My assignments</h3>
        {downloadError && <div className="mb-2"><ErrorBlock message={downloadError} /></div>}
        {!assignments && !assignmentsError ? <LoadingBlock /> : !assignments ? <ErrorBlock message={assignmentsError ?? ''} onRetry={() => void load()} /> :
          !assignments || assignments.items.length === 0 ? <EmptyState title="No assignments yet" message="Choose an assignment your instructor set and submit your PDF using the form." /> : (
          <>
            <ul className="flex flex-col gap-2">
              {assignments.items.map((a) => (
                <li key={a.id} className="card flex flex-col gap-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <b className="min-w-0 truncate">{a.title}</b>
                    <AssignmentStatusPill status={a.status} />
                  </div>
                  <span className="text-[11px] text-muted">{a.courseTitle} · {a.fileName} ({formatFileSize(a.fileSize)}) · {formatDate(a.createdAt)}</span>
                  {a.note && <p className="whitespace-pre-line">{a.note}</p>}
                  <span className="text-[11px] text-muted">Attempt {a.attemptNo} of {a.maxAttempts}</span>
                  {a.marks !== null && (
                    <p><b>Marks: </b>{a.marks}/{MAX_ASSIGNMENT_MARKS}{a.status === 'REJECTED' && <span className="text-pill-bad"> (passing marks: {a.passMark})</span>}</p>
                  )}
                  {a.status === 'REJECTED' && a.rejectReason && (
                    <p className="rounded-nav bg-pill-bad-bg px-2.5 py-2 text-pill-bad"><b>Reason: </b>{a.rejectReason}</p>
                  )}
                  {a.feedback && <p className="whitespace-pre-line"><b>Instructor feedback: </b>{a.feedback}</p>}
                  <div>
                    <button className="btn" onClick={() => downloadFile(a)}>Download PDF</button>
                  </div>
                </li>
              ))}
            </ul>
            <Pagination page={assignments.page} pageSize={assignments.pageSize} total={assignments.total} onChange={setPage} />
          </>
        )}
      </section>
    </div>
  );
}

function SubmitForm({ tasks, loadingTasks, onDone }: { tasks: AssignmentTask[]; loadingTasks: boolean; onDone: () => void }) {
  const [courseId, setCourseId] = useState<number | ''>('');
  const [taskId, setTaskId] = useState<number | ''>('');
  // Courses that have at least one assignment set by the instructor.
  const courses = [...new Map(tasks.map((t) => [t.courseId, { id: t.courseId, title: t.courseTitle }])).values()];
  const courseTasks = tasks.filter((t) => t.courseId === courseId);
  const task = tasks.find((t) => t.id === taskId);
  // Same rule as quizzes: a new attempt only after a rejection or marks below the pass mark, while attempts are left. Never after passing.
  const blocked = !!task && !task.canSubmit;
  const [note, setNote] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const { loading: submitLoading, error: submitError, fieldErrors: submitFieldErrors, callAPI: submitAssignmentAPI, reset: resetSubmit } = useApi(submitAssignment);
  const busy = submitLoading;
  const [done, setDone] = useState<string | null>(null);
  const [localFields, setFields] = useState<Record<string, string>>({});
  const fields = { ...localFields, ...submitFieldErrors }; // browser checks + server field errors
  const error = Object.keys(submitFieldErrors).length > 0 ? 'Please fix the highlighted fields.' : submitError;
  const input = useRef<HTMLInputElement>(null);

  function pickFile(f: File | null) {
    setDone(null);
    if (!f) return setFile(null);
    if (f.type !== 'application/pdf' && !/\.pdf$/i.test(f.name)) { setFile(null); return setFields((x) => ({ ...x, file: 'Only PDF files are allowed' })); }
    if (f.size > MAX_ASSIGNMENT_BYTES) { setFile(null); return setFields((x) => ({ ...x, file: 'The PDF must be 5 MB or smaller' })); }
    setFields((x) => { const { file: _drop, ...rest } = x; return rest; });
    setFile(f);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const problems: Record<string, string> = {};
    if (courseId === '') problems['courseId'] = 'Choose a course';
    if (taskId === '') problems['taskId'] = 'Choose an assignment';
    else if (blocked) problems['taskId'] = task?.blockedReason ?? 'You cannot submit this assignment again';
    if (!file) problems['file'] = fields['file'] ?? 'Choose a PDF file';
    setFields(problems);
    resetSubmit();
    if (Object.keys(problems).length > 0 || courseId === '' || taskId === '' || !file) return;
    log('StudentAssignmentsPage', 'submit clicked', { courseId, courseAssignmentId: taskId, file });
    let sent: Awaited<ReturnType<typeof submitAssignment>>;
    try {
      sent = await submitAssignmentAPI({ courseAssignmentId: taskId, note: note.trim() || undefined, file });
    } catch {
      return; // submitAction.error / fieldErrors are already set
    }
    setNote(''); setFile(null); setCourseId(''); setTaskId(''); setDone(`Assignment submitted (attempt ${sent.attemptNo} of ${sent.maxAttempts}). Your instructor will verify it.`);
    if (input.current) input.current.value = '';
    onDone();
  }

  return (
    <form onSubmit={submit} noValidate className="card flex flex-col gap-2" aria-label="Submit an assignment">
      <h3 className="font-heading text-[14px] font-bold">Submit an assignment</h3>
      <label className="flex flex-col gap-1">Course
        <select className="input" value={courseId} disabled={loadingTasks} aria-invalid={fields['courseId'] ? true : undefined}
          onChange={(e) => { setCourseId(e.target.value ? Number(e.target.value) : ''); setTaskId(''); setDone(null); }}>
          <option value="">Choose a course…</option>
          {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
        </select>
        {fields['courseId'] && <span className="text-[11px] text-pill-bad" role="alert">{fields['courseId']}</span>}
      </label>
      <label className="flex flex-col gap-1">Assignment
        <select className="input" value={taskId} disabled={courseId === ''} aria-invalid={fields['taskId'] ? true : undefined}
          onChange={(e) => { setTaskId(e.target.value ? Number(e.target.value) : ''); setDone(null); }}>
          <option value="">{courseId === '' ? 'Choose a course first…' : courseTasks.length === 0 ? 'No assignments in this course' : 'Choose an assignment…'}</option>
          {courseTasks.map((t) => <option key={t.id} value={t.id}>{t.title}{t.myStatus ? ` (${t.myStatus.charAt(0) + t.myStatus.slice(1).toLowerCase()})` : ''}</option>)}
        </select>
        {task?.description && <span className="whitespace-pre-line text-[11px] text-muted">{task.description}</span>}
        {task && <AttemptInfo task={task} />}
        {fields['taskId'] && <span className="text-[11px] text-pill-bad" role="alert">{fields['taskId']}</span>}
      </label>
      <label className="flex flex-col gap-1">Note for your instructor (optional)
        <textarea rows={3} className="input" maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <label className="flex flex-col gap-1">PDF file (up to 5 MB)
        <input ref={input} type="file" accept="application/pdf,.pdf" className="input" aria-invalid={fields['file'] ? true : undefined}
          onChange={(e) => pickFile(e.target.files?.[0] ?? null)} />
        {file && <span className="text-[11px] text-muted">{file.name} · {formatFileSize(file.size)}</span>}
        {fields['file'] && <span className="text-[11px] text-pill-bad" role="alert">{fields['file']}</span>}
      </label>
      {error && <ErrorBlock message={error} />}
      {done && <div className="card bg-pill-ok-bg text-pill-ok" role="status">{done}</div>}
      <button type="submit" className="btn btn-primary justify-center disabled:opacity-60" disabled={busy || blocked}>{busy ? 'Uploading…' : 'Submit assignment'}</button>
    </form>
  );
}

/** The attempt the student is on and how many are left, like the quiz page. */
function AttemptInfo({ task }: { task: AssignmentTask }) {
  const next = Math.min(task.attemptsUsed + 1, task.maxAttempts);
  return (
    <span className="flex flex-col gap-0.5 text-[11px]" aria-live="polite">
      <span className="text-muted">
        {task.canSubmit ? `This will be attempt ${next} of ${task.maxAttempts}` : `Attempts used: ${task.attemptsUsed} of ${task.maxAttempts}`}
        {` · ${task.attemptsLeft} attempt${task.attemptsLeft === 1 ? '' : 's'} left · passing marks: ${task.passMark}`}
      </span>
      {task.blockedReason && <span className={task.myStatus === 'ACCEPTED' ? 'text-pill-ok' : 'text-pill-bad'} role="status">{task.blockedReason}</span>}
    </span>
  );
}
