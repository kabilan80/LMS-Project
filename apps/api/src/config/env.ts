import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('1d'),
  PORT: z.coerce.number().int().default(4000),
  CLIENT_URL: z.string().url(),
  CURRENCY: z.string().length(3).default('INR'),
  PAYMENT_PROVIDER: z.enum(['mock', 'razorpay', 'stripe']).default('mock'),
  PAYMENT_KEY_ID: z.string().default(''),
  PAYMENT_KEY_SECRET: z.string().default(''),
  PAYMENT_WEBHOOK_SECRET: z.string().default(''),
  DISABLE_RATE_LIMITS: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
  SEED_DEMO: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:');
  for (const issue of parsed.error.issues) console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  process.exit(1);
}

export const env = parsed.data;
