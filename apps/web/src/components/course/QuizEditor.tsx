import { useState } from 'react';
import { quizInputSchema, type CourseDetail } from '@lms/shared';
import useApi from '../../hooks/useApi';
import { saveCourseQuiz } from '../../services/courseService';

interface DraftOption { text: string; isCorrect: boolean }
interface DraftQuestion { text: string; explanation: string; options: DraftOption[] }

const blankQuestion = (): DraftQuestion => ({
  text: '',
  explanation: '',
  options: [{ text: '', isCorrect: true }, { text: '', isCorrect: false }],
});

export function QuizEditor({ course, onSaved }: { course: CourseDetail; onSaved: () => void | Promise<void> }) {
  const locked = !course.canEdit;
  const [title, setTitle] = useState(course.quiz?.title ?? 'Final quiz');
  const [minutes, setMinutes] = useState(String(course.quiz?.timeLimitMinutes ?? 30));
  const [questions, setQuestions] = useState<DraftQuestion[]>(
    course.quiz?.questions.map((q) => ({
      text: q.text,
      explanation: q.explanation ?? '',
      options: q.options.map((o) => ({ text: o.text, isCorrect: o.isCorrect ?? false })),
    })) ?? [],
  );
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const { loading: saveLoading, error: saveError, callAPI: saveCourseQuizAPI } = useApi(saveCourseQuiz);
  const busy = saveLoading;

  const edit = (fn: (q: DraftQuestion[]) => DraftQuestion[]) => { setSaved(false); setQuestions(fn); };
  const patchQ = (qi: number, patch: Partial<DraftQuestion>) =>
    edit((qs) => qs.map((q, i) => (i === qi ? { ...q, ...patch } : q)));
  const patchO = (qi: number, oi: number, patch: Partial<DraftOption>) =>
    edit((qs) => qs.map((q, i) => (i === qi ? { ...q, options: q.options.map((o, j) => (j === oi ? { ...o, ...patch } : o)) } : q)));
  const markCorrect = (qi: number, oi: number) =>
    edit((qs) => qs.map((q, i) => (i === qi ? { ...q, options: q.options.map((o, j) => ({ ...o, isCorrect: j === oi })) } : q)));

  async function save() {
    setError(null);
    const parsed = quizInputSchema.safeParse({
      title,
      timeLimitMinutes: Number(minutes),
      questions: questions.map((q) => ({ text: q.text, explanation: q.explanation || undefined, options: q.options })),
    });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const where = issue && issue.path[0] === 'questions' && typeof issue.path[1] === 'number' ? `Question ${issue.path[1] + 1}: ` : '';
      return setError(`${where}${issue?.message ?? 'Check the quiz'}`);
    }
    try {
      await saveCourseQuizAPI(course.id, parsed.data);
    } catch {
      return; // saveQuiz.error is shown below
    }
    setSaved(true);
    await onSaved();
  }

  return (
    <section className="card" aria-label="Final quiz">
      <h5 className="mb-1 font-heading text-[14px] font-bold">Final quiz</h5>
      <p className="mb-3 text-muted">Unlocks after a student completes every lesson. One correct answer per question. Pass mark: {course.passMark}%.</p>
      {(error ?? saveError) && <div role="alert" className="mb-3 rounded-ctl bg-pill-bad-bg px-3 py-2 text-pill-bad">{error ?? saveError}</div>}
      <fieldset disabled={locked} className="min-w-0">
        <div className="mb-3 grid gap-3 sm:grid-cols-[1fr_160px]">
          <div><label htmlFor="q-title" className="mb-[3px] block text-xs font-semibold">Quiz title</label>
            <input id="q-title" className="input" value={title} onChange={(e) => { setSaved(false); setTitle(e.target.value); }} /></div>
          <div><label htmlFor="q-min" className="mb-[3px] block text-xs font-semibold">Time limit (min)</label>
            <input id="q-min" type="number" min={1} max={240} className="input" value={minutes} onChange={(e) => { setSaved(false); setMinutes(e.target.value); }} /></div>
        </div>

        {questions.length === 0 && <p className="mb-3 text-muted">No questions yet.</p>}
        <div className="flex flex-col gap-3">
          {questions.map((q, qi) => (
            <div key={qi} className="rounded-ctl border border-line p-3">
              <div className="mb-2 flex items-center justify-between">
                <b>Question {qi + 1}</b>
                {!locked && <button type="button" className="text-danger underline" onClick={() => edit((qs) => qs.filter((_, i) => i !== qi))}>Remove</button>}
              </div>
              <textarea rows={2} className="input mb-2" aria-label={`Question ${qi + 1} text`} placeholder="Question text" value={q.text} onChange={(e) => patchQ(qi, { text: e.target.value })} />
              {q.options.map((o, oi) => (
                <div key={oi} className="mb-1.5 flex items-center gap-2">
                  <input type="radio" name={`correct-${qi}`} aria-label={`Mark option ${oi + 1} correct`} checked={o.isCorrect} onChange={() => markCorrect(qi, oi)} />
                  <input className="input" aria-label={`Question ${qi + 1} option ${oi + 1}`} placeholder={`Option ${oi + 1}`} value={o.text} onChange={(e) => patchO(qi, oi, { text: e.target.value })} />
                  {!locked && q.options.length > 2 && (
                    <button type="button" className="btn" aria-label="Remove option"
                      onClick={() => edit((qs) => qs.map((qq, i) => {
                        if (i !== qi) return qq;
                        const options = qq.options.filter((_, j) => j !== oi);
                        if (!options.some((x) => x.isCorrect) && options[0]) options[0] = { ...options[0], isCorrect: true };
                        return { ...qq, options };
                      }))}>✕</button>
                  )}
                </div>
              ))}
              {!locked && q.options.length < 6 && (
                <button type="button" className="btn mt-1" onClick={() => patchQ(qi, { options: [...q.options, { text: '', isCorrect: false }] })}>+ Add option</button>
              )}
              <input className="input mt-2" aria-label={`Question ${qi + 1} explanation`} placeholder="Explanation shown after the quiz (optional)" value={q.explanation} onChange={(e) => patchQ(qi, { explanation: e.target.value })} />
            </div>
          ))}
        </div>
      </fieldset>
      {!locked && (
        <div className="mt-3 flex items-center gap-3">
          <button type="button" className="btn" onClick={() => edit((qs) => [...qs, blankQuestion()])}>+ Add question</button>
          <button type="button" className="btn btn-primary disabled:opacity-60" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save quiz'}</button>
          {saved && <span className="text-success" role="status">Quiz saved</span>}
        </div>
      )}
    </section>
  );
}
