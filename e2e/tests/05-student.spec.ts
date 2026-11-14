import { expect, test } from '@playwright/test';
import { call, must } from '../support/api';
import {
  adminSession, assign, completeLessons, grantFree, makeInstructor, makePublishedCourse, makeStudent,
  type CourseInfo, type Person,
} from '../support/world';
import { openAs, watchForProblems } from '../support/ui';

let admin: Person;
let instructor: Person;
let course: CourseInfo;

test.beforeAll(async () => {
  admin = await adminSession();
  instructor = await makeInstructor(admin, 'Learn teacher');
  course = await makePublishedCourse(admin, instructor, 'Learn course');
});

test('catalog lists published courses, search narrows them, and a course page shows its curriculum', async ({ page }) => {
  const student = await makeStudent('Browse');
  const problems = watchForProblems(page);
  await openAs(page, student, 'STUDENT', '/student/courses');
  await expect(page.getByText(course.title)).toBeVisible();
  const search = page.locator('main').getByLabel('Search courses');
  await search.fill('zzz-nothing-matches-this');
  await expect(page.getByText(course.title)).toHaveCount(0);
  await search.fill(course.title);
  await page.getByText(course.title).first().click();
  await expect(page).toHaveURL(new RegExp(`/student/courses/${course.id}$`));
  await expect(page.getByRole('region', { name: 'Curriculum' })).toContainText('Lesson 1');
  await expect(page.getByRole('button', { name: 'Buy this course' })).toBeVisible();
  expect(problems).toEqual([]);
});

test('buying a course with the test payment unlocks it', async ({ page }) => {
  const student = await makeStudent('Buyer');
  await openAs(page, student, 'STUDENT', `/student/courses/${course.id}`);
  await page.getByRole('button', { name: 'Buy this course' }).click();
  await expect(page).toHaveURL(/\/student\/checkout\?type=SINGLE/);
  const pay = page.getByRole('region', { name: 'Payment' });
  await expect(pay.getByRole('heading', { name: 'Review and pay' })).toBeVisible();
  await pay.locator('button.btn-gold').click();
  await expect(page.getByRole('heading', { name: 'Payment successful' })).toBeVisible();
  await page.getByRole('link', { name: 'Go to course' }).click();
  await expect(page.getByRole('link', { name: 'Open course' })).toBeVisible();
  expect((await call('GET', `/courses/${course.id}/learn`, student.token)).status).toBe(200);
});

test('a declined payment gives no access and can be retried', async () => {
  const student = await makeStudent('Decliner');
  const order = await must<{ orderId: string }>('POST', '/checkout', student.token, { type: 'SINGLE', courseId: course.id });
  const res = await must<{ status: string }>('POST', '/checkout/confirm', student.token, { orderId: order.orderId, simulate: 'decline' });
  expect(res.status).toBe('FAILED');
  expect((await call('GET', `/courses/${course.id}/learn`, student.token)).status).toBe(403);
  const again = await must<{ orderId: string }>('POST', '/checkout', student.token, { type: 'SINGLE', courseId: course.id });
  expect((await must<{ status: string }>('POST', '/checkout/confirm', student.token, { orderId: again.orderId, simulate: 'success' })).status).toBe('SUCCEEDED');
  expect((await call('GET', `/courses/${course.id}/learn`, student.token)).status).toBe(200);
});

test('instructors and admins cannot check out', async () => {
  expect((await call('POST', '/checkout', instructor.token, { type: 'ANNUAL' })).status).toBe(403);
  expect((await call('POST', '/checkout', admin.token, { type: 'ANNUAL' })).status).toBe(403);
});

test('the annual package opens every course', async () => {
  const student = await makeStudent('Annual');
  const order = await must<{ orderId: string }>('POST', '/checkout', student.token, { type: 'ANNUAL' });
  await must('POST', '/checkout/confirm', student.token, { orderId: order.orderId, simulate: 'success' });
  expect((await call('GET', `/courses/${course.id}/learn`, student.token)).status).toBe(200);
});

test('lessons are locked in order, the quiz is locked until every lesson is done, then a certificate is issued', async ({ page }) => {
  const student = await makeStudent('Graduate');
  await assign(admin, student, instructor);
  await grantFree(admin, student, course);
  const [, second] = course.lessonIds as [number, number];

  // Lesson 2 cannot be completed before lesson 1; the quiz cannot start yet.
  expect((await call('PUT', `/lessons/${second}/progress`, student.token, { positionSeconds: 60, watchedSeconds: 60, durationSeconds: 60, ended: true })).status).toBe(403);
  expect((await call('POST', `/courses/${course.id}/quiz/start`, student.token)).status).toBe(409);

  await openAs(page, student, 'STUDENT', `/student/learn/${course.id}`);
  await expect(page.getByRole('complementary', { name: 'Lessons' })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);

  await completeLessons(student, course);

  // Quiz: a wrong answer fails, the right one passes and issues a certificate.
  const start = await must<{ attemptId: number; questions: { id: number; options: { id: number; text: string }[] }[] }>('POST', `/courses/${course.id}/quiz/start`, student.token);
  const q = start.questions[0]!;
  const wrong = q.options.find((o) => o.text === 'Wrong')!;
  const failed = await must<{ passed: boolean; certificateId: number | null }>('POST', `/quiz-attempts/${start.attemptId}/submit`, student.token, { answers: [{ questionId: q.id, optionId: wrong.id }] });
  expect(failed.passed).toBe(false);
  expect(failed.certificateId).toBeNull();

  const retry = await must<{ attemptId: number; questions: { id: number; options: { id: number; text: string }[] }[] }>('POST', `/courses/${course.id}/quiz/start`, student.token);
  const rq = retry.questions[0]!;
  const right = rq.options.find((o) => o.text === 'Right')!;
  const passed = await must<{ passed: boolean; certificateId: number | null }>('POST', `/quiz-attempts/${retry.attemptId}/submit`, student.token, { answers: [{ questionId: rq.id, optionId: right.id }] });
  expect(passed.passed).toBe(true);
  expect(passed.certificateId).not.toBeNull();

  // The result page, the certificates page and the public verify page all agree.
  await page.goto(`/student/quiz-result/${retry.attemptId}`);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.goto('/student/certificates');
  await expect(page.getByText(course.title).first()).toBeVisible();
  const certs = await must<{ items: { code: string }[] }>('GET', '/certificates', student.token);
  const code = certs.items[0]!.code;
  await page.goto(`/verify/${code}`);
  await expect(page.getByText('This certificate is valid')).toBeVisible();
  await page.goto('/verify/NOT-A-REAL-CODE');
  await expect(page.getByText('This certificate is valid')).toHaveCount(0);

  // Passed once: no more attempts.
  expect((await call('POST', `/courses/${course.id}/quiz/start`, student.token)).status).toBe(409);
});

test('submitting a quiz asks for a final confirmation first; going back changes nothing', async ({ page }) => {
  const student = await makeStudent('Confirmer');
  await assign(admin, student, instructor);
  await grantFree(admin, student, course);
  await completeLessons(student, course);

  await openAs(page, student, 'STUDENT', `/student/quiz/${course.id}`);
  // Starting takes two confirmations: the rules, then a final "I am ready" tick.
  await page.getByRole('button', { name: 'Start quiz' }).click();
  await expect(page.getByRole('alertdialog')).toContainText('cannot exit');
  await page.getByRole('alertdialog').getByRole('button', { name: 'I understand, continue' }).click();
  await expect(page.getByRole('alertdialog').getByRole('button', { name: 'Yes, start quiz now' })).toBeDisabled();
  await page.getByRole('alertdialog').getByRole('checkbox').check();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Yes, start quiz now' }).click();

  // Submit stays disabled until every question is answered.
  await expect(page.getByRole('button', { name: 'Submit quiz' }).first()).toBeDisabled();
  await page.getByRole('radio', { name: 'Right' }).check();
  await page.getByRole('button', { name: 'Submit quiz' }).first().click();

  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText('This is final');
  await dialog.getByRole('button', { name: 'Go back' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`/student/quiz/${course.id}$`)); // nothing was submitted

  await page.getByRole('button', { name: 'Submit quiz' }).first().click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Yes, submit quiz' }).click();
  await expect(page).toHaveURL(/\/student\/quiz-result\/\d+$/);

  // A finished quiz stays in the list, with its result and certificate.
  await page.goto('/student/quizzes');
  const row = page.getByRole('row').filter({ hasText: course.title });
  await expect(row.getByText('Passed')).toBeVisible();
  await expect(row.getByRole('link', { name: 'View result' })).toBeVisible();
  await expect(row.getByRole('link', { name: 'Certificate' })).toBeVisible();
});

test('without access a student can only open the free preview lesson', async () => {
  const student = await makeStudent('Locked');
  const [preview, paid] = course.lessonIds as [number, number];
  expect((await call('GET', `/lessons/${paid}`, student.token)).status).toBe(403);
  expect((await call('GET', `/lessons/${preview}`, student.token)).status).toBeLessThan(400);
});

test('Doubts page shows the assigned instructor, or a friendly empty state', async ({ page }) => {
  const withTeacher = await makeStudent('HasTeacher');
  await assign(admin, withTeacher, instructor);
  await openAs(page, withTeacher, 'STUDENT', '/student/doubts');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Doubts');
  await expect(page.getByRole('button', { name: new RegExp(instructor.name) })).toBeVisible();
  await expect(page.getByLabel('Type your message')).toBeVisible();

  const without = await makeStudent('NoTeacher');
  await openAs(page, without, 'STUDENT', '/student/doubts');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Doubts');
  await expect(page.getByText('No instructor assigned yet', { exact: false }).first()).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('notifications: the bell shows unread items and "Mark all read" clears them', async ({ page }) => {
  const student = await makeStudent('Bell');
  await assign(admin, student, instructor); // creates a notification for the student
  await openAs(page, student, 'STUDENT', '/student/dashboard');
  await page.getByRole('button', { name: /^Notifications, \d+ unread$/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Notifications' });
  await expect(dialog.getByText('Instructor assigned')).toBeVisible();
  await dialog.getByRole('button', { name: 'Mark all read' }).click();
  await expect(page.getByRole('button', { name: 'Notifications', exact: true })).toBeVisible();
});

test('a student cannot reach instructor or admin data over the API', async () => {
  const student = await makeStudent('Nosy');
  for (const path of ['/users', '/permissions', '/purchases', '/grants', '/me/students', '/dashboard/admin', '/dashboard/instructor']) {
    expect((await call('GET', path, student.token)).status, path).toBe(403);
  }
});
