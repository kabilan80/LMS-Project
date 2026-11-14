import type { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { CERTIFICATE_MIN_PERCENT, effectivePassMark, isPassing, scoreQuiz, type QuizStart, type QuizResult, type SubmitQuizInput } from '@lms/shared';
import { prisma } from '../config/prisma';
import { log } from '../lib/log';
import { badRequest, conflict, notFound } from '../middleware/errors';
import { getAssignmentProgress, issueCertificateIfEligible } from '../services/certificates';
import { quizDeadline, closeOldAttempts, isLate, getLessons } from '../services/learning';
import { checkCourseAccess } from './learning.controller';
import { parseId } from './helpers';

const questionInclude = { options: { orderBy: { id: 'asc' } } } satisfies Prisma.QuestionInclude;

async function loadQuestions(quizId: number) {
  return prisma.question.findMany({ where: { quizId }, orderBy: { order: 'asc' }, include: questionInclude });
}

function toQuizStart(
  attempt: { id: number; startedAt: Date },
  quiz: { title: string; timeLimitMinutes: number },
  courseId: number,
  questions: Awaited<ReturnType<typeof loadQuestions>>,
): QuizStart {
  return {
    attemptId: attempt.id,
    courseId,
    title: quiz.title,
    startedAt: attempt.startedAt.toISOString(),
    deadline: quizDeadline(attempt.startedAt, quiz.timeLimitMinutes).toISOString(),
    timeLimitMinutes: quiz.timeLimitMinutes,
    // The correct answers never leave the server while the quiz is open.
    questions: questions.map((q) => ({ id: q.id, text: q.text, options: q.options.map((o) => ({ id: o.id, text: o.text })) })),
  };
}

/** Starts (or resumes) an attempt. Needs every lesson complete and attempts left. */
export async function startQuiz(req: Request, res: Response) {
  const studentId = req.auth!.id;
  const courseId = parseId(req.params['id']);
  const course = await checkCourseAccess(studentId, courseId);
  const quiz = course.quiz;
  if (!quiz || quiz._count.questions === 0) throw notFound('This course has no quiz yet');

  const lessons = await getLessons(courseId, studentId);
  if (lessons.length === 0 || !lessons.every((l) => l.completed)) throw conflict('Finish all lessons to unlock the quiz');

  const now = new Date();
  await closeOldAttempts(studentId, quiz.id, quiz.timeLimitMinutes, now);
  const attempts = await prisma.quizAttempt.findMany({ where: { studentId, quizId: quiz.id }, select: { id: true, startedAt: true, submittedAt: true, passed: true } });

  const open = attempts.find((a) => a.submittedAt === null);
  if (open) return void res.json(toQuizStart(open, quiz, courseId, await loadQuestions(quiz.id))); // resume
  if (attempts.some((a) => a.passed)) throw conflict('You already passed this quiz');
  if (attempts.length >= course.maxAttempts) throw conflict(`You have used all ${course.maxAttempts} attempts`);

  const created = await prisma.quizAttempt.create({ data: { studentId, quizId: quiz.id }, select: { id: true, startedAt: true } });
  res.status(201).json(toQuizStart(created, quiz, courseId, await loadQuestions(quiz.id)));
}

async function makeResult(attemptId: number, studentId: number): Promise<QuizResult> {
  const attempt = await prisma.quizAttempt.findFirst({
    where: { id: attemptId, studentId }, // someone else's attempt looks like a missing one
    include: {
      quiz: {
        include: {
          course: { select: { id: true, title: true, passMark: true, maxAttempts: true } },
          questions: { orderBy: { order: 'asc' }, include: questionInclude },
        },
      },
    },
  });
  if (!attempt) throw notFound('Attempt not found');
  if (!attempt.submittedAt) throw conflict('This attempt has not been submitted yet');

  const course = attempt.quiz.course;
  const answers = Array.isArray(attempt.answers) ? (attempt.answers as { questionId: number; optionId: number | null }[]) : [];
  const [certificate, used, assignmentProgress] = await Promise.all([
    prisma.certificate.findUnique({ where: { studentId_courseId: { studentId, courseId: course.id } }, select: { id: true } }),
    prisma.quizAttempt.count({ where: { studentId, quizId: attempt.quizId, submittedAt: { not: null } } }),
    getAssignmentProgress(studentId, course.id),
  ]);
  const { correct, total } = scoreQuiz(
    attempt.quiz.questions.map((q) => ({ id: q.id, correctOptionId: q.options.find((o) => o.isCorrect)?.id ?? null })),
    answers,
  );
  return {
    attemptId: attempt.id,
    courseId: course.id,
    courseTitle: course.title,
    scorePercent: attempt.scorePercent,
    passed: attempt.passed,
    passMark: effectivePassMark(course.passMark),
    correct,
    total,
    submittedAt: attempt.submittedAt.toISOString(),
    certificateId: certificate?.id ?? null,
    assignmentsPending: assignmentProgress.pending,
    assignmentsRequired: assignmentProgress.required,
    assignmentsBelowMin: assignmentProgress.belowMin,
    attemptsUsed: used,
    maxAttempts: course.maxAttempts,
    timedOut: attempt.answers === null && attempt.scorePercent === 0 && !attempt.passed,
    review: attempt.quiz.questions.map((q) => ({
      questionId: q.id,
      text: q.text,
      explanation: q.explanation,
      selectedOptionId: answers.find((a) => a.questionId === q.id)?.optionId ?? null,
      correctOptionId: q.options.find((o) => o.isCorrect)?.id ?? null,
      options: q.options.map((o) => ({ id: o.id, text: o.text })),
    })),
  };
}

export async function submitQuizAttempt(req: Request, res: Response) {
  const studentId = req.auth!.id;
  const attemptId = parseId(req.params['id']);
  const { answers } = req.body as SubmitQuizInput;

  const attempt = await prisma.quizAttempt.findFirst({
    where: { id: attemptId, studentId },
    include: {
      quiz: {
        include: {
          course: { select: { id: true, title: true, passMark: true } },
          questions: { include: { options: { select: { id: true, isCorrect: true } } } },
        },
      },
    },
  });
  if (!attempt) throw notFound('Attempt not found');
  if (attempt.submittedAt) return void res.json(await makeResult(attemptId, studentId)); // double submit: same result

  const now = new Date();
  const timedOut = isLate(quizDeadline(attempt.startedAt, attempt.quiz.timeLimitMinutes), now);
  // Before the deadline every question must be answered. Only running out of time may submit with gaps.
  if (!timedOut) {
    const answered = new Set(answers.filter((a) => a.optionId !== null).map((a) => a.questionId));
    if (!attempt.quiz.questions.every((q) => answered.has(q.id))) throw badRequest('Answer every question before submitting the quiz');
  }
  // Past the deadline (plus a short grace period) the answers no longer count.
  const counted = timedOut ? [] : answers;
  const { percent } = scoreQuiz(
    attempt.quiz.questions.map((q) => ({ id: q.id, correctOptionId: q.options.find((o) => o.isCorrect)?.id ?? null })),
    counted,
  );
  const passed = !timedOut && isPassing(percent, effectivePassMark(attempt.quiz.course.passMark));
  const courseId = attempt.quiz.course.id;

  await prisma.$transaction(async (tx) => {
    // Only the request that closes the attempt scores it, so a double click cannot issue two results.
    const closed = await tx.quizAttempt.updateMany({
      where: { id: attemptId, submittedAt: null },
      data: { submittedAt: now, scorePercent: percent, passed, answers: timedOut ? Prisma.DbNull : counted },
    });
    log('quiz', `student ${studentId} course ${courseId}: attempt ${attemptId} scored ${percent}%`, { passed, timedOut, firstClose: closed.count === 1 });
    if (closed.count === 0 || !passed) return;
    // The certificate needs the quiz AND the instructor's approval of every course assignment.
    const result = await issueCertificateIfEligible(studentId, courseId, tx);
    if (!result.issued && result.reason === 'assignments below minimum') {
      await tx.notification.create({
        data: {
          userId: studentId,
          title: 'Quiz passed',
          body: `You passed the quiz for "${attempt.quiz.course.title}", but your assignment marks are below ${CERTIFICATE_MIN_PERCENT}%, so no certificate can be issued.`,
        },
      });
    }
    if (!result.issued && result.reason === 'assignments not approved') {
      await tx.notification.create({
        data: {
          userId: studentId,
          title: 'Quiz passed',
          body: `You passed "${attempt.quiz.course.title}". Your certificate will be issued once your instructor accepts your assignments with ${CERTIFICATE_MIN_PERCENT}% or more.`,
        },
      });
    }
  });
  res.json(await makeResult(attemptId, studentId));
}

export async function getQuizAttempt(req: Request, res: Response) {
  res.json(await makeResult(parseId(req.params['id']), req.auth!.id));
}
