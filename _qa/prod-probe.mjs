/**
 * Boots the built server in production mode against a freshly seeded fixture database and records
 * what a real visitor (or a scanner) would actually see. No developer database is needed.
 */
import { randomBytes } from "node:crypto";
import { readdirSync } from "node:fs";
import { spawn } from "node:child_process";
import { createFixtureDatabase, removeDatabaseFiles } from "./fresh-db.mjs";

const port = 4178;
const origin = `http://localhost:${port}`;
const probeDb = "data/prod-probe.db";
await createFixtureDatabase(probeDb);

const child = spawn(process.execPath, ["dist-server/server/index.js"], {
  env: {
    ...process.env,
    NODE_ENV: "production",
    PORT: String(port),
    APP_ORIGIN: origin,
    DATABASE_PATH: probeDb,
    COOKIE_SECURE: "false",
    SMTP_URL: "",
    RAZORPAY_KEY_ID: "",
    SHIPROCKET_EMAIL: ""
  },
  stdio: ["ignore", "pipe", "pipe"]
});
const boot = [];
child.stdout.on("data", (chunk) => boot.push(String(chunk)));
child.stderr.on("data", (chunk) => boot.push(`[stderr] ${String(chunk)}`));

const wait = async () => {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`${origin}/api/v1/health`);
      if (response.ok) return true;
    } catch {
      // not listening yet
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
};

if (!(await wait())) {
  console.log("SERVER FAILED TO START\n" + boot.join(""));
  child.kill("SIGKILL");
  process.exit(1);
}

const asset = readdirSync("dist/assets").find((name) => name.endsWith(".js"));
const css = readdirSync("dist/assets").find((name) => name.endsWith(".css"));

async function show(label, path, options = {}) {
  const response = await fetch(`${origin}${path}`, { redirect: "manual", ...options });
  const body = (await response.text()).slice(0, 140).replace(/\s+/g, " ");
  // Cookie values are masked: the evidence in this row is the attribute set (Max-Age, Path, SameSite),
  // not the token, and a log file should not carry anything replayable even from a throwaway session.
  const redact = (name, value) =>
    name === "set-cookie" ? value.replace(/(^|,\s)([A-Za-z0-9_]+)=[^;]*/g, "$1$2=[redacted]") : value;
  const headers = ["cache-control", "content-type", "content-security-policy", "x-frame-options", "x-content-type-options", "referrer-policy", "strict-transport-security", "permissions-policy", "x-powered-by", "set-cookie", "vary", "location"]
    .filter((name) => response.headers.has(name))
    .map((name) => `${name}=${redact(name, String(response.headers.get(name)).slice(0, 150))}`);
  console.log(`\n${label} ${options.method ?? "GET"} ${path} -> ${response.status}`);
  for (const header of headers) console.log(`    ${header}`);
  console.log(`    body: ${body}`);
  return { status: response.status, headers: Object.fromEntries(response.headers), body };
}

await show("storefront shell", "/");
await show("hashed javascript", `/assets/${asset}`);
await show("hashed stylesheet", `/assets/${css}`);
await show("svg illustration", "/images/products/rose-keepsake-box.svg");
await show("deep client route", "/shop?category=birthday");
await show("unknown client route", "/this-page-does-not-exist");
await show("robots.txt", "/robots.txt");
await show("sitemap.xml", "/sitemap.xml");
await show("declared favicon", "/favicon.svg");
await show("legacy favicon fallback", "/favicon.ico");
await show("health", "/api/v1/health");
await show("site content", "/api/v1/content/site");
await show("unknown api route", "/api/v1/nothing-here");
await show("env file", "/.env");
await show("sqlite file through static", "/../data/sree.db");
await show("admin list signed out", "/api/v1/admin/orders");
await show("csrf-less mutation", "/api/v1/cart/items", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ productId: "x", quantity: 1 })
});
// The forged-origin request is refused before validation or storage, so its password is generated
// per run instead of written into a file — nothing in this repository holds a credential literal.
const probePassword = `Probe#${randomBytes(6).toString("hex")}`;
await show("forged origin", "/api/v1/auth/register", {
  method: "POST",
  headers: { "Content-Type": "application/json", Origin: "https://evil.example" },
  body: JSON.stringify({ name: "Probe", email: "probe@example.invalid", password: probePassword })
});
await show("oversized payload", "/api/v1/content/newsletter", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "probe@example.invalid", junk: "a".repeat(2 * 1024 * 1024) })
});

const html = await (await fetch(`${origin}/`)).text();
console.log("\nHTML surface");
console.log(`    scripts: ${(html.match(/<script[^>]+src="([^"]+)"/g) ?? []).length}`);
console.log(`    inline handlers: ${(html.match(/ on(click|error|load)=/g) ?? []).length}`);
console.log(`    justdial mentions: ${(html.match(/justdial/gi) ?? []).length}`);
console.log(`    store name present: ${html.includes("Sree Collections")}`);

const notFound = await show("api 404 shape", "/api/v1/orders/SC-00000000-000000?email=probe@example.invalid");
console.log(`    body: ${notFound.body}`);

console.log("\nserver log:");
for (const line of boot) console.log(`    ${line.trim()}`);

child.kill("SIGTERM");
await new Promise((resolve) => setTimeout(resolve, 400));
child.kill("SIGKILL");
removeDatabaseFiles(probeDb);
process.exit(0);
