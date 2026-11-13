import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import { config } from "../config.js";
import { newId, nowIso } from "../db.js";
import { AppError } from "./http.js";
export const SESSION_COOKIE = "sc_session";
export const CSRF_COOKIE = "sc_csrf";
export const CART_COOKIE = "sc_cart";
const BCRYPT_COST = 12;
const SESSION_MS = config.sessionDays * 24 * 60 * 60 * 1000;
export async function hashPassword(password) {
    return bcrypt.hash(password, BCRYPT_COST);
}
export async function verifyPassword(password, hash) {
    return bcrypt.compare(password, hash);
}
export function hashToken(token) {
    return createHash("sha256").update(token).digest("hex");
}
export function createOpaqueToken(bytes = 32) {
    return randomBytes(bytes).toString("base64url");
}
export function safeEqual(left, right) {
    const a = Buffer.from(left);
    const b = Buffer.from(right);
    if (a.length !== b.length)
        return false;
    return timingSafeEqual(a, b);
}
export function sessionUser(db, req) {
    const token = req.cookies?.[SESSION_COOKIE];
    if (typeof token !== "string" || token.length < 20)
        return null;
    const row = db
        .prepare(`SELECT u.id, u.email, u.name, u.phone, u.role
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ?`)
        .get(hashToken(token), nowIso());
    return row ?? null;
}
export function createSession(db, userId, res) {
    const token = createOpaqueToken();
    const expires = new Date(Date.now() + SESSION_MS);
    db.prepare("INSERT INTO sessions (id, token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?, ?)").run(newId(), hashToken(token), userId, expires.toISOString(), nowIso());
    res.cookie(SESSION_COOKIE, token, {
        httpOnly: true,
        sameSite: "lax",
        secure: config.cookieSecure,
        path: "/",
        maxAge: SESSION_MS
    });
}
export function destroySession(db, req, res) {
    const token = req.cookies?.[SESSION_COOKIE];
    if (typeof token === "string" && token) {
        db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashToken(token));
    }
    res.clearCookie(SESSION_COOKIE, { path: "/", sameSite: "lax", secure: config.cookieSecure });
}
export function optionalUser(db) {
    return (req, _res, next) => {
        const user = sessionUser(db, req);
        if (user)
            req.user = user;
        next();
    };
}
export function requireAuth(db) {
    return (req, _res, next) => {
        const user = sessionUser(db, req);
        if (!user) {
            next(new AppError(401, "AUTH_REQUIRED", "Please sign in to continue."));
            return;
        }
        req.user = user;
        next();
    };
}
export function requireRole(...roles) {
    return (req, _res, next) => {
        const user = req.user;
        if (!user) {
            next(new AppError(401, "AUTH_REQUIRED", "Please sign in to continue."));
            return;
        }
        if (user.role === "owner" || user.role === "admin") {
            next();
            return;
        }
        if (!roles.includes(user.role)) {
            next(new AppError(403, "FORBIDDEN", "Your account does not have access to this action."));
            return;
        }
        next();
    };
}
export function csrfProtection(req, res, next) {
    let token = req.cookies?.[CSRF_COOKIE];
    if (typeof token !== "string" || token.length < 20) {
        token = createOpaqueToken(24);
        res.cookie(CSRF_COOKIE, token, {
            httpOnly: false,
            sameSite: "lax",
            secure: config.cookieSecure,
            path: "/",
            maxAge: 7 * 24 * 60 * 60 * 1000
        });
    }
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
        const header = req.get("x-csrf-token");
        if (!header || !safeEqual(String(header), token)) {
            next(new AppError(403, "CSRF_FAILED", "The security token expired. Refresh the page and try again."));
            return;
        }
    }
    next();
}
export function normalizeEmail(email) {
    return email.trim().toLowerCase();
}
