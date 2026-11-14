/**
 * Creates the admin account in the database. Nothing about the admin lives in .env.
 *   pnpm create-admin                                  (asks for name, email and password; the password is hidden)
 *   pnpm create-admin --name X --email a@b.com --password '...'   (non-interactive, used by the browser tests)
 */
import { createInterface } from 'node:readline';
import { createAdmin } from '../src/lib/admin';
import { prisma } from '../src/config/prisma';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function ask(question: string, hidden = false): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  return new Promise((resolve) => {
    if (hidden) {
      // Hide what is typed: everything after the prompt is swallowed by the readline output hook.
      const rlAny = rl as unknown as { _writeToOutput: (s: string) => void };
      rlAny._writeToOutput = (s: string) => {
        if (s.includes(question)) process.stdout.write(s);
      };
    }
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write('\n');
      resolve(answer);
    });
  });
}

async function main() {
  const name = arg('name') ?? (await ask('Admin name: '));
  const email = arg('email') ?? (await ask('Admin email: '));
  let password = arg('password');
  if (!password) {
    password = await ask('Admin password (min 8 characters): ', true);
    if (password !== (await ask('Repeat password: ', true))) throw new Error('Passwords do not match');
  }
  const result = await createAdmin({ name, email, password });
  console.log(`Admin ${result}: ${email.trim().toLowerCase()}`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
