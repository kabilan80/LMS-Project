import type { Request, Response } from 'express';
import type { QuizInput } from '@lms/shared';
import { prisma } from '../config/prisma';
import { markCourseEdited, getStaffCourse } from './courseAccess';
import { parseId } from './helpers';

/** Builder saves the whole quiz in one request: replaces the questions and options. */
export async function saveQuiz(req: Request, res: Response) {
  const courseId = parseId(req.params['id']);
  const input = req.body as QuizInput;
  const course = await getStaffCourse(req, courseId);

  await prisma.$transaction(async (tx) => {
    const quiz = await tx.quiz.upsert({
      where: { courseId },
      update: { title: input.title, timeLimitMinutes: input.timeLimitMinutes },
      create: { courseId, title: input.title, timeLimitMinutes: input.timeLimitMinutes },
    });
    await tx.question.deleteMany({ where: { quizId: quiz.id } }); // options cascade
    for (const [i, q] of input.questions.entries()) {
      await tx.question.create({
        data: {
          quizId: quiz.id,
          text: q.text,
          order: i + 1,
          explanation: q.explanation ?? null,
          options: { create: q.options.map((o) => ({ text: o.text, isCorrect: o.isCorrect })) },
        },
      });
    }
    await markCourseEdited(tx, course);
  });
  res.json({ ok: true });
}
