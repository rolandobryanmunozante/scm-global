import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z
    .string()
    .default("postgresql://scm_user:scm_password@localhost:5432/scm_global"),
  JWT_SECRET: z.string().min(16).default("local-development-secret-change-me"),
  WEB_ORIGIN: z.string().default("http://localhost:5173"),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().default("SCM Global <no-reply@scm.local>"),
});

export const config = envSchema.parse(process.env);
