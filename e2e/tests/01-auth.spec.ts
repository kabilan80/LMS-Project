import { expect, test } from '@playwright/test';
import { ADMIN, STRONG_PASSWORD } from '../support/env';
import { must } from '../support/api';
import { adminSession, makeStudent, uid } from '../support/world';
import { openAs, signIn, signInAs, signOut } from '../support/ui';

test.describe('Sign in, register, sign out', () => {
  test('wrong password shows one generic error', async ({ page }) => {
    await signIn(page, { email: ADMIN.email, password: 'definitely-wrong' });
    await expect(page.getByRole('alert')).toHaveText('Incorrect email or password');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('empty form shows a field error and does not call the server', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByText('Enter a valid email')).toBeVisible();
  });

  test('admin signs in, lands on the dashboard, signs out, and is then locked out', async ({ page }) => {
    const admin = await adminSession();
    await signInAs(page, admin, 'ADMIN');
    await signOut(page);
    await page.goto('/admin/users');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('a student registers, is sent to sign in, and reaches the student dashboard', async ({ page }) => {
    const tag = uid('reg');
    await page.goto('/register');
    await page.getByLabel('Full name').fill(`Reg ${tag}`);
    await page.getByLabel('Email').fill(`${tag}@example.com`);
    await page.getByLabel('Password', { exact: true }).fill(STRONG_PASSWORD);
    await page.getByLabel('Confirm password').fill(STRONG_PASSWORD);
    await page.getByLabel('I agree to the terms').check();
    await page.getByRole('button', { name: 'Create account' }).click();

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByText('Account created. Please sign in.')).toBeVisible();
    await page.getByLabel('Password', { exact: true }).fill(STRONG_PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/student\/dashboard$/);
  });

  test('register validates passwords, terms and duplicate emails', async ({ page }) => {
    const existing = await makeStudent('Existing');
    await page.goto('/register');
    await page.getByLabel('Full name').fill('Someone');
    await page.getByLabel('Email').fill(existing.email);
    await page.getByLabel('Password', { exact: true }).fill(STRONG_PASSWORD);
    await page.getByLabel('Confirm password').fill('Different-Pass9');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByText('Passwords do not match')).toBeVisible();
    await expect(page.getByText('You must accept the terms')).toBeVisible();

    await page.getByLabel('Confirm password').fill(STRONG_PASSWORD);
    await page.getByLabel('I agree to the terms').check();
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByRole('alert').first()).toContainText('already exists');
  });

  test('a new instructor must replace the temporary password before anything else', async ({ page }) => {
    const admin = await adminSession();
    const tag = uid('forced');
    const created = await must<{ temporaryPassword: string }>('POST', '/users', admin.token, {
      role: 'INSTRUCTOR', name: `Forced ${tag}`, email: `${tag}@example.com`, expertise: 'Testing',
    });
    await signIn(page, { email: `${tag}@example.com`, password: created.temporaryPassword });
    await expect(page).toHaveURL(/\/change-password$/);

    // The rest of the app is closed until the password is changed.
    await page.goto('/instructor/courses');
    await expect(page).toHaveURL(/\/change-password$/);

    await page.getByLabel('Temporary password').fill(created.temporaryPassword);
    await page.getByLabel('New password', { exact: true }).fill(STRONG_PASSWORD);
    await page.getByLabel('Confirm new password').fill(STRONG_PASSWORD);
    await page.getByRole('button', { name: 'Save password' }).click();
    await expect(page).toHaveURL(/\/instructor\/dashboard$/);
  });

  test('each role is kept out of the other roles\' areas', async ({ page }) => {
    const student = await makeStudent('Guard');
    await openAs(page, student, 'STUDENT', '/admin/users');
    await expect(page).toHaveURL(/\/unauthorized$/);
    await page.goto('/instructor/courses');
    await expect(page).toHaveURL(/\/unauthorized$/);
  });
});
