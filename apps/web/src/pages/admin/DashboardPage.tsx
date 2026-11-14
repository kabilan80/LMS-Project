import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { formatMoney } from '@lms/shared';
import { Pill } from '../../components/Pill';
import { StatCard } from '../../components/StatCard';
import { EmptyState, ErrorBlock, LoadingBlock } from '../../components/Status';
import useApi from '../../hooks/useApi';
import { getAdminDashboard } from '../../services/dashboardService';
import { PURCHASE_LABEL, formatDate, timeAgo } from '../../utils/format';

export function AdminDashboardPage() {
  const { data: adminDashboard, loaded: adminDashboardLoaded, error: adminDashboardError, callAPI: getAdminDashboardAPI } = useApi(getAdminDashboard);
  const refetch = () => getAdminDashboardAPI().then(() => undefined, () => undefined);
  useEffect(() => {
    void refetch();
    // refresh in the background every minute while the tab is visible
    const t = window.setInterval(() => { if (!document.hidden) void refetch(); }, 60_000);
    return () => window.clearInterval(t);
  }, []);

  if (!adminDashboardLoaded && !adminDashboardError) return <LoadingBlock />;
  if (adminDashboardError || !adminDashboard) return <ErrorBlock message={adminDashboardError ?? 'Could not load the dashboard'} onRetry={refetch} />;

  const { users, courses, sales } = adminDashboard;
  const activeSubs = sales.activeAnnual + sales.activeBundles + sales.activeSingles;

  return (
    <>
      {(courses.pending > 0 || users.unassignedStudents > 0) && (
        <div role="status" className="card flex flex-wrap items-center gap-x-4 gap-y-1 bg-pill-wa-bg text-pill-wa">
          {courses.pending > 0 && <span><b>{courses.pending}</b> course{courses.pending === 1 ? ' is' : 's are'} waiting for approval. <Link to="/admin/approval" className="font-semibold underline">Review</Link></span>}
          {users.unassignedStudents > 0 && <span><b>{users.unassignedStudents}</b> student{users.unassignedStudents === 1 ? ' has' : 's have'} no instructor. <Link to="/admin/assign" className="font-semibold underline">Assign</Link></span>}
        </div>
      )}

      <section aria-label="Summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Students" value={users.students} hint={`${users.unassignedStudents} unassigned`} />
        <StatCard label="Instructors" value={users.instructors} hint="Active accounts" />
        <StatCard label="Published courses" value={courses.published} hint={`${courses.pending} awaiting approval`} />
        <StatCard label="Active subscriptions" value={activeSubs} hint={`${sales.activeAnnual} annual · ${sales.activeBundles} bundle · ${sales.activeSingles} single`} />
        <StatCard label="Revenue" value={<span className="text-[18px]">{formatMoney(sales.revenueMinor, sales.currency)}</span>} hint="All completed payments" />
      </section>

      <div className="grid items-start gap-3 lg:grid-cols-2">
        <section className="card" aria-label="Pending approvals">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="font-heading text-[14px] font-bold">Pending approvals</h3>
            <Link to="/admin/approval" className="text-navy underline">Open queue</Link>
          </div>
          {adminDashboard.pendingCourses.length === 0 ? <p className="text-muted">Nothing is waiting for review.</p> : (
            <ul className="flex flex-col gap-2">
              {adminDashboard.pendingCourses.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 rounded-nav bg-page px-2.5 py-2">
                  <span className="min-w-0"><b className="block truncate">{c.title}</b><span className="text-[11px] text-muted">By {c.creatorName}{c.submittedAt ? ` · ${timeAgo(c.submittedAt)}` : ''}</span></span>
                  <Pill tone="wait">Pending</Pill>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card" aria-label="Quick actions">
          <h3 className="mb-2 font-heading text-[14px] font-bold">Quick actions</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            <Link to="/admin/users" className="btn btn-primary justify-center">+ Create instructor</Link>
            <Link to="/admin/assign" className="btn justify-center">Assign instructors</Link>
            <Link to="/admin/plans" className="btn justify-center">Plans and prices</Link>
            <Link to="/admin/grants" className="btn justify-center">Grant access</Link>
          </div>
        </section>
      </div>

      <section className="card p-0" aria-label="Recent purchases">
        <h3 className="px-3.5 pb-2 pt-3 font-heading text-[14px] font-bold">Recent purchases</h3>
        {adminDashboard.recentPurchases.length === 0 ? (
          <div className="px-3.5 pb-4"><EmptyState title="No purchases yet" message="Completed purchases appear here." /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left">
              <thead><tr className="border-y border-line text-muted">
                <th className="px-3.5 py-2 font-semibold">Student</th>
                <th className="px-3.5 py-2 font-semibold">Purchase</th>
                <th className="px-3.5 py-2 font-semibold">Amount</th>
                <th className="px-3.5 py-2 font-semibold">Date</th>
              </tr></thead>
              <tbody>
                {adminDashboard.recentPurchases.map((p) => (
                  <tr key={p.id} className="border-b border-line-soft last:border-0">
                    <td className="px-3.5 py-2">{p.student?.name ?? '—'}</td>
                    <td className="px-3.5 py-2"><b className="block">{p.title}</b><span className="text-[11px] text-muted">{PURCHASE_LABEL[p.type]}</span></td>
                    <td className="px-3.5 py-2">{formatMoney(p.amountMinor, p.currency)}</td>
                    <td className="px-3.5 py-2 text-muted">{formatDate(p.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
