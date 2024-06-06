import { drizzle } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import * as schema from "./schema";

export const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

try {
  await client.connect();
} catch (err) {
  console.error("Error connecting to database");
  console.error("DATABASE_URL:", process.env.DATABASE_URL);
  console.error(err);
  process.exit(1);
}
export const db = drizzle(client, { schema: { ...schema } });
