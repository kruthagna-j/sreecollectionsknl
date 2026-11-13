import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import bcrypt from "bcryptjs";
import { chromium } from "playwright-core";
import { openDatabase, newId } from "../dist-server/server/db.js";
import { seedDatabase } from "../dist-server/server/seed-data.js";

const ROOT = resolve(".");
const PORT = Number(process.env.E2E_PORT ?? 4137);
const BASE = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`;
const DB_PATH = resolve(ROOT, "data", "e2e.db");
const CHROME = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";

const customerEmail = `e2e-customer-${Date.now()}@example.com`;
const ownerEmail = `e2e-owner-${Date.now()}@example.com`;
const customerPassword = "CustomerE2E#2026";
const ownerPassword = randomBytes(18).toString("base64url");

const failures = [];
const consoleErrors = [];
let server;
let browser;

function check(label, condition, detail) {
  if (condition) {
    console.log(`PASS  ${label}`);
  } else {
    failures.push(label);
    console.error(`FAIL  ${label}`, detail ?? "");
  }
}

function removeDb() {
  for (const suffix of ["", "-shm", "-wal"]) {
    try {
      rmSync(`${DB_PATH}${suffix}`, { force: true });
    } catch {
      // best effort cleanup
    }
  }
}

async function waitForHealth() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`${BASE}/api/v1/health`);
      if (response.ok) return await response.json();
    } catch {
      // server still starting
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  }
  throw new Error(`API did not become healthy at ${BASE}`);
}

function watch(page, label) {
  page.on("pageerror", (error) => consoleErrors.push(`${label} pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(`${label} console: ${message.text()}`);
  });
}

async function run() {
  for (const file of ["dist/index.html", "dist-server/server/index.js"]) {
    if (!existsSync(resolve(ROOT, file))) {
      throw new Error(`Missing ${file}. Run \`npm run build\` before \`npm run e2e\`.`);
    }
  }
  if (!existsSync(CHROME)) throw new Error(`Chrome was not found at ${CHROME}. Set CHROME_PATH to a Chrome executable.`);

  removeDb();
  const db = openDatabase(DB_PATH);
  try {
    seedDatabase(db);
    db.prepare(
      "INSERT INTO users (id, email, password_hash, name, phone, role, created_at) VALUES (?, ?, ?, ?, NULL, 'owner', ?)"
    ).run(newId(), ownerEmail, await bcrypt.hash(ownerPassword, 12), "E2E Owner", new Date().toISOString());
    const storeRow = db.prepare("SELECT value FROM settings WHERE key = 'store'").get();
    const store = JSON.parse(storeRow.value);
    store.supportWhatsApp = "9876500000";
    db.prepare("UPDATE settings SET value = ? WHERE key = 'store'").run(JSON.stringify(store));
  } finally {
    db.close();
  }

  server = spawn(process.execPath, ["dist-server/server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: String(PORT),
      APP_ORIGIN: BASE,
      DATABASE_PATH: DB_PATH,
      COOKIE_SECURE: "false"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  server.stdout.on("data", (chunk) => process.stdout.write(`[api] ${chunk}`));
  server.stderr.on("data", (chunk) => process.stderr.write(`[api] ${chunk}`));

  const health = await waitForHealth();
  check("health endpoint reports a connected database", health.status === "ok" && health.database === "ok", health);
  check(
    "provider integrations are reported as not configured",
    health.integrations.onlinePayments === "not_configured" && health.integrations.email === "not_configured",
    health.integrations
  );

  browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  let whatsappPopup = null;
  let whatsappPopupUrl = "";
  let mainPage = null;
  await context.route("https://wa.me/**", (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: "<title>WhatsApp test stub</title>" })
  );
  context.on("page", (popup) => {
    if (popup === mainPage) return;
    whatsappPopup = popup;
    popup.on("framenavigated", (frame) => {
      if (frame === popup.mainFrame() && frame.url().startsWith("https://wa.me/")) whatsappPopupUrl = frame.url();
    });
  });
  const page = await context.newPage();
  mainPage = page;
  watch(page, "desktop");

  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  check("storefront home renders", (await page.locator("main").count()) > 0 && (await page.title()).length > 0);

  await page.goto(`${BASE}/register`, { waitUntil: "networkidle" });
  await page.fill("#register-name", "E2E Customer");
  await page.fill("#register-email", customerEmail);
  await page.fill("#register-phone", "9876501234");
  await page.fill("#register-password", customerPassword);
  await page.fill("#register-confirm", customerPassword);
  await page.getByLabel(/accept the terms/i).check();
  await page.getByRole("button", { name: /create account/i }).click();
  await page.waitForURL(/\/account$/, { timeout: 15000 });
  await page.locator(".account-shell").waitFor({ timeout: 15000 });
  check("customer registration signs the shopper in", (await page.locator(".account-shell").count()) > 0);

  await page.goto(`${BASE}/shop`, { waitUntil: "networkidle" });
  const cards = await page.locator(".product-card").count();
  check("shop lists live catalogue products", cards >= 10, { cards });

  await page.getByRole("link", { name: /Rose Velvet Keepsake Box/i }).first().click();
  await page.waitForURL(/\/product\/rose-keepsake-box/);
  await page.locator(".buy-row__add").waitFor({ timeout: 15000 });
  check("product page opens from the catalogue", (await page.locator(".buy-row__add").count()) === 1);

  await page.locator(".buy-row__add").click();
  await page.locator(".cart-drawer.is-open").waitFor({ timeout: 15000 });
  const drawerText = await page.locator(".cart-drawer").innerText();
  check("adding to bag opens the cart drawer with the item", /Rose Velvet Keepsake Box/i.test(drawerText));

  await page.locator('.cart-drawer__actions a:has-text("Checkout")').click();
  await page.waitForURL(/\/checkout$/);
  await page.waitForSelector(".checkout-layout");

  await page.fill("#checkout-phone", "9876501234");
  await page.fill("#ship-recipient", "E2E Customer");
  await page.fill("#ship-phone", "9876501234");
  await page.fill("#ship-pincode", "518001");
  await page.fill("#ship-line1", "14 Test Residency, Road No 2");
  await page.fill("#ship-city", "Kurnool");
  await page.locator(".checkout-pin-state__ok").waitFor({ timeout: 15000 });
  check("checkout validates the configured delivery PIN", true);

  await page.fill("#ship-pincode", "110001");
  await page.waitForFunction(() => document.body.innerText.includes("All India delivery"), null, { timeout: 15000 });
  check("checkout quotes pan-India delivery with a fee and estimate", true);
  await page.fill("#ship-pincode", "518001");
  await page.locator(".checkout-pin-state__ok").waitFor({ timeout: 15000 });

  await page.getByLabel(/accept the terms of sale/i).check();
  await page.getByRole("button", { name: /place order/i }).click();
  await page.waitForURL(/\/order\/SC-\d{8}-[A-Z0-9]{6}(\?|$)/, { timeout: 20000 });
  const orderNumber = decodeURIComponent(new URL(page.url()).pathname.split("/").pop());
  const confirmation = await page.locator(".order-page").innerText();
  check("COD order is placed and confirmed", /your order is in/i.test(confirmation) && confirmation.includes(orderNumber), {
    orderNumber
  });
  check("confirmation is honest about email delivery", /Email delivery is not configured/i.test(confirmation));
  check("confirmation shows the delivery zone and estimate", /estimated in 1–2 working days/i.test(confirmation));
  const invoiceLinks = await page.locator('a[href*="/invoice"]').count();
  check("confirmation offers HTML and PDF invoices", invoiceLinks >= 2, { invoiceLinks });

  await page.waitForTimeout(900);
  const handoffText = await page.locator(".order-handoff").innerText().catch(() => "");
  const popupUrl = whatsappPopupUrl || whatsappPopup?.url() || "";
  check("confirmation shows the WhatsApp handoff", handoffText.length > 0);
  check(
    "confirmation opens WhatsApp with the prepared order message",
    /^https:\/\/wa\.me\/919876500000\?text=/.test(popupUrl) && decodeURIComponent(popupUrl).includes(orderNumber),
    `${popupUrl.slice(0, 120)} | ${handoffText.slice(-220)}`
  );
  if (whatsappPopup && !whatsappPopup.isClosed()) await whatsappPopup.close();

  await page.goto(`${BASE}/account/orders`, { waitUntil: "networkidle" });
  const accountOrders = await page.locator(".order-cards").innerText();
  check("order appears in the customer's account", accountOrders.includes(orderNumber));

  await page.getByRole("button", { name: /^sign out$/i }).click();
  await page.waitForURL(/\/login/, { timeout: 15000 });

  await page.goto(`${BASE}/track`, { waitUntil: "networkidle" });
  await page.fill("#track-number", orderNumber);
  await page.fill("#track-email", customerEmail);
  await page.getByRole("button", { name: /find my order/i }).click();
  await page.waitForFunction((number) => document.body.innerText.includes(number), orderNumber, { timeout: 15000 });
  check("guest order tracking works with the checkout email", true);

  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill("#login-email", ownerEmail);
  await page.fill("#login-password", ownerPassword);
  await Promise.all([
    page.waitForURL(/\/admin$/, { timeout: 15000 }),
    page.getByRole("button", { name: /sign in/i }).click()
  ]);
  await page.locator(".admin-shell").waitFor({ timeout: 15000 });
  check("owner signs in to the admin area", (await page.locator(".admin-shell").count()) === 1);

  await page.goto(`${BASE}/admin/orders`, { waitUntil: "networkidle" });
  await page.getByRole("link", { name: orderNumber }).click();
  await page.waitForURL(/\/admin\/orders\/[0-9a-f-]{8,}/);
  await page.selectOption("#order-next-status", "confirmed");
  await page.fill("#order-status-note", "Confirmed by the end-to-end test");
  await page.getByRole("button", { name: /update order/i }).click();
  await page.getByText(/order moved to confirmed/i).waitFor({ timeout: 15000 });
  const detail = await page.locator(".admin-order-detail").innerText();
  check("admin confirms the order and the timeline records it", /Confirmed by the end-to-end test/.test(detail), detail.slice(0, 200));
  check("admin sees the order message log", /Order messages/i.test(detail) && /not configured/i.test(detail));
  const adminInvoicePdf = await page.locator('.admin-order-detail a[href*="/invoice.pdf"]').count();
  check("admin can open the invoice PDF", adminInvoicePdf >= 1, { adminInvoicePdf });

  await page.goto(`${BASE}/admin/products`, { waitUntil: "networkidle" });
  const adminProducts = await page.locator(".admin-table--products tbody tr").count();
  check("admin catalogue lists products", adminProducts >= 10, { adminProducts });

  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const mobile = await mobileContext.newPage();
  watch(mobile, "mobile");
  await mobile.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await mobile.fill("#login-email", ownerEmail);
  await mobile.fill("#login-password", ownerPassword);
  await Promise.all([
    mobile.waitForURL(/\/admin$/, { timeout: 15000 }),
    mobile.getByRole("button", { name: /sign in/i }).click()
  ]);
  await mobile.locator(".admin-shell").waitFor({ timeout: 15000 });
  await mobile.goto(`${BASE}/admin/products`, { waitUntil: "networkidle" });
  await mobile.locator(".admin-table--products tbody tr").first().waitFor({ timeout: 15000 });

  const widths = await mobile.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth
  }));
  check("mobile admin has no horizontal page overflow", widths.scroll <= widths.client + 1, widths);

  await mobile.goto(`${BASE}/`, { waitUntil: "networkidle" });
  const homeOverflow = await mobile.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1
  );
  check("mobile storefront has no horizontal page overflow", homeOverflow);

  await mobile.locator(".site-header__menu").click();
  await mobile.locator(".mobile-menu.is-open").waitFor({ timeout: 5000 });
  check("mobile navigation drawer opens", await mobile.locator(".mobile-menu.is-open").isVisible());
  await mobile.keyboard.press("Escape");
  await mobile.waitForTimeout(300);
  check("mobile navigation closes with Escape", !(await mobile.locator(".mobile-menu.is-open").count()));

  check("no browser console or page errors", consoleErrors.length === 0, consoleErrors.slice(0, 5));

  await mobileContext.close();
  await context.close();
}

try {
  await run();
} catch (error) {
  failures.push("unhandled error");
  console.error(`\nE2E aborted: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
} finally {
  if (browser) await browser.close().catch(() => {});
  if (server) {
    server.kill();
    await new Promise((resolveExit) => {
      const timer = setTimeout(resolveExit, 5000);
      server.once("exit", () => {
        clearTimeout(timer);
        resolveExit();
      });
    });
  }
  removeDb();
}

if (consoleErrors.length) {
  console.error(`\nBrowser console errors:\n${consoleErrors.join("\n")}`);
}
if (failures.length) {
  console.error(`\n${failures.length} end-to-end check(s) failed: ${failures.join(", ")}`);
  process.exit(1);
}
console.log("\nAll end-to-end checks passed.");
