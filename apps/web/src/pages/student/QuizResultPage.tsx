import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Pill } from '../../components/Pill';
import { EmptyState, ErrorBlock, LoadingBlock } from '../../components/Status';
import useApi from '../../hooks/useApi';
import { getQuizAttempt } from '../../services/learningService';

export function QuizResultPage() {
  const attemptId = Number(useParams()['attemptId']);
  const { data: quizAttempt, error: quizAttemptError, callAPI: getQuizAttemptAPI } = useApi(getQuizAttempt);
  const validId = Number.isInteger(attemptId) && attemptId > 0;
  const load = () => getQuizAttemptAPI(attemptId).catch(() => undefined);
  useEffect(() => { if (validId) void load(); }, [attemptId]);

  if (!validId) return <EmptyState title="Result not found" />;
  if (!quizAttempt && !quizAttemptError) return <LoadingBlock />;
  if (quizAttemptError || !quizAttempt) return <ErrorBlock message={quizAttemptError ?? 'Could not load the result'} onRetry={() => void load()} />;

  const canRetry = !quizAttempt.passed && quizAttempt.attemptsUsed < quizAttempt.maxAttempts;
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-3">
      <section className="card text-center">
        <Pill tone={quizAttempt.passed ? 'ok' : 'bad'}>{quizAttempt.passed ? 'Passed' : quizAttempt.timedOut ? 'Time ran out' : 'Not passed'}</Pill>
        <div className="my-2 font-heading text-[44px] font-bold leading-none">{quizAttempt.scorePercent}%</div>
        <p className="text-muted">{quizAttempt.courseTitle}</p>
        <p className="mt-1">{quizAttempt.correct} of {quizAttempt.total} correct · pass mark {quizAttempt.passMark}% · attempt {quizAttempt.attemptsUsed} of {quizAttempt.maxAttempts}</p>
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          {quizAttempt.certificateId && <Link to="/student/certificates" className="btn btn-gold">View certificate</Link>}
          {quizAttempt.passed && !quizAttempt.certificateId && !quizAttempt.assignmentsBelowMin && quizAttempt.assignmentsPending > 0 && <Link to="/student/assignments" className="btn btn-gold">Go to assignments</Link>}
          {canRetry && <Link to={`/student/quiz/${quizAttempt.courseId}`} className="btn btn-primary">Try again</Link>}
          <Link to={`/student/learn/${quizAttempt.courseId}`} className="btn">Back to course</Link>
        </div>
        {quizAttempt.passed && !quizAttempt.certificateId && !quizAttempt.assignmentsBelowMin && quizAttempt.assignmentsPending > 0 && (
          <p className="mt-2 rounded-nav bg-pill-wa-bg px-2.5 py-2 text-pill-wa" role="status">
            Quiz passed. Your certificate is issued once your instructor accepts your assignments ({quizAttempt.assignmentsPending} of {quizAttempt.assignmentsRequired} still to be accepted).
          </p>
        )}
        {quizAttempt.passed && !quizAttempt.certificateId && quizAttempt.assignmentsBelowMin && (
          <p className="mt-2 rounded-nav bg-pill-bad-bg px-2.5 py-2 text-pill-bad" role="status">
            Quiz passed, but your assignment marks are below 70% or you used all attempts on an assignment, so no certificate can be issued.
          </p>
        )}
        {!quizAttempt.passed && !canRetry && <p className="mt-2 text-muted">You have used all attempts. Ask your instructor for help.</p>}
      </section>

      <section className="card" aria-label="Answer review">
        <h3 className="mb-2 font-heading text-[14px] font-bold">Review your answers</h3>
        {quizAttempt.timedOut ? <p className="text-muted">This attempt was closed when time ran out, so there are no answers to review.</p> : (
          <ol className="flex flex-col gap-4">
            {quizAttempt.review.map((q, i) => {
              const right = q.selectedOptionId !== null && q.selectedOptionId === q.correctOptionId;
              return (
                <li key={q.questionId}>
                  <b className="block">{i + 1}. {q.text} <span className={right ? 'text-success' : 'text-danger'}>{right ? '✔ Correct' : q.selectedOptionId === null ? '✘ Not answered' : '✘ Incorrect'}</span></b>
                  <ul className="mt-1 flex flex-col gap-1">
                    {q.options.map((o) => {
                      const isCorrect = o.id === q.correctOptionId;
                      const isChosen = o.id === q.selectedOptionId;
                      return (
                        <li key={o.id} className={`rounded-nav px-2.5 py-1.5 ${isCorrect ? 'bg-pill-ok-bg text-pill-ok' : isChosen ? 'bg-pill-bad-bg text-pill-bad' : 'bg-page'}`}>
                          {isCorrect ? '✔ ' : isChosen ? '✘ ' : ''}{o.text}{isChosen && ' (your answer)'}
                        </li>
                      );
                    })}
                  </ul>
                  {q.explanation && <p className="mt-1 text-muted">{q.explanation}</p>}
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}
