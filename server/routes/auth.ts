import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { newId, nowIso, type DB } from "../db.js";
import { audit } from "../lib/audit.js";
import {
  createSession,
  destroySession,
  hashPassword,
  normalizeEmail,
  optionalUser,
  requireAuth,
  sessionUser,
  verifyPassword,
  type AuthedRequest
} from "../lib/auth.js";
import { mergeGuestCart } from "../lib/cart.js";
import { AppError, parseBody, route } from "../lib/http.js";

const phone = z
  .string()
  .trim()
  .transform((value) => value.replace(/[\s-]/g, "").replace(/^\+?91/, ""))
  .refine((value) => /^[6-9]\d{9}$/.test(value), "Enter a valid 10-digit Indian mobile number.");

const password = z
  .string()
  .min(10, "Use at least 10 characters.")
  .max(128, "Use 128 characters or fewer.")
  .regex(/[A-Za-z]/, "Include at least one letter.")
  .regex(/\d/, "Include at least one number.");

const registerSchema = z.object({
  name: z.string().trim().min(2, "Enter your name.").max(80),
  email: z.string().trim().email("Enter a valid email address.").max(160).transform(normalizeEmail),
  phone: phone.optional(),
  password
});

const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid email address.").transform(normalizeEmail),
  password: z.string().min(1, "Enter your password.").max(128)
});

const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1, "Enter your current password."),
  newPassword: password
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: { code: "RATE_LIMITED", message: "Too many attempts. Please wait a few minutes." } }
});

// Each attempt verifies a bcrypt hash, so a scripted run costs CPU as well as guessing tries.
const credentialLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: { code: "RATE_LIMITED", message: "Too many password attempts. Please wait a few minutes." } }
});

export function authRoutes(db: DB): Router {
  const router = Router();

  router.get(
    "/session",
    optionalUser(db),
    route((req, res) => {
      const user = (req as AuthedRequest).user ?? null;
      res.json({ user });
    })
  );

  router.post(
    "/register",
    authLimiter,
    route(async (req, res) => {
      const input = parseBody(registerSchema, req.body);
      const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(input.email);
      if (existing) throw new AppError(409, "EMAIL_IN_USE", "An account with this email already exists.");

      const id = newId();
      const passwordHash = await hashPassword(input.password);
      try {
        db.prepare(
          "INSERT INTO users (id, email, password_hash, name, phone, role, created_at) VALUES (?, ?, ?, ?, ?, 'customer', ?)"
        ).run(id, input.email, passwordHash, input.name, input.phone ?? null, nowIso());
      } catch (error) {
        if (error instanceof Error && /UNIQUE/i.test(error.message)) {
          throw new AppError(409, "EMAIL_IN_USE", "An account with this email already exists.");
        }
        throw error;
      }

      createSession(db, id, res);
      mergeGuestCart(db, req, res, id);
      audit(db, id, "auth.registered", "user", id);
      res.status(201).json({
        user: { id, email: input.email, name: input.name, phone: input.phone ?? null, role: "customer" }
      });
    })
  );

  router.post(
    "/login",
    authLimiter,
    route(async (req, res) => {
      const input = parseBody(loginSchema, req.body);
      const user = db
        .prepare("SELECT id, email, name, phone, role, password_hash FROM users WHERE email = ?")
        .get(input.email) as
        | { id: string; email: string; name: string; phone: string | null; role: string; password_hash: string }
        | undefined;

      if (!user || !(await verifyPassword(input.password, user.password_hash))) {
        throw new AppError(401, "INVALID_CREDENTIALS", "Email or password is incorrect.");
      }

      createSession(db, user.id, res);
      mergeGuestCart(db, req, res, user.id);
      audit(db, user.id, "auth.signed_in", "user", user.id);
      res.json({
        user: { id: user.id, email: user.email, name: user.name, phone: user.phone, role: user.role }
      });
    })
  );

  router.post(
    "/logout",
    route((req, res) => {
      const user = sessionUser(db, req);
      destroySession(db, req, res);
      if (user) audit(db, user.id, "auth.signed_out", "user", user.id);
      res.json({ ok: true });
    })
  );

  router.post(
    "/password",
    requireAuth(db),
    credentialLimiter,
    route(async (req, res) => {
      const user = (req as AuthedRequest).user!;
      const input = parseBody(passwordChangeSchema, req.body);
      const row = db.prepare("SELECT password_hash FROM users WHERE id = ?").get(user.id) as
        | { password_hash: string }
        | undefined;
      if (!row || !(await verifyPassword(input.currentPassword, row.password_hash))) {
        throw new AppError(400, "CURRENT_PASSWORD_INVALID", "Your current password is incorrect.");
      }
      const nextHash = await hashPassword(input.newPassword);
      db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(nextHash, user.id);
      db.prepare("DELETE FROM sessions WHERE user_id = ?").run(user.id);
      createSession(db, user.id, res);
      audit(db, user.id, "auth.password_changed", "user", user.id);
      res.json({ ok: true });
    })
  );

  router.post(
    "/password/forgot",
    authLimiter,
    route((_req, res) => {
      throw new AppError(
        503,
        "EMAIL_NOT_CONFIGURED",
        "Password recovery by email is not available yet. No email provider is configured for this store. Please contact the store directly."
      );
    })
  );

  return router;
}
