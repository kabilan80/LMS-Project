import { useEffect, useState } from 'react';
import { Pagination } from '../../components/Pagination';
import { Pill } from '../../components/Pill';
import { EmptyState, ErrorBlock, LoadingBlock } from '../../components/Status';
import useApi from '../../hooks/useApi';
import { useDebounced } from '../../hooks/useDebounced';
import { getErrorMessage } from '../../services/api';
import { assignInstructor, assignInstructorToMany, getInstructors, getUsers } from '../../services/userService';

type Show = 'all' | 'unassigned' | 'assigned';
const TABS: { key: Show; label: string }[] = [
  { key: 'all', label: 'All students' },
  { key: 'unassigned', label: 'Not assigned' },
  { key: 'assigned', label: 'Assigned' },
];

/**
 * One table of students. Each row clearly says Assigned or Not assigned and has its own instructor box for
 * assigning one student; tick several students and use the bar on top to assign the whole group.
 */
export function AssignInstructorsPage() {
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search);
  const [show, setShow] = useState<Show>('all');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkInstructor, setBulkInstructor] = useState('');
  const { callAPI: assignInstructorAPI } = useApi(assignInstructor);
  const { loading: assignInstructorToManyLoading, callAPI: assignInstructorToManyAPI } = useApi(assignInstructorToMany);
  const busy = assignInstructorToManyLoading;
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);

  const { data: instructorsData, loaded: instructorsLoaded, error: instructorsError, callAPI: getInstructorsAPI } = useApi(getInstructors);
  const { data: users, loaded: usersLoaded, error: usersError, callAPI: getUsersAPI } = useApi(getUsers);
  const loadInstructors = () => getInstructorsAPI().then(() => undefined, () => undefined);
  const loadStudents = () =>
    getUsersAPI({
        role: 'STUDENT',
        page,
        pageSize: 10,
        search: debounced || undefined,
        unassigned: show === 'unassigned' ? 'true' : show === 'assigned' ? 'false' : undefined,
      })
      .then(() => undefined, () => undefined);
  useEffect(() => { void loadInstructors(); }, []);
  useEffect(() => { void loadStudents(); }, [page, debounced, show]);

  const instructors = instructorsData ?? [];
  const activeInstructors = instructors.filter((i) => i.active);
  const rows = users?.items ?? [];

  const refresh = () => Promise.all([loadInstructors(), loadStudents()]);
  const pick = (s: Show) => { setShow(s); setPage(1); setSelected(new Set()); };
  const toggle = (id: number) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  async function assignOne(studentId: number, value: string) {
    setMessage(null);
    try {
      await assignInstructorAPI(studentId, value === '' ? null : Number(value));
      await refresh();
    } catch (e) {
      setMessage({ type: 'error', text: getErrorMessage(e) });
    }
  }

  async function assignSelected() {
    if (!bulkInstructor || selected.size === 0) return;
    setMessage(null);
    let assigned: number;
    try {
      assigned = (await assignInstructorToManyAPI([...selected], Number(bulkInstructor))).assigned;
    } catch (e) {
      return setMessage({ type: 'error', text: getErrorMessage(e) });
    }
    const who = instructors.find((i) => String(i.id) === bulkInstructor)?.name ?? 'the instructor';
    setMessage({ type: 'ok', text: `${assigned} student${assigned === 1 ? '' : 's'} assigned to ${who}.` });
    setSelected(new Set());
    setBulkInstructor('');
    await refresh();
  }

  if (!instructorsLoaded && !instructorsError) return <LoadingBlock />;
  if (instructorsError) return <ErrorBlock message={instructorsError} onRetry={() => void loadInstructors()} />;
  if (instructors.length === 0) return <EmptyState title="No instructors yet" message="Create an instructor on the Users page first." />;

  return (
    <section className="card flex flex-col gap-3" aria-label="Assign instructors">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-ctl border border-line p-0.5" role="group" aria-label="Show students">
          {TABS.map((t) => (
            <button key={t.key} type="button" aria-pressed={show === t.key} onClick={() => pick(t.key)}
              className={`rounded-[6px] px-3 py-1 font-semibold ${show === t.key ? 'bg-navy text-white' : 'text-muted hover:text-ink'}`}>
              {t.label}
            </button>
          ))}
        </div>
        <input className="input max-w-[220px]" placeholder="Search students" aria-label="Search students"
          value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
      </div>

      {/* Group assign: only needs a tick on the students and an instructor. */}
      <div className={`flex flex-wrap items-center gap-2 rounded-nav px-3 py-2 ${selected.size > 0 ? 'bg-pill-in-bg' : 'bg-page'}`}>
        <b>{selected.size > 0 ? `${selected.size} selected` : 'Tick students to assign them together'}</b>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <select className="input w-auto" aria-label="Instructor for selected students" value={bulkInstructor} onChange={(e) => setBulkInstructor(e.target.value)}>
            <option value="">Choose instructor…</option>
            {activeInstructors.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
          <button className="btn btn-primary disabled:opacity-60" disabled={busy || !bulkInstructor || selected.size === 0} onClick={assignSelected}>
            {busy ? 'Assigning…' : 'Assign to instructor'}
          </button>
        </div>
      </div>

      {message && (
        <div role={message.type === 'error' ? 'alert' : 'status'}>
          {message.type === 'error' ? <ErrorBlock message={message.text} /> : <div className="card bg-pill-ok-bg text-pill-ok">{message.text}</div>}
        </div>
      )}

      {!usersLoaded && !usersError ? <LoadingBlock /> : usersError ? <ErrorBlock message={usersError} onRetry={() => void loadStudents()} /> :
        rows.length === 0 ? <EmptyState title={show === 'unassigned' ? 'Every student has an instructor' : show === 'assigned' ? 'No assigned students yet' : 'No students found'} message="Students appear here after they register." /> : (
        <div className="overflow-x-auto rounded-nav border border-line">
          <table className="w-full min-w-[600px] text-left">
            <thead>
              <tr className="border-b border-line text-muted">
                <th className="w-10 px-3.5 py-2.5">
                  <input type="checkbox" aria-label="Select all on this page"
                    checked={rows.length > 0 && rows.every((r) => selected.has(r.id))}
                    onChange={(e) => setSelected((s) => {
                      const next = new Set(s);
                      for (const r of rows) { if (e.target.checked) next.add(r.id); else next.delete(r.id); }
                      return next;
                    })} />
                </th>
                <th className="px-3.5 py-2.5 font-semibold">Student</th>
                <th className="px-3.5 py-2.5 font-semibold">Status</th>
                <th className="px-3.5 py-2.5 font-semibold">Instructor</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id} className="border-b border-line-soft last:border-0">
                  <td className="px-3.5 py-2.5"><input type="checkbox" aria-label={`Select ${s.name}`} checked={selected.has(s.id)} onChange={() => toggle(s.id)} /></td>
                  <td className="px-3.5 py-2.5"><b className="block">{s.name}</b><span className="text-muted">{s.email}</span></td>
                  <td className="px-3.5 py-2.5">{s.instructorId ? <Pill tone="ok">Assigned</Pill> : <Pill tone="wait">Not assigned</Pill>}</td>
                  <td className="px-3.5 py-2.5">
                    <select className="input w-auto min-w-[180px]" aria-label={`Instructor for ${s.name}`} value={s.instructorId ?? ''} onChange={(e) => assignOne(s.id, e.target.value)}>
                      <option value="">Not assigned</option>
                      {instructors.map((i) => (
                        <option key={i.id} value={i.id} disabled={!i.active && i.id !== s.instructorId}>{i.name}{i.active ? '' : ' (disabled)'}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {users && users.total > 0 && (
        <Pagination page={users.page} pageSize={users.pageSize} total={users.total} onChange={setPage} />
      )}
    </section>
  );
}
