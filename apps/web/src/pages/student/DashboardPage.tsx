import { Link } from 'react-router-dom';
import { Pill } from '../../components/Pill';
import { ProgressBar } from '../../components/ProgressBar';
import { StatCard } from '../../components/StatCard';
import { EmptyState, ErrorBlock, LoadingBlock } from '../../components/Status';
import { useEffect } from 'react';
import useApi from '../../hooks/useApi';
import { getStudentDashboard } from '../../services/dashboardService';
import { useAuthStore } from '../../store/authStore';
import { formatDate } from '../../utils/format';

export function StudentDashboardPage() {
  const user = useAuthStore((s) => s.user);
  const { data: studentDashboard, loaded: studentDashboardLoaded, error: studentDashboardError, callAPI: getStudentDashboardAPI } = useApi(getStudentDashboard);
  const load = () => getStudentDashboardAPI().catch(() => undefined);
  useEffect(() => { void load(); }, []);
  // Refresh in the background every minute while the tab is visible.
  useEffect(() => {
    const t = window.setInterval(() => { if (!document.hidden) void load(); }, 60_000);
    return () => window.clearInterval(t);
  }, []);

  if (!studentDashboard && !studentDashboardError && !studentDashboardLoaded) return <LoadingBlock />;
  if (!studentDashboard) return <ErrorBlock message={studentDashboardError ?? 'Could not load your dashboard'} onRetry={() => void load()} />;

  const { plan, continueLearning: cont, upcomingQuiz: quiz, courses } = studentDashboard;
  const lessonsDone = courses.reduce((n, c) => n + c.completedLessons, 0);
  const lessonsTotal = courses.reduce((n, c) => n + c.totalLessons, 0);
  const planName = plan.annualUntil ? 'Annual package' : plan.individualCourses > 0 ? 'Individual courses' : 'No plan yet';
  const planHint = plan.annualUntil ? `Active until ${formatDate(plan.annualUntil)}` :
    plan.individualCourses > 0 ? `${plan.individualCourses} course${plan.individualCourses === 1 ? '' : 's'} unlocked` : (
      <Link to="/student/subscription" className="text-navy underline">Choose a plan</Link>
    );

  return (
    <>
      <h2 className="font-heading text-[18px] font-bold">Welcome back, {user?.name}</h2>

      <section aria-label="Summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="My plan" value={<span className="text-[18px]">{planName}</span>} hint={planHint} />
        <StatCard label="My courses" value={plan.accessibleCourses} hint={plan.annualUntil ? 'All published courses' : 'Courses you can open'} />
        <StatCard label="Lessons completed" value={`${lessonsDone}/${lessonsTotal}`} hint="Across your courses" />
        <StatCard label="Certificates" value={studentDashboard.certificates} hint={<Link to="/student/certificates" className="text-navy underline">View certificates</Link>} />
      </section>

      <div className="grid gap-3 lg:grid-cols-2">
        <section className="card" aria-label="Continue learning">
          <h3 className="mb-2 font-heading text-[14px] font-bold">Continue learning</h3>
          {cont ? (
            <>
              <b className="block">{cont.courseTitle}</b>
              <span className="mb-2 block text-muted">Next: {cont.lessonTitle}</span>
              <ProgressBar value={cont.completedLessons} max={cont.totalLessons} label="Course progress" />
              <div className="mt-2 flex items-center justify-between">
                <span className="text-muted">{cont.completedLessons} of {cont.totalLessons} lessons</span>
                <Link to={`/student/learn/${cont.courseId}/${cont.lessonId}`} className="btn btn-primary">Continue</Link>
              </div>
            </>
          ) : courses.length === 0 ? (
            <p className="text-muted">You have no courses yet. <Link to="/student/courses" className="text-navy underline">Browse courses</Link></p>
          ) : <p className="text-muted">You have finished every lesson. Nice work!</p>}
        </section>

        <section className="card" aria-label="Upcoming quiz">
          <h3 className="mb-2 font-heading text-[14px] font-bold">Upcoming quiz</h3>
          {quiz ? (
            <>
              <b className="block">{quiz.courseTitle}</b>
              <span className="mb-2 block text-muted">All lessons done. {quiz.attemptsLeft} attempt{quiz.attemptsLeft === 1 ? '' : 's'} left.</span>
              <Link to={`/student/quiz/${quiz.courseId}`} className="btn btn-gold">Take the quiz</Link>
            </>
          ) : <p className="text-muted">No quiz is ready. Finish all lessons in a course to unlock its final quiz.</p>}
        </section>
      </div>

      <section aria-label="My courses">
        <h3 className="mb-2 font-heading text-[14px] font-bold">My courses</h3>
        {courses.length === 0 ? (
          <EmptyState title="No courses yet" message="Buy a course, choose a plan, or ask your instructor for access." />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {courses.map((c) => (
              <article key={c.id} className="card flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <b className="font-heading text-[14px] leading-snug">{c.title}</b>
                  {c.certificateId ? <Pill tone="ok">Certified</Pill> : c.allLessonsDone && c.hasQuiz ? <Pill tone="wait">Quiz ready</Pill> : null}
                </div>
                <ProgressBar value={c.completedLessons} max={c.totalLessons} label={`${c.title} progress`} />
                <div className="flex items-center justify-between">
                  <span className="text-muted">{c.completedLessons} of {c.totalLessons} lessons</span>
                  <Link to={c.nextLessonId ? `/student/learn/${c.id}/${c.nextLessonId}` : `/student/learn/${c.id}`} className="btn">
                    {c.completedLessons === 0 ? 'Start' : c.nextLessonId ? 'Continue' : 'Review'}
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
