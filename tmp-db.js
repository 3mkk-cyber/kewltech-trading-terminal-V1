import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";
const { Pool } = pg;
if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?"
  );
}
console.log("[DB] Initializing connection with URL:", process.env.DATABASE_URL);
const pool = new Pool({
  host: "localhost",
  port: 5432,
  user: "user",
  password: "password123",
  database: "kewltech_trading"
});
pool.on("error", (err) => {
  console.error("[DB] Pool error:", err);
});
const db = drizzle(pool, { schema });
export {
  db,
  pool
};
