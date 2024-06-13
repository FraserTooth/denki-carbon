import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, client } from "./db";
import { logger } from "./utils";

logger.info("Migrating database...");
try {
  await migrate(db, { migrationsFolder: "./drizzle" });
  logger.info("Database migrated successfully");
  await client.end();
  process.exit(0);
} catch (e) {
  logger.error("Error migrating database");
  logger.error(e);
  logger.error(
    process.env.DATABASE_URL.slice(0, 8) +
      "********" +
      process.env.DATABASE_URL.slice(-8)
  );
  await client.end();
  process.exit(1);
}
