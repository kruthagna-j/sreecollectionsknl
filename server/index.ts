import { config } from "./config.js";
import { openDatabase, type DB } from "./db.js";
import { seedDatabase } from "./seed-data.js";
import { createApp } from "./app.js";

const db: DB = openDatabase(config.databasePath);

if (config.env === "development") {
  const categories = db.prepare("SELECT COUNT(*) AS count FROM categories").get() as { count: number };
  if (categories.count === 0) {
    seedDatabase(db);
    console.log("Development catalogue seeded. Review the products and settings in the admin area before launch.");
  }
}

const app = createApp(db);
const server = app.listen(config.port, () => {
  console.log(`Sree Collections API listening on http://localhost:${config.port} (${config.env})`);
  console.log(`Storefront origin: ${config.appOrigin}`);
});

const cleanup = setInterval(
  () => {
    const cutoff = new Date(Date.now() - config.cartDays * 24 * 60 * 60 * 1000).toISOString();
    try {
      db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(new Date().toISOString());
      db.prepare("DELETE FROM carts WHERE user_id IS NULL AND updated_at < ?").run(cutoff);
    } catch (error) {
      console.error("Background cleanup failed:", error instanceof Error ? error.message : error);
    }
  },
  6 * 60 * 60 * 1000
);
cleanup.unref();

let shuttingDown = false;

function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Received ${signal}. Closing the server.`);
  clearInterval(cleanup);
  server.close(() => {
    try {
      db.close();
    } catch {
      // The database may already be closed.
    }
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
