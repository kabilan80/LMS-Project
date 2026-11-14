import { useEffect, useRef } from 'react';
import { Link, useParams } from 'react-router-dom';
import { LessonPlayer } from '../../components/LessonPlayer';
import { Pill } from '../../components/Pill';
import { ProgressBar } from '../../components/ProgressBar';
import { QuizLock } from '../../components/QuizLock';
import { EmptyState, ErrorBlock, LoadingBlock } from '../../components/Status';
import useApi from '../../hooks/useApi';
import { getLearnState, getLesson } from '../../services/learningService';
import { formatDuration } from '../../utils/format';

/** The video lesson screen: player on the left, lesson list with ticks and locks on the right. */
export function LearnPage() {
  const params = useParams();
  const courseId = Number(params['courseId']);
  const { data: learnStateData, error: learnStateError, callAPI: getLearnStateAPI } = useApi(getLearnState);
  const validId = Number.isInteger(courseId) && courseId > 0;
  const loadState = () => getLearnStateAPI(courseId).catch(() => undefined);
  useEffect(() => { if (validId) void loadState(); }, [courseId]);
  const lessons = learnStateData?.lessons ?? [];
  const requested = params['lessonId'] ? Number(params['lessonId']) : null;
  const activeId = requested ?? lessons.find((l) => !l.completed && !l.locked)?.id ?? lessons[0]?.id ?? null;
  const active = lessons.find((l) => l.id === activeId);

  const { data: lessonData, error: lessonError, callAPI: getLessonAPI, reset: resetLesson } = useApi(getLesson);
  const playable = !!(activeId && active && !active.locked);
  const loadLesson = () => (activeId ? getLessonAPI(activeId).catch(() => undefined) : undefined);
  useEffect(() => {
    if (playable) void loadLesson();
    else resetLesson();
  }, [activeId, playable]);
  const refetched = useRef(new Set<number>());

  if (!validId) return <EmptyState title="Course not found" />;
  if (!learnStateData && !learnStateError) return <LoadingBlock />;
  if (learnStateError || !learnStateData) {
    return (
      <>
        <Link to="/student/courses" className="text-navy underline">← Back to courses</Link>
        <ErrorBlock message={learnStateError ?? 'Could not load this course'} onRetry={() => void loadState()} />
      </>
    );
  }

  const s = learnStateData;
  const done = lessons.filter((l) => l.completed).length;
  const firstOpen = lessons.find((l) => !l.completed && !l.locked);
  const lesson = lessonData;
  const nextId = lesson?.nextLessonId ?? null;
  const nextLesson = lessons.find((l) => l.id === nextId);

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <Link to={`/student/courses/${courseId}`} className="text-muted underline">← Course details</Link>
        <h2 className="font-heading text-[18px] font-bold">{s.course.title}</h2>
        <span className="ml-auto text-muted">{done} of {lessons.length} lessons complete</span>
      </div>
      <ProgressBar value={done} max={lessons.length} label="Course progress" />

      {lessons.length === 0 ? <EmptyState title="No lessons yet" message="This course has no lessons." /> : (
        <div className="grid items-start gap-3 lg:grid-cols-[1fr_320px]">
          <section className="flex min-w-0 flex-col gap-3">
            {active?.locked ? (
              <div className="card py-10 text-center">
                <b className="font-heading text-[15px]">🔒 This lesson is locked</b>
                <p className="mb-3 mt-1 text-muted">Lessons unlock in order. Finish the one before it first.</p>
                {firstOpen && <Link to={`/student/learn/${courseId}/${firstOpen.id}`} className="btn btn-primary">Go to lesson {firstOpen.number}</Link>}
              </div>
            ) : !lesson && !lessonError ? <LoadingBlock /> : lessonError || !lesson ? (
              <ErrorBlock message={lessonError ?? 'Could not load this lesson'} onRetry={() => void loadLesson()} />
            ) : (
              <>
                <LessonPlayer
                  key={lesson.id}
                  lesson={lesson}
                  track
                  onResult={(r) => {
                    // Refresh ticks and locks once, when a lesson first becomes complete.
                    if (r.completed && !refetched.current.has(lesson.id) && !active?.completed) {
                      refetched.current.add(lesson.id);
                      void loadState();
                    }
                  }}
                />
                <div className="card flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-heading text-[16px] font-bold">{lesson.title}</h3>
                    <span className="text-muted">Lesson {active?.number} · {active?.moduleTitle}</span>
                  </div>
                  {active?.completed ? <Pill tone="ok">Completed</Pill> : <Pill tone="wait">Watch to complete</Pill>}
                  <Link to="/student/doubts" className="btn">Ask a doubt</Link>
                  {nextLesson && active?.completed && (
                    <Link to={`/student/learn/${courseId}/${nextLesson.id}`} className="btn btn-primary">Next lesson →</Link>
                  )}
                </div>
                <p className="text-[11px] text-muted">A lesson completes when you watch at least 90% of it or reach the end. Your place is saved automatically.</p>
              </>
            )}

            {s.allCompleted && (
              <div className="card flex flex-wrap items-center gap-3 border-gold bg-pill-wa-bg">
                <div className="min-w-0 flex-1">
                  <b className="block">{s.quiz.passed ? 'You passed the final quiz 🎉' : 'All lessons complete'}</b>
                  <span className="text-pill-wa">
                    {s.quiz.passed ? (s.quiz.certificateId ? 'Your certificate is ready.' : s.quiz.assignmentsBelowMin ? 'Your assignment marks are below 70% or you used all attempts on an assignment, so no certificate can be issued.' : `Your certificate is issued after your instructor accepts ${s.quiz.assignmentsPending} more assignment${s.quiz.assignmentsPending === 1 ? '' : 's'}.`) : s.quiz.exists ? 'The final quiz is unlocked.' : 'The final quiz is not ready yet.'}
                  </span>
                </div>
                {s.quiz.certificateId ? <Link to="/student/certificates" className="btn btn-gold">View certificate</Link> :
                  s.quiz.passed && !s.quiz.assignmentsBelowMin ? <Link to="/student/assignments" className="btn btn-gold">Go to assignments</Link> :
                  s.quiz.exists && <Link to={`/student/quiz/${courseId}`} className="btn btn-gold">{s.quiz.openAttemptId ? 'Resume quiz' : 'Take the final quiz'}</Link>}
              </div>
            )}
          </section>

          <aside className="card p-2" aria-label="Lessons">
            <ol className="flex flex-col gap-0.5">
              {lessons.map((l, i) => {
                const newModule = i === 0 || lessons[i - 1]?.moduleTitle !== l.moduleTitle;
                return (
                  <li key={l.id}>
                    {newModule && <div className="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted">{l.moduleTitle}</div>}
                    {l.locked ? (
                      <div className="flex items-center gap-2 rounded-nav px-2 py-1.5 text-muted" aria-disabled="true">
                        <span aria-hidden="true">🔒</span><span className="min-w-0 flex-1 truncate">{l.number}. {l.title}</span>
                      </div>
                    ) : (
                      <Link to={`/student/learn/${courseId}/${l.id}`} aria-current={l.id === activeId ? 'true' : undefined}
                        className={`flex items-center gap-2 rounded-nav px-2 py-1.5 ${l.id === activeId ? 'bg-pill-in-bg font-semibold' : 'hover:bg-page'}`}>
                        <span aria-hidden="true" className={l.completed ? 'text-success' : 'text-navy'}>{l.completed ? '✔' : '▶'}</span>
                        <span className="min-w-0 flex-1 truncate">{l.number}. {l.title}</span>
                        <span className="text-[11px] text-muted">{formatDuration(l.durationSeconds)}</span>
                      </Link>
                    )}
                  </li>
                );
              })}
            </ol>
            {s.quiz.exists && (
              <div className="mt-2 border-t border-line-soft px-1 pt-2">
                <QuizLock courseId={courseId} lessonsDone={done} lessonsTotal={lessons.length}
                  passed={s.quiz.passed} certificateId={s.quiz.certificateId}
                  noAttemptsLeft={!s.quiz.passed && !s.quiz.openAttemptId && s.quiz.attemptsUsed >= s.course.maxAttempts} />
              </div>
            )}
          </aside>
        </div>
      )}
    </>
  );
}
