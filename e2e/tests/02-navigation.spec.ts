import { expect, test } from '@playwright/test';
import { adminSession, assign, makeInstructor, makePublishedCourse, makeStudent, grantFree, type Person } from '../support/world';
import { navItems, openAs, watchForProblems } from '../support/ui';

/**
 * Opens every menu item of every role and checks the page really loads: right title, no error banner,
 * no "built in a later phase" placeholder, no JavaScript errors, no 5xx from the API.
 */
let admin: Person;
let instructor: Person;
let student: Person;

test.beforeAll(async () => {
  admin = await adminSession();
  instructor = await makeInstructor(admin, 'Nav');
  student = await makeStudent('Nav');
  await assign(admin, student, instructor);
  const course = await makePublishedCourse(admin, instructor, 'Nav course');
  await grantFree(admin, student, course);
});

for (const role of ['ADMIN', 'INSTRUCTOR', 'STUDENT'] as const) {
  test(`every ${role.toLowerCase()} menu page loads`, async ({ page }) => {
    const who = role === 'ADMIN' ? admin : role === 'INSTRUCTOR' ? instructor : student;
    const problems = watchForProblems(page);
    await openAs(page, who, role, navItems(role)[0]!.path);

    for (const item of navItems(role)) {
      await page.goto(item.path);
      await expect(page.getByRole('heading', { level: 1 }), item.path).toHaveText(item.label);
      await expect(page.getByText('This page is built in a later phase.'), item.path).toHaveCount(0);
      await expect(page.getByRole('alert'), `${item.path} shows an error`).toHaveCount(0);
      await expect(page.getByText('Loading…'), item.path).toHaveCount(0);
    }
    expect(problems).toEqual([]);
  });
}

test('the admin menu has no Doubts page and the old address is a 404 page; Roles & permissions is last', async ({ page }) => {
  await openAs(page, admin, 'ADMIN', '/admin/dashboard');
  const menu = page.getByRole('navigation', { name: 'Main menu' });
  await expect(menu.getByText('Doubts')).toHaveCount(0);
  await expect(menu.getByText('Doubts')).toHaveCount(0);
  await expect(menu.getByRole('link').last()).toHaveText('Roles & permissions');
  await page.goto('/admin/doubts');
  await expect(page.getByRole('heading', { name: /not found|404/i })).toBeVisible();
});

test('instructor and student menus have Doubts (and no My instructor)', async ({ page }) => {
  await openAs(page, instructor, 'INSTRUCTOR', '/instructor/dashboard');
  const imenu = page.getByRole('navigation', { name: 'Main menu' });
  await expect(imenu.getByRole('link', { name: 'Doubts' })).toBeVisible();
  await openAs(page, student, 'STUDENT', '/student/dashboard');
  const smenu = page.getByRole('navigation', { name: 'Main menu' });
  await expect(smenu.getByRole('link', { name: 'Doubts' })).toBeVisible();
  await expect(smenu.getByText('My instructor')).toHaveCount(0);
});

test('unknown addresses show the not-found page', async ({ page }) => {
  await page.goto('/this/does/not/exist');
  await expect(page.getByRole('heading', { name: /not found|404/i })).toBeVisible();
});
