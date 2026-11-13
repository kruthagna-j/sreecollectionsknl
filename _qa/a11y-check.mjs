import { chromium } from "playwright-core";
import { readStaffCredentials } from "./fresh-db.mjs";

const base = process.env.QA_BASE ?? "http://localhost:5175";
const chrome = process.env.CHROME_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const browser = await chromium.launch({ executablePath: chrome, headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
const failures = [];

function check(label, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures.push(label);
}

async function go(path) {
  await page.goto(base + path, { waitUntil: "networkidle" });
}

const HELPERS = `
const parse = (value) => {
  const parts = (String(value).match(/[\\d.]+/g) ?? []).map(Number);
  return { r: parts[0] || 0, g: parts[1] || 0, b: parts[2] || 0, a: parts.length > 3 ? parts[3] : 1 };
};
const lum = ({ r, g, b }) => {
  const [R, G, B] = [r, g, b].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
};
const composite = (fg, bg) => {
  if (fg.a >= 1) return { r: fg.r, g: fg.g, b: fg.b, a: 1 };
  return { r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 };
};
const ratio = (f, b) => {
  const a = lum(f), c = lum(b);
  const [hi, lo] = a > c ? [a, c] : [c, a];
  return (hi + 0.05) / (lo + 0.05);
};
const stack = (element) => {
  const layers = [];
  let node = element;
  while (node && node !== document.documentElement) {
    const background = getComputedStyle(node).backgroundColor;
    if (background && background !== "rgba(0, 0, 0, 0)") layers.push(parse(background));
    node = node.parentElement;
  }
  layers.push(parse(getComputedStyle(document.body).backgroundColor || "rgb(255,255,255)"));
  let result = { r: 255, g: 255, b: 255, a: 1 };
  for (let i = layers.length - 1; i >= 0; i -= 1) result = composite(layers[i], result);
  return result;
};
const visible = (element) => {
  if (element.closest('[aria-hidden="true"], [inert], [hidden], .drawer-backdrop')) return false;
  const rect = element.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return false;
  const style = getComputedStyle(element);
  return style.visibility !== "hidden" && Number(style.opacity) > 0.05;
};
`;

// sweep every visible run of text and report the weakest contrasts
async function contrastSweep(path) {
  await go(path);
  const rows = await page.evaluate(`(() => {
    ${HELPERS}
    const found = [];
    for (const element of document.querySelectorAll("body *")) {
      if (element.closest(".cart-drawer")) continue;
      const hasOwnText = Array.from(element.childNodes).some((n) => n.nodeType === 3 && String(n.textContent).trim().length > 1);
      if (!hasOwnText || element.closest("svg")) continue;
      if (!visible(element)) continue;
      const style = getComputedStyle(element);
      const background = stack(element);
      const foreground = composite(parse(style.color), background);
      const size = parseFloat(style.fontSize);
      const weight = Number(style.fontWeight) || 400;
      const large = size >= 24 || (size >= 18.66 && weight >= 700);
      found.push({
        ratio: ratio(foreground, background),
        size,
        weight,
        needed: large ? 3 : 4.5,
        cls: (typeof element.className === "string" ? element.className : "").slice(0, 42),
        text: (element.textContent || "").trim().slice(0, 34)
      });
    }
    found.sort((a, b) => a.ratio - b.ratio);
    return found.slice(0, 8);
  })()`);
  const worst = rows[0];
  const offenders = rows.filter((row) => row.ratio < row.needed);
  check(`contrast sweep ${path}`, offenders.length === 0, worst ? `weakest ${worst.ratio.toFixed(2)}:1 on "${worst.text}" .${worst.cls} ${worst.size}px w${worst.weight}; ${offenders.length} below AA` : "no text found");
  for (const row of offenders.slice(0, 6)) {
    console.log(`      · ${row.ratio.toFixed(2)}:1 (needs ${row.needed}) ${row.size}px w${row.weight} .${row.cls} — "${row.text}"`);
  }
}

for (const path of ["/", "/shop", "/product/rose-keepsake-box", "/cart", "/contact", "/checkout", "/track"]) {
  await contrastSweep(path);
}

// ---------- the focus indicator, measured after its transition settles ----------
await go("/contact");
const ring = await page.evaluate(`(() => {
  ${HELPERS}
  const field = document.querySelector("main .field input:not([type=checkbox]):not([type=radio])");
  if (!field) return { found: false };
  field.focus();
  return new Promise((resolve) => {
    setTimeout(() => {
      const style = getComputedStyle(field);
      const background = stack(field);
      const shadowMatch = (style.boxShadow || "").match(/rgba?\\([^)]+\\)/);
      const halo = shadowMatch ? composite(parse(shadowMatch[0]), background) : null;
      const border = composite(parse(style.borderColor), background);
      const result = {
        found: true,
        id: field.id || field.name || field.tagName.toLowerCase(),
        outline: style.outlineWidth + " " + style.outlineStyle,
        shadow: style.boxShadow.slice(0, 46),
        haloRatio: halo ? ratio(halo, background) : 0,
        borderRatio: ratio(border, background),
        borderWidth: parseFloat(style.borderWidth),
        focused: document.activeElement === field
      };
      field.blur();
      resolve(result);
    }, 320);
  });
})()`);
if (!ring.found) {
  check("focus indicator measurable", false, "no text input inside a field on /contact");
} else {
  check("field is focusable", ring.focused === true, `#${ring.id}`);
  check(
    "focus indicator contrast >= 3:1",
    (ring.shadow !== "none" && ring.haloRatio >= 3) || ring.borderRatio >= 3,
    `#${ring.id} halo ${ring.haloRatio.toFixed(2)}:1 (${ring.shadow}) | border ${ring.borderRatio.toFixed(2)}:1 at ${ring.borderWidth}px | outline ${ring.outline}`
  );
}

// placeholder contrast, measured on the ::placeholder pseudo wherever one appears
for (const [path, selector] of [["/shop", "main input[placeholder], main textarea[placeholder]"], ["/", ".newsletter__row input[placeholder]"]]) {
  await go(path);
  const placeholder = await page.evaluate(`(() => {
    ${HELPERS}
    const field = document.querySelector(${JSON.stringify(selector)});
    if (!field) return null;
    const style = getComputedStyle(field, "::placeholder");
    const background = stack(field);
    return { ratio: ratio(composite(parse(style.color), background), background), size: parseFloat(style.fontSize), text: field.placeholder.slice(0, 24) };
  })()`);
  if (placeholder) {
    check(`placeholder text on ${path} >= 4.5:1`, placeholder.ratio >= 4.5, `${placeholder.ratio.toFixed(2)}:1 at ${placeholder.size}px ("${placeholder.text}")`);
  } else {
    check(`placeholder text on ${path} measurable`, false, `nothing matches ${selector}`);
  }
}

// ---------- a bag with something in it, so checkout renders its form ----------
await go("/");
const filled = await page.evaluate(async () => {
  const read = (name) => decodeURIComponent((document.cookie.match(new RegExp(`${name}=([^;]+)`)) ?? [])[1] ?? "");
  const page_ = await (await fetch("/api/v1/catalog/products?pageSize=50", { credentials: "include" })).json();
  const product = (page_.items ?? []).find((item) => item.inStock && item.variantCount === 0);
  if (!product) return { ok: false, reason: "no in-stock product without options" };
  const headers = { "Content-Type": "application/json", "x-csrf-token": read("sc_csrf") };
  const response = await fetch("/api/v1/cart/items", {
    method: "POST",
    credentials: "include",
    headers,
    body: JSON.stringify({ productId: product.id, variantId: "", quantity: 1 })
  });
  const shipping = await fetch("/api/v1/cart/shipping", {
    method: "POST",
    credentials: "include",
    headers,
    body: JSON.stringify({ pincode: "560001" })
  });
  return { ok: response.status === 201 && shipping.status === 200, status: response.status, shipping: shipping.status, name: product.name };
});
check("test bag filled through the public API", filled.ok, JSON.stringify(filled));

// ---------- aria wiring on a failed submit ----------
await go("/checkout");
const submit = page.locator(".checkout-place");
await submit.scrollIntoViewIfNeeded();
await submit.click();
await page.waitForTimeout(900);
const aria = await page.evaluate(() => {
  const results = [];
  for (const error of document.querySelectorAll(".field__error")) {
    const field = error.closest(".field");
    const control = field && field.querySelector("input, select, textarea");
    if (!error.id) results.push({ problem: "error paragraph has no id" });
    if (!control) {
      results.push({ problem: "field with an error has no control", label: field?.querySelector("label")?.textContent });
      continue;
    }
    const describedBy = control.getAttribute("aria-describedby") || "";
    results.push({
      id: control.id || control.name,
      invalid: control.getAttribute("aria-invalid"),
      describedBy,
      reachesMessage: describedBy.split(/\s+/).filter((id) => document.getElementById(id)).includes(error.id),
      role: error.getAttribute("role"),
      message: (error.textContent || "").trim().slice(0, 44)
    });
  }
  return { count: document.querySelectorAll(".field__error").length, results };
});
check("checkout shows validation errors on an empty form", aria.count > 0, `${aria.count} field errors`);
for (const entry of aria.results.slice(0, 6)) {
  if (entry.problem) {
    check("field error wiring", false, JSON.stringify(entry));
    continue;
  }
  check(`aria-invalid on #${entry.id}`, entry.invalid === "true");
  check(`aria-describedby on #${entry.id} reaches the message`, entry.reachesMessage, `${entry.describedBy} -> "${entry.message}"`);
  check(`error for #${entry.id} is announced`, entry.role === "alert");
}
const labelled = await page.evaluate(() => {
  let unlabelled = 0;
  const missed = [];
  for (const control of document.querySelectorAll("main input, main select, main textarea")) {
    if (["hidden", "checkbox", "radio", "button"].includes(control.type)) continue;
    const text =
      (control.labels && control.labels.length ? control.labels[0].textContent : "") ||
      control.getAttribute("aria-label") ||
      control.getAttribute("aria-labelledby") ||
      control.getAttribute("title");
    if (!text || !text.trim()) {
      unlabelled += 1;
      missed.push(control.id || control.name || control.type);
    }
  }
  return { unlabelled, missed };
});
check("every checkout control has an accessible name", labelled.unlabelled === 0, JSON.stringify(labelled.missed));

// ---------- headings inside a dialog ----------
const drawerName = await page.evaluate(() => {
  const drawer = document.querySelector(".cart-drawer");
  return drawer ? { label: drawer.getAttribute("aria-label"), hidden: drawer.getAttribute("aria-hidden") } : null;
});
check("cart drawer is labelled", Boolean(drawerName?.label), JSON.stringify(drawerName));

// ---------- landmarks and skip links ----------
async function landmarks(path) {
  await go(path);
  const info = await page.evaluate(() => {
    const mains = Array.from(document.querySelectorAll("main"));
    const skip = document.querySelector(".skip-link");
    const target = skip && document.querySelector(skip.getAttribute("href") || "#");
    return {
      mainCount: mains.length,
      mainId: mains.map((m) => m.id).join(","),
      skip: skip ? skip.textContent.trim() : null,
      skipTarget: Boolean(target && target.tagName === "MAIN"),
      h1: document.querySelectorAll('h1:not([aria-hidden="true"])').length
    };
  });
  check(`${path} has exactly one main`, info.mainCount === 1, `main id="${info.mainId}"`);
  check(`${path} has one h1`, info.h1 === 1, `${info.h1} h1`);
  check(`${path} skip link points at main`, Boolean(info.skip) && info.skipTarget, `${info.skip ?? "none"}`);
  if (info.skip) {
    const onFocus = await page.evaluate(() => {
      const skip = document.querySelector(".skip-link");
      skip.focus();
      const rect = skip.getBoundingClientRect();
      return { visible: rect.top >= 0 && rect.height > 0 && rect.width > 0, href: skip.getAttribute("href") };
    });
    check(`${path} skip link becomes visible on focus`, onFocus.visible, `focus() -> ${onFocus.href}`);
  }
}
for (const path of ["/", "/shop", "/product/rose-keepsake-box", "/cart", "/checkout", "/gift-finder", "/about", "/contact", "/track"]) {
  await landmarks(path);
}
await go("/login");
const staff = readStaffCredentials();
await page.fill("#login-email", staff.staffEmail);
await page.fill("#login-password", staff.staffPassword);
await Promise.all([page.waitForURL(/\/(account|admin)/, { timeout: 15000 }), page.getByRole("button", { name: /sign in/i }).click()]);
await page.waitForLoadState("networkidle");
await landmarks("/account");
await landmarks("/admin");
await landmarks("/admin/orders");
await landmarks("/admin/products");

// ---------- heading order, ignoring hidden overlays ----------
async function headingOrder(path) {
  await go(path);
  const headings = await page.evaluate(() =>
    Array.from(document.querySelectorAll("h1, h2, h3, h4, h5, h6"))
      .filter((h) => !h.closest('[aria-hidden="true"], [inert], [hidden], .cart-drawer, .drawer-backdrop'))
      .filter((h) => {
        const rect = h.getBoundingClientRect();
        return rect.width > 1 || rect.height > 1 || h.offsetParent !== null;
      })
      .map((h) => ({ level: Number(h.tagName[1]), text: (h.textContent || "").trim().slice(0, 34) })));
  const bad = [];
  for (let i = 1; i < headings.length; i += 1) {
    if (headings[i].level > headings[i - 1].level + 1) bad.push(`"${headings[i - 1].text}" h${headings[i - 1].level} -> "${headings[i].text}" h${headings[i].level}`);
  }
  check(`${path} headings never skip a level`, bad.length === 0, bad.length ? bad.join(" | ") : `${headings.length} headings`);
}
for (const path of ["/", "/shop", "/product/rose-keepsake-box", "/about", "/contact", "/faq", "/gift-finder", "/track", "/journal", "/offers", "/policies/privacy", "/policies/shipping", "/policies/returns", "/policies/terms", "/policies/gift-wrap", "/policies/personalisation", "/cart", "/checkout", "/account", "/admin"]) {
  await headingOrder(path);
}

/* --------------------------------------------------------------------------
   User-preference honouring: reduced motion and 200% text
   -------------------------------------------------------------------------- */
const motionContext = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 1280, height: 900 } });
const motionView = await motionContext.newPage();
await motionView.goto(base + "/", { waitUntil: "networkidle" });
const motion = await motionView.evaluate(() => {
  // Chrome reports the 0.01ms override as "1e-05s", so the exponent has to survive parsing.
  const toMs = (value) => {
    const parsed = /^([\d.eE+-]+)(m?s)$/.exec(String(value).trim());
    if (!parsed) return 0;
    return Number(parsed[1]) * (parsed[2] === "ms" ? 1 : 1000);
  };
  const styled = Array.from(document.querySelectorAll("body *"))
    .map((node) => getComputedStyle(node))
    .filter((style) => style.animationName !== "none" || style.transitionProperty !== "all")
    .map((style) => ({
      animation: style.animationName,
      animationMs: toMs(style.animationDuration),
      transition: style.transitionProperty,
      transitionMs: toMs(style.transitionDuration)
    }));
  const slow = styled.filter((row) => row.animationMs > 20 || row.transitionMs > 20);
  return {
    honoured: matchMedia("(prefers-reduced-motion: reduce)").matches,
    inspected: styled.length,
    slow: slow.slice(0, 4),
    slowCount: slow.length
  };
});
check(
  "prefers-reduced-motion collapses animation and transition durations",
  motion.honoured && motion.slowCount === 0,
  `media query honoured=${motion.honoured}; ${motion.inspected} animated nodes, ${motion.slowCount} still above 20ms${motion.slow.length ? ` (${JSON.stringify(motion.slow[0])})` : ""}`
);
await motionContext.close();

// Zoom and reflow. Chrome in this environment has no Emulation.setTextZoom, so the same
// criterion is measured the way the layout actually behaves: 200% page zoom on a 1280px
// desktop is a 640px layout viewport, and WCAG 1.4.10 reflow is 320px.
for (const zoom of [
  { label: "200% zoom on a 1280px desktop (640px layout)", width: 640, height: 512 },
  { label: "320px reflow width (WCAG 1.4.10)", width: 320, height: 640 }
]) {
  const zoomContext = await browser.newContext({ viewport: { width: zoom.width, height: zoom.height } });
  const zoomView = await zoomContext.newPage();
  for (const path of ["/", "/product/rose-keepsake-box", "/checkout"]) {
    await zoomView.goto(base + path, { waitUntil: "networkidle" });
    const wide = await zoomView.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      offenders: Array.from(document.querySelectorAll("body *"))
        .filter((node) => node.getBoundingClientRect().right > document.documentElement.clientWidth + 2)
        .filter((node) => !node.closest('[aria-hidden="true"], .cart-drawer, [hidden]'))
        .slice(0, 3)
        .map((node) => `${node.tagName.toLowerCase()}.${String(node.className).split(" ")[0]}@${Math.round(node.getBoundingClientRect().right)}`)
    }));
    check(
      `${zoom.label}: ${path} has no horizontal overflow`,
      wide.scrollWidth <= wide.clientWidth + 2,
      `scroll ${wide.scrollWidth} vs client ${wide.clientWidth}${wide.offenders.length ? ` — ${wide.offenders.join(", ")}` : ""}`
    );
  }
  await zoomContext.close();
}

console.log(`\nFAILURES ${failures.length}`);
for (const failure of failures) console.log(`- ${failure}`);
await browser.close();
process.exit(failures.length ? 1 : 0);
