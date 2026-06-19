import path from "node:path";
import { defineConfig, env } from "prisma/config";

// Load .env for the Prisma CLI (Node >=20.12 / 26 built-in).
try {
  process.loadEnvFile();
} catch {
  // .env may be absent in some environments; ignore.
}

// Prisma 7 keeps connection URLs out of schema.prisma. The CLI (migrate,
// studio) reads the datasource URL from here; the runtime client gets a
// libSQL driver adapter in lib/db.ts.
export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  migrations: {
    path: path.join("prisma", "migrations"),
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
