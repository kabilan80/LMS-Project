import { CERTIFICATE_MIN_PERCENT } from './constants';

export interface ScoreQuestion {
  id: number;
  correctOptionId: number | null;
}
export interface ScoreAnswer {
  questionId: number;
  optionId: number | null;
}

/** Percent correct, rounded. Unanswered or unknown questions count as wrong. The first answer per question wins. */
export function scoreQuiz(questions: ScoreQuestion[], answers: ScoreAnswer[]) {
  const chosen = new Map<number, number | null>();
  for (const a of answers) if (!chosen.has(a.questionId)) chosen.set(a.questionId, a.optionId);
  let correct = 0;
  for (const q of questions) {
    if (q.correctOptionId !== null && chosen.get(q.id) === q.correctOptionId) correct++;
  }
  const total = questions.length;
  return { correct, total, percent: total === 0 ? 0 : Math.round((correct / total) * 100) };
}

/** The quiz pass mark that counts: the course's own pass mark, but never below what a certificate needs. */
export const effectivePassMark = (passMark: number) => Math.max(passMark, CERTIFICATE_MIN_PERCENT);

export const isPassing = (percent: number, passMark: number) => percent >= passMark;
