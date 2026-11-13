/**
 * Finds out what actually moves on the product page. Captures every layout shift with the
 * elements responsible, so a CLS number can be traced to a specific piece of markup instead of
 * being guessed at. Re-run with:  node _qa/cls-probe.mjs
 */
import { createFixtureDatabase, removeDatabaseFiles } from "./fresh-db.mjs";
import { spawn } from "node:child_process";
import { chromium } from "playwright-core";

const port = 4180;
const origin = `http://localhost:${port}`;
const probeDb = "data/cls-probe.db";
const chrome = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";

await createFixtureDatabase(probeDb);

const child = spawn(process.execPath, ["dist-server/server/index.js"], {
  env: {
    ...process.env,
    NODE_ENV: "production",
    PORT: String(port),
    APP_ORIGIN: origin,
    DATABASE_PATH: probeDb,
    COOKIE_SECURE: "false",
    SMTP_URL: ""
  },
  stdio: ["ignore", "pipe", "pipe"]
});

async function waitForServer() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      if ((await fetch(`${origin}/api/v1/health`)).ok) return true;
    } catch {
      // not listening yet
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}

if (!(await waitForServer())) {
  console.log("SERVER FAILED TO START");
  child.kill();
  process.exit(1);
}

const browser = await chromium.launch({ executablePath: chrome, headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });

await context.addInitScript(`
window.__shifts = [];
new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) {
    if (entry.hadRecentInput) continue;
    const identify = (element) => {
      if (!element || !element.tagName) return "unknown";
      const classes = typeof element.className === "string" && element.className
        ? "." + element.className.trim().split(/\\s+/).join(".")
        : "";
      const text = (element.innerText || element.textContent || "").trim().slice(0, 34);
      return element.tagName.toLowerCase() + (element.id ? "#" + element.id : "") + classes +
        (text ? " [" + JSON.stringify(text) + "]" : "");
    };
    window.__shifts.push({
      value: Number(entry.value.toFixed(4)),
      atMs: Math.round(entry.startTime),
      sources: (entry.sources ?? []).slice(0, 4).map((source) => ({
        node: identify(source.node),
        parent: source.node && source.node.parentElement ? identify(source.node.parentElement) : "none",
        from: source.previousRect
          ? [Math.round(source.previousRect.x), Math.round(source.previousRect.y), Math.round(source.previousRect.width), Math.round(source.previousRect.height)]
          : null,
        to: source.currentRect
          ? [Math.round(source.currentRect.x), Math.round(source.currentRect.y), Math.round(source.currentRect.width), Math.round(source.currentRect.height)]
          : null
      }))
    });
  }
}).observe({ type: "layout-shift", buffered: true });
window.__fonts = { ready: false, loaded: [] };
document.fonts.ready.then(() => {
  window.__fonts.ready = true;
  window.__fonts.loaded = [...document.fonts]
    .filter((face) => face.status === "loaded")
    .map((face) => face.family + " " + face.weight);
});
window.__trace = [];
window.__traceError = null;
const sample = () => {
  const rect = (selector) => {
    const element = document.querySelector(selector);
    if (!element) return null;
    const box = element.getBoundingClientRect();
    return Math.round(box.top) + "x" + Math.round(box.height);
  };
  try {
    window.__trace.push({
      at: Math.round(performance.now()),
      header: rect(".site-header"),
      main: rect(".site-main"),
      footer: rect(".site-footer"),
      loader: rect(".page-loader"),
      buyBar: rect(".product-mobile-buy"),
      rootNodes: (document.getElementById("root") || { childElementCount: -1 }).childElementCount,
      scrollHeight: document.documentElement.scrollHeight
    });
  } catch (error) {
    window.__traceError = String(error && error.message ? error.message : error);
  }
};
sample();
const tick = setInterval(sample, 60);
setTimeout(() => clearInterval(tick), 30000);
`);

const page = await context.newPage();
page.on("pageerror", (error) => console.log("PAGEERROR:", error.message));
page.on("console", (message) => {
  if (message.type() === "error") console.log("CONSOLE ERROR:", message.text().slice(0, 160));
});
const cdp = await context.newCDPSession(page);
await cdp.send("Network.enable");
// The slow-3G profile hides shifts that only appear when the network is fast enough for content
// to arrive while the page is still interactive, so the profile is selectable.
const PROFILES = {
  slow3g: { label: "slow 3G, 4x CPU", latency: 800, down: (500 * 1024) / 8, up: (125 * 1024) / 8, cpu: 4 },
  "4g": { label: "4G, 4x CPU", latency: 150, down: (4 * 1024 * 1024) / 8, up: (1 * 1024 * 1024) / 8, cpu: 4 }
};
const profile = PROFILES[process.env.QA_CLS_PROFILE ?? "slow3g"] ?? PROFILES.slow3g;
await cdp.send("Network.emulateNetworkConditions", {
  offline: false,
  latency: profile.latency,
  downloadThroughput: profile.down,
  uploadThroughput: profile.up
});
await cdp.send("Emulation.setCPUThrottlingRate", { rate: profile.cpu });

const target = process.argv[2] ?? "/product/rose-keepsake-box";
await page.goto(`${origin}${target}`, { waitUntil: "load", timeout: 120000 });
await page.waitForSelector("#main h1", { timeout: 60000 });
await page.waitForTimeout(4000);

const result = await page.evaluate(() => ({
  shifts: window.__shifts,
  trace: window.__trace,
  traceError: window.__traceError,
  total: window.__shifts.reduce((sum, shift) => sum + shift.value, 0),
  fonts: window.__fonts,
  images: [...document.images].map((image) => ({
    src: (image.currentSrc || image.src || "").split("/").pop(),
    widthAttr: image.getAttribute("width"),
    heightAttr: image.getAttribute("height"),
    rendered: `${Math.round(image.getBoundingClientRect().width)}x${Math.round(image.getBoundingClientRect().height)}`,
    complete: image.complete
  })),
  skeletons: document.querySelectorAll("[class*=skeleton],[class*=loader],[class*=loading]").length
}));

console.log(`layout shifts on ${target} (${profile.label})`);
console.log(`total CLS ${result.total.toFixed(3)} across ${result.shifts.length} shifts\n`);
for (const shift of result.shifts) {
  console.log(`+${shift.value.toFixed(4)} at ${shift.atMs} ms`);
  for (const source of shift.sources) {
    console.log(`    moved: ${source.node}`);
    console.log(`      inside: ${source.parent}`);
    console.log(`      rect ${JSON.stringify(source.from)} -> ${JSON.stringify(source.to)}  (x, y, w, h)`);
  }
}
let previous = "";
console.log(`\nlayout trace (${result.trace.length} frames sampled, error: ${result.traceError ?? "none"}; top x height of each shell region, null = not in the document):`);
for (const frame of result.trace) {
  const line = `header ${String(frame.header).padEnd(10)} main ${String(frame.main).padEnd(12)} footer ${String(frame.footer).padEnd(10)} loader ${String(frame.loader).padEnd(10)} buyBar ${String(frame.buyBar).padEnd(10)} root ${frame.rootNodes} doc ${frame.scrollHeight}`;
  if (line !== previous) console.log(`  ${String(frame.at).padStart(6)} ms  ${line}`);
  previous = line;
}
console.log(`\nfonts ready: ${result.fonts.ready} · loaded faces: ${result.fonts.loaded.join(" | ") || "none yet"}`);
console.log(`skeleton/loader nodes still in the DOM: ${result.skeletons}`);
console.log("\nimages:");
for (const image of result.images) {
  console.log(`    ${String(image.src).padEnd(36)} attrs ${image.widthAttr}x${image.heightAttr} · rendered ${image.rendered} · complete ${image.complete}`);
}

console.log("\nCLS=0");
await browser.close();
child.kill();
await new Promise((resolve) => setTimeout(resolve, 300));
removeDatabaseFiles(probeDb);
