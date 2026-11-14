import { expect, test } from '@playwright/test';
import { call, must } from '../support/api';
import { adminSession, makeInstructor, makePublishedCourse, makeStudent, type Person } from '../support/world';
import { openAs, watchForProblems } from '../support/ui';

let admin: Person;
let instructor: Person;

test.beforeAll(async () => {
  admin = await adminSession();
  instructor = await makeInstructor(admin, 'Home teacher');
});

test('the home page opens without signing in and shows only the courses the admin chose', async ({ page }) => {
  const shown = await makePublishedCourse(admin, instructor, 'Visible on home');
  const hidden = await makePublishedCourse(admin, instructor, 'Not on home');
  await must('PATCH', `/home-courses/${shown.id}`, admin.token, { show: true });

  const problems = watchForProblems(page);
  await page.goto('/');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Learn at your pace');
  await expect(page.getByRole('link', { name: 'Get started' }).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: shown.title })).toBeVisible();
  await expect(page.getByRole('heading', { name: hidden.title })).toHaveCount(0);
  expect(problems).toEqual([]);

  // Hiding it again removes it from the page.
  await must('PATCH', `/home-courses/${shown.id}`, admin.token, { show: false });
  await page.reload();
  await expect(page.getByRole('heading', { name: shown.title })).toHaveCount(0);
});

test('a signed-in student sees a link to their dashboard on the home page', async ({ page }) => {
  const student = await makeStudent('Home visitor');
  await openAs(page, student, 'STUDENT', '/');
  await expect(page.getByRole('link', { name: 'Go to my dashboard' })).toBeVisible();
});

test('the admin page switches courses on and off, and the public API only returns published, chosen courses', async ({ page }) => {
  const course = await makePublishedCourse(admin, instructor, 'Switch me');
  await openAs(page, admin, 'ADMIN', '/admin/home-courses');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Home page courses');
  const row = page.getByRole('row').filter({ hasText: course.title });
  await row.getByRole('button', { name: 'Show on home page' }).click();
  await expect(row.getByText('Shown')).toBeVisible();
  expect(JSON.stringify((await call('GET', '/public/home', null)).body)).toContain(course.title);
  await row.getByRole('button', { name: 'Hide' }).click();
  await expect(row.getByText('Hidden')).toBeVisible();
  expect(JSON.stringify((await call('GET', '/public/home', null)).body)).not.toContain(course.title);
});

test('only the admin can change the home page, and at most 8 courses can be shown', async () => {
  const student = await makeStudent('Nosy');
  const course = await makePublishedCourse(admin, instructor, 'Guarded');
  expect((await call('PATCH', `/home-courses/${course.id}`, instructor.token, { show: true })).status).toBe(403);
  expect((await call('PATCH', `/home-courses/${course.id}`, student.token, { show: true })).status).toBe(403);
  expect((await call('GET', '/home-courses', student.token)).status).toBe(403);
  expect((await call('PATCH', `/home-courses/${course.id}`, admin.token, { show: 'yes' })).status).toBe(422);
  expect((await call('PATCH', '/home-courses/999999', admin.token, { show: true })).status).toBe(404);

  const list = await must<{ items: { id: number; showOnHome: boolean }[]; max: number }>('GET', '/home-courses', admin.token);
  for (const c of list.items.filter((c) => c.showOnHome)) await must('PATCH', `/home-courses/${c.id}`, admin.token, { show: false });
  const made = [] as number[];
  for (let i = 0; i < list.max; i++) {
    const c = await makePublishedCourse(admin, instructor, `Cap ${i}`);
    made.push(c.id);
    await must('PATCH', `/home-courses/${c.id}`, admin.token, { show: true });
  }
  expect((await call('PATCH', `/home-courses/${course.id}`, admin.token, { show: true })).status).toBe(400);
  for (const id of made) await must('PATCH', `/home-courses/${id}`, admin.token, { show: false });
});
