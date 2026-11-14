import { useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { formatMoney } from '@lms/shared';
import { AccessPill } from '../../components/course/CourseCard';
import { LEVELS } from '../../components/course/courseUi';
import { Pill } from '../../components/Pill';
import { EmptyState, ErrorBlock, LoadingBlock } from '../../components/Status';
import useApi from '../../hooks/useApi';
import { getAssignmentTasks } from '../../services/assignmentService';
import { getBundles, getPlans } from '../../services/commerceService';
import { getCourse } from '../../services/courseService';
import { AssignmentStatusPill } from '../../components/AssignmentStatus';
import { QuizLock } from '../../components/QuizLock';
import { getLearnState } from '../../services/learningService';
import { formatDuration } from '../../utils/format';

/** Everything a student needs to decide before paying. Video links are never in this response. */
export function CourseDetailPage() {
  const id = Number(useParams()['id']);
  const navigate = useNavigate();
  const { data: courseData, error: courseError, callAPI: getCourseAPI } = useApi(getCourse);
  const { data: plansData, callAPI: getPlansAPI } = useApi(getPlans);
  const { data: bundlesData, callAPI: getBundlesAPI } = useApi(getBundles);
  const { data: learnStateData, callAPI: getLearnStateAPI } = useApi(getLearnState);
  const { data: tasksData, callAPI: getTasksAPI } = useApi(getAssignmentTasks);
  const validId = Number.isInteger(id) && id > 0;
  const hasAccess = !!courseData?.access;
  const loadCourse = () => getCourseAPI(id).catch(() => undefined);

  useEffect(() => { if (validId) void loadCourse(); }, [id]);
  useEffect(() => { getPlansAPI().catch(() => undefined); }, []);
  useEffect(() => { if (validId) getBundlesAPI(id).catch(() => undefined); }, [id]);
  useEffect(() => { if (validId && hasAccess) getLearnStateAPI(id).catch(() => undefined); }, [id, hasAccess]);

  useEffect(() => { if (hasAccess) getTasksAPI().catch(() => undefined); }, [id, hasAccess]);

  if (!validId) return <EmptyState title="Course not found" />;
  if (!courseData && !courseError) return <LoadingBlock />;
  if (courseError || !courseData) {
    return (
      <>
        <Link to="/student/courses" className="text-navy underline">← Back to courses</Link>
        <ErrorBlock message={courseError ?? 'Course not found'} onRetry={() => void loadCourse()} />
      </>
    );
  }

  const c = courseData;
  const single = plansData?.find((p) => p.type === 'SINGLE');
  const annual = plansData?.find((p) => p.type === 'ANNUAL');
  const lessonCount = c.modules.reduce((n, m) => n + m.lessons.length, 0);
  const totalSeconds = c.modules.reduce((n, m) => n + m.lessons.reduce((k, l) => k + (l.durationSeconds ?? 0), 0), 0);
  const buy = (query: string) => navigate(`/student/checkout?${query}`);
  const level = LEVELS.find((l) => l.value === c.level)?.label ?? c.level;

  return (
    <>
      <Link to="/student/courses" className="text-navy underline">← Back to courses</Link>
      <div className="grid items-start gap-3 lg:grid-cols-[1fr_300px]">
        <div className="flex flex-col gap-3">
          <section className="card">
            <div className="mb-1 flex flex-wrap items-center gap-1.5">
              <Pill tone="info">{c.category}</Pill>
              <span className="text-[11px] text-muted">{level}</span>
            </div>
            <h2 className="font-heading text-[20px] font-bold">{c.title}</h2>
            <p className="mb-2 text-muted">By {c.creator.name} · {c.modules.length} modules · {lessonCount} lessons{totalSeconds ? ` · ${formatDuration(totalSeconds)}` : ''}</p>
            <p className="whitespace-pre-line">{c.description}</p>
          </section>

          <section className="card" aria-label="Curriculum">
            <h3 className="mb-2 font-heading text-[14px] font-bold">Curriculum</h3>
            {c.modules.length === 0 ? <p className="text-muted">The curriculum is being prepared.</p> : (
              <ol className="flex flex-col gap-3">
                {c.modules.map((m, i) => (
                  <li key={m.id}>
                    <b>Module {i + 1}: {m.title}</b>
                    <ul className="mt-1 flex flex-col gap-1">
                      {m.lessons.map((l) => (
                        <li key={l.id} className="flex items-center justify-between rounded-nav bg-page px-2.5 py-1.5">
                          {l.isPreview && !c.access
                            ? <Link to={`/student/preview/${c.id}/${l.id}`} className="text-navy underline">▶ {l.title}</Link>
                            : <span>{l.title}</span>}
                          <span className="flex items-center gap-2 text-[11px] text-muted">
                            {l.isPreview && <Pill tone="ok">Free preview</Pill>}
                            {formatDuration(l.durationSeconds)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ol>
            )}
            {c.quiz && (
              <p className="mt-3 rounded-nav bg-pill-in-bg px-2.5 py-1.5">
                Final quiz: {c.quiz.questions.length} questions · {c.quiz.timeLimitMinutes} min · pass mark {c.passMark}% · {c.maxAttempts} attempts. A certificate is issued when you pass.
              </p>
            )}
          </section>

          {c.assignments.length > 0 && (
            <section className="card" aria-label="Assignments">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="font-heading text-[14px] font-bold">Assignments</h3>
                {c.access && <Link to="/student/assignments" className="text-navy underline">Submit an assignment</Link>}
              </div>
              <ul className="flex flex-col gap-1">
                {c.assignments.map((a) => {
                  const mine = tasksData?.find((t) => t.id === a.id);
                  return (
                    <li key={a.id} className="flex flex-col gap-0.5 rounded-nav bg-page px-2.5 py-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <b className="min-w-0 truncate">{a.title}</b>
                        {c.access && (mine?.myStatus ? <AssignmentStatusPill status={mine.myStatus} /> : tasksData ? <Pill tone="wait">Not submitted</Pill> : null)}
                      </div>
                      {a.description && <span className="whitespace-pre-line text-[11px] text-muted">{a.description}</span>}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>

        <aside className="card flex flex-col gap-2 lg:sticky lg:top-3" aria-label="Get this course">
          {c.access ? (
            <>
              <div className="flex items-center justify-between"><b>Your access</b><AccessPill access={c.access} /></div>
              <p className="text-muted">
                {c.access === 'GRANT' ? 'Your instructor or admin gave you free access.' :
                  c.access === 'ANNUAL' ? 'Included in your annual package.' : 'This course is yours to keep.'}
              </p>
              <Link to={`/student/learn/${c.id}`} className="btn btn-primary btn-lg justify-center">Open course</Link>
              {learnStateData?.quiz.exists && (
                <QuizLock courseId={c.id}
                  lessonsDone={learnStateData.lessons.filter((l) => l.completed).length}
                  lessonsTotal={learnStateData.lessons.length}
                  passed={learnStateData.quiz.passed}
                  certificateId={learnStateData.quiz.certificateId}
                  noAttemptsLeft={!learnStateData.quiz.passed && !learnStateData.quiz.openAttemptId && learnStateData.quiz.attemptsUsed >= learnStateData.course.maxAttempts} />
              )}
            </>
          ) : (
            <>
              {single && <div className="font-heading text-[26px] font-bold">{formatMoney(single.priceMinor, single.currency)} <small className="text-[12px] font-medium text-muted">single course</small></div>}
              {single && <button className="btn btn-primary btn-lg justify-center" onClick={() => buy(`type=SINGLE&courseId=${c.id}`)}>Buy this course</button>}
              {(bundlesData ?? []).map((b) => (
                <div key={b.id} className="rounded-nav border border-line p-2">
                  <b className="block">{b.name}</b>
                  <span className="text-[11px] text-muted">{b.courses.length} courses</span>
                  <button className="btn mt-1.5 w-full justify-center" disabled={b.owned} onClick={() => buy(`type=BUNDLE&bundleId=${b.id}`)}>
                    {b.owned ? 'Already yours' : `Buy bundle · ${formatMoney(b.priceMinor, b.currency)}`}
                  </button>
                </div>
              ))}
              {annual && (
                <button className="btn btn-gold justify-center" onClick={() => buy('type=ANNUAL')}>
                  All courses for a year · {formatMoney(annual.priceMinor, annual.currency)}
                </button>
              )}
              {!single && !annual && <p className="text-muted">Purchases are not available right now.</p>}
              <ul className="mt-1 text-[11px] text-muted">
                <li>✔ Your instructor can also grant free access</li>
                <li>✔ Quiz and certificate included</li>
                <li>✔ Works on mobile</li>
              </ul>
            </>
          )}
        </aside>
      </div>
    </>
  );
}
