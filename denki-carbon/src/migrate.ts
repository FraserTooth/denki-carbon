import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, client } from "./db";

console.log("Migrating database...");
await migrate(db, { migrationsFolder: "./drizzle" });
console.log("Database migrated successfully");

await client.end();
