import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  JWT_ISSUER: z.string().default('wormhole-api'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().default(3000),
  REDIS_URL: z.string().optional(),
  /** 32-byte hex key for AES-256-GCM (connection/secret encryption). In production use KMS/Vault. */
  ENCRYPTION_KEY: z.string().length(64).regex(/^[0-9a-fA-F]+$/).optional(),
  /** Comma-separated origins for CORS, or "true" to reflect request origin. Default reflects origin. */
  CORS_ORIGIN: z.string().optional(),
});

export type Config = z.infer<typeof envSchema>;

function loadConfig(): Config {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error('Invalid environment:', parsed.error.flatten());
    process.exit(1);
  }
  return parsed.data;
}

export const config = loadConfig();
