import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Pagination } from '../../components/Pagination';
import { Pill } from '../../components/Pill';
import { EmptyState, ErrorBlock, LoadingBlock } from '../../components/Status';
import useApi from '../../hooks/useApi';
import { useDebounced } from '../../hooks/useDebounced';
import { getMyStudents } from '../../services/learningService';
import { formatDate } from '../../utils/format';

export function MyStudentsPage() {
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search);
  const [page, setPage] = useState(1);
  const { data: myStudentsData, loaded: myStudentsLoaded, error: myStudentsError, callAPI: getMyStudentsAPI } = useApi(getMyStudents);
  const load = () => getMyStudentsAPI({ page, pageSize: 10, search: debounced || undefined }).catch(() => undefined);
  useEffect(() => { void load(); }, [page, debounced]);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <input className="input max-w-[260px]" placeholder="Search students" aria-label="Search students" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        <Link to="/instructor/grants" className="btn btn-primary ml-auto">Grant access</Link>
      </div>
      {!myStudentsLoaded && !myStudentsError ? <LoadingBlock /> : myStudentsError ? <ErrorBlock message={myStudentsError} onRetry={() => void load()} /> :
        !myStudentsData || myStudentsData.items.length === 0 ? <EmptyState title="No students yet" message="Students the admin assigns to you appear here, with the courses they select. You teach those courses." /> : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full min-w-[640px] text-left">
            <thead><tr className="border-b border-line text-muted">
              <th className="px-3.5 py-2.5 font-semibold">Student</th>
              <th className="px-3.5 py-2.5 font-semibold">Courses selected</th>
              <th className="px-3.5 py-2.5 font-semibold">Lessons done</th>
              <th className="px-3.5 py-2.5 font-semibold">Certificates</th>
              <th className="px-3.5 py-2.5 font-semibold">Free access</th>
            </tr></thead>
            <tbody>
              {myStudentsData.items.map((s) => (
                <tr key={s.id} className="border-b border-line-soft last:border-0">
                  <td className="px-3.5 py-2.5"><b className="block">{s.name}</b><span className="text-muted">{s.email}</span>{!s.active && <> <Pill tone="bad">Disabled</Pill></>}</td>
                  <td className="px-3.5 py-2.5">
                    {s.annualUntil && <Pill tone="info">Annual · all courses until {formatDate(s.annualUntil)}</Pill>}
                    {s.courses.length === 0 && !s.annualUntil ? <span className="text-muted">None yet</span> : (
                      <ul className="mt-1 flex flex-wrap gap-1.5">
                        {s.courses.map((c) => <li key={c.id} className="rounded-full border border-line bg-page px-2 py-px text-[11px]">{c.title}{c.source === 'GRANT' && <span className="text-muted"> · free</span>}</li>)}
                      </ul>
                    )}
                  </td>
                  <td className="px-3.5 py-2.5">{s.lessonsCompleted}</td>
                  <td className="px-3.5 py-2.5">{s.certificates}</td>
                  <td className="px-3.5 py-2.5">{s.activeGrants}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {myStudentsData && myStudentsData.total > 0 && <Pagination page={myStudentsData.page} pageSize={myStudentsData.pageSize} total={myStudentsData.total} onChange={setPage} />}
    </>
  );
}
