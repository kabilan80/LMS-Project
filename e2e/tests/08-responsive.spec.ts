import { expect, test } from '@playwright/test';
import { adminSession, assign, grantFree, makeInstructor, makePublishedCourse, makeStudent, type Person } from '../support/world';
import { navItems, openAs } from '../support/ui';

/** Runs on a phone-sized screen (see the "phone" project): menu drawer works and nothing scrolls sideways. */
let admin: Person;
let instructor: Person;
let student: Person;

test.beforeAll(async () => {
  admin = await adminSession();
  instructor = await makeInstructor(admin, 'Phone');
  student = await makeStudent('Phone');
  await assign(admin, student, instructor);
  const course = await makePublishedCourse(admin, instructor, 'Phone course');
  await grantFree(admin, student, course);
});

const noSidewaysScroll = (page: import('@playwright/test').Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1 && document.body.scrollWidth <= window.innerWidth + 1);

test('student: the menu opens as a drawer and pages fit the screen', async ({ page }) => {
  await openAs(page, student, 'STUDENT', '/student/dashboard');
  await page.getByRole('button', { name: 'Open menu' }).click();
  await page.getByRole('navigation', { name: 'Main menu' }).getByRole('link', { name: 'Doubts' }).click();
  await expect(page).toHaveURL(/\/student\/doubts$/);
  for (const item of navItems('STUDENT')) {
    await page.goto(item.path);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(item.label);
    expect(await noSidewaysScroll(page), item.path).toBe(true);
  }
});

test('instructor and admin pages fit the screen', async ({ page }) => {
  await openAs(page, instructor, 'INSTRUCTOR', '/instructor/dashboard');
  for (const item of navItems('INSTRUCTOR')) {
    await page.goto(item.path);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(item.label);
    expect(await noSidewaysScroll(page), item.path).toBe(true);
  }
  await openAs(page, admin, 'ADMIN', '/admin/dashboard');
  for (const item of navItems('ADMIN')) {
    await page.goto(item.path);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(item.label);
  }
});
