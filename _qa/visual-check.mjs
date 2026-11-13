import { chromium } from "playwright-core";
import { readStaffCredentials } from "./fresh-db.mjs";

const base = process.env.QA_BASE ?? "http://localhost:5175";
const chrome = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const browser = await chromium.launch({ executablePath: chrome, headless: true });
const errors = [];

async function newPage(viewport, mobile = false) {
  const context = await browser.newContext({
    viewport,
    isMobile: mobile,
    hasTouch: mobile,
    deviceScaleFactor: 1,
    reducedMotion: "no-preference"
  });
  const page = await context.newPage();
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  return { context, page };
}

async function audit(page, label) {
  const result = await page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const offenders = [];
    for (const element of document.querySelectorAll("body *")) {
      const rect = element.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      if (rect.right > width + 1 || rect.left < -1) {
        const style = getComputedStyle(element);
        if (style.position === "fixed" || style.visibility === "hidden") continue;
        offenders.push({
          tag: element.tagName.toLowerCase(),
          cls: typeof element.className === "string" ? element.className.slice(0, 80) : "",
          right: Math.round(rect.right),
          left: Math.round(rect.left),
          width: Math.round(rect.width)
        });
      }
    }
    return {
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: width,
      scrollHeight: document.documentElement.scrollHeight,
      offenders: offenders.slice(0, 12)
    };
  });
  const overflow = result.scrollWidth > result.clientWidth + 1;
  console.log(`AUDIT ${label} ${result.clientWidth}x${result.scrollHeight} overflow=${overflow ? "YES" : "no"} ${overflow ? JSON.stringify(result.offenders) : ""}`);
}

async function shot(page, name, fullPage = false) {
  await page.waitForTimeout(450);
  await page.screenshot({ path: `_qa/shots/${name}.png`, fullPage });
  await audit(page, name);
}

async function login(page) {
  const staff = readStaffCredentials();
  await page.goto(`${base}/login`, { waitUntil: "networkidle" });
  await page.fill("#login-email", staff.staffEmail);
  await page.fill("#login-password", staff.staffPassword);
  await Promise.all([page.waitForURL(/\/(account|admin)/, { timeout: 10000 }), page.getByRole("button", { name: /sign in/i }).click()]);
  await page.waitForLoadState("networkidle");
}

// ---------- desktop ----------
{
  const { context, page } = await newPage({ width: 1440, height: 900 });
  await page.goto(base, { waitUntil: "networkidle" });
  await shot(page, "desktop-home", true);

  await page.goto(`${base}/shop`, { waitUntil: "networkidle" });
  await shot(page, "desktop-shop");

  await page.goto(`${base}/product/rose-keepsake-box`, { waitUntil: "networkidle" });
  await shot(page, "desktop-product");

  const add = page.getByRole("button", { name: /^add to bag$/i }).first();
  if (await add.count()) {
    await add.click();
    await page.waitForTimeout(900);
  }
  await page.goto(`${base}/cart`, { waitUntil: "networkidle" });
  await shot(page, "desktop-cart");

  await page.goto(`${base}/checkout`, { waitUntil: "networkidle" });
  await shot(page, "desktop-checkout");

  await page.goto(`${base}/gift-finder`, { waitUntil: "networkidle" });
  await shot(page, "desktop-giftfinder");

  await page.goto(`${base}/about`, { waitUntil: "networkidle" });
  await shot(page, "desktop-about");

  await login(page);
  await page.goto(`${base}/account`, { waitUntil: "networkidle" });
  await shot(page, "desktop-account");

  await page.goto(`${base}/admin`, { waitUntil: "networkidle" });
  await shot(page, "desktop-admin-dashboard");

  await page.goto(`${base}/admin/products`, { waitUntil: "networkidle" });
  await shot(page, "desktop-admin-products");

  await page.goto(`${base}/admin/settings`, { waitUntil: "networkidle" });
  await shot(page, "desktop-admin-settings");

  await page.goto(`${base}/admin/orders`, { waitUntil: "networkidle" });
  await shot(page, "desktop-admin-orders", true);

  await context.close();
}

// ---------- mobile ----------
{
  const { context, page } = await newPage({ width: 390, height: 844 }, true);
  await page.goto(base, { waitUntil: "networkidle" });
  await shot(page, "mobile-home");
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(500);
  await shot(page, "mobile-footer");

  await page.goto(`${base}/shop`, { waitUntil: "networkidle" });
  await shot(page, "mobile-shop");

  await page.goto(`${base}/product/rose-keepsake-box`, { waitUntil: "networkidle" });
  await shot(page, "mobile-product");
  await page.evaluate(() => window.scrollTo(0, 620));
  await shot(page, "mobile-product-lower");

  const add = page.getByRole("button", { name: /^add to bag$/i }).first();
  if (await add.count()) {
    await add.click();
    await page.waitForTimeout(900);
  }
  await page.goto(`${base}/cart`, { waitUntil: "networkidle" });
  await shot(page, "mobile-cart");

  await page.goto(`${base}/checkout`, { waitUntil: "networkidle" });
  await shot(page, "mobile-checkout");

  await login(page);
  await page.goto(`${base}/account`, { waitUntil: "networkidle" });
  await shot(page, "mobile-account");

  await page.goto(`${base}/admin`, { waitUntil: "networkidle" });
  await shot(page, "mobile-admin-dashboard");
  await page.getByRole("button", { name: /open menu/i }).click();
  await page.waitForTimeout(400);
  await shot(page, "mobile-admin-menu");

  await page.goto(`${base}/admin/products`, { waitUntil: "networkidle" });
  await shot(page, "mobile-admin-products");

  await context.close();
}

// ---------- narrow low-end ----------
{
  const { context, page } = await newPage({ width: 360, height: 740 }, true);
  await page.goto(base, { waitUntil: "networkidle" });
  await shot(page, "narrow-home");
  await page.goto(`${base}/shop`, { waitUntil: "networkidle" });
  await shot(page, "narrow-shop");
  await page.goto(`${base}/product/rose-keepsake-box`, { waitUntil: "networkidle" });
  await shot(page, "narrow-product");
  await context.close();
}

console.log(`ERRORS ${errors.length}`);
for (const error of errors.slice(0, 25)) console.log(error);
await browser.close();
