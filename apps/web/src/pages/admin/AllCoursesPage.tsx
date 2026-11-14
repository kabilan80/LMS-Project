import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Link, useNavigate } from 'react-router-dom';
import type { CourseListItem, CourseStatus } from '@lms/shared';
import { NewCourseForm } from '../../components/course/NewCourseForm';
import { StatusPill } from '../../components/course/courseUi';
import { Pagination } from '../../components/Pagination';
import { EmptyState, ErrorBlock, LoadingBlock } from '../../components/Status';
import useApi from '../../hooks/useApi';
import { useDebounced } from '../../hooks/useDebounced';
import { getCourses, unpublishCourse } from '../../services/courseService';

export function AllCoursesPage() {
  const navigate = useNavigate();
  const [urlParams] = useSearchParams();
  const urlSearch = urlParams.get('search') ?? '';
  const [search, setSearch] = useState(urlSearch);
  const debounced = useDebounced(search);
  const [status, setStatus] = useState<'' | CourseStatus>('');
  const [page, setPage] = useState(1);
  // The top-bar search sends people here with ?search=...; follow it when it changes.
  useEffect(() => {
    setSearch(urlSearch);
    setPage(1);
  }, [urlSearch]);
  const [creating, setCreating] = useState(false);
  const { error: unpublishError, callAPI: unpublishCourseAPI } = useApi(unpublishCourse);
  const actionError = unpublishError;
  const { data: coursesData, loaded: coursesLoaded, error: coursesError, callAPI: getCoursesAPI } = useApi(getCourses);
  const refetch = () => getCoursesAPI({ page, pageSize: 10, search: debounced || undefined, status: status || undefined }).then(() => undefined, () => undefined);
  useEffect(() => { void refetch(); }, [page, debounced, status]);

  async function unpublish(c: CourseListItem) {
    if (!window.confirm(`Unpublish "${c.title}"? Students will no longer see it. It returns to draft.`)) return;
    try {
      await unpublishCourseAPI(c.id);
      await refetch();
    } catch {
      /* unpublishAction.error is shown above */
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <input className="input max-w-[240px]" placeholder="Search by title" aria-label="Search courses" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        <select className="input w-auto" aria-label="Status" value={status} onChange={(e) => { setStatus(e.target.value as typeof status); setPage(1); }}>
          <option value="">All statuses</option>
          <option value="DRAFT">Draft</option>
          <option value="PENDING">Waiting for approval</option>
          <option value="PUBLISHED">Published</option>
          <option value="REJECTED">Rejected</option>
        </select>
        {!creating && <button className="btn btn-primary ml-auto" onClick={() => setCreating(true)}>+ New course</button>}
      </div>
      {creating && <div className="max-w-xl"><NewCourseForm onCancel={() => setCreating(false)} onCreated={(id) => navigate(`/admin/courses/${id}`)} /></div>}
      {actionError && <ErrorBlock message={actionError} />}

      {!coursesLoaded && !coursesError ? <LoadingBlock /> : coursesError ? <ErrorBlock message={coursesError} onRetry={refetch} /> :
        !coursesData || coursesData.items.length === 0 ? <EmptyState title="No courses found" message="Try different filters, or create a course." /> : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full min-w-[640px] text-left">
            <thead>
              <tr className="border-b border-line text-muted">
                <th className="px-3.5 py-2.5 font-semibold">Course</th>
                <th className="px-3.5 py-2.5 font-semibold">Creator</th>
                <th className="px-3.5 py-2.5 font-semibold">Content</th>
                <th className="px-3.5 py-2.5 font-semibold">Status</th>
                <th className="px-3.5 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {coursesData.items.map((c) => (
                <tr key={c.id} className="border-b border-line-soft last:border-0">
                  <td className="px-3.5 py-2.5"><b className="block">{c.title}</b><span className="text-muted">{c.category}</span></td>
                  <td className="px-3.5 py-2.5">{c.creator.name}</td>
                  <td className="px-3.5 py-2.5 text-muted">{c.moduleCount} modules · {c.lessonCount} lessons</td>
                  <td className="px-3.5 py-2.5"><StatusPill status={c.status} /></td>
                  <td className="whitespace-nowrap px-3.5 py-2.5 text-right">
                    {c.status === 'PENDING' && <Link to="/admin/approval" className="btn mr-1.5">Review</Link>}
                    {c.status === 'PUBLISHED' && <button className="btn mr-1.5" onClick={() => unpublish(c)}>Unpublish</button>}
                    <Link to={`/admin/courses/${c.id}`} className="btn">{c.status === 'PENDING' ? 'Open' : 'Edit'}</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {coursesData && coursesData.total > 0 && <Pagination page={coursesData.page} pageSize={coursesData.pageSize} total={coursesData.total} onChange={setPage} />}
    </>
  );
}
