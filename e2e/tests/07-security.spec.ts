import { expect, test } from '@playwright/test';
import { call, login } from '../support/api';
import { adminSession, assign, makeInstructor, makePublishedCourse, makeStudent, uid, grantFree, type Person } from '../support/world';
import { openAs } from '../support/ui';

let admin: Person;
let instructor: Person;
let student: Person;

test.beforeAll(async () => {
  admin = await adminSession();
  instructor = await makeInstructor(admin, 'Sec');
  student = await makeStudent('Sec');
});

const PROTECTED_GET = [
  '/auth/me', '/users', '/permissions', '/courses', '/plans', '/bundles', '/purchases', '/grants', '/doubts/contacts', '/notifications',
  '/me/courses', '/me/students', '/me/access', '/certificates', '/dashboard/admin', '/dashboard/student', '/dashboard/instructor',
];

test('every private endpoint refuses requests without a token or with a forged one', async () => {
  for (const path of PROTECTED_GET) {
    expect((await call('GET', path, null)).status, `no token ${path}`).toBe(401);
    expect((await call('GET', path, 'not.a.token')).status, `bad token ${path}`).toBe(401);
  }
});

test('an instructor cannot use admin endpoints', async () => {
  for (const path of ['/users', '/permissions', '/purchases', '/dashboard/admin', '/instructors/load', '/admin/certificates']) {
    expect((await call('GET', path, instructor.token)).status, path).toBe(403);
  }
  expect((await call('PATCH', `/students/${student.id}/instructor`, instructor.token, { instructorId: instructor.id })).status).toBe(403);
  expect((await call('POST', '/users', instructor.token, { role: 'INSTRUCTOR', name: 'Nope', email: 'nope@example.com', expertise: 'x' })).status).toBe(403);
  // An instructor must not be able to make an admin either.
  expect((await call('POST', '/users', instructor.token, { role: 'ADMIN', name: 'Nope', email: 'nope2@example.com' })).status).toBe(403);
  expect((await call('POST', '/users', student.token, { role: 'ADMIN', name: 'Nope', email: 'nope3@example.com' })).status).toBe(403);
});

test('registering cannot create an admin or instructor', async () => {
  const tag = uid('sneak');
  const r = await call('POST', '/auth/register', null, {
    name: 'Sneaky', email: `${tag}@example.com`, password: 'Sneaky-Pass-1', confirmPassword: 'Sneaky-Pass-1', acceptTerms: true, role: 'ADMIN',
  });
  expect(r.status).toBe(201);
  expect(r.body.user.role).toBe('STUDENT');
});

test('user lists never contain password hashes and the admin account cannot be edited', async () => {
  const r = await call('GET', '/users?pageSize=100', admin.token);
  expect(JSON.stringify(r.body)).not.toMatch(/passwordHash|\$2[aby]\$/);
  expect((await call('PATCH', `/users/${admin.id}`, admin.token, { active: false })).status).toBe(403);
});

test('weak and wrong passwords are refused', async () => {
  expect((await call('POST', '/auth/register', null, { name: 'Weak', email: `${uid('w')}@example.com`, password: 'short', confirmPassword: 'short', acceptTerms: true })).status).toBe(422);
  expect((await call('POST', '/auth/change-password', student.token, { currentPassword: 'wrong-current', newPassword: 'Another-Pass-9' })).status).toBe(400);
  expect((await call('POST', '/auth/login', null, { email: student.email, password: 'wrong' })).status).toBe(401);
  expect((await call('POST', '/auth/login', null, { email: 'nobody@example.com', password: 'wrong' })).status).toBe(401);
});

test('odd input in search boxes and ids never crashes the server', async () => {
  for (const path of [
    `/users?search=${encodeURIComponent("' OR 1=1 --")}`,
    `/courses?search=${encodeURIComponent('%_\\')}`,
    '/courses/abc', '/courses/-1', '/doubts/messages?withId=abc', '/users?page=0', '/users?pageSize=100000',
  ]) {
    const r = await call('GET', path, admin.token);
    expect(r.status, path).toBeLessThan(500);
  }
});

test('other students\' quiz attempts and certificates are invisible', async () => {
  const other = await makeStudent('Peek');
  const course = await makePublishedCourse(admin, instructor, 'Sec course');
  await assign(admin, student, instructor);
  await grantFree(admin, student, course);
  expect((await call('GET', '/quiz-attempts/1', other.token)).status).toBeGreaterThanOrEqual(403);
  expect((await call('GET', '/certificates/1/pdf', other.token)).status).toBe(404);
});

test('text from users is shown as text, never run as HTML (doubt message)', async ({ page }) => {
  const asker = await makeStudent('Xss');
  await assign(admin, asker, instructor);
  const payload = '<img src=x onerror="window.__pwned=1">';
  const d = await call('POST', '/doubts/messages', asker.token, { toId: instructor.id, body: `Body ${payload}` });
  expect(d.status).toBe(201);

  let dialogs = 0;
  page.on('dialog', () => { dialogs++; });
  await openAs(page, instructor, 'INSTRUCTOR', '/instructor/doubts');
  await page.getByRole('button', { name: new RegExp(asker.name) }).click();
  await expect(page.getByRole('log').getByText('Body <img', { exact: false })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
  expect(dialogs).toBe(0);
});

test('a re-issued token for a role change is not needed: the server re-reads the user each time', async () => {
  const s = await makeStudent('Reread');
  const before = await login(s.email, s.password);
  expect(before.user.role).toBe('STUDENT');
  expect((await call('GET', '/users', before.token)).status).toBe(403);
});
