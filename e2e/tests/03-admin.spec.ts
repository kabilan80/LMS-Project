import { expect, test } from '@playwright/test';
import { call, must } from '../support/api';
import { adminSession, assign, makeInstructor, makePublishedCourse, makeStudent, uid, type Person } from '../support/world';
import { openAs, signIn } from '../support/ui';

let admin: Person;
test.beforeAll(async () => { admin = await adminSession(); });

test('admin creates an instructor, sees the temporary password once, and the instructor can use it', async ({ page }) => {
  const tag = uid('newins');
  await openAs(page, admin, 'ADMIN', '/admin/users');
  await page.getByLabel('Full name').fill(`Created ${tag}`);
  await page.getByLabel('Email', { exact: true }).fill(`${tag}@example.com`);
  await page.getByLabel('Expertise').fill('Databases');
  await page.getByRole('button', { name: 'Create instructor' }).click();

  const notice = page.getByRole('status').filter({ hasText: 'Instructor created' });
  await expect(notice).toBeVisible();
  const temp = (await notice.locator('code').innerText()).trim();
  expect(temp.length).toBeGreaterThanOrEqual(10);
  await expect(page.getByText(`Created ${tag}`).first()).toBeVisible();

  // A duplicate email is refused with a clear message.
  await page.getByLabel('Full name').fill('Duplicate');
  await page.getByLabel('Email', { exact: true }).fill(`${tag}@example.com`);
  await page.getByLabel('Expertise').fill('Databases');
  await page.getByRole('button', { name: 'Create instructor' }).click();
  await expect(page.getByRole('alert').first()).toContainText('already exists');

  // The new instructor signs in with it and is forced to change it.
  const other = await page.context().browser()!.newContext();
  const p2 = await other.newPage();
  await signIn(p2, { email: `${tag}@example.com`, password: temp });
  await expect(p2).toHaveURL(/\/change-password$/);
});

test('admin creates another admin by choosing the Admin role, and can manage them but not the main admin', async ({ page }) => {
  const tag = uid('newadm');
  await openAs(page, admin, 'ADMIN', '/admin/users');
  await page.getByLabel('Role', { exact: true }).last().selectOption('ADMIN');
  await expect(page.getByLabel('Expertise')).toHaveCount(0); // admins need no expertise
  await page.getByLabel('Full name').fill(`Second ${tag}`);
  await page.getByLabel('Email', { exact: true }).fill(`${tag}@example.com`);
  await page.getByRole('button', { name: 'Create admin' }).click();

  const notice = page.getByRole('status').filter({ hasText: 'Admin created' });
  await expect(notice).toBeVisible();
  const temp = (await notice.locator('code').innerText()).trim();

  // The new admin must change the temporary password first, then has admin access.
  const first = await call('POST', '/auth/login', null, { email: `${tag}@example.com`, password: temp });
  expect(first.status).toBe(200);
  expect(first.body.user.role).toBe('ADMIN');
  expect(first.body.user.mustChangePassword).toBe(true);
  expect((await call('GET', '/users', first.body.token)).status).toBe(403); // blocked until the password is changed
  await must('POST', '/auth/change-password', first.body.token, { currentPassword: temp, newPassword: 'Brand-New-Pass-9' });
  const again = await call('POST', '/auth/login', null, { email: `${tag}@example.com`, password: 'Brand-New-Pass-9' });
  expect((await call('GET', '/users', again.body.token)).status).toBe(200);

  // The first (main) admin can disable the new one, but nobody can change their own account here.
  const list = await call('GET', `/users?role=ADMIN&pageSize=100`, admin.token);
  const created = list.body.items.find((u: { email: string }) => u.email === `${tag}@example.com`);
  expect(created.locked).toBe(false);
  expect((await call('PATCH', `/users/${created.id}`, admin.token, { active: false })).status).toBe(200);
  expect((await call('PATCH', `/users/${created.id}`, admin.token, { active: true })).status).toBe(200);
  expect((await call('PATCH', `/users/${created.id}`, again.body.token, { active: false })).status).toBe(403); // not yourself
  expect((await call('PATCH', `/users/${admin.id}`, again.body.token, { active: false })).status).toBe(403); // not the main admin
});

test('admin disables and re-enables a user; a disabled user is locked out everywhere', async ({ page }) => {
  const student = await makeStudent('Disable');
  await openAs(page, admin, 'ADMIN', '/admin/users');
  await page.getByLabel('Search users').fill(student.email);
  const row = page.getByRole('row').filter({ hasText: student.email });
  await row.getByRole('button', { name: 'Disable' }).click();
  await expect(row.getByRole('button', { name: 'Enable' })).toBeVisible();

  expect((await call('POST', '/auth/login', null, { email: student.email, password: student.password })).status).toBe(401);
  expect((await call('GET', '/auth/me', student.token)).status).toBe(401); // an old token stops working at once

  await row.getByRole('button', { name: 'Enable' }).click();
  await expect(row.getByRole('button', { name: 'Disable' })).toBeVisible();
  expect((await call('POST', '/auth/login', null, { email: student.email, password: student.password })).status).toBe(200);
});

test('admin resets a password and the user must choose a new one', async ({ page }) => {
  const ins = await makeInstructor(admin, 'Reset');
  page.on('dialog', (d) => void d.accept()); // "Reset the password for …?"
  await openAs(page, admin, 'ADMIN', '/admin/users');
  await page.getByLabel('Search users').fill(ins.email);
  await page.getByRole('row').filter({ hasText: ins.email }).getByRole('button', { name: 'Reset password' }).click();
  const notice = page.getByRole('status').filter({ hasText: /password/i }).first();
  await expect(notice.locator('code')).toBeVisible();
  const temp = (await notice.locator('code').innerText()).trim();
  const r = await call('POST', '/auth/login', null, { email: ins.email, password: temp });
  expect(r.status).toBe(200);
  expect(r.body.user.mustChangePassword).toBe(true);
});

test('admin assigns a student to an instructor from the Assign page', async ({ page }) => {
  const ins = await makeInstructor(admin, 'Assignee');
  const student = await makeStudent('Assigned');
  await openAs(page, admin, 'ADMIN', '/admin/assign');
  await page.getByLabel('Search students').fill(student.name);
  await page.getByLabel(`Instructor for ${student.name}`).selectOption(String(ins.id));

  await expect.poll(async () => {
    const r = await call('GET', `/users?role=STUDENT&search=${encodeURIComponent(student.email)}`, admin.token);
    return r.body.items?.[0]?.instructorId;
  }).toBe(ins.id);

  // The instructor now sees the student and the student sees the instructor.
  const mine = await call('GET', '/me/students', ins.token);
  expect(JSON.stringify(mine.body)).toContain(student.name);
  const theirs = await call('GET', '/doubts/contacts', student.token);
  expect(JSON.stringify(theirs.body)).toContain(ins.name);
});

test('admin approves a submitted course from the approval page', async ({ page }) => {
  const ins = await makeInstructor(admin, 'Author');
  const title = `Approve me ${uid('ap')}`;
  const { id } = await must<{ id: number }>('POST', '/courses', ins.token, {
    title, description: 'Needs review', category: 'Testing', level: 'BEGINNER', passMark: 70, maxAttempts: 3,
  });
  const mod = await must<{ id: number }>('POST', `/courses/${id}/modules`, ins.token, { title: 'M1' });
  await must('POST', `/modules/${mod.id}/lessons`, ins.token, { title: 'L1', youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ', durationSeconds: 30, isPreview: false });
  await must('PUT', `/courses/${id}/quiz`, ins.token, {
    title: 'Quiz', timeLimitMinutes: 5,
    questions: [{ text: 'Q?', options: [{ text: 'A', isCorrect: true }, { text: 'B', isCorrect: false }] }],
  });
  await must('POST', `/courses/${id}/submit`, ins.token);

  await openAs(page, admin, 'ADMIN', '/admin/approval');
  await page.getByRole('list', { name: 'Courses waiting for approval' }).getByRole('button', { name: new RegExp(title) }).click();
  await page.getByRole('button', { name: 'Approve and publish' }).click();
  await expect(page.getByRole('list', { name: 'Courses waiting for approval' }).getByText(title)).toHaveCount(0);

  const course = await call('GET', `/courses/${id}`, admin.token);
  expect(course.body.status).toBe('PUBLISHED');
  const note = await call('GET', '/notifications', ins.token);
  expect(JSON.stringify(note.body)).toContain('Course approved');
});

test('rejecting needs a reason and only works on courses waiting for approval', async () => {
  const ins = await makeInstructor(admin, 'Rejected');
  const course = await makePublishedCourse(admin, ins, 'Already live');
  expect((await call('POST', `/courses/${course.id}/reject`, admin.token, { reason: 'x' })).status).toBe(422);
  // A live course is not waiting for approval.
  expect((await call('POST', `/courses/${course.id}/reject`, admin.token, { reason: 'Needs better audio' })).status).toBe(400);
});

test('admin edits a plan price and the change is saved', async ({ page }) => {
  await openAs(page, admin, 'ADMIN', '/admin/plans');
  const plans = page.getByRole('region', { name: 'Plans' });
  await plans.getByRole('button', { name: 'Edit' }).first().click();
  await page.getByLabel(/^Price \(/).fill('1234');
  await plans.getByRole('button', { name: 'Save' }).click();
  await expect.poll(async () => {
    const r = await call('GET', '/plans', admin.token);
    return (r.body as { priceMinor: number }[]).some((p) => p.priceMinor === 123400);
  }).toBe(true);

  // Invalid price is refused.
  await plans.getByRole('button', { name: 'Edit' }).first().click();
  await page.getByLabel(/^Price \(/).fill('abc');
  await plans.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Enter a valid price')).toBeVisible();
});

test('bundles need at least two courses', async () => {
  const ins = await makeInstructor(admin, 'Bundler');
  const a = await makePublishedCourse(admin, ins, 'Bundle A');
  const b = await makePublishedCourse(admin, ins, 'Bundle B');
  expect((await call('POST', '/bundles', admin.token, { name: 'One only', priceMinor: 100, courseIds: [a.id] })).status).toBe(422);
  const ok = await call('POST', '/bundles', admin.token, { name: `Pair ${uid('b')}`, priceMinor: 150000, courseIds: [a.id, b.id], active: true });
  expect(ok.status).toBe(201);
});

test('roles & permissions: turning a student permission off blocks it immediately, turning it on restores it', async ({ page }) => {
  const ins = await makeInstructor(admin, 'Perm');
  const student = await makeStudent('Perm');
  const course = await makePublishedCourse(admin, ins, 'Perm course');
  await must('POST', '/grants', admin.token, { studentId: student.id, courseId: course.id });
  expect((await call('GET', '/me/courses', student.token)).status).toBe(200);

  await openAs(page, admin, 'ADMIN', '/admin/roles');
  const tick = page.getByRole('checkbox', { name: 'Student: Watch lessons and take quizzes' });
  await tick.click();
  await page.getByRole('button', { name: /^Save changes/ }).click();
  await expect.poll(async () => (await call('GET', '/me/courses', student.token)).status).toBe(403);

  await tick.click();
  await page.getByRole('button', { name: /^Save changes/ }).click();
  await expect.poll(async () => (await call('GET', '/me/courses', student.token)).status).toBe(200);
});

test('admin dashboard and certificates pages show data without errors', async ({ page }) => {
  await openAs(page, admin, 'ADMIN', '/admin/dashboard');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Dashboard');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.goto('/admin/certificates');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Certificates');
});
