/**
 * Builds a throwaway, fully seeded database for the browser checks.
 *
 * The checks used to copy `data/sree.db`, which meant they only ran on the machine that happened
 * to have a developed database — and they logged in with a staff address written into the harness
 * scripts. A fresh unpack of the project has neither, so every browser check now provisions its
 * own fixture data and receives its staff credentials through the environment.
 */
import { randomBytes } from "node:crypto";
import { rmSync } from "node:fs";
import bcrypt from "bcryptjs";
import { newId, openDatabase } from "../dist-server/server/db.js";
import { seedDatabase } from "../dist-server/server/seed-data.js";

// A reserved fictional number, so no check can ever address a real shopper's WhatsApp.
export const FIXTURE_WHATSAPP = "9876500000";

export function removeDatabaseFiles(path) {
  for (const suffix of ["", "-shm", "-wal"]) rmSync(`${path}${suffix}`, { force: true });
}

/**
 * @param {string} path where the SQLite file should live
 * @returns {Promise<{ staffEmail: string, staffPassword: string }>} the credentials to hand to the browser
 */
export async function createFixtureDatabase(path) {
  removeDatabaseFiles(path);
  const db = openDatabase(path);
  try {
    seedDatabase(db);
    const staffEmail = `qa-owner-${Date.now()}@example.com`;
    const staffPassword = randomBytes(18).toString("base64url");
    db.prepare(
      "INSERT INTO users (id, email, password_hash, name, phone, role, created_at) VALUES (?, ?, ?, ?, NULL, 'owner', ?)"
    ).run(newId(), staffEmail, await bcrypt.hash(staffPassword, 12), "QA Owner", new Date().toISOString());
    const store = JSON.parse(db.prepare("SELECT value FROM settings WHERE key = 'store'").get().value);
    store.supportWhatsApp = FIXTURE_WHATSAPP;
    db.prepare("UPDATE settings SET value = ?, updated_at = ? WHERE key = 'store'").run(
      JSON.stringify(store),
      new Date().toISOString()
    );
    return { staffEmail, staffPassword };
  } finally {
    db.close();
  }
}

/** Credentials the child scripts expect; fails loudly rather than falling back to a hard-coded login. */
export function readStaffCredentials() {
  const staffEmail = process.env.QA_OWNER_EMAIL;
  const staffPassword = process.env.QA_OWNER_PASSWORD;
  if (!staffEmail || !staffPassword) {
    throw new Error("Run browser checks through `node _qa/run-checks.mjs …`, which supplies QA_OWNER_EMAIL and QA_OWNER_PASSWORD.");
  }
  return { staffEmail, staffPassword };
}
