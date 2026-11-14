import { expect, test } from '@playwright/test';
import { API_URL } from '../support/env';
import { call, must } from '../support/api';
import { adminSession, assign, completeLessons, grantFree, makeInstructor, makePublishedCourse, makeStudent, uid, type CourseInfo, type Person } from '../support/world';
import { openAs } from '../support/ui';

let admin: Person;
let instructor: Person;
let otherInstructor: Person;
let student: Person;
let otherStudent: Person;
let loner: Person; // a student with no instructor
let course: CourseInfo;

const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');

/** The instructor adds an assignment to a course (like a module) and we read back its id. */
async function addTask(title: string, forCourse: CourseInfo = course): Promise<number> {
  await must('POST', `/courses/${forCourse.id}/assignments`, instructor.token, { title });
  const detail = await must<{ assignments: { id: number; title: string }[] }>('GET', `/courses/${forCourse.id}`, instructor.token);
  return detail.assignments.filter((a) => a.title === title).map((a) => a.id).sort((a, b) => b - a)[0]!;
}

/** Uploads like the app does: the PDF is the body, the details are in the query string. Makes a new course assignment unless taskId is given. */
async function upload(who: Person, opts: { title?: string; taskId?: number; fileName?: string; body?: Buffer; type?: string } = {}) {
  const taskId = opts.taskId ?? (await addTask(opts.title ?? `Homework ${uid('h')}`));
  const q = new URLSearchParams({ courseAssignmentId: String(taskId), fileName: opts.fileName ?? 'homework.pdf' });
  const res = await fetch(`${API_URL}/assignments?${q}`, {
    method: 'POST',
    headers: { 'Content-Type': opts.type ?? 'application/pdf', Authorization: `Bearer ${who.token}` },
    body: opts.body ?? PDF,
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null, taskId };
}

test.beforeAll(async () => {
  admin = await adminSession();
  instructor = await makeInstructor(admin, 'Grader');
  otherInstructor = await makeInstructor(admin, 'Other grader');
  student = await makeStudent('Submitter');
  otherStudent = await makeStudent('Neighbour');
  loner = await makeStudent('Loner');
  await assign(admin, student, instructor);
  await assign(admin, otherStudent, otherInstructor);
  course = await makePublishedCourse(admin, instructor, 'Assignment course');
  for (const s of [student, otherStudent, loner]) await grantFree(admin, s, course);
});

test('full flow: submitted, verifying, rejected with a reason, then accepted after a new submission', async () => {
  const sent = await upload(student, { title: `Essay ${uid('e')}` });
  expect(sent.status).toBe(201);
  const id = sent.body.id as number;

  const status = async () => (await must<{ items: { id: number; status: string; rejectReason: string | null }[] }>('GET', '/assignments', student.token)).items.find((a) => a.id === id)!;
  expect((await status()).status).toBe('SUBMITTED');

  // Accept or reject is only possible after verifying has started.
  expect((await call('POST', `/assignments/${id}/accept`, instructor.token, { marks: 85 })).status).toBe(409);
  expect((await call('POST', `/assignments/${id}/reject`, instructor.token, { reason: 'Too short' })).status).toBe(409);
  expect((await call('POST', `/assignments/${id}/verify`, instructor.token)).status).toBe(200);
  expect((await status()).status).toBe('VERIFYING');
  expect((await call('POST', `/assignments/${id}/verify`, instructor.token)).status).toBe(409);

  // A rejection needs a reason, and the student sees it.
  expect((await call('POST', `/assignments/${id}/reject`, instructor.token, { reason: '' })).status).toBe(422);
  expect((await call('POST', `/assignments/${id}/reject`, instructor.token, { reason: 'Please add more detail' })).status).toBe(200);
  const rejected = await status();
  expect(rejected.status).toBe('REJECTED');
  expect(rejected.rejectReason).toBe('Please add more detail');
  expect((await call('POST', `/assignments/${id}/accept`, instructor.token, { marks: 85 })).status).toBe(409); // decided already

  // The student submits again and this one is accepted.
  const again = await upload(student, { taskId: sent.taskId });
  expect(again.status).toBe(201);
  // While a submission is waiting for review, sending the same assignment again is refused.
  expect((await upload(student, { taskId: sent.taskId })).status).toBe(409);
  await must('POST', `/assignments/${again.body.id}/verify`, instructor.token);
  expect((await call('POST', `/assignments/${again.body.id}/accept`, instructor.token, { marks: 85 })).status).toBe(200);
  const items = (await must<{ items: { id: number; status: string }[] }>('GET', '/assignments', student.token)).items;
  expect(items.find((a) => a.id === again.body.id)!.status).toBe('ACCEPTED');
});

test('only the student and their assigned instructor can see or download an assignment', async () => {
  const { body } = await upload(student, { title: `Private ${uid('p')}` });
  const id = body.id as number;

  for (const who of [student, instructor]) {
    const res = await fetch(`${API_URL}/assignments/${id}/file`, { headers: { Authorization: `Bearer ${who.token}` } });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/pdf');
    expect((await res.text()).startsWith('%PDF-')).toBe(true);
  }
  for (const who of [otherStudent, otherInstructor]) {
    expect((await call('GET', `/assignments/${id}/file`, who.token)).status).toBe(404);
    expect(JSON.stringify((await call('GET', '/assignments', who.token)).body)).not.toContain('Private');
  }
  expect((await call('GET', '/assignments', admin.token)).status).toBe(403);
  expect((await call('GET', `/assignments/${id}/file`, admin.token)).status).toBe(403);
  expect((await call('GET', '/assignments', null)).status).toBe(401);

  // Other instructors and the student cannot decide on it either.
  expect((await call('POST', `/assignments/${id}/verify`, otherInstructor.token)).status).toBe(404);
  expect((await call('POST', `/assignments/${id}/verify`, student.token)).status).toBe(403);
});

test('only real PDF files up to 5 MB are accepted, and only from students with an instructor', async () => {
  expect((await upload(student, { body: Buffer.from('just some text, not a pdf') })).status).toBe(400);
  expect((await upload(student, { fileName: 'homework.docx' })).status).toBe(400);
  expect((await upload(student, { type: 'text/plain' })).status).toBe(400);
  expect((await upload(student, { body: Buffer.alloc(0) })).status).toBe(400);

  const big = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(5 * 1024 * 1024 + 10)]);
  expect((await upload(student, { body: big })).status).toBe(413);
  const edge = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(5 * 1024 * 1024 - 100)]);
  expect((await upload(student, { body: edge })).status).toBe(201);

  expect((await upload(loner)).status).toBe(400); // no instructor yet
  expect((await upload(instructor)).status).toBe(403); // instructors do not submit
  expect((await upload(student, { taskId: 999999 })).status).toBe(404); // no such assignment
  expect((await upload(student, { taskId: 0 })).status).toBe(422);
});

test('student submits from the page; instructor verifies and rejects with a reason; student sees it', async ({ browser }) => {
  const title = `UI homework ${uid('ui')}`;
  await addTask(title);
  const sPage = await (await browser.newContext()).newPage();
  await openAs(sPage, student, 'STUDENT', '/student/assignments');
  await expect(sPage.getByRole('heading', { level: 1 })).toHaveText('Assignments');

  // A file that is not a PDF is refused on the page itself.
  await sPage.getByLabel(/^PDF file/).setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
  await expect(sPage.getByText('Only PDF files are allowed')).toBeVisible();

  await sPage.getByLabel('Course', { exact: true }).selectOption({ label: course.title });
  await sPage.getByLabel('Assignment', { exact: true }).selectOption({ label: title });
  await sPage.getByLabel(/^PDF file/).setInputFiles({ name: 'work.pdf', mimeType: 'application/pdf', buffer: PDF });
  await sPage.getByRole('button', { name: 'Submit assignment' }).click();
  await expect(sPage.getByText('Assignment submitted')).toBeVisible();
  const mine = sPage.getByRole('listitem').filter({ hasText: title });
  await expect(mine.getByText('Submitted')).toBeVisible();

  const iPage = await (await browser.newContext()).newPage();
  await openAs(iPage, instructor, 'INSTRUCTOR', '/instructor/assignments');
  const theirs = iPage.getByRole('listitem').filter({ hasText: title });
  await expect(theirs).toBeVisible();
  await theirs.getByRole('button', { name: 'Start verifying' }).click();
  await expect(theirs.getByText('Verifying')).toBeVisible();
  await theirs.getByRole('button', { name: 'Reject' }).click();
  const dialog = iPage.getByRole('alertdialog');
  await expect(dialog.getByRole('button', { name: 'Reject assignment' })).toBeDisabled(); // a reason is required
  await dialog.getByLabel(/^Reason/).fill('The second page is missing');
  await dialog.getByRole('button', { name: 'Reject assignment' }).click();
  await expect(theirs.getByText('The second page is missing')).toBeVisible();

  await sPage.reload();
  await expect(sPage.getByRole('listitem').filter({ hasText: title }).getByText('The second page is missing')).toBeVisible({ timeout: 15_000 });
});

test('certificate waits for the instructor to accept every course assignment', async () => {
  const gated = await makePublishedCourse(admin, instructor, 'Gated course');
  const task = await addTask('Final project', gated);
  await grantFree(admin, student, gated);
  await completeLessons(student, gated);

  // Pass the quiz first: no certificate yet, because an assignment is still open.
  const start = await must<{ attemptId: number; questions: { id: number; options: { id: number; text: string }[] }[] }>('POST', `/courses/${gated.id}/quiz/start`, student.token);
  const q = start.questions[0]!;
  const right = q.options.find((o) => o.text === 'Right')!;
  const passed = await must<{ passed: boolean; certificateId: number | null; assignmentsPending: number }>('POST', `/quiz-attempts/${start.attemptId}/submit`, student.token, { answers: [{ questionId: q.id, optionId: right.id }] });
  expect(passed.passed).toBe(true);
  expect(passed.certificateId).toBeNull();
  expect(passed.assignmentsPending).toBe(1);

  // Submitted and verifying is still not enough; a rejection is not enough either.
  const sent = await upload(student, { taskId: task });
  expect(sent.status).toBe(201);
  await must('POST', `/assignments/${sent.body.id}/verify`, instructor.token);
  await must('POST', `/assignments/${sent.body.id}/reject`, instructor.token, { reason: 'Not complete' });
  const certs = async () => (await must<{ items: { courseId: number }[] }>('GET', '/certificates', student.token)).items.filter((c) => c.courseId === gated.id);
  expect(await certs()).toHaveLength(0);

  // Accepting the new submission issues the certificate.
  const second = await upload(student, { taskId: task });
  await must('POST', `/assignments/${second.body.id}/verify`, instructor.token);
  await must('POST', `/assignments/${second.body.id}/accept`, instructor.token, { marks: 90 });
  expect(await certs()).toHaveLength(1);

  // The certificate shows a status, never marks or percentages.
  const cert = (await certs())[0] as Record<string, unknown>;
  expect(cert['status']).toBe('Accomplished');
  expect(cert['scorePercent']).toBeUndefined();
});

test('grading needs marks from 0 to 100; marks below the pass mark fail the attempt and block the certificate until a pass', async () => {
  const course = await makePublishedCourse(admin, instructor, 'Marks course');
  const task = await addTask('Marked project', course);
  await grantFree(admin, student, course);
  await completeLessons(student, course);

  const sent = await upload(student, { taskId: task });
  await must('POST', `/assignments/${sent.body.id}/verify`, instructor.token);
  for (const bad of [{}, { marks: -1 }, { marks: 101 }, { marks: 70.5 }, { marks: 'ten' }, { marks: 80, feedback: 'x'.repeat(1001) }]) {
    expect((await call('POST', `/assignments/${sent.body.id}/accept`, instructor.token, bad)).status).toBe(422);
  }
  // 55 is below the pass mark: the attempt fails (REJECTED), the marks and feedback are stored and the student may try again.
  const graded = await must<{ accepted: boolean; attemptsLeft: number }>('POST', `/assignments/${sent.body.id}/accept`, instructor.token, { marks: 55, feedback: 'Needs more depth' });
  expect(graded).toMatchObject({ accepted: false, attemptsLeft: 2 });
  type Item = { id: number; status: string; marks: number | null; feedback: string | null; attemptNo: number; maxAttempts: number; passMark: number; rejectReason: string | null };
  const items = async () => (await must<{ items: Item[] }>('GET', '/assignments', student.token)).items;
  expect((await items()).find((a) => a.id === sent.body.id)).toMatchObject({ status: 'REJECTED', marks: 55, feedback: 'Needs more depth', attemptNo: 1, maxAttempts: 3, passMark: 70 });
  expect((await call('POST', `/assignments/${sent.body.id}/accept`, instructor.token, { marks: 90 })).status).toBe(409); // a grade is final
  expect((await call('PATCH', `/assignments/${sent.body.id}/marks`, instructor.token, { marks: 90 })).status).toBe(404); // no more "edit marks"

  // Quiz passed with 100%, but the assignment is not passed yet: no certificate.
  const start = await must<{ attemptId: number; questions: { id: number; options: { id: number; text: string }[] }[] }>('POST', `/courses/${course.id}/quiz/start`, student.token);
  const q = start.questions[0]!;
  const right = q.options.find((o) => o.text === 'Right')!;
  await must('POST', `/quiz-attempts/${start.attemptId}/submit`, student.token, { answers: [{ questionId: q.id, optionId: right.id }] });
  const certs = async () => (await must<{ items: { courseId: number }[] }>('GET', '/certificates', student.token)).items.filter((c) => c.courseId === course.id);
  expect(await certs()).toHaveLength(0);

  // The student sends attempt 2; exactly the pass mark passes it, and then the certificate is issued.
  const second = await upload(student, { taskId: task });
  expect(second.body).toMatchObject({ attemptNo: 2, maxAttempts: 3 });
  await must('POST', `/assignments/${second.body.id}/verify`, instructor.token);
  expect(await must('POST', `/assignments/${second.body.id}/accept`, instructor.token, { marks: 70 })).toMatchObject({ accepted: true });
  expect((await items()).find((a) => a.id === second.body.id)).toMatchObject({ status: 'ACCEPTED', marks: 70, attemptNo: 2 });
  expect(await certs()).toHaveLength(1);
  // Passed: no further submissions even though an attempt is left.
  expect((await upload(student, { taskId: task })).status).toBe(409);
});

test('at most 3 attempts: each failed attempt can be resubmitted, the 4th is refused, and nothing can be sent while one is under review', async () => {
  const course = await makePublishedCourse(admin, instructor, 'Attempts course');
  const task = await addTask('Three tries', course);
  await grantFree(admin, student, course);
  await completeLessons(student, course);

  type Task = { id: number; myStatus: string | null; attemptsUsed: number; maxAttempts: number; attemptsLeft: number; canSubmit: boolean; blockedReason: string | null };
  const mine = async () => (await must<{ items: Task[] }>('GET', '/assignments/tasks', student.token)).items.find((t) => t.id === task)!;
  expect(await mine()).toMatchObject({ attemptsUsed: 0, maxAttempts: 3, attemptsLeft: 3, canSubmit: true });

  // Attempt 1 rejected with a reason, attempt 2 failed with low marks.
  const first = await upload(student, { taskId: task });
  expect(first.body).toMatchObject({ attemptNo: 1 });
  expect(await mine()).toMatchObject({ attemptsUsed: 1, attemptsLeft: 2, canSubmit: false }); // waiting for review
  expect((await upload(student, { taskId: task })).status).toBe(409);
  await must('POST', `/assignments/${first.body.id}/verify`, instructor.token);
  await must('POST', `/assignments/${first.body.id}/reject`, instructor.token, { reason: 'Wrong file' });
  expect(await mine()).toMatchObject({ attemptsUsed: 1, attemptsLeft: 2, canSubmit: true });

  const second = await upload(student, { taskId: task });
  expect(second.body).toMatchObject({ attemptNo: 2 });
  await must('POST', `/assignments/${second.body.id}/verify`, instructor.token);
  await must('POST', `/assignments/${second.body.id}/accept`, instructor.token, { marks: 69 }); // one below the pass mark
  expect(await mine()).toMatchObject({ attemptsUsed: 2, attemptsLeft: 1, canSubmit: true });

  const third = await upload(student, { taskId: task });
  expect(third.body).toMatchObject({ attemptNo: 3 });
  await must('POST', `/assignments/${third.body.id}/verify`, instructor.token);
  await must('POST', `/assignments/${third.body.id}/reject`, instructor.token, { reason: 'Still not right' });

  // All three used: no 4th attempt, and the course is not eligible for a certificate.
  const fourth = await upload(student, { taskId: task });
  expect(fourth.status).toBe(409);
  expect(JSON.stringify(fourth.body)).toContain('all 3 attempts');
  expect(await mine()).toMatchObject({ attemptsUsed: 3, attemptsLeft: 0, canSubmit: false });
  type Progress = { courseId: number; status: string; assignments: { state: string } };
  const progress = (await must<{ items: Progress[] }>('GET', '/certificates/progress', student.token)).items.find((p) => p.courseId === course.id)!;
  expect(progress).toMatchObject({ status: 'NOT_ELIGIBLE', assignments: { state: 'failed' } });

  // The history keeps every attempt with its marks, reason and number, for the student and the instructor.
  for (const who of [student, instructor]) {
    const rows = (await must<{ items: { courseAssignmentId: number; attemptNo: number; status: string; marks: number | null; rejectReason: string | null }[] }>('GET', '/assignments?pageSize=100', who.token)).items
      .filter((a) => a.courseAssignmentId === task).sort((a, b) => a.attemptNo - b.attemptNo);
    expect(rows.map((r) => [r.attemptNo, r.status, r.marks])).toEqual([[1, 'REJECTED', null], [2, 'REJECTED', 69], [3, 'REJECTED', null]]);
    expect(rows[0]!.rejectReason).toBe('Wrong file');
  }
});

test('instructor grading box: digits can be typed without touching Cancel, Save grades, Cancel closes, and there is no Edit marks button', async ({ browser }) => {
  const title = `Typing ${uid('ty')}`;
  const taskId = await addTask(title);
  const sent = await upload(student, { taskId });
  await must('POST', `/assignments/${sent.body.id}/verify`, instructor.token);

  const page = await (await browser.newContext()).newPage();
  await openAs(page, instructor, 'INSTRUCTOR', '/instructor/assignments');
  const card = page.getByRole('listitem').filter({ hasText: title });
  await expect(card.getByRole('button', { name: /edit mark/i })).toHaveCount(0);
  await card.getByRole('button', { name: 'Accept' }).click();

  const dialog = page.getByRole('alertdialog');
  const marks = dialog.getByLabel(/^Marks for the student/);
  await expect(marks).toBeFocused(); // the cursor starts in the marks box, not on Cancel
  await page.keyboard.type('7');
  await expect(dialog).toBeVisible(); // 7 does not close the box
  await expect(marks).toBeFocused(); // and focus stays in the marks box while typing
  await page.keyboard.type('5');
  await expect(marks).toHaveValue('75');
  await marks.fill('7a5x');
  await expect(marks).toHaveValue('75'); // letters are ignored
  await dialog.getByLabel(/^Feedback/).fill('Good work');

  // Cancel closes without saving.
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(card.getByText('Verifying')).toBeVisible();

  // Reopen: the box starts empty and Save stays disabled until valid marks are typed.
  await card.getByRole('button', { name: 'Accept' }).click();
  await expect(dialog.getByLabel(/^Marks for the student/)).toHaveValue('');
  await expect(dialog.getByRole('button', { name: 'Save' })).toBeDisabled();
  await page.keyboard.type('55');
  await expect(dialog.getByText(/Below the passing marks/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(card.getByText('Rejected')).toBeVisible();
  await expect(card.getByText('Marks: 55/100')).toBeVisible();
  await expect(card.getByText('Attempt 1 of 3')).toBeVisible();
  await expect(card.getByRole('button', { name: /edit mark/i })).toHaveCount(0);
});

test('student page shows the attempt number and attempts left, and blocks the form after a pass', async ({ browser }) => {
  const title = `Attempt UI ${uid('au')}`;
  const taskId = await addTask(title);
  const sent = await upload(student, { taskId });
  await must('POST', `/assignments/${sent.body.id}/verify`, instructor.token);
  await must('POST', `/assignments/${sent.body.id}/reject`, instructor.token, { reason: 'Redo it' });

  const page = await (await browser.newContext()).newPage();
  await openAs(page, student, 'STUDENT', '/student/assignments');
  await page.getByLabel('Course', { exact: true }).selectOption({ label: course.title });
  await page.getByLabel('Assignment', { exact: true }).selectOption({ label: `${title} (Rejected)` });
  await expect(page.getByText(/This will be attempt 2 of 3 · 2 attempts left/)).toBeVisible();
  await expect(page.getByRole('listitem').filter({ hasText: title }).getByText('Attempt 1 of 3')).toBeVisible();

  await must('POST', `/assignments/${(await upload(student, { taskId })).body.id}/verify`, instructor.token);
  const items = (await must<{ items: { id: number; courseAssignmentId: number; status: string }[] }>('GET', '/assignments', instructor.token)).items;
  const open = items.find((a) => a.courseAssignmentId === taskId && a.status === 'VERIFYING')!;
  await must('POST', `/assignments/${open.id}/accept`, instructor.token, { marks: 92 });

  await page.reload();
  await page.getByLabel('Course', { exact: true }).selectOption({ label: course.title });
  await page.getByLabel('Assignment', { exact: true }).selectOption({ label: `${title} (Accepted)` });
  await expect(page.getByText('You already passed this assignment')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Submit assignment' })).toBeDisabled();
});
