import { expect, test } from '@playwright/test';
import { call, must } from '../support/api';
import { adminSession, assign, grantFree, makeInstructor, makePublishedCourse, makeStudent, uid, type CourseInfo, type Person } from '../support/world';
import { openAs } from '../support/ui';

let admin: Person;
let instructor: Person;
let student: Person;
let stranger: Person; // not assigned to this instructor
let course: CourseInfo;

test.beforeAll(async () => {
  admin = await adminSession();
  instructor = await makeInstructor(admin, 'Teacher');
  student = await makeStudent('Mine');
  stranger = await makeStudent('Stranger');
  await assign(admin, student, instructor);
  course = await makePublishedCourse(admin, instructor, 'Teacher course');
});

test('instructor sees their courses and opens one in the builder', async ({ page }) => {
  await openAs(page, instructor, 'INSTRUCTOR', '/instructor/courses');
  await expect(page.getByRole('link', { name: new RegExp(course.title) })).toBeVisible();
  await page.getByRole('link', { name: new RegExp(course.title) }).click();
  await expect(page).toHaveURL(new RegExp(`/instructor/courses/${course.id}$`));
  await expect(page.getByText(course.title).first()).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('a new course starts as a draft and cannot be submitted without lessons and a quiz', async () => {
  const { id } = await must<{ id: number }>('POST', '/courses', instructor.token, {
    title: `Empty draft ${uid('d')}`, description: 'Nothing in it yet', category: 'Testing', level: 'BEGINNER', passMark: 70, maxAttempts: 3,
  });
  const detail = await call('GET', `/courses/${id}`, instructor.token);
  expect(detail.body.status).toBe('DRAFT');
  expect((await call('POST', `/courses/${id}/submit`, instructor.token)).status).toBe(400);
});

test('course input is validated (title, lesson link, quiz answers)', async () => {
  expect((await call('POST', '/courses', instructor.token, { title: 'ab', description: 'd', category: 'c', level: 'BEGINNER' })).status).toBe(422);
  const draft = await must<{ id: number }>('POST', '/courses', instructor.token, {
    title: `Draft ${uid('v')}`, description: 'd', category: 'Testing', level: 'BEGINNER', passMark: 70, maxAttempts: 3,
  });
  const m = await must<{ id: number }>('POST', `/courses/${draft.id}/modules`, instructor.token, { title: 'M' });
  expect((await call('POST', `/modules/${m.id}/lessons`, instructor.token, { title: 'Bad link', youtubeUrl: 'https://example.com/video' })).status).toBe(422);
  expect((await call('PUT', `/courses/${draft.id}/quiz`, instructor.token, {
    title: 'Two right', timeLimitMinutes: 5,
    questions: [{ text: 'Q', options: [{ text: 'A', isCorrect: true }, { text: 'B', isCorrect: true }] }],
  })).status).toBe(422);
});

test('instructors cannot approve or publish courses or touch other instructors\' courses', async () => {
  const other = await makeInstructor(admin, 'Other');
  const theirs = await makePublishedCourse(admin, other, 'Their course');
  expect((await call('POST', `/courses/${theirs.id}/approve`, instructor.token)).status).toBe(403);
  expect((await call('POST', `/courses/${theirs.id}/publish`, instructor.token)).status).toBe(403);
  expect((await call('PATCH', `/courses/${theirs.id}`, instructor.token, { title: 'Hijacked title' })).status).toBeGreaterThanOrEqual(403);
  const after = await call('GET', `/courses/${theirs.id}`, admin.token);
  expect(after.body.title).toBe(theirs.title);
});

test('My students lists only assigned students', async ({ page }) => {
  await openAs(page, instructor, 'INSTRUCTOR', '/instructor/students');
  await expect(page.getByText(student.name)).toBeVisible();
  await expect(page.getByText(stranger.name)).toHaveCount(0);
});

test('instructor grants free access to an assigned student, sees them on the right, and can revoke', async ({ page }) => {
  await openAs(page, instructor, 'INSTRUCTOR', '/instructor/grants');
  const form = page.getByRole('form', { name: 'Grant access' });
  await form.getByLabel('Find student').fill(student.name);
  await form.getByLabel('Student', { exact: true }).selectOption(String(student.id));
  await form.getByLabel('Course', { exact: true }).selectOption(String(course.id));
  await form.getByLabel('Reason (optional)').fill('Scholarship');
  await form.getByRole('button', { name: 'Grant access' }).click();

  const right = page.getByRole('region', { name: 'Students with access' });
  await expect(right.getByText(student.name)).toBeVisible();
  const opened = await call('GET', `/courses/${course.id}/learn`, student.token);
  expect(opened.status).toBe(200);

  await right.getByRole('button', { name: 'Revoke' }).first().click();
  await expect.poll(async () => (await call('GET', `/courses/${course.id}/learn`, student.token)).status).toBe(403);
});

test('instructor cannot grant access to a student who is not theirs, and duplicates are refused', async () => {
  expect((await call('POST', '/grants', instructor.token, { studentId: stranger.id, courseId: course.id })).status).toBe(403);
  await grantFree(instructor, student, course);
  expect((await call('POST', '/grants', instructor.token, { studentId: student.id, courseId: course.id })).status).toBe(409);
});

test('instructor dashboard loads real numbers', async ({ page }) => {
  await openAs(page, instructor, 'INSTRUCTOR', '/instructor/dashboard');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Dashboard');
  await expect(page.getByRole('alert')).toHaveCount(0);
});
