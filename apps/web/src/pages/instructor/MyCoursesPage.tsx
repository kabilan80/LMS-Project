import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { CourseStatus } from '@lms/shared';
import { NewCourseForm } from '../../components/course/NewCourseForm';
import { StatusPill } from '../../components/course/courseUi';
import { Pagination } from '../../components/Pagination';
import { EmptyState, ErrorBlock, LoadingBlock } from '../../components/Status';
import useApi from '../../hooks/useApi';
import { getCourses } from '../../services/courseService';

export function MyCoursesPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<'' | CourseStatus>('');
  const [page, setPage] = useState(1);
  const [scope, setScope] = useState<'all' | 'teaching'>('all');
  const [creating, setCreating] = useState(false);
  const { data: courses, loaded: coursesLoaded, error: coursesError, callAPI: getCoursesAPI } = useApi(getCourses);
  const load = () => getCoursesAPI({ page, pageSize: 12, status: status || undefined, scope }).catch(() => undefined);
  useEffect(() => { void load(); }, [page, status, scope]);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Course scope" className="flex overflow-hidden rounded-ctl border border-line">
          {([['all', 'All courses'], ['teaching', 'Teaching']] as const).map(([k, label]) => (
            <button key={k} role="tab" aria-selected={scope === k} className={`px-3 py-1.5 text-[12.5px] font-semibold ${scope === k ? 'bg-navy text-white' : 'bg-card text-ink'}`}
              onClick={() => { setScope(k); setStatus(''); setPage(1); }}>{label}</button>
          ))}
        </div>
        {scope === 'all' && <select className="input w-auto" aria-label="Status" value={status} onChange={(e) => { setStatus(e.target.value as typeof status); setPage(1); }}>
          <option value="">All statuses</option>
          <option value="DRAFT">Draft</option>
          <option value="PENDING">Waiting for approval</option>
          <option value="PUBLISHED">Published</option>
          <option value="REJECTED">Rejected</option>
        </select>}
        {!creating && <button className="btn btn-primary ml-auto" onClick={() => setCreating(true)}>+ New course</button>}
      </div>

      {creating && (
        <div className="max-w-xl">
          <NewCourseForm onCancel={() => setCreating(false)} onCreated={(id) => navigate(`/instructor/courses/${id}`)} />
        </div>
      )}

      {!coursesLoaded && !coursesError ? <LoadingBlock /> : coursesError ? <ErrorBlock message={coursesError} onRetry={() => void load()} /> :
        !courses || courses.items.length === 0 ? <EmptyState title={scope === 'teaching' ? 'No courses selected yet' : 'No courses yet'} message={scope === 'teaching' ? 'You teach the courses your assigned students select. They appear here once a student buys or is granted a course.' : 'Create a course, then submit it for approval when it is ready.'} /> : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {courses.items.map((c) => (
            <Link key={c.id} to={`/instructor/courses/${c.id}`} className="card block hover:border-navy">
              <div className="mb-1 flex items-start justify-between gap-2">
                <b className="font-heading text-[14px]">{c.title}</b>
                <StatusPill status={c.status} />
              </div>
              <div className="text-muted">{c.category} · {c.moduleCount} modules · {c.lessonCount} lessons</div>
              <div className="text-[11px] text-muted">By {c.creator.name}{c.myStudents ? ` · ${c.myStudents} of your students` : ''}</div>
              {c.status === 'REJECTED' && c.rejectionReason && <p className="mt-2 text-pill-bad">Changes requested: {c.rejectionReason}</p>}
            </Link>
          ))}
        </div>
      )}
      {courses && courses.total > 0 && <Pagination page={courses.page} pageSize={courses.pageSize} total={courses.total} onChange={setPage} />}
    </>
  );
}
