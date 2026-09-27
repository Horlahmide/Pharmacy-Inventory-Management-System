import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * Prisma Client Singleton
 *
 * Prisma 7 requires a driver adapter to connect to the database.
 * We use @prisma/adapter-pg which connects to PostgreSQL via the `pg` driver.
 *
 * In Next.js development mode, hot-reloading creates a new module scope on every
 * file change. Without a singleton, each reload would create a new PrismaClient
 * instance and a new database connection pool, eventually exhausting connections.
 *
 * The globalThis trick persists the instance across hot reloads.
 */

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
