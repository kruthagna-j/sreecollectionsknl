import "dotenv/config";
import { resolve } from "node:path";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  APP_ORIGIN: z.string().url().default("http://localhost:5175"),
  DATABASE_PATH: z.string().default("./data/sree.db"),
  COOKIE_SECURE: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value === "true")
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment configuration:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const env = parsed.data;
const isProduction = env.NODE_ENV === "production";

if (isProduction && !process.env.APP_ORIGIN) {
  console.error("APP_ORIGIN must be set explicitly in production.");
  process.exit(1);
}

export const config = {
  env: env.NODE_ENV,
  isProduction,
  port: env.PORT,
  appOrigin: env.APP_ORIGIN.replace(/\/$/, ""),
  databasePath: resolve(process.cwd(), env.DATABASE_PATH),
  cookieSecure: env.COOKIE_SECURE ?? isProduction,
  sessionDays: 30,
  cartDays: 365,
  integrations: {
    razorpay: Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET),
    razorpayWebhook: Boolean(process.env.RAZORPAY_WEBHOOK_SECRET),
    shiprocket: Boolean(process.env.SHIPROCKET_EMAIL && process.env.SHIPROCKET_PASSWORD),
    googleRoutes: Boolean(process.env.GOOGLE_ROUTES_API_KEY),
    smtp: Boolean(process.env.SMTP_URL),
    smtpFrom: process.env.SMTP_FROM ?? ""
  }
} as const;

export type AppConfig = typeof config;
