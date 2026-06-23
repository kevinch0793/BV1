// Seed the admin account and assign all existing data to it. Plain JS (no TS
// build needed): talks to SQLite via the libSQL client and hashes the password
// inline with the SAME scheme as lib/password.ts so login verification matches.
import { createClient } from "@libsql/client";
import { scryptSync, randomBytes, randomUUID } from "node:crypto";

try {
  process.loadEnvFile();
} catch {
  /* .env optional */
}

const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;
if (!email || !password) {
  console.error("Set ADMIN_EMAIL and ADMIN_PASSWORD in .env before seeding.");
  process.exit(1);
}

// Must match lib/password.ts: scrypt$<saltB64url>$<hashB64url>, N=16384 r=8 p=1, keylen 64.
function hashPassword(pw) {
  const salt = randomBytes(16);
  const hash = scryptSync(pw, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

// Prisma stores DateTime as ISO 8601 with a +00:00 offset — match it.
const isoNow = () => new Date().toISOString().replace("Z", "+00:00");

const db = createClient({ url: process.env.DATABASE_URL ?? "file:./prisma/dev.db" });

const existing = await db.execute({ sql: `SELECT id FROM "Client" WHERE email = ?`, args: [email] });
let adminId;
if (existing.rows.length) {
  adminId = existing.rows[0].id;
  console.log("Admin already exists:", adminId);
} else {
  adminId = randomUUID();
  const now = isoNow();
  await db.execute({
    sql: `INSERT INTO "Client" (id, email, passwordHash, role, status, createdAt, approvedAt)
          VALUES (?, ?, ?, 'admin', 'approved', ?, ?)`,
    args: [adminId, email, hashPassword(password), now, now],
  });
  console.log("Created admin:", adminId, email);
}

const p = await db.execute({ sql: `UPDATE "Profile" SET clientId = ? WHERE clientId IS NULL`, args: [adminId] });
const s = await db.execute({ sql: `UPDATE "Settings" SET clientId = ? WHERE clientId IS NULL`, args: [adminId] });
console.log(`Backfilled -> profiles: ${p.rowsAffected}, settings: ${s.rowsAffected}`);

process.exit(0);
