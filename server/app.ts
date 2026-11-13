import { existsSync } from "node:fs";
import { resolve } from "node:path";
import compression from "compression";
import cookieParser from "cookie-parser";
import express, { type Express, type NextFunction, type Request, type Response } from "express";
import { rateLimit } from "express-rate-limit";
import helmet from "helmet";
import { config } from "./config.js";
import type { DB } from "./db.js";
import { csrfProtection } from "./lib/auth.js";
import { AppError, route } from "./lib/http.js";
import { renderRobotsTxt, renderSitemap } from "./lib/seo.js";
import { accountRoutes } from "./routes/account.js";
import { adminRoutes } from "./routes/admin.js";
import { authRoutes } from "./routes/auth.js";
import { cartRoutes } from "./routes/cart.js";
import { catalogRoutes } from "./routes/catalog.js";
import { checkoutRoutes, orderLookupRoutes } from "./routes/checkout.js";
import { contentRoutes } from "./routes/content.js";

const API_PREFIX = "/api/v1";

export function createApp(db: DB): Express {
  const app = express();
  app.disable("x-powered-by");
  if (config.isProduction) app.set("trust proxy", 1);

  app.use(
    helmet({
      contentSecurityPolicy: config.isProduction
        ? {
            directives: {
              defaultSrc: ["'self'"],
              imgSrc: ["'self'", "data:", "https:"],
              styleSrc: ["'self'", "'unsafe-inline'"],
              scriptSrc: ["'self'"],
              fontSrc: ["'self'", "data:"],
              connectSrc: ["'self'"],
              objectSrc: ["'none'"],
              frameAncestors: ["'none'"],
              baseUri: ["'self'"],
              formAction: ["'self'"]
            }
          }
        : false,
      crossOriginEmbedderPolicy: false
    })
  );
  app.use(compression());
  app.use(express.json({ limit: "100kb" }));
  app.use(express.urlencoded({ extended: false, limit: "50kb" }));
  app.use(cookieParser());

  if (config.env !== "test") {
    app.use((req, res, next) => {
      const started = process.hrtime.bigint();
      res.on("finish", () => {
        const durationMs = Number(process.hrtime.bigint() - started) / 1_000_000;
        const line = JSON.stringify({
          level: res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info",
          time: new Date().toISOString(),
          method: req.method,
          path: req.path,
          status: res.statusCode,
          durationMs: Math.round(durationMs * 10) / 10
        });
        if (res.statusCode >= 500) console.error(line);
        else if (config.env !== "production" || res.statusCode >= 400) console.log(line);
      });
      next();
    });
  }

  app.use("/api", (req, _res, next) => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      next();
      return;
    }
    const origin = req.get("origin");
    if (origin && origin.replace(/\/$/, "") !== config.appOrigin) {
      next(new AppError(403, "ORIGIN_NOT_ALLOWED", "This request came from an untrusted origin."));
      return;
    }
    next();
  });

  app.use(
    "/api",
    rateLimit({
      windowMs: 5 * 60 * 1000,
      limit: 900,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      skip: (req) => req.path === "/v1/health",
      message: { error: { code: "RATE_LIMITED", message: "Too many requests. Please slow down and try again." } }
    })
  );

  app.use((req, res, next) => {
    if (req.path.startsWith("/api")) res.setHeader("Cache-Control", "no-store");
    next();
  });

  app.use("/api", csrfProtection);

  app.get(
    "/robots.txt",
    route((_req, res) => {
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.send(renderRobotsTxt());
    })
  );

  app.get(
    "/sitemap.xml",
    route((_req, res) => {
      res.setHeader("Content-Type", "application/xml; charset=utf-8");
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.send(renderSitemap(db));
    })
  );

  app.get(`${API_PREFIX}/health`, (_req, res) => {
    let database = "ok";
    try {
      db.prepare("SELECT 1").get();
    } catch {
      database = "error";
    }
    res.status(database === "ok" ? 200 : 503).json({
      status: database === "ok" ? "ok" : "degraded",
      version: "0.1.0",
      database,
      uptimeSeconds: Math.round(process.uptime()),
      integrations: {
        // A key in the environment does not mean the store can use that service. Only SMTP has an
        // adapter in this build, so the other three must never read as merely "unverified".
        onlinePayments: config.integrations.razorpay ? "configured_no_adapter" : "not_configured",
        email: config.integrations.smtp ? "configured_unverified" : "not_configured",
        courier: config.integrations.shiprocket ? "configured_no_adapter" : "not_configured",
        routeDistance: config.integrations.googleRoutes ? "configured_no_adapter" : "not_configured"
      }
    });
  });

  app.use(`${API_PREFIX}/auth`, authRoutes(db));
  app.use(`${API_PREFIX}/catalog`, catalogRoutes(db));
  app.use(`${API_PREFIX}/cart`, cartRoutes(db));
  app.use(`${API_PREFIX}/checkout`, checkoutRoutes(db));
  app.use(`${API_PREFIX}/orders`, orderLookupRoutes(db));
  app.use(`${API_PREFIX}/account`, accountRoutes(db));
  app.use(`${API_PREFIX}/content`, contentRoutes(db));
  app.use(`${API_PREFIX}/admin`, adminRoutes(db));

  app.use("/api", (req, _res, next) => {
    next(new AppError(404, "ENDPOINT_NOT_FOUND", `No API endpoint matches ${req.method} ${req.path}.`));
  });

  if (config.isProduction) {
    const dist = resolve(process.cwd(), "dist");
    if (existsSync(dist)) {
      app.use(
        express.static(dist, {
          index: false,
          setHeaders: (res, path) => {
            if (path.endsWith("index.html")) {
              res.setHeader("Cache-Control", "no-cache");
              return;
            }
            // Vite content-hashes everything under assets/, so a revisit should not re-fetch it.
            res.setHeader(
              "Cache-Control",
              /[\\/]assets[\\/]/.test(path) ? "public, max-age=31536000, immutable" : "public, max-age=86400"
            );
          }
        })
      );
      app.use((req, res, next) => {
        if (req.method !== "GET" || req.path.startsWith("/api")) {
          next();
          return;
        }
        // Real storefront routes have no file extension; anything else is an asset probe that should 404
        // rather than be answered with the app shell (a soft 200 on /robots.txt misleads crawlers).
        const lastSegment = req.path.split("/").pop() ?? "";
        if (lastSegment.includes(".")) {
          next();
          return;
        }
        if (!req.accepts("html")) {
          next();
          return;
        }
        res.setHeader("Cache-Control", "no-cache");
        res.sendFile(resolve(dist, "index.html"));
      });
    } else {
      console.warn("The storefront build was not found. Run `npm run build:web` before starting the server.");
    }
  }

  app.use((req, _res, next) => {
    next(new AppError(404, "NOT_FOUND", `Nothing is served at ${req.method} ${req.path}.`));
  });

  app.use((error: unknown, req: Request, res: Response, _next: NextFunction) => {
    if (res.headersSent) return;
    if (error instanceof AppError) {
      res.status(error.status).json({
        error: { code: error.code, message: error.message, details: error.details ?? null }
      });
      return;
    }
    if (error instanceof SyntaxError && "body" in error) {
      res.status(400).json({ error: { code: "INVALID_JSON", message: "The request body is not valid JSON." } });
      return;
    }
    // body-parser raises plain errors with a status; oversize uploads are the caller's fault, not ours.
    const upstreamStatus = typeof (error as { status?: unknown }).status === "number" ? (error as { status: number }).status : 0;
    if (upstreamStatus >= 400 && upstreamStatus < 500) {
      const tooLarge = (error as { type?: string }).type === "entity.too.large";
      res.status(upstreamStatus).json({
        error: {
          code: tooLarge ? "PAYLOAD_TOO_LARGE" : "INVALID_REQUEST",
          message: tooLarge
            ? "That request is too large to process. Please send a smaller one."
            : "The request could not be read."
        }
      });
      return;
    }
    console.error(
      JSON.stringify({
        level: "error",
        time: new Date().toISOString(),
        message: "Unhandled request error",
        path: req.path,
        error: error instanceof Error ? error.message : String(error),
        stack: config.isProduction ? undefined : error instanceof Error ? error.stack : undefined
      })
    );
    res.status(500).json({
      error: { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again." }
    });
  });

  return app;
}
