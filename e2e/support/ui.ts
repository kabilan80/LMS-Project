import { expect, type Page } from '@playwright/test';
import { NAV, ROLE_HOME } from '@lms/shared';
import type { Person } from './world';

export async function signIn(page: Page, who: Pick<Person, 'email' | 'password'>) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(who.email);
  await page.getByLabel('Password', { exact: true }).fill(who.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

/** Signs in through the form and waits for the role's home page. */
export async function signInAs(page: Page, who: Person, role: 'ADMIN' | 'INSTRUCTOR' | 'STUDENT') {
  await signIn(page, who);
  await expect(page).toHaveURL(new RegExp(`${ROLE_HOME[role]}$`));
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
}

export async function signOut(page: Page) {
  await page.locator('button[aria-haspopup="menu"]').click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/);
}

export const navItems = (role: 'ADMIN' | 'INSTRUCTOR' | 'STUDENT') => NAV[role].flatMap((g) => g.items);

/** Records anything that would make a real user see a broken page: JS errors and failed API calls (5xx). */
export function watchForProblems(page: Page) {
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/favicon|Failed to load resource.*(401|403|404|409|422)/.test(m.text())) problems.push(`console: ${m.text()}`);
  });
  page.on('response', (r) => {
    if (r.status() >= 500) problems.push(`HTTP ${r.status()} ${r.request().method()} ${r.url()}`);
  });
  return problems;
}

/** Starts the page already signed in (same storage format the app uses), then opens `path`. Much faster than the form. */
export async function openAs(page: Page, who: Person, role: 'ADMIN' | 'INSTRUCTOR' | 'STUDENT', path: string) {
  const state = {
    state: { token: who.token, user: { id: who.id, name: who.name, email: who.email, role, mustChangePassword: false }, remember: true },
    version: 0,
  };
  await page.addInitScript((value) => localStorage.setItem('lms-auth', value), JSON.stringify(state));
  await page.goto(path);
}
