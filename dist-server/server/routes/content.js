import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { config } from "../config.js";
import { getSetting, newId, nowIso } from "../db.js";
import { optionalUser } from "../lib/auth.js";
import { listCategories, listProducts } from "../lib/catalog.js";
import { parseBody, route } from "../lib/http.js";
import { listZones } from "../lib/shipping.js";
const ticketSchema = z.object({
    name: z.string().trim().min(2, "Enter your name.").max(80),
    email: z.string().trim().email("Enter a valid email address.").max(160).transform((value) => value.toLowerCase()),
    subject: z.string().trim().min(3, "Add a subject.").max(120),
    message: z.string().trim().min(10, "Tell us a little more.").max(3000),
    orderNumber: z.string().trim().max(30).optional().default("")
});
const newsletterSchema = z.object({
    email: z.string().trim().email("Enter a valid email address.").max(160).transform((value) => value.toLowerCase()),
    consent: z.boolean().refine((value) => value, "Please confirm that we may store your email."),
    source: z.string().trim().max(30).optional().default("footer")
});
function contactLimiter() {
    return rateLimit({
        windowMs: 15 * 60 * 1000,
        limit: 10,
        standardHeaders: "draft-8",
        legacyHeaders: false,
        message: { error: { code: "RATE_LIMITED", message: "Too many messages. Please wait a few minutes." } }
    });
}
export function contentRoutes(db) {
    const router = Router();
    router.use(optionalUser(db));
    router.get("/site", route((_req, res) => {
        const store = getSetting(db, "store", {
            name: "Sree Collections",
            tagline: "Since 1998",
            supportEmail: "",
            supportPhone: "",
            supportWhatsApp: "",
            address: ""
        });
        const storedProfile = getSetting(db, "publicProfile", {});
        const publicProfile = {
            rating: typeof storedProfile.rating === "number" ? storedProfile.rating : null,
            ratingCount: typeof storedProfile.ratingCount === "number" ? storedProfile.ratingCount : null,
            yearsInBusiness: typeof storedProfile.yearsInBusiness === "number" ? storedProfile.yearsInBusiness : null,
            locality: typeof storedProfile.locality === "string" ? storedProfile.locality : "",
            closesAt: typeof storedProfile.closesAt === "string" ? storedProfile.closesAt : "",
            categories: Array.isArray(storedProfile.categories)
                ? storedProfile.categories.filter((item) => typeof item === "string")
                : []
        };
        const notifications = getSetting(db, "notifications", {
            sendCustomerEmail: true,
            sendOwnerEmail: true,
            ownerEmail: "",
            whatsappAutoOpen: true
        });
        const whatsapp = typeof store.supportWhatsApp === "string" ? store.supportWhatsApp : "";
        const operational = getSetting(db, "operational", { maintenance: false, message: "" });
        const returns = getSetting(db, "returns", { enabled: true, windowDays: 7, note: "" });
        const giftWrap = getSetting(db, "giftWrap", { fee: 0, label: "" });
        const cod = getSetting(db, "cod", { enabled: false, maxTotal: 0, fee: 0 });
        const zones = listZones(db).map((zone) => ({
            name: zone.name,
            fee: zone.fee,
            freeAbove: zone.free_above,
            etaDaysMin: zone.eta_days_min,
            etaDaysMax: zone.eta_days_max
        }));
        res.json({
            store,
            publicProfile,
            notifications: { whatsappAutoOpen: Boolean(notifications.whatsappAutoOpen) },
            operational,
            policies: { returns, giftWrap, cod },
            shipping: {
                zones,
                note: "Delivery is available across India. The fee and estimate depend on the PIN code and the zones configured by the store."
            },
            integrations: {
                onlinePayments: config.integrations.razorpay ? "configured_no_adapter" : "not_configured",
                email: config.integrations.smtp ? "configured_unverified" : "not_configured",
                sms: "not_configured",
                whatsapp: whatsapp ? "click_to_chat" : "not_configured",
                courier: config.integrations.shiprocket ? "configured_no_adapter" : "not_configured",
                routeDistance: config.integrations.googleRoutes ? "configured_no_adapter" : "not_configured"
            }
        });
    }));
    router.get("/home", route((_req, res) => {
        const home = getSetting(db, "home", {
            announcement: "",
            hero: null,
            sections: []
        });
        const featured = listProducts(db, {
            page: 1,
            pageSize: 4,
            offset: 0,
            featured: true,
            sort: "featured"
        }).items;
        const newest = listProducts(db, { page: 1, pageSize: 4, offset: 0, sort: "newest" }).items;
        const personalised = listProducts(db, { page: 1, pageSize: 4, offset: 0, tag: "personalised" }).items;
        const topSellers = db
            .prepare(`SELECT p.id, SUM(oi.quantity) AS sold
           FROM order_items oi JOIN orders o ON o.id = oi.order_id JOIN products p ON p.id = oi.product_id
           WHERE o.status NOT IN ('cancelled') AND p.status = 'published'
           GROUP BY p.id ORDER BY sold DESC LIMIT 4`)
            .all();
        const bestsellers = topSellers
            .map((entry) => listProducts(db, { page: 1, pageSize: 48, offset: 0 }).items.find((product) => product.id === entry.id))
            .filter((product) => Boolean(product));
        res.json({
            announcement: home.announcement,
            hero: home.hero,
            sections: [...(home.sections ?? [])]
                .filter((section) => section.enabled)
                .sort((left, right) => left.order - right.order),
            categories: listCategories(db),
            collections: {
                featured,
                newest,
                personalised,
                bestsellers
            },
            testimonials: [],
            testimonialsNote: "Customer testimonials appear here only after real, moderated reviews are available. None are shown yet."
        });
    }));
    router.post("/support/tickets", contactLimiter(), route((req, res) => {
        const user = req.user ?? null;
        const input = parseBody(ticketSchema, req.body);
        const id = newId();
        const ticketNumber = `ST-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${Math.floor(1000 + Math.random() * 9000)}`;
        db.prepare(`INSERT INTO support_tickets
           (id, ticket_number, user_id, name, email, subject, message, order_number, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)`).run(id, ticketNumber, user?.id ?? null, input.name, input.email, input.subject, input.message, input.orderNumber || null, nowIso());
        res.status(201).json({
            ticketNumber,
            message: "Your message has been saved for the store team. Automated email replies are not enabled, so please call the store for anything urgent."
        });
    }));
    router.post("/newsletter", contactLimiter(), route((req, res) => {
        const input = parseBody(newsletterSchema, req.body);
        db.prepare(`INSERT INTO newsletter_subscribers (email, source, consent_at, unsubscribed_at) VALUES (?, ?, ?, NULL)
         ON CONFLICT(email) DO UPDATE SET source = excluded.source, consent_at = excluded.consent_at, unsubscribed_at = NULL`).run(input.email, input.source || "footer", nowIso());
        res.status(201).json({
            message: "Your email has been saved. Automated newsletters are not sending yet; you can ask us to remove your details at any time.",
            delivery: "not_configured"
        });
    }));
    router.delete("/newsletter", contactLimiter(), route((req, res) => {
        const input = parseBody(z.object({ email: z.string().trim().toLowerCase().email() }), req.query);
        db.prepare("UPDATE newsletter_subscribers SET unsubscribed_at = ? WHERE email = ?").run(nowIso(), input.email);
        res.json({ ok: true });
    }));
    return router;
}
