import { drizzle } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import * as schema from "./schema";
import { logger } from "./utils";

export const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

try {
  await client.connect();
} catch (err) {
  logger.error("Error connecting to database");
  logger.error("DATABASE_URL:", process.env.DATABASE_URL);
  logger.error(err);
  process.exit(1);
}
export const db = drizzle(client, { schema: { ...schema } });
