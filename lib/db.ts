import { PrismaClient } from "@/lib/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";

// Prisma 7 runs the client through a driver adapter. We use libSQL pointed at
// a local SQLite file. A single client is cached on globalThis so Next.js hot
// reloads don't open a new connection on every request.
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

function createClient(): PrismaClient {
  const adapter = new PrismaLibSql({
    url: process.env.DATABASE_URL ?? "file:./prisma/dev.db",
  });
  const client = new PrismaClient({ adapter });
  // Decouple the interactive answer endpoint from the background tailoring
  // pipeline. The default "delete" journal makes a writer hold an exclusive lock
  // that blocks readers, so heavy pipeline writes could stall/fail an /api/answer
  // read (and pipeline writes serialize against each other). WAL lets many readers
  // run concurrently with one writer, and busy_timeout makes any brief lock WAIT a
  // few seconds instead of failing instantly. WAL is a persistent DB setting; both
  // are fire-and-forget at startup (harmless if the driver is a remote libSQL).
  void client.$queryRawUnsafe("PRAGMA journal_mode=WAL").catch(() => {});
  void client.$queryRawUnsafe("PRAGMA busy_timeout=5000").catch(() => {});
  return client;
}

export const prisma: PrismaClient = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
