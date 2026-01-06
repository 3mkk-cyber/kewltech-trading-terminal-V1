import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const parsedUrl = new URL(process.env.DATABASE_URL);

console.log(
  "[DB] Initializing connection with URL:",
  process.env.DATABASE_URL.replace(/:\/\/([^:]+):([^@]+)@/, "://$1:****@"),
);

const poolConfig = {
  host: parsedUrl.hostname,
  port: parsedUrl.port ? parseInt(parsedUrl.port, 10) : 5432,
  user: decodeURIComponent(parsedUrl.username),
  password: decodeURIComponent(parsedUrl.password),
  database: parsedUrl.pathname.replace(/^\//, ""),
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
};

console.log("[DB] Pool config", {
  ...poolConfig,
  password: poolConfig.password ? "****" : undefined,
});

export const pool = new Pool(poolConfig);

pool.on("error", (err) => {
  console.error("[DB] Unexpected pool error:", err);
});

pool.on("connect", () => {
  console.log("[DB] New client connected to pool");
});

export const db = drizzle(pool, { schema });
