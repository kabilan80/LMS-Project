import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import type { MyCourse } from '@lms/shared';
import { Pill } from '../../components/Pill';
import { EmptyState, ErrorBlock, LoadingBlock } from '../../components/Status';
import useApi from '../../hooks/useApi';
import { getMyCourses } from '../../services/learningService';

function StatusPill({ c, outOfAttempts }: { c: MyCourse; outOfAttempts: boolean }) {
  if (c.quizPassed) return <Pill tone="ok">Passed{c.quizBestPercent !== null ? ` · ${c.quizBestPercent}%` : ''}</Pill>;
  if (!c.allLessonsDone) return <Pill tone="info">Locked · {c.completedLessons}/{c.totalLessons} lessons</Pill>;
  if (outOfAttempts) return <Pill tone="bad">No attempts left{c.quizBestPercent !== null ? ` · best ${c.quizBestPercent}%` : ''}</Pill>;
  return <Pill tone="wait">Ready{c.quizBestPercent !== null ? ` · best ${c.quizBestPercent}%` : ''}</Pill>;
}

/** Every quiz of every course the student can open: locked, ready, passed or finished. Passed quizzes stay here. */
export function QuizzesPage() {
  const { data: myCoursesData, error: myCoursesError, callAPI: getMyCoursesAPI } = useApi(getMyCourses);
  const load = () => getMyCoursesAPI().catch(() => undefined);
  useEffect(() => { void load(); }, []);
  if (!myCoursesData && !myCoursesError) return <LoadingBlock />;
  if (myCoursesError) return <ErrorBlock message={myCoursesError} onRetry={() => void load()} />;
  const rows = (myCoursesData ?? []).filter((c) => c.hasQuiz);
  if (rows.length === 0) return <EmptyState title="No quizzes yet" message="Each course has one final quiz. It unlocks when you finish all lessons." />;

  return (
    <div className="card overflow-x-auto p-0">
      <table className="w-full min-w-[620px] text-left">
        <thead><tr className="border-b border-line text-muted">
          <th className="px-3.5 py-2.5 font-semibold">Course</th>
          <th className="px-3.5 py-2.5 font-semibold">Status</th>
          <th className="px-3.5 py-2.5 font-semibold">Attempts</th>
          <th className="px-3.5 py-2.5" />
        </tr></thead>
        <tbody>
          {rows.map((c) => {
            const out = !c.quizPassed && c.quizAttemptsUsed >= c.maxAttempts;
            return (
              <tr key={c.id} className="border-b border-line-soft last:border-0">
                <td className="px-3.5 py-2.5"><b>{c.allLessonsDone || c.quizPassed ? '' : '🔒 '}{c.title}</b></td>
                <td className="px-3.5 py-2.5"><StatusPill c={c} outOfAttempts={out} /></td>
                <td className="px-3.5 py-2.5 text-muted">{c.quizAttemptsUsed} of {c.maxAttempts}</td>
                <td className="px-3.5 py-2.5">
                  <span className="flex flex-wrap items-center justify-end gap-2">
                    {c.lastAttemptId && <Link to={`/student/quiz-result/${c.lastAttemptId}`} className="btn">View result</Link>}
                    {c.certificateId && <Link to="/student/certificates" className="btn btn-gold">Certificate</Link>}
                    {!c.quizPassed && c.allLessonsDone && !out && <Link to={`/student/quiz/${c.id}`} className="btn btn-primary">{c.quizAttemptsUsed > 0 ? 'Try again' : 'Open quiz'}</Link>}
                    {!c.quizPassed && !c.allLessonsDone && <Link to={`/student/learn/${c.id}`} className="btn">Go to lessons</Link>}
                    {!c.quizPassed && c.allLessonsDone && out && <Link to={`/student/learn/${c.id}`} className="btn">Go to lessons</Link>}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
