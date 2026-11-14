import type { Request, Response } from 'express';
import type { Prisma } from '@prisma/client';
import {
  AssignmentStatus,
  MAX_ASSIGNMENT_BYTES,
  MAX_ASSIGNMENT_MARKS,
  Role,
  effectivePassMark,
  gradeAttempt,
  listAssignmentsQuery,
  submitAssignmentQuery,
  summarizeAttempts,
  type AssignmentRow,
  type Paginated,
} from '@lms/shared';
import { prisma } from '../config/prisma';
import { badRequest, conflict, forbidden, notFound } from '../middleware/errors';
import { log } from '../lib/log';
import { getCourseAccess } from '../services/access';
import { getAssignmentProgress, issueCertificateIfEligible } from '../services/certificates';
import { parseId } from './helpers';

/**
 * Assignments are PDF files. A student sees only their own. An instructor sees only the assignments of
 * the students the admin assigned to them. The admin has no access. Anyone else gets "not found".
 *
 * Attempts work like quiz attempts: every submission is one attempt and is kept (file, marks, feedback), up to the
 * course's `maxAttempts` (3 by default). The instructor grades with marks: at or above the course pass mark the
 * assignment is ACCEPTED and no more submissions are allowed; below it (or a plain rejection) it is REJECTED and the
 * student may submit again while attempts are left.
 */

const rowSelect = {
  id: true,
  title: true,
  note: true,
  courseId: true,
  courseAssignmentId: true,
  studentId: true,
  fileName: true,
  fileSize: true,
  status: true,
  rejectReason: true,
  marks: true,
  feedback: true,
  attemptNo: true,
  createdAt: true,
  updatedAt: true,
  course: { select: { title: true, passMark: true, maxAttempts: true } },
  student: { select: { name: true, instructorId: true } },
} satisfies Prisma.AssignmentSelect; // never includes fileData, which is large

type Record_ = Prisma.AssignmentGetPayload<{ select: typeof rowSelect }>;

const toRow = (a: Record_): AssignmentRow => ({
  id: a.id,
  title: a.title,
  note: a.note,
  courseAssignmentId: a.courseAssignmentId,
  courseId: a.courseId,
  courseTitle: a.course.title,
  studentId: a.studentId,
  studentName: a.student.name,
  fileName: a.fileName,
  fileSize: a.fileSize,
  status: a.status,
  rejectReason: a.status === AssignmentStatus.REJECTED ? a.rejectReason : null,
  marks: a.marks,
  feedback: a.feedback,
  attemptNo: a.attemptNo,
  maxAttempts: a.course.maxAttempts,
  passMark: effectivePassMark(a.course.passMark),
  createdAt: a.createdAt.toISOString(),
  updatedAt: a.updatedAt.toISOString(),
});

function scopeFor(req: Request): Prisma.AssignmentWhereInput {
  const { id, role } = req.auth!;
  if (role === Role.STUDENT) return { studentId: id };
  if (role === Role.INSTRUCTOR) return { student: { instructorId: id } };
  return { id: -1 };
}

async function loadAllowed(req: Request, id: number) {
  const found = await prisma.assignment.findFirst({ where: { id, ...scopeFor(req) }, select: rowSelect });
  if (!found) throw notFound('Assignment not found'); // someone else's looks like a missing one
  return found;
}

/** Student: send a PDF for one of the assignments the instructor set (the body is the file; details are in the query string). */
export async function submitAssignment(req: Request, res: Response) {
  const studentId = req.auth!.id;
  const q = submitAssignmentQuery.parse(req.query);
  const file = req.body as unknown;
  log('assignment', `student ${studentId} submits for course assignment ${q.courseAssignmentId}`, { fileName: q.fileName, bytes: Buffer.isBuffer(file) ? file.length : 0 });
  if (!Buffer.isBuffer(file) || file.length === 0) throw badRequest('Choose a PDF file to upload');
  if (file.length > MAX_ASSIGNMENT_BYTES) throw badRequest('The PDF must be 5 MB or smaller');
  if (file.subarray(0, 5).toString('latin1') !== '%PDF-') throw badRequest('Only PDF files are allowed');
  if (!/\.pdf$/i.test(q.fileName)) throw badRequest('Only PDF files are allowed');

  const task = await prisma.courseAssignment.findUnique({
    where: { id: q.courseAssignmentId },
    select: { id: true, title: true, courseId: true, course: { select: { maxAttempts: true } } },
  });
  if (!task) throw notFound('Assignment not found');

  const me = await prisma.user.findUnique({ where: { id: studentId }, select: { name: true, instructorId: true } });
  // Only the assigned instructor can see assignments, so a student needs one first.
  if (!me?.instructorId) throw badRequest('You do not have an instructor yet. Ask the admin to assign one, then submit your assignment.');
  if (!(await getCourseAccess(studentId, task.courseId))) throw forbidden('Get access to this course to submit an assignment for it');

  const instructorId = me.instructorId;
  const maxAttempts = task.course.maxAttempts;
  const created = await prisma.$transaction(async (tx) => {
    // Lock this assignment while its attempts are counted, so two quick submissions cannot both take the last attempt.
    await tx.$queryRaw`SELECT id FROM CourseAssignment WHERE id = ${task.id} FOR UPDATE`;
    const mine = await tx.assignment.findMany({ where: { studentId, courseAssignmentId: task.id }, select: { status: true } });
    const attempts = summarizeAttempts(mine.map((m) => m.status), maxAttempts);
    // Send again only after a rejection or marks below the pass mark, and only while attempts are left.
    if (!attempts.canSubmit) throw conflict(attempts.passed ? 'This assignment was already accepted' : (attempts.blockedReason ?? 'You cannot submit this assignment'));

    const a = await tx.assignment.create({
      data: {
        studentId, courseId: task.courseId, courseAssignmentId: task.id, title: task.title, note: q.note || null,
        fileName: q.fileName, fileSize: file.length, fileData: file, attemptNo: attempts.used + 1,
      },
      select: { id: true, attemptNo: true },
    });
    await tx.notification.create({
      data: { userId: instructorId, title: 'New assignment', body: `${me.name} submitted "${task.title}" (attempt ${a.attemptNo} of ${maxAttempts}).` },
    });
    return a;
  });
  log('assignment', `submission ${created.id} saved (attempt ${created.attemptNo} of ${maxAttempts}, status SUBMITTED)`);
  res.status(201).json({ id: created.id, attemptNo: created.attemptNo, maxAttempts });
}

export async function listAssignments(req: Request, res: Response) {
  const q = listAssignmentsQuery.parse(req.query);
  const where: Prisma.AssignmentWhereInput = { ...scopeFor(req), ...(q.status ? { status: q.status } : {}) };
  const [total, rows] = await Promise.all([
    prisma.assignment.count({ where }),
    prisma.assignment.findMany({ where, select: rowSelect, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
  ]);
  const body: Paginated<AssignmentRow> = { items: rows.map(toRow), page: q.page, pageSize: q.pageSize, total };
  res.json(body);
}

/** The student who sent it and their assigned instructor can download the PDF. */
export async function downloadAssignment(req: Request, res: Response) {
  const id = parseId(req.params['id']);
  const a = await loadAllowed(req, id);
  const data = await prisma.assignment.findUniqueOrThrow({ where: { id }, select: { fileData: true } });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${a.fileName.replace(/[^\w.\- ]/g, '_')}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(Buffer.from(data.fileData));
}

async function ownInstructorOnly(req: Request) {
  if (req.auth!.role !== Role.INSTRUCTOR) throw forbidden();
  return loadAllowed(req, parseId(req.params['id']));
}

/** Instructor: start checking a newly submitted assignment. */
export async function verifyAssignment(req: Request, res: Response) {
  const a = await ownInstructorOnly(req);
  if (a.status !== AssignmentStatus.SUBMITTED) throw conflict('This assignment is already being verified or has a result');
  await prisma.$transaction([
    prisma.assignment.update({ where: { id: a.id }, data: { status: AssignmentStatus.VERIFYING } }),
    prisma.notification.create({ data: { userId: a.studentId, title: 'Assignment is being verified', body: `Your instructor started verifying "${a.title}".` } }),
  ]);
  res.json({ ok: true });
}

/**
 * Instructor: grade an assignment they are verifying. Marks at or above the pass mark accept it; marks below it
 * fail this attempt (status REJECTED) so the student can try again. A plain rejection needs a reason and no marks.
 * A grade is final: there is no editing marks afterwards.
 */
async function decide(req: Request, res: Response, input: { marks: number | null; reason: string | null; feedback: string | null }) {
  const a = await ownInstructorOnly(req);
  if (a.status !== AssignmentStatus.VERIFYING) throw conflict('Start verifying this assignment first');
  const { passMark, passed } = input.marks === null ? { passMark: effectivePassMark(a.course.passMark), passed: false } : gradeAttempt(input.marks, a.course.passMark);
  const rejectReason = passed ? null : input.reason ?? `Marks ${input.marks}/${MAX_ASSIGNMENT_MARKS} are below the passing marks (${passMark}).`;
  log('assignment', `instructor ${req.auth!.id} ${passed ? 'ACCEPTS' : 'REJECTS'} submission ${a.id} (attempt ${a.attemptNo})`, { student: a.studentId, course: a.courseId, marks: input.marks, passMark, reason: rejectReason });

  // Attempts left after this one (used by the notification, and so the student knows what to do next).
  // (Older free-form submissions have no assignment to send again for, so they have none left.)
  const used = a.courseAssignmentId === null ? a.course.maxAttempts : await prisma.assignment.count({ where: { studentId: a.studentId, courseAssignmentId: a.courseAssignmentId } });
  const left = passed ? 0 : Math.max(0, a.course.maxAttempts - used);
  const retry = left > 0 ? `You can submit again (${left} attempt${left === 1 ? '' : 's'} left).` : 'You have no attempts left.';
  const body = passed
    ? `"${a.title}" was accepted. Marks: ${input.marks}/${MAX_ASSIGNMENT_MARKS}.`
    : input.marks === null
      ? `"${a.title}" was rejected: ${rejectReason} ${retry}`
      : `"${a.title}": ${input.marks}/${MAX_ASSIGNMENT_MARKS} is below the passing marks (${passMark}). ${retry}`;
  await prisma.$transaction([
    prisma.assignment.update({
      where: { id: a.id },
      data: { status: passed ? AssignmentStatus.ACCEPTED : AssignmentStatus.REJECTED, rejectReason, marks: input.marks, feedback: input.feedback, reviewedAt: new Date() },
    }),
    prisma.notification.create({ data: { userId: a.studentId, title: passed ? 'Assignment accepted' : 'Assignment rejected', body } }),
  ]);
  // The certificate needs approved assignments with average marks of 70+, so accepting the last one may issue it now (if the quiz is passed with 70%+).
  if (passed) {
    const progress = await getAssignmentProgress(a.studentId, a.courseId);
    log('assignment', `student ${a.studentId} course ${a.courseId}: ${progress.accepted} of ${progress.required} assignment(s) accepted, average marks ${progress.averagePercent}`);
    await issueCertificateIfEligible(a.studentId, a.courseId);
  }
  res.json({ ok: true, accepted: passed, attemptsLeft: left });
}

export const acceptAssignment = (req: Request, res: Response) => {
  const { marks, feedback } = req.body as { marks: number; feedback?: string };
  return decide(req, res, { marks, reason: null, feedback: feedback || null });
};
export const rejectAssignment = (req: Request, res: Response) => decide(req, res, { marks: null, reason: (req.body as { reason: string }).reason, feedback: null });
