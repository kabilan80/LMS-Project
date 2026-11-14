import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { StatusPill } from '../../components/course/courseUi';
import { StatCard } from '../../components/StatCard';
import { EmptyState, ErrorBlock, LoadingBlock } from '../../components/Status';
import useApi from '../../hooks/useApi';
import { getInstructorDashboard } from '../../services/dashboardService';
import { useAuthStore } from '../../store/authStore';
import { timeAgo } from '../../utils/format';

const dash = (v: number | null, suffix = '') => (v === null ? '—' : `${v}${suffix}`);

export function InstructorDashboardPage() {
  const user = useAuthStore((s) => s.user);
  const { data: instructorDashboard, loaded: instructorDashboardLoaded, error: instructorDashboardError, callAPI: getInstructorDashboardAPI } = useApi(getInstructorDashboard);
  const load = () => getInstructorDashboardAPI().catch(() => undefined);
  useEffect(() => {
    void load();
    const t = window.setInterval(() => { if (!document.hidden) void load(); }, 60_000);
    return () => window.clearInterval(t);
  }, []);

  if (!instructorDashboardLoaded && !instructorDashboardError) return <LoadingBlock />;
  if (!instructorDashboard) return <ErrorBlock message={instructorDashboardError ?? 'Could not load your dashboard'} onRetry={() => void load()} />;

  const { courses } = instructorDashboard;
  return (
    <>
      <h2 className="font-heading text-[18px] font-bold">Welcome back, {user?.name}</h2>

      {courses.rejected > 0 && (
        <div role="status" className="card border-pill-bad-bg bg-pill-bad-bg text-pill-bad">
          {courses.rejected} course{courses.rejected === 1 ? ' needs' : 's need'} changes. <Link to="/instructor/courses" className="font-semibold underline">Open My courses</Link>
        </div>
      )}

      <section aria-label="Summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="My courses" value={courses.total} hint={courses.pending > 0 ? `${courses.pending} pending approval` : `${courses.published} published`} />
        <StatCard label="Learners" value={instructorDashboard.learners} hint="Students active in your courses" />
        <StatCard label="Avg completion" value={dash(instructorDashboard.avgCompletionPercent, '%')} hint="Across your courses" />
        <StatCard label="Assigned students" value={instructorDashboard.assignedStudents} hint={`${instructorDashboard.certificatesIssued} certificates issued`} />
      </section>

      <div className="grid items-start gap-3 lg:grid-cols-[1fr_320px]">
        <section className="card p-0" aria-label="Course performance">
          <h3 className="px-3.5 pb-2 pt-3 font-heading text-[14px] font-bold">My courses performance</h3>
          {instructorDashboard.stats.length === 0 ? (
            <div className="px-3.5 pb-4"><EmptyState title="No courses yet" message="Create your first course from My courses." /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-left">
                <thead><tr className="border-y border-line text-muted">
                  <th className="px-3.5 py-2 font-semibold">Course</th>
                  <th className="px-3.5 py-2 font-semibold">Learners</th>
                  <th className="px-3.5 py-2 font-semibold">Completion</th>
                  <th className="px-3.5 py-2 font-semibold">Avg quiz</th>
                  <th className="px-3.5 py-2 font-semibold">Status</th>
                </tr></thead>
                <tbody>
                  {instructorDashboard.stats.map((s) => (
                    <tr key={s.id} className="border-b border-line-soft last:border-0">
                      <td className="px-3.5 py-2"><Link to={`/instructor/courses/${s.id}`} className="font-semibold text-navy hover:underline">{s.title}</Link></td>
                      <td className="px-3.5 py-2">{s.learners}</td>
                      <td className="px-3.5 py-2">{dash(s.completionPercent, '%')}</td>
                      <td className="px-3.5 py-2">{dash(s.avgQuizPercent, '%')}</td>
                      <td className="px-3.5 py-2"><StatusPill status={s.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div className="flex flex-col gap-3">
          <section className="card" aria-label="Quick actions">
            <h3 className="mb-2 font-heading text-[14px] font-bold">Quick actions</h3>
            <div className="flex flex-col gap-2">
              <Link to="/instructor/courses" className="btn btn-primary justify-center">+ New course</Link>
              <Link to="/instructor/students" className="btn justify-center">My students</Link>
              <Link to="/instructor/grants" className="btn justify-center">Grant access</Link>
            </div>
          </section>
          <section className="card" aria-label="Recent activity">
            <h3 className="mb-2 font-heading text-[14px] font-bold">Recent activity</h3>
            {instructorDashboard.activity.length === 0 ? <p className="text-muted">Nothing yet. Activity shows up as learners start your courses.</p> : (
              <ul className="flex flex-col gap-2">
                {instructorDashboard.activity.map((a) => (
                  <li key={a.id}><span className="block">• {a.text}</span><span className="ml-3 text-[11px] text-muted">{timeAgo(a.at)}</span></li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
