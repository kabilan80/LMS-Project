import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { QuizStart } from '@lms/shared';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { QuizLock } from '../../components/QuizLock';
import { EmptyState, ErrorBlock, LoadingBlock } from '../../components/Status';
import useApi from '../../hooks/useApi';
import { getLearnState, startQuiz, submitQuiz } from '../../services/learningService';

const clock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

export function QuizPage() {
  const courseId = Number(useParams()['courseId']);
  const { data: learnStateData, error: learnStateError, callAPI: getLearnStateAPI } = useApi(getLearnState);
  const loadState = () => getLearnStateAPI(courseId).catch(() => undefined);
  useEffect(() => { if (Number.isInteger(courseId) && courseId > 0) void loadState(); }, [courseId]);
  const [attempt, setAttempt] = useState<QuizStart | null>(null);
  const { loading: startLoading, error: startError, callAPI: startQuizAPI } = useApi(startQuiz);
  const [confirmStep, setConfirmStep] = useState<0 | 1 | 2>(0);
  const [understood, setUnderstood] = useState(false);

  if (!Number.isInteger(courseId) || courseId <= 0) return <EmptyState title="Course not found" />;
  if (attempt) return <QuizTaker attempt={attempt} />;
  if (!learnStateData && !learnStateError) return <LoadingBlock />;
  if (learnStateError || !learnStateData) return <ErrorBlock message={learnStateError ?? 'Could not load the quiz'} onRetry={() => void loadState()} />;

  const s = learnStateData;
  const q = s.quiz;
  const attemptsLeft = Math.max(0, s.course.maxAttempts - q.attemptsUsed - (q.openAttemptId ? 1 : 0));
  const blocked = !s.allCompleted ? 'Finish every lesson to unlock the quiz.' :
    !q.exists ? 'This course does not have a quiz yet.' :
    q.passed ? 'You already passed this quiz.' :
    !q.openAttemptId && attemptsLeft === 0 ? 'You have used all your attempts.' : null;

  async function start() {
    try {
      setAttempt(await startQuizAPI(courseId));
    } catch {
      // startAction.error is already set
    }
    setConfirmStep(0);
    setUnderstood(false);
  }
  const closeConfirm = () => { setConfirmStep(0); setUnderstood(false); };

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-3">
      <Link to={`/student/learn/${courseId}`} className="text-navy underline">← Back to lessons</Link>
      <section className="card">
        <h2 className="font-heading text-[18px] font-bold">{q.title ?? 'Final quiz'}</h2>
        <p className="mb-3 text-muted">{s.course.title}</p>
        <ul className="mb-3 flex flex-col gap-1">
          <li>{q.questionCount} questions</li>
          <li>Time limit: {q.timeLimitMinutes} minutes</li>
          <li>Pass mark: {s.course.passMark}%</li>
          <li>Attempts used: {q.attemptsUsed} of {s.course.maxAttempts}</li>
        </ul>
        <p className="mb-3 rounded-nav bg-pill-wa-bg px-2.5 py-2 text-pill-wa">The timer starts as soon as you begin and keeps running if you leave the page. Once you submit, you cannot change your answers.</p>
        {startError && <ErrorBlock message={startError} />}
        {!s.allCompleted && (
          <div className="mb-3">
            <QuizLock courseId={courseId} lessonsDone={s.lessons.filter((l) => l.completed).length} lessonsTotal={s.lessons.length} />
          </div>
        )}
        {blocked ? (
          <div className="flex items-center gap-3"><span className="text-muted">{blocked}</span>
            {q.certificateId && <Link to="/student/certificates" className="btn btn-gold">View certificate</Link>}</div>
        ) : (
          <button className="btn btn-primary btn-lg disabled:opacity-60" disabled={startLoading} onClick={() => (q.openAttemptId ? void start() : setConfirmStep(1))}>
            {startLoading ? 'Starting…' : q.openAttemptId ? 'Resume attempt' : 'Start quiz'}
          </button>
        )}
      </section>

      {confirmStep === 1 && (
        <ConfirmDialog title="Before you start the quiz" confirmLabel="I understand, continue" cancelLabel="Not now" onConfirm={() => setConfirmStep(2)} onCancel={closeConfirm}>
          <p>Please read these rules carefully:</p>
          <ul className="list-disc pl-5">
            <li>You <b>cannot exit</b> the quiz once it has started.</li>
            <li>You must <b>answer all {q.questionCount} questions</b>. The quiz is complete only when every question is answered, or when the timer runs out.</li>
            <li>You have <b>{q.timeLimitMinutes} minutes</b>. The timer keeps running even if you close the page, and unanswered questions are marked wrong when it ends.</li>
            <li>This is attempt {q.attemptsUsed + 1} of {s.course.maxAttempts}. Pass mark: {s.course.passMark}%.</li>
          </ul>
        </ConfirmDialog>
      )}
      {confirmStep === 2 && (
        <ConfirmDialog title="Final confirmation" confirmLabel="Yes, start quiz now" cancelLabel="Go back" busy={startLoading} confirmDisabled={!understood} onConfirm={() => void start()} onCancel={closeConfirm}>
          <p>The timer starts the moment you confirm.</p>
          <label className="flex items-start gap-2">
            <input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} className="mt-0.5" />
            <span>I am ready, I will answer all questions, and I understand I cannot leave until I submit or time runs out.</span>
          </label>
        </ConfirmDialog>
      )}
    </div>
  );
}

function QuizTaker({ attempt }: { attempt: QuizStart }) {
  const navigate = useNavigate();
  const deadline = new Date(attempt.deadline).getTime();
  const [now, setNow] = useState(() => Date.now());
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [confirmStep, setConfirmStep] = useState<0 | 1 | 2>(0);
  const [notice, setNotice] = useState<string | null>(null);
  const { loading: submitLoading, error: submitError, callAPI: submitQuizAPI } = useApi(submitQuiz);
  const busy = submitLoading;
  const submitted = useRef(false);

  async function submit() {
    if (submitted.current) return;
    submitted.current = true;
    try {
      const result = await submitQuizAPI(
        attempt.attemptId,
        attempt.questions.map((q) => ({ questionId: q.id, optionId: answers[q.id] ?? null })),
      );
      navigate(`/student/quiz-result/${result.attemptId}`, { replace: true });
    } catch {
      submitted.current = false; // allow a retry; submitAction.error is already set
      setConfirmStep(0);
    }
  }

  // No exit during the quiz: warn on reload/close, swallow in-app links and the back button.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    const stopLinks = (e: MouseEvent) => {
      if ((e.target as HTMLElement | null)?.closest('a[href]')) {
        e.preventDefault();
        e.stopPropagation();
        setNotice('You cannot leave the quiz. Answer all questions and submit, or wait for the timer to end.');
      }
    };
    const stopBack = () => {
      window.history.pushState(null, '', window.location.href);
      setNotice('You cannot leave the quiz. Answer all questions and submit, or wait for the timer to end.');
    };
    window.history.pushState(null, '', window.location.href);
    window.addEventListener('beforeunload', warn);
    window.addEventListener('popstate', stopBack);
    document.addEventListener('click', stopLinks, true);
    return () => {
      window.removeEventListener('beforeunload', warn);
      window.removeEventListener('popstate', stopBack);
      document.removeEventListener('click', stopLinks, true);
    };
  }, []);

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  const remaining = deadline - now;
  useEffect(() => {
    if (remaining <= 0) void submit(); // time is up: send what we have (the only way to finish with gaps)
  });

  const q = attempt.questions[index];
  const answered = Object.keys(answers).length;
  const allAnswered = answered === attempt.questions.length;
  if (!q) return <EmptyState title="This quiz has no questions" />;

  return (
    <div className="grid items-start gap-3 lg:grid-cols-[1fr_240px]">
      <section className="card flex flex-col gap-3" aria-label={`Question ${index + 1} of ${attempt.questions.length}`}>
        <div className="flex items-center justify-between">
          <span className="text-muted">Question {index + 1} of {attempt.questions.length}</span>
          <b className={`font-heading text-[16px] ${remaining < 60_000 ? 'text-danger' : ''}`} role="timer" aria-live="off">⏱ {clock(remaining)}</b>
        </div>
        <h2 className="font-heading text-[16px] font-bold">{q.text}</h2>
        <div role="radiogroup" aria-label="Answers" className="flex flex-col gap-2">
          {q.options.map((o) => {
            const selected = answers[q.id] === o.id;
            return (
              <label key={o.id} className={`flex cursor-pointer items-center gap-2.5 rounded-ctl border px-3 py-2.5 ${selected ? 'border-navy bg-pill-in-bg' : 'border-line hover:bg-page'}`}>
                <input type="radio" name={`q-${q.id}`} checked={selected} onChange={() => setAnswers((a) => ({ ...a, [q.id]: o.id }))} />
                {o.text}
              </label>
            );
          })}
        </div>
        {submitError && <ErrorBlock message={submitError} />}
        {notice && <p role="alert" className="rounded-nav bg-pill-wa-bg px-2.5 py-2 text-pill-wa">{notice}</p>}
        <div className="flex items-center justify-between gap-2">
          <button className="btn" disabled={index === 0} onClick={() => setIndex((i) => i - 1)}>← Previous</button>
          {index < attempt.questions.length - 1 ? (
            <button className="btn btn-primary" onClick={() => setIndex((i) => i + 1)}>Next →</button>
          ) : (
            <button className="btn btn-gold disabled:opacity-60" disabled={busy || !allAnswered} onClick={() => setConfirmStep(1)}>Submit quiz</button>
          )}
        </div>
      </section>

      <aside className="card" aria-label="Question navigator">
        <b className="mb-2 block">Questions</b>
        <div className="flex flex-wrap gap-1.5">
          {attempt.questions.map((x, i) => (
            <button key={x.id} aria-label={`Go to question ${i + 1}${answers[x.id] ? ' (answered)' : ''}`} aria-current={i === index ? 'true' : undefined}
              onClick={() => setIndex(i)}
              className={`grid h-8 w-8 place-items-center rounded-ctl border font-semibold ${i === index ? 'border-navy bg-navy text-white' : answers[x.id] ? 'border-success bg-pill-ok-bg text-success' : 'border-line'}`}>
              {i + 1}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-muted">{answered} of {attempt.questions.length} answered</p>
        {!allAnswered && <p className="mt-1 text-[11px] text-pill-wa">Answer all questions to enable Submit.</p>}
        <button className="btn mt-2 w-full justify-center disabled:opacity-60" disabled={busy || !allAnswered} onClick={() => setConfirmStep(1)}>Submit quiz</button>
      </aside>

      {confirmStep === 1 && (
        <ConfirmDialog title="Submit your quiz?" confirmLabel="Continue" onConfirm={() => setConfirmStep(2)} onCancel={() => setConfirmStep(0)}>
          <p>You have answered <b>all {attempt.questions.length}</b> questions.</p>
          <p className="rounded-nav bg-pill-bad-bg px-2.5 py-2 text-pill-bad"><b>This is final.</b> After you submit, you cannot change your answers.</p>
        </ConfirmDialog>
      )}
      {confirmStep === 2 && (
        <ConfirmDialog title="Are you absolutely sure?" confirmLabel="Yes, submit quiz" busy={busy} onConfirm={() => void submit()} onCancel={() => setConfirmStep(0)}>
          <p>Your answers will be submitted and graded now. You cannot undo this.</p>
        </ConfirmDialog>
      )}
    </div>
  );
}
