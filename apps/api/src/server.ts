import { env } from './config/env';
import { adminExists } from './lib/admin';
import { prisma } from './config/prisma';
import { createApp } from './app';

async function main() {
  if (!(await adminExists()));
  const app = createApp();
  app.listen(env.PORT, () => {
    console.log(`API listening on http://localhost:${env.PORT}`);
  });
}

main().catch(async (err) => {
  console.error('Failed to start server:', err);
  await prisma.$disconnect();
  process.exit(1);
});
