import { config } from "../config.js";
import { newId, nowIso } from "../db.js";
import { CART_COOKIE, createOpaqueToken, hashToken } from "./auth.js";
const CART_MS = config.cartDays * 24 * 60 * 60 * 1000;
function cookieOptions() {
    return {
        httpOnly: true,
        sameSite: "lax",
        secure: config.cookieSecure,
        path: "/",
        maxAge: CART_MS
    };
}
function findByToken(db, token) {
    return db.prepare("SELECT * FROM carts WHERE token_hash = ?").get(hashToken(token));
}
function latestUserCart(db, userId) {
    return db
        .prepare("SELECT * FROM carts WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1")
        .get(userId);
}
function createCart(db, res, userId) {
    const token = createOpaqueToken();
    const id = newId();
    const timestamp = nowIso();
    db.prepare("INSERT INTO carts (id, token_hash, user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)").run(id, hashToken(token), userId, timestamp, timestamp);
    res.cookie(CART_COOKIE, token, cookieOptions());
    return db.prepare("SELECT * FROM carts WHERE id = ?").get(id);
}
export function resolveCart(db, req, res, user) {
    const token = req.cookies?.[CART_COOKIE];
    if (typeof token === "string" && token.length >= 20) {
        const cart = findByToken(db, token);
        if (cart) {
            if (!user) {
                if (!cart.user_id) {
                    res.cookie(CART_COOKIE, token, cookieOptions());
                    return cart;
                }
                // A signed-out browser must never keep another account's cart.
                return createCart(db, res, null);
            }
            if (!cart.user_id) {
                db.prepare("UPDATE carts SET user_id = ?, updated_at = ? WHERE id = ?").run(user.id, nowIso(), cart.id);
                res.cookie(CART_COOKIE, token, cookieOptions());
                return { ...cart, user_id: user.id };
            }
            if (cart.user_id === user.id) {
                res.cookie(CART_COOKIE, token, cookieOptions());
                return cart;
            }
            return createCart(db, res, user.id);
        }
        if (user) {
            const existing = latestUserCart(db, user.id);
            if (existing) {
                return createCart(db, res, user.id);
            }
        }
        return createCart(db, res, user ? user.id : null);
    }
    if (user) {
        const existing = latestUserCart(db, user.id);
        if (existing) {
            // No raw token is available for an existing cart, so start a fresh one and leave the old cart untouched.
            return createCart(db, res, user.id);
        }
    }
    return createCart(db, res, user ? user.id : null);
}
export function mergeGuestCart(db, req, res, userId) {
    const token = req.cookies?.[CART_COOKIE];
    const guest = typeof token === "string" && token.length >= 20 ? findByToken(db, token) : undefined;
    if (!guest)
        return;
    if (guest.user_id && guest.user_id !== userId)
        return;
    const target = latestUserCart(db, userId);
    if (!target || target.id === guest.id) {
        db.prepare("UPDATE carts SET user_id = ?, updated_at = ? WHERE id = ?").run(userId, nowIso(), guest.id);
        res.cookie(CART_COOKIE, token, cookieOptions());
        return;
    }
    const targetItems = db.prepare("SELECT * FROM cart_items WHERE cart_id = ?").all(target.id);
    const upsert = db.prepare(`INSERT INTO cart_items
       (id, cart_id, product_id, variant_id, quantity, gift_wrap, gift_message, personalization_json, added_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(cart_id, product_id, variant_id) DO UPDATE SET
       quantity = MIN(20, cart_items.quantity + excluded.quantity)`);
    for (const item of targetItems) {
        upsert.run(newId(), guest.id, item.product_id, item.variant_id, item.quantity, item.gift_wrap, item.gift_message, item.personalization_json, nowIso());
    }
    if (!guest.coupon_code && target.coupon_code) {
        db.prepare("UPDATE carts SET coupon_code = ? WHERE id = ?").run(target.coupon_code, guest.id);
    }
    db.prepare("DELETE FROM carts WHERE id = ?").run(target.id);
    db.prepare("UPDATE carts SET user_id = ?, updated_at = ? WHERE id = ?").run(userId, nowIso(), guest.id);
    res.cookie(CART_COOKIE, token, cookieOptions());
}
export function touchCart(db, cartId) {
    db.prepare("UPDATE carts SET updated_at = ? WHERE id = ?").run(nowIso(), cartId);
}
