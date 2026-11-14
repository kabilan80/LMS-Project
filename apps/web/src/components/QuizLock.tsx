import { Link } from 'react-router-dom';
import { Pill } from './Pill';
import { ProgressBar } from './ProgressBar';

interface Props {
  courseId: number;
  lessonsDone: number;
  lessonsTotal: number;
  passed?: boolean;
  certificateId?: number | null;
  noAttemptsLeft?: boolean;
}

/** The final quiz as a card: locked until every lesson is done, then open. */
export function QuizLock({ courseId, lessonsDone, lessonsTotal, passed, certificateId, noAttemptsLeft }: Props) {
  const unlocked = lessonsTotal > 0 && lessonsDone >= lessonsTotal;
  const left = Math.max(0, lessonsTotal - lessonsDone);

  return (
    <div className="rounded-nav border border-line p-2.5" aria-label="Final quiz">
      <div className="mb-1 flex items-center justify-between gap-2">
        <b>{unlocked ? 'Final quiz' : '🔒 Final quiz'}</b>
        {passed ? <Pill tone="ok">Passed</Pill> : unlocked ? (noAttemptsLeft ? <Pill tone="bad">No attempts left</Pill> : <Pill tone="wait">Ready</Pill>) : <Pill tone="info">Locked</Pill>}
      </div>
      {!unlocked && (
        <>
          <ProgressBar value={lessonsDone} max={lessonsTotal} label="Lessons finished" />
          <p className="my-1.5 text-[11px] text-muted">
            {lessonsDone} of {lessonsTotal} lessons done. Finish {left} more lesson{left === 1 ? '' : 's'} to unlock the quiz.
          </p>
        </>
      )}
      {certificateId ? <Link to="/student/certificates" className="btn btn-gold w-full justify-center">Certificate</Link> :
        unlocked && !passed && !noAttemptsLeft ? <Link to={`/student/quiz/${courseId}`} className="btn btn-primary w-full justify-center">Open quiz</Link> :
        !unlocked ? <button type="button" className="btn w-full justify-center" disabled>Locked</button> : null}
    </div>
  );
}
