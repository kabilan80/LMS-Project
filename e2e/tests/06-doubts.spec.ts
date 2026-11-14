import { expect, test } from '@playwright/test';
import { call, must } from '../support/api';
import { adminSession, assign, makeInstructor, makeStudent, uid, type Person } from '../support/world';
import { openAs } from '../support/ui';

let admin: Person;
let instructor: Person;
let otherInstructor: Person;
let student: Person;
let otherStudent: Person;
let loner: Person; // a student the admin has not assigned to anyone

test.beforeAll(async () => {
  admin = await adminSession();
  instructor = await makeInstructor(admin, 'Doubt teacher');
  otherInstructor = await makeInstructor(admin, 'Other teacher');
  student = await makeStudent('Asker');
  otherStudent = await makeStudent('Neighbour');
  loner = await makeStudent('Loner');
  await assign(admin, student, instructor);
  await assign(admin, otherStudent, otherInstructor);
});

test('student asks a doubt in the Doubts page, the assigned instructor sees it and replies, the student sees the reply', async ({ browser }) => {
  const question = `How do loops work ${uid('q')}`;
  const answer = `Think of a loop as a repeat button ${uid('a')}`;

  const sPage = await (await browser.newContext()).newPage();
  await openAs(sPage, student, 'STUDENT', '/student/doubts');
  await expect(sPage.getByRole('heading', { level: 1 })).toHaveText('Doubts');
  await sPage.getByLabel('Type your message').fill(question);
  await sPage.getByLabel('Type your message').press('Enter');
  await expect(sPage.getByRole('log').getByText(question)).toBeVisible();

  const iPage = await (await browser.newContext()).newPage();
  await openAs(iPage, instructor, 'INSTRUCTOR', '/instructor/doubts');
  const contact = iPage.getByRole('button', { name: new RegExp(student.name) });
  await expect(contact.getByLabel('1 unread')).toBeVisible();
  await contact.click();
  await expect(iPage.getByRole('log').getByText(question)).toBeVisible();
  await expect(contact.getByLabel(/unread/)).toHaveCount(0); // opening the conversation marks it read
  await iPage.getByLabel('Type your message').fill(answer);
  await iPage.getByRole('button', { name: 'Send message' }).click();
  await expect(iPage.getByRole('log').getByText(answer)).toBeVisible();

  // The student's open page refreshes by itself.
  await expect(sPage.getByRole('log').getByText(answer)).toBeVisible({ timeout: 15_000 });
});

test('an instructor only sees their own assigned students', async ({ page }) => {
  await openAs(page, instructor, 'INSTRUCTOR', '/instructor/doubts');
  await expect(page.getByRole('button', { name: new RegExp(student.name) })).toBeVisible();
  await expect(page.getByRole('button', { name: new RegExp(otherStudent.name) })).toHaveCount(0);
});

test('a student without an instructor sees a friendly empty state, not an error', async ({ page }) => {
  await openAs(page, loner, 'STUDENT', '/student/doubts');
  await expect(page.getByText('No instructor assigned yet', { exact: false }).first()).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('doubt rules are enforced by the server', async () => {
  const msg = { toId: instructor.id, body: 'hello' };
  expect((await call('GET', '/doubts/contacts', null)).status).toBe(401);
  expect((await call('POST', '/doubts/messages', null, msg)).status).toBe(401);

  // The admin does not take part in doubts.
  expect((await call('GET', '/doubts/contacts', admin.token)).status).toBe(403);
  expect((await call('POST', '/doubts/messages', admin.token, msg)).status).toBe(403);

  // A student can only write to their own instructor; an unassigned student cannot write at all.
  expect((await call('POST', '/doubts/messages', student.token, { toId: otherInstructor.id, body: 'hi' })).status).toBe(404);
  expect((await call('POST', '/doubts/messages', loner.token, msg)).status).toBe(400);
  expect((await call('GET', `/doubts/messages?withId=${otherInstructor.id}`, student.token)).status).toBe(404);

  // An instructor can only write to (or read) their own assigned students.
  expect((await call('POST', '/doubts/messages', instructor.token, { toId: otherStudent.id, body: 'hi' })).status).toBe(404);
  expect((await call('GET', `/doubts/messages?withId=${otherStudent.id}`, instructor.token)).status).toBe(404);
  expect((await call('GET', `/doubts/messages?withId=${loner.id}`, instructor.token)).status).toBe(404);

  // Input checks.
  expect((await call('POST', '/doubts/messages', student.token, { toId: instructor.id, body: '   ' })).status).toBe(422);
  expect((await call('POST', '/doubts/messages', student.token, { toId: instructor.id, body: 'x'.repeat(2001) })).status).toBe(422);
  expect((await call('GET', '/doubts/messages', student.token)).status).toBe(422);

  // The happy path: a message goes through and shows up for both sides.
  const sent = await must<{ id: number; mine: boolean }>('POST', '/doubts/messages', student.token, msg);
  expect(sent.mine).toBe(true);
  const seenByTeacher = await must<{ messages: { body: string; mine: boolean }[] }>('GET', `/doubts/messages?withId=${student.id}`, instructor.token);
  expect(seenByTeacher.messages.some((m) => m.body === 'hello' && !m.mine)).toBe(true);
});

test('reassigning a student moves the conversation to the new instructor', async () => {
  const mover = await makeStudent('Mover');
  await assign(admin, mover, instructor);
  await must('POST', '/doubts/messages', mover.token, { toId: instructor.id, body: 'before the move' });
  await assign(admin, mover, otherInstructor);
  expect((await call('GET', `/doubts/messages?withId=${mover.id}`, instructor.token)).status).toBe(404); // old instructor is out
  const fresh = await must<{ messages: unknown[] }>('GET', `/doubts/messages?withId=${otherInstructor.id}`, mover.token);
  expect(fresh.messages).toHaveLength(0); // a new instructor starts a fresh conversation
});
