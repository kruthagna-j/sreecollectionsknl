/**
 * Runs the browser checks against a freshly booted production server on a seeded fixture database,
 * so a result cannot depend on a dev server that happens to be left running, or on a `data/sree.db`
 * that only exists on one machine.
 *
 *   npm run build && node _qa/run-checks.mjs _qa/a11y-check.mjs _qa/visual-check.mjs
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createFixtureDatabase, removeDatabaseFiles } from "./fresh-db.mjs";

const port = 4181;
const origin = `http://localhost:${port}`;
const checkDb = "data/checks-probe.db";

if (!existsSync("dist-server/server/index.js") || !existsSync("dist/index.html")) {
  console.log("dist/index.html or dist-server/server/index.js is missing — run `npm run build` first.");
  process.exit(1);
}

const staff = await createFixtureDatabase(checkDb);

const server = spawn(process.execPath, ["dist-server/server/index.js"], {
  env: {
    ...process.env,
    NODE_ENV: "production",
    PORT: String(port),
    APP_ORIGIN: origin,
    DATABASE_PATH: checkDb,
    COOKIE_SECURE: "false",
    SMTP_URL: ""
  },
  stdio: ["ignore", "pipe", "pipe"]
});
const boot = [];
server.stdout.on("data", (chunk) => boot.push(String(chunk)));
server.stderr.on("data", (chunk) => boot.push(`[stderr] ${String(chunk)}`));

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
  console.log("SERVER FAILED TO START\n" + boot.join(""));
  server.kill();
  removeDatabaseFiles(checkDb);
  process.exit(1);
}

console.log(`production server for checks: ${origin} (fixture database: ${checkDb})`);
console.log("fixture staff account created for this run; credentials passed to the checks through QA_OWNER_EMAIL / QA_OWNER_PASSWORD and never printed");

let failed = 0;
for (const script of process.argv.slice(2)) {
  console.log(`\n===== ${script} =====`);
  const run = spawn(process.execPath, [script], {
    env: { ...process.env, QA_BASE: origin, QA_OWNER_EMAIL: staff.staffEmail, QA_OWNER_PASSWORD: staff.staffPassword },
    stdio: "inherit"
  });
  const code = await new Promise((resolve) => run.on("exit", resolve));
  console.log(`----- ${script} exit ${code} -----`);
  if (code !== 0) failed = 1;
}

server.kill();
await new Promise((resolve) => setTimeout(resolve, 300));
removeDatabaseFiles(checkDb);
process.exit(failed);
