import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, client } from "./db";

console.log("Migrating database...");
try {
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("Database migrated successfully");
  await client.end();
  process.exit(0);
} catch (e) {
  console.log("Error migrating database");
  console.log(e);
  console.log(
    process.env.DATABASE_URL.slice(0, 8) +
      "********" +
      process.env.DATABASE_URL.slice(-8)
  );
  await client.end();
  process.exit(1);
}
