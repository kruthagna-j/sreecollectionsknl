import { chromium } from "playwright-core";

const base = "http://localhost:5175";
const chrome = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const browser = await chromium.launch({ executablePath: chrome, headless: true });
const page = await browser.newPage();

for (const arg of process.argv.slice(2)) {
  const path = arg.startsWith("/") ? arg : `/${arg}`;
  await page.goto(`${base}${path}`, { waitUntil: "networkidle" });
  const list = await page.evaluate(() =>
    Array.from(document.querySelectorAll("h1, h2, h3, h4")).map((h) => ({
      tag: h.tagName,
      cls: typeof h.className === "string" ? h.className : "",
      in: h.closest("main") ? "main" : h.closest("header") ? "header" : h.closest("footer") ? "footer" : "other",
      text: (h.textContent || "").trim().slice(0, 60)
    }))
  );
  console.log(`\n== ${path}`);
  for (const h of list) console.log(`  ${h.tag} [${h.in}] .${h.cls} — ${h.text}`);
}

await browser.close();
