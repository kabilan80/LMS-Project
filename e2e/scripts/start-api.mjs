// Starts the API for the browser tests on a throw-away database:
//   1. refuses to touch any database whose name does not end in `_e2e`
//   2. recreates the tables (prisma db push --force-reset) and seeds permissions, plans and then creates the admin in the database
//   3. runs the API (no file watching)
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const apiDir = path.join(root, 'apps', 'api');
const url = process.env.DATABASE_URL ?? '';
const dbName = url.split('?')[0].split('/').pop() ?? '';
if (!dbName.endsWith('_e2e')) {
  console.error(`Refusing to reset database "${dbName}". The test database name must end in _e2e (set E2E_DATABASE_URL).`);
  process.exit(1);
}

const run = (args) => {
  const r = spawnSync('pnpm', ['exec', ...args], { cwd: apiDir, stdio: 'inherit', env: process.env, shell: process.platform === 'win32' });
  if (r.status !== 0) process.exit(r.status ?? 1);
};
run(['prisma', 'db', 'push', '--force-reset', '--skip-generate', '--accept-data-loss']);
run(['prisma', 'db', 'seed']);
run(['tsx', 'prisma/create-admin.ts', '--name', process.env.E2E_ADMIN_NAME, '--email', process.env.E2E_ADMIN_EMAIL, '--password', process.env.E2E_ADMIN_PASSWORD]);

const server = spawn('pnpm', ['exec', 'tsx', 'src/server.ts'], { cwd: apiDir, stdio: 'inherit', env: process.env, shell: process.platform === 'win32' });
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => server.kill(sig));
server.on('exit', (code) => process.exit(code ?? 0));
