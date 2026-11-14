import { useEffect, useState, type FormEvent } from 'react';
import { Field, FormError } from '../components/Field';
import { Pagination } from '../components/Pagination';
import { Pill } from '../components/Pill';
import { EmptyState, ErrorBlock, LoadingBlock } from '../components/Status';
import useApi from '../hooks/useApi';
import { useDebounced } from '../hooks/useDebounced';
import { createGrant, getCourseOptions, getGrantStudents, getGrants, revokeGrant } from '../services/commerceService';
import { useAuthStore } from '../store/authStore';
import { formatDate } from '../utils/format';

/** Grant a student free access to a course. Used by admin (any student) and instructors (assigned students only). */
function GrantForm({ onGranted }: { onGranted: () => void }) {
  const isAdmin = useAuthStore((s) => s.user?.role === 'ADMIN');
  const [studentSearch, setStudentSearch] = useState('');
  const debounced = useDebounced(studentSearch);
  const { data: grantStudents, loading: grantStudentsLoading, callAPI: getGrantStudentsAPI } = useApi(getGrantStudents);
  const { data: courseOptionsData, callAPI: getCourseOptionsAPI } = useApi(getCourseOptions);
  useEffect(() => { getGrantStudentsAPI(debounced).catch(() => undefined); }, [debounced]);
  useEffect(() => { getCourseOptionsAPI().catch(() => undefined); }, []);
  const [studentId, setStudentId] = useState('');
  const [courseId, setCourseId] = useState('');
  const [reason, setReason] = useState('');
  const [expires, setExpires] = useState('');
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState<string | null>(null);
  const { loading: createLoading, error: createError, fieldErrors: createFieldErrors, callAPI: createGrantAPI, reset: resetCreate } = useApi(createGrant);
  const fieldErrors = { ...createFieldErrors, ...formErrors };
  const error = createError;
  const busy = createLoading;

  async function submit(e: FormEvent) {
    e.preventDefault();
    resetCreate();
    setDone(null);
    const errs: Record<string, string> = {};
    if (!studentId) errs['studentId'] = 'Choose a student';
    if (!courseId) errs['courseId'] = 'Choose a course';
    // End of the chosen day in the person's own time zone.
    const expiresAt = expires ? new Date(`${expires}T23:59:59`) : undefined;
    if (expiresAt && expiresAt.getTime() <= Date.now()) errs['expiresAt'] = 'Pick a date in the future';
    setFormErrors(errs);
    if (Object.keys(errs).length > 0) return;

    let res;
    try {
      res = await createGrantAPI({
        studentId: Number(studentId),
        courseId: Number(courseId),
        reason: reason.trim() || undefined,
        expiresAt: expiresAt?.toISOString(),
      });
    } catch {
      return; // the message and field errors are in create.error / create.fieldErrors
    }
    setDone(`${res.student.name} can now open "${res.course.title}".`);
    setStudentId('');
    setCourseId('');
    setReason('');
    setExpires('');
    onGranted();
  }

  return (
    <form onSubmit={submit} noValidate className="card" aria-label="Grant access">
      <h3 className="mb-2 font-heading text-[14px] font-bold">Grant free access</h3>
      <FormError message={error} />
      {done && <p className="mb-3 rounded-ctl bg-pill-ok-bg px-3 py-2 text-pill-ok" role="status">{done}</p>}

      <Field label="Find student" placeholder={isAdmin ? 'Name or email' : 'Name or email (your assigned students)'} value={studentSearch} onChange={(e) => setStudentSearch(e.target.value)} />
      <div className="mb-[9px]">
        <label htmlFor="g-student" className="mb-[3px] block text-xs font-semibold">Student</label>
        <select id="g-student" className={`input ${fieldErrors['studentId'] ? 'border-danger' : ''}`} value={studentId} onChange={(e) => setStudentId(e.target.value)}>
          <option value="">{grantStudentsLoading ? 'Loading…' : (grantStudents?.length ?? 0) === 0 ? 'No students found' : 'Choose a student'}</option>
          {(grantStudents ?? []).map((s) => <option key={s.id} value={s.id}>{s.name} · {s.email}</option>)}
        </select>
        {fieldErrors['studentId'] && <p className="mt-1 text-[11px] text-danger" role="alert">{fieldErrors['studentId']}</p>}
      </div>
      <div className="mb-[9px]">
        <label htmlFor="g-course" className="mb-[3px] block text-xs font-semibold">Course</label>
        <select id="g-course" className={`input ${fieldErrors['courseId'] ? 'border-danger' : ''}`} value={courseId} onChange={(e) => setCourseId(e.target.value)}>
          <option value="">Choose a published course</option>
          {(courseOptionsData ?? []).map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
        </select>
        {fieldErrors['courseId'] && <p className="mt-1 text-[11px] text-danger" role="alert">{fieldErrors['courseId']}</p>}
      </div>
      <Field label="Reason (optional)" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
      <Field label="Access ends on (optional)" type="date" value={expires} onChange={(e) => setExpires(e.target.value)} error={fieldErrors['expiresAt']} />
      <button type="submit" className="btn btn-primary disabled:opacity-60" disabled={busy}>{busy ? 'Granting…' : 'Grant access'}</button>
    </form>
  );
}

export function GrantsPage() {
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search);
  const [status, setStatus] = useState<'' | 'active' | 'inactive'>('active');
  const [page, setPage] = useState(1);
  const { error: revokeError, callAPI: revokeGrantAPI } = useApi(revokeGrant);
  const actionError = revokeError;
  const { data: grants, loaded: grantsLoaded, error: grantsError, callAPI: getGrantsAPI } = useApi(getGrants);
  const refetch = () => getGrantsAPI({ page, pageSize: 10, search: debounced || undefined, status: status || undefined }).then(() => undefined).catch(() => undefined);
  useEffect(() => { void refetch(); }, [page, debounced, status]);

  async function revoke(id: number, label: string) {
    if (!window.confirm(`Remove free access for ${label}?`)) return;
    try {
      await revokeGrantAPI(id);
    } catch {
      return; // shown above the list
    }
    await refetch();
  }

  return (
    <div className="grid items-start gap-3 lg:grid-cols-[minmax(300px,380px)_1fr]">
      <GrantForm onGranted={() => { setPage(1); void refetch(); }} />

      <section aria-label="Students with access" className="flex min-w-0 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="mr-auto font-heading text-[14px] font-bold">Students with access</h3>
          <input className="input max-w-[220px]" placeholder="Search by student" aria-label="Search grants" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
          <select className="input w-auto" aria-label="Status" value={status} onChange={(e) => { setStatus(e.target.value as typeof status); setPage(1); }}>
            <option value="active">Active</option>
            <option value="inactive">Revoked or expired</option>
            <option value="">All</option>
          </select>
        </div>
        {actionError && <ErrorBlock message={actionError} />}

        {!grantsLoaded && !grantsError ? <LoadingBlock /> : grantsError ? <ErrorBlock message={grantsError} onRetry={refetch} /> :
          !grants || grants.items.length === 0 ? <EmptyState title="No grants found" message="Students you give free access to appear here." /> : (
          <>
            <div className="card overflow-x-auto p-0">
              <table className="w-full min-w-[560px] text-left">
                <thead><tr className="border-b border-line text-muted">
                  <th className="px-3.5 py-2.5 font-semibold">Student</th><th className="px-3.5 py-2.5 font-semibold">Course</th>
                  <th className="px-3.5 py-2.5 font-semibold">Granted by</th><th className="px-3.5 py-2.5 font-semibold">Ends</th>
                  <th className="px-3.5 py-2.5 font-semibold">Status</th><th className="px-3.5 py-2.5" />
                </tr></thead>
                <tbody>
                  {grants.items.map((g) => (
                    <tr key={g.id} className="border-b border-line-soft last:border-0">
                      <td className="px-3.5 py-2.5"><b className="block">{g.student.name}</b><span className="text-muted">{g.student.email}</span></td>
                      <td className="px-3.5 py-2.5">{g.course.title}{g.reason && <span className="block text-[11px] text-muted">{g.reason}</span>}</td>
                      <td className="px-3.5 py-2.5 text-muted">{g.grantedBy.name}<span className="block text-[11px]">{formatDate(g.createdAt)}</span></td>
                      <td className="px-3.5 py-2.5 text-muted">{g.expiresAt ? formatDate(g.expiresAt) : 'No end date'}</td>
                      <td className="px-3.5 py-2.5">{g.active ? <Pill tone="ok">Active</Pill> : <Pill tone="info">{g.revokedAt ? 'Revoked' : 'Expired'}</Pill>}</td>
                      <td className="px-3.5 py-2.5 text-right">{g.active && <button className="btn" onClick={() => revoke(g.id, g.student.name)}>Revoke</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} pageSize={grants.pageSize} total={grants.total} onChange={setPage} />
          </>
        )}
      </section>
    </div>
  );
}
