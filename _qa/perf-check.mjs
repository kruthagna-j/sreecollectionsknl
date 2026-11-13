/**
 * Quantified performance benchmark. Boots the BUILT production server against a freshly seeded
 * fixture database, loads real storefront pages in a real Chrome with CPU + network throttling,
 * and records paint timing, transfer bytes, long tasks, layout shift and API latency.
 *
 * Every number in the output is measured, not estimated. Re-run with:  npm run build && node _qa/perf-check.mjs
 */
import { createFixtureDatabase, removeDatabaseFiles } from "./fresh-db.mjs";
import { spawn } from "node:child_process";
import { chromium } from "playwright-core";

const port = 4179;
const origin = `http://localhost:${port}`;
const perfDb = "data/perf-probe.db";
const chrome = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";

await createFixtureDatabase(perfDb);

const child = spawn(process.execPath, ["dist-server/server/index.js"], {
  env: {
    ...process.env,
    NODE_ENV: "production",
    PORT: String(port),
    APP_ORIGIN: origin,
    DATABASE_PATH: perfDb,
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

async function waitForServer() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`${origin}/api/v1/health`);
      if (response.ok) return true;
    } catch {
      // not listening yet
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}

if (!(await waitForServer())) {
  console.log("SERVER FAILED TO START\n" + boot.join(""));
  child.kill();
  process.exit(1);
}

const browser = await chromium.launch({ executablePath: chrome, headless: true });

const PROFILES = [
  {
    name: "low-end mobile (4x CPU throttle, slow 3G: 500 kbps down / 125 kbps up / 800 ms RTT)",
    cpu: 4,
    network: { latency: 800, downloadThroughput: (500 * 1024) / 8, uploadThroughput: (125 * 1024) / 8, offline: false }
  },
  {
    name: "mid-range mobile (4x CPU throttle, 4G: 4 Mbps down / 1 Mbps up / 150 ms RTT)",
    cpu: 4,
    network: { latency: 150, downloadThroughput: (4 * 1024 * 1024) / 8, uploadThroughput: (1024 * 1024) / 8, offline: false }
  },
  { name: "unthrottled desktop (no CPU or network limit)", cpu: 1, network: null }
];

const PAGES = [
  { path: "/", label: "home", ready: "#main h1" },
  { path: "/product/rose-keepsake-box", label: "product", ready: "#main h1" },
  { path: "/checkout", label: "checkout", ready: "#checkout-name", needsBag: true },
  { path: "/track", label: "track order", ready: "#main h1" }
];

// The checkout form only renders for a bag that contains something, so a bag is filled through
// the public API first. Those calls happen in an earlier navigation, so they are not counted in
// the checkout timings below.
const FILL_BAG = `(async () => {
  const read = (name) => decodeURIComponent((document.cookie.match(new RegExp(name + "=([^;]+)")) ?? [])[1] ?? "");
  const page = await (await fetch("/api/v1/catalog/products?pageSize=50", { credentials: "include" })).json();
  const product = (page.items ?? []).find((item) => item.inStock && item.variantCount === 0);
  if (!product) return { ok: false };
  const headers = { "Content-Type": "application/json", "x-csrf-token": read("sc_csrf") };
  const added = await fetch("/api/v1/cart/items", {
    method: "POST", credentials: "include", headers,
    body: JSON.stringify({ productId: product.id, variantId: "", quantity: 1 })
  });
  const quoted = await fetch("/api/v1/cart/shipping", {
    method: "POST", credentials: "include", headers, body: JSON.stringify({ pincode: "560001" })
  });
  return { ok: added.status === 201 && quoted.status === 200, name: product.name };
})()`;

const INIT = `
window.__perf = { lcp: 0, lcpDetail: null, longTasks: 0, longTaskCount: 0, cls: 0, interactive: 0 };
try {
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (entry.startTime <= window.__perf.lcp) continue;
      window.__perf.lcp = entry.startTime;
      const node = entry.element;
      window.__perf.lcpDetail = {
        when: Math.round(entry.startTime),
        render: Math.round(entry.renderTime || entry.loadEventEnd || 0),
        tag: node ? node.tagName.toLowerCase() : "(unknown)",
        cls: node && node.className ? String(node.className).slice(0, 60) : "",
        src: node && node.currentSrc ? node.currentSrc.replace(location.origin, "") : "",
        text: node && node.textContent ? node.textContent.trim().slice(0, 48) : "",
        box: node ? Math.round(node.getBoundingClientRect().width) + "x" + Math.round(node.getBoundingClientRect().height) : "",
        // the network entry for that resource, so the wait can be split into fetch vs render
        resource: (() => {
          if (!node || !node.currentSrc) return null;
          const match = performance.getEntriesByType("resource").find((r) => r.name === node.currentSrc);
          return match ? { start: Math.round(match.startTime), end: Math.round(match.responseEnd), transfer: match.transferSize } : null;
        })()
      };
    }
  }).observe({ type: "largest-contentful-paint", buffered: true });
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      window.__perf.longTasks += entry.duration;
      window.__perf.longTaskCount += 1;
    }
  }).observe({ type: "long-task", buffered: true });
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (entry.hadRecentInput) continue;
      window.__perf.cls += entry.value;
    }
  }).observe({ type: "layout-shift", buffered: true });
} catch (error) {
  // older Chrome: the metrics that work are still recorded
}
const probe = setInterval(() => {
  if (window.__perf.interactive) {
    clearInterval(probe);
    return;
  }
  const main = document.querySelector("#main") || document.querySelector("main");
  if (main && (main.innerText || "").trim().length > 60) {
    window.__perf.interactive = performance.now();
    clearInterval(probe);
  }
}, 16);
`;

const READ = `(() => {
  const navigation = performance.getEntriesByType("navigation")[0] || {};
  const paints = Object.fromEntries(performance.getEntriesByType("paint").map((p) => [p.name, p.startTime]));
  const resources = performance.getEntriesByType("resource");
  const transfer = resources.reduce((sum, entry) => sum + (entry.transferSize || 0), 0) + (navigation.transferSize || 0);
  const encoded = resources.reduce((sum, entry) => sum + (entry.encodedBodySize || 0), 0) + (navigation.encodedBodySize || 0);
  const decoded = resources.reduce((sum, entry) => sum + (entry.decodedBodySize || 0), 0) + (navigation.decodedBodySize || 0);
  const byType = {};
  for (const entry of resources) {
    const bucket = (byType[entry.initiatorType] ||= { count: 0, transfer: 0 });
    bucket.count += 1;
    bucket.transfer += entry.transferSize || 0;
  }
  return {
    fcp: paints["first-contentful-paint"] || 0,
    lcp: window.__perf.lcp,
    lcpDetail: window.__perf.lcpDetail,
    interactive: window.__perf.interactive,
    dcl: navigation.domContentLoadedEventEnd || 0,
    load: navigation.loadEventEnd || 0,
    requests: resources.length + 1,
    transfer,
    encoded,
    decoded,
    byType,
    longTasks: window.__perf.longTasks,
    longTaskCount: window.__perf.longTaskCount,
    cls: window.__perf.cls,
    compressed: resources.filter((entry) => entry.decodedBodySize > entry.encodedBodySize).length,
    urls: resources
      .map((entry) => ({
        name: entry.name.split("/").pop(),
        kind: entry.initiatorType,
        transfer: Math.round(entry.transferSize || 0),
        raw: Math.round(entry.decodedBodySize || 0)
      }))
      .sort((a, b) => b.transfer - a.transfer)
      .slice(0, 12),
    cached: resources.filter((entry) => entry.transferSize === 0 && entry.decodedBodySize > 0).length
  };
})()`;

const kb = (bytes) => (bytes / 1024).toFixed(1);
const ms = (value) => `${Math.round(value)} ms`;

async function measure(pageSpec, chromePage) {
  await chromePage.goto(`${origin}${pageSpec.path}`, { waitUntil: "load", timeout: 120000 });
  await chromePage.waitForSelector(pageSpec.ready, { timeout: 120000 });
  await chromePage.waitForTimeout(1500);
  return chromePage.evaluate(READ);
}

console.log("PERFORMANCE BENCHMARK — built production bundle, real Chrome, isolated database copy");
console.log(`server: ${origin} · NODE_ENV=production · dist built by "npm run build"`);
console.log(
  "cold = first visit to that URL in a fresh browser context; warm = the same URL again in that context."
);
console.log(
  "checkout is measured after a throttled home visit that fills one item through the API, i.e. the realistic browse-then-buy path, so shared chunks are already cached.\n"
);

const summary = [];

const apiOnly = process.argv.includes("--api-only");
const PROFILES_TO_RUN = apiOnly ? [] : PROFILES;
// QA_ONLY_PAGE / QA_ONLY_PROFILE substring filters, so one row can be re-measured quickly
// without paying for the whole matrix again.
const onlyPage = process.env.QA_ONLY_PAGE;
const onlyProfile = process.env.QA_ONLY_PROFILE;
const pagesForRun = onlyPage ? PAGES.filter((p) => p.label.toLowerCase().includes(onlyPage.toLowerCase())) : PAGES;
const profilesToRun = PROFILES_TO_RUN.filter((p) => !onlyProfile || p.name.toLowerCase().includes(onlyProfile.toLowerCase()));

for (const profile of profilesToRun) {
  console.log(`=== ${profile.name} ===`);
  for (const pageSpec of pagesForRun) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await context.addInitScript(INIT);
    const chromePage = await context.newPage();
    const cdp = await context.newCDPSession(chromePage);
    await cdp.send("Network.enable");
    if (profile.network) {
      await cdp.send("Network.emulateNetworkConditions", {
        offline: false,
        latency: profile.network.latency,
        downloadThroughput: profile.network.downloadThroughput,
        uploadThroughput: profile.network.uploadThroughput
      });
    }
    if (profile.cpu !== 1) {
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: profile.cpu });
    }
    if (pageSpec.needsBag) {
      await chromePage.goto(`${origin}/`, { waitUntil: "load", timeout: 120000 });
      const filled = await chromePage.evaluate(FILL_BAG);
      if (!filled.ok) {
        console.log(`${pageSpec.label}: COULD NOT FILL A BAG — skipping`);
        await context.close();
        continue;
      }
    }

    const cold = await measure(pageSpec, chromePage);
    const warm = await measure(pageSpec, chromePage);

    console.log(
      `${pageSpec.label.padEnd(11)} cold: FCP ${ms(cold.fcp).padStart(9)} · LCP ${ms(cold.lcp).padStart(9)} · ` +
        `text on screen ${ms(cold.interactive).padStart(9)} · load ${ms(cold.load).padStart(9)} · ` +
        `${cold.requests} requests · ${kb(cold.transfer)} kB on the wire · ${kb(cold.encoded)} kB body · ` +
        `${kb(cold.decoded)} kB uncompressed · long tasks ${cold.longTaskCount} / ${ms(cold.longTasks)} · CLS ${cold.cls.toFixed(3)}`
    );
    console.log(
      `${" ".repeat(11)} warm: FCP ${ms(warm.fcp).padStart(9)} · LCP ${ms(warm.lcp).padStart(9)} · ` +
        `text on screen ${ms(warm.interactive).padStart(9)} · ${warm.requests} requests · ` +
        `${kb(warm.transfer)} kB transferred (${warm.cached} served from cache) · long tasks ${warm.longTaskCount} / ${ms(warm.longTasks)}`
    );
    console.log(
      `${" ".repeat(11)} LCP element: ${
        cold.lcpDetail
          ? `${cold.lcpDetail.tag}${cold.lcpDetail.cls ? "." + cold.lcpDetail.cls : ""} ${cold.lcpDetail.box}` +
            `${cold.lcpDetail.src ? ` ${cold.lcpDetail.src}` : ""}` +
            `${cold.lcpDetail.text ? ` "${cold.lcpDetail.text}"` : ""} · rendered at ${cold.lcpDetail.render} ms` +
            `${cold.lcpDetail.resource ? ` · resource fetched ${cold.lcpDetail.resource.start}→${cold.lcpDetail.resource.end} ms, ${kb(cold.lcpDetail.resource.transfer)} kB` : ""}`
          : "not attributed"
      }`
    );
    if (profile === profilesToRun[0]) {
      console.log(
        `${" ".repeat(11)} wire split (cold): ${Object.entries(cold.byType)
          .map(([type, value]) => `${type} ${value.count}/${kb(value.transfer)}kB`)
          .join(" · ")} · responses served compressed: ${cold.compressed}/${cold.requests}`
      );
      console.log(
        `${" ".repeat(11)} largest (cold): ${cold.urls
          .filter((entry) => entry.transfer > 0)
          .map((entry) => `${entry.name} ${kb(entry.transfer)}kB on wire / ${kb(entry.raw)}kB raw`)
          .join(" · ")}`
      );
    }
    summary.push({ profile: profile.name, page: pageSpec.label, cold, warm });
    await context.close();
  }
  console.log("");
}

// ---------- API latency, measured inside a real browser page ----------
// The cart writes need both the session cookie and the CSRF cookie the SPA receives while it
// boots, so a hand-rolled Node request cannot reach them without being rejected first.
console.log("=== API latency (localhost, unthrottled, in-page fetch, 9 samples per route) ===");
const apiContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const apiPage = await apiContext.newPage();
await apiPage.goto(`${origin}/`, { waitUntil: "load", timeout: 120000 });
await apiPage.waitForFunction(() => document.cookie.includes("sc_csrf="), { timeout: 30000 });

async function timed(method, path, body) {
  return apiPage.evaluate(
    async ({ method, path, body }) => {
      const read = (name) => decodeURIComponent((document.cookie.match(new RegExp(name + "=([^;]+)")) ?? [])[1] ?? "");
      const headers = { Accept: "application/json" };
      if (body !== undefined) headers["Content-Type"] = "application/json";
      if (method !== "GET") headers["x-csrf-token"] = read("sc_csrf");
      const started = performance.now();
      const response = await fetch(path, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        credentials: "include"
      });
      await response.text();
      return { ms: performance.now() - started, status: response.status };
    },
    { method, path, body }
  );
}

const bagProduct = await apiPage.evaluate(async () => {
  const listing = await (await fetch("/api/v1/catalog/products?pageSize=50", { credentials: "include" })).json();
  const item = (listing.items ?? []).find((product) => product.inStock && product.variantCount === 0);
  return item ? { id: item.id, name: item.name } : null;
});
if (!bagProduct) {
  console.log("no in-stock single-variant product in the seed — cart latency samples skipped");
}

async function sample(label, run, samples = 9) {
  const values = [];
  let status = 0;
  for (let index = 0; index < samples; index += 1) {
    const result = await run();
    values.push(result.ms);
    status = result.status;
  }
  values.sort((a, b) => a - b);
  const median = values[Math.floor(values.length / 2)];
  console.log(
    `${label.padEnd(46)} median ${ms(median).padStart(9)} · min ${ms(values[0]).padStart(8)} · max ${ms(values[values.length - 1]).padStart(9)} · HTTP ${status}`
  );
  return { label, median, min: values[0], max: values[values.length - 1], status };
}

await sample("GET  /api/v1/health", () => timed("GET", "/api/v1/health"));
await sample("GET  /api/v1/catalog/meta", () => timed("GET", "/api/v1/catalog/meta"));
await sample("GET  /api/v1/catalog/products?pageSize=50", () => timed("GET", "/api/v1/catalog/products?pageSize=50"));
await sample("GET  /api/v1/catalog/products/:slug", () => timed("GET", "/api/v1/catalog/products/rose-keepsake-box"));
await sample("GET  /api/v1/catalog/delivery/check?pincode=560001", () => timed("GET", "/api/v1/catalog/delivery/check?pincode=560001"));
if (bagProduct) {
  await sample(
    "POST /api/v1/cart/items (add one item to a bag)",
    () => timed("POST", "/api/v1/cart/items", { productId: bagProduct.id, variantId: "", quantity: 1 })
  );
  await sample(
    "POST /api/v1/cart/shipping (server-side quote)",
    () => timed("POST", "/api/v1/cart/shipping", { pincode: "560001" })
  );
}
await sample("GET  /api/v1/admin/summary (signed out)", () => timed("GET", "/api/v1/admin/summary"));
await apiContext.close();

// Core Web Vitals treat a page as "Good" up to 0.10 CLS. The benchmark pages are not decorative
// demos — a shift above that line has to be seen by whoever edits the storefront, so the number is
// asserted rather than only printed.
const CLS_BUDGET = 0.1;
console.log("\n=== layout-shift budget (cold first visit, CLS must stay at or below 0.100) ===");
let budgetFailed = 0;
for (const { profile, page, cold } of summary) {
  const cls = Number(cold.cls.toFixed(3));
  const ok = cls <= CLS_BUDGET;
  if (!ok) budgetFailed = 1;
  console.log(`${ok ? "PASS" : "FAIL"} ${profile.split(" (")[0]} / ${page} — CLS ${cls.toFixed(3)}`);
}
console.log(`CLS BUDGET FAILURES ${budgetFailed}`);

console.log("\n=== machine-readable (kB transferred on the wire, cold first visit) ===");
console.log(
  JSON.stringify(
    summary.map(({ profile, page, cold, warm }) => ({
      profile,
      page,
      coldFcpMs: Math.round(cold.fcp),
      coldLcpMs: Math.round(cold.lcp),
      coldTextOnScreenMs: Math.round(cold.interactive),
      coldLoadMs: Math.round(cold.load),
      coldRequests: cold.requests,
      coldTransferKb: Number(kb(cold.transfer)),
      coldDecodedKb: Number(kb(cold.encoded)),
      coldLongTasks: cold.longTaskCount,
      coldLongTaskMs: Math.round(cold.longTasks),
      coldCls: Number(cold.cls.toFixed(3)),
      warmFcpMs: Math.round(warm.fcp),
      warmTextOnScreenMs: Math.round(warm.interactive),
      warmTransferKb: Number(kb(warm.transfer)),
      warmCachedResponses: warm.cached
    })),
    null,
    1
  )
);

console.log(`\nBENCH=${budgetFailed}`);

await browser.close();
child.kill();
await new Promise((resolve) => setTimeout(resolve, 400));
removeDatabaseFiles(perfDb);
process.exit(budgetFailed);
