// Load environment variables from .env file
import dotenv from "dotenv";
dotenv.config();

import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { db, pool } from "./db";
import { sql } from "drizzle-orm";
import { TradingBot } from "./tradingBot";
import * as crypto from "crypto";

const app = express();
const httpServer = createServer(app);

declare global {
  namespace Express {
    interface Request {
      rawBody?: unknown;
      id?: string;
    }
  }
}

// Capture raw body for webhooks
app.use(
  express.json({
    verify: (req, _res, buf) => {
      (req as any).rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

// Simple structured logger helper
export function log(message: string, source = "server", context: { requestId?: string } = {}) {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  const reqPart = context.requestId ? ` [req:${context.requestId}]` : "";
  console.log(`${formattedTime} [${source}]${reqPart} ${message}`);
}

// Request ID middleware
app.use((req, res, next) => {
  const headerId = req.headers["x-request-id"];
  const requestId =
    typeof headerId === "string" ? headerId : Array.isArray(headerId) ? headerId[0] : crypto.randomUUID();
  req.id = requestId;
  res.setHeader("x-request-id", requestId);
  next();
});

// Response logger middleware (captures JSON responses)
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: unknown | undefined;
  const originalResJson = res.json.bind(res);

  res.json = function (bodyJson: any) {
    capturedJsonResponse = bodyJson;
    return originalResJson(bodyJson);
  } as typeof res.json;

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api") || path === "/readyz" || path === "/healthz") {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        try {
          logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
        } catch {
          /* ignore serialization errors */
        }
      }
      log(logLine, "express", { requestId: req.id });
    }
  });

  next();
});

(async () => {
  // Initialize database tables if they don't exist
  try {
    log("Checking/creating database schema...", "db");
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS analysis_logs (
        id SERIAL PRIMARY KEY,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        price TEXT NOT NULL,
        data JSONB NOT NULL
      );
    `);
    log("Database schema ready", "db");
  } catch (dbError: any) {
    console.warn("[DB] Warning - Could not initialize database:", dbError?.message || dbError);
    console.warn("[DB] Server will continue but API may not save data to database");
  }

  app.get("/healthz", (_req, res) => {
    res.json({ status: "ok", uptime: process.uptime() });
  });

  app.get("/readyz", async (_req, res) => {
    try {
      await pool.query("select 1");
      res.json({ status: "ready" });
    } catch (err) {
      console.error("[HEALTH] Readiness check failed:", err);
      res.status(503).json({ status: "unready" });
    }
  });

  await registerRoutes(httpServer, app);

  // Error handler
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    res.status(status).json({ message });
    console.error("[SERVER] Request error:", err);
  });

  // Setup either static serving or Vite in dev
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  const port = parseInt(process.env.PORT || "5000", 10);
  let tradingBot: TradingBot | null = null;

  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
    },
    async () => {
      log(`serving on port ${port}`);
      try {
        tradingBot = new TradingBot();
        await tradingBot.start();
      } catch (err) {
        console.error("[BOT] Failed to start trading bot:", err);
      }
    },
  );

  httpServer.on("error", (err) => {
    console.error("[SERVER] HTTP server error:", err);
  });

  // Graceful shutdown handler
  const shutdown = async (signal: string) => {
    console.log(`\n[SERVER] Received ${signal}, shutting down gracefully...`);

    if (tradingBot) {
      try {
        await tradingBot.stop();
      } catch (err) {
        console.warn("[BOT] Error stopping trading bot:", err);
      }
    }

    try {
      await pool.end();
      console.log("[DB] Pool closed");
    } catch (err) {
      console.warn("[DB] Error while closing pool:", err);
    }

    try {
      const { learningEngine } = await import("./learningEngine");
      await learningEngine.cleanup();
    } catch (err) {
      console.warn("[LEARNING] Error during cleanup:", err);
    }

    httpServer.close(() => {
      console.log("[SERVER] Server closed");
      process.exit(0);
    });

    setTimeout(() => {
      console.error("[SERVER] Forced shutdown after timeout");
      process.exit(1);
    }, 10000);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("unhandledRejection", (reason) => {
    console.error("[SERVER] Unhandled rejection:", reason);
    shutdown("unhandledRejection");
  });
  process.on("uncaughtException", (error) => {
    console.error("[SERVER] Uncaught exception:", error);
    shutdown("uncaughtException");
  });
})();
