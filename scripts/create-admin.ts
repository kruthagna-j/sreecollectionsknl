import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { config } from "../server/config.js";
import { newId, nowIso, openDatabase } from "../server/db.js";
import { hashPassword } from "../server/lib/auth.js";
import { audit } from "../server/lib/audit.js";

const ALLOWED_ROLES = ["owner", "admin", "catalogue", "orders", "support", "finance"] as const;
type Role = (typeof ALLOWED_ROLES)[number];

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main(): Promise<void> {
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    const email = (arg("email") ?? (await rl.question("Admin email: "))).trim().toLowerCase();
    const name = (arg("name") ?? (await rl.question("Full name: "))).trim();
    const roleInput = (arg("role") ?? "owner").trim() as Role;
    const password = process.env.ADMIN_PASSWORD ?? (await rl.question("Password (min 12 characters): "));

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a valid email address.");
    if (name.length < 2 || name.length > 80) throw new Error("Enter a name between 2 and 80 characters.");
    if (!ALLOWED_ROLES.includes(roleInput)) throw new Error(`Role must be one of: ${ALLOWED_ROLES.join(", ")}.`);
    if (password.length < 12 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      throw new Error("Use at least 12 characters with a letter and a number.");
    }

    const db = openDatabase(config.databasePath);
    try {
      const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
      if (existing) throw new Error("An account with this email already exists. Use another address.");
      const id = newId();
      const passwordHash = await hashPassword(password);
      db.prepare(
        "INSERT INTO users (id, email, password_hash, name, phone, role, created_at) VALUES (?, ?, ?, ?, NULL, ?, ?)"
      ).run(id, email, passwordHash, name, roleInput, nowIso());
      audit(db, null, "user.admin_created", "user", id, { role: roleInput });
      console.log(`Created ${roleInput} account for ${email}. Password was not stored in any file or log.`);
    } finally {
      db.close();
    }
  } finally {
    rl.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
