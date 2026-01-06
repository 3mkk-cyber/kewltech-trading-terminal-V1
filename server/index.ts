// Load environment variables from .env file
import dotenv from "dotenv";
dotenv.config();

import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import net from "net";
import { db, pool } from "./db";
import { sql } from "drizzle-orm";
import { TradingBot } from "./tradingBot";
import * as crypto from "crypto";
import { collectDefaultMetrics, Registry, Counter, Gauge, Histogram } from "prom-client";

const app = express();
const httpServer = createServer(app);

// Track active requests and raw socket connections to allow graceful draining
let activeRequests = 0;
const connections = new Set<net.Socket>();

// Prometheus metrics
const metricsRegistry = new Registry();
collectDefaultMetrics({ register: metricsRegistry });

const requestsCounter = new Counter({
  name: "app_requests_total",
  help: "Total HTTP requests",
  labelNames: ["method", "route", "status"],
});
metricsRegistry.registerMetric(requestsCounter);

const activeRequestsGauge = new Gauge({
  name: "app_active_requests",
  help: "Currently active HTTP requests",
});
metricsRegistry.registerMetric(activeRequestsGauge);

const openSocketsGauge = new Gauge({
  name: "app_open_sockets",
  help: "Currently open TCP sockets",
});
metricsRegistry.registerMetric(openSocketsGauge);

const requestDuration = new Histogram({
  name: "app_request_duration_seconds",
  help: "Request duration in seconds",
  labelNames: ["method", "route", "status"],
  buckets: [0.005, 0.01, 0.05, 0.1, 0.3, 1, 2, 5],
});
metricsRegistry.registerMetric(requestDuration);

httpServer.on("connection", (socket: net.Socket) => {
  connections.add(socket);
  try {
    openSocketsGauge.set(connections.size);
  } catch {}
  socket.on("close", () => {
    connections.delete(socket);
    try {
      openSocketsGauge.set(connections.size);
    } catch {}
  });
});

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

// Track active requests for shutdown instrumentation
app.use((req, res, next) => {
  activeRequests += 1;
  try {
    activeRequestsGauge.set(activeRequests);
  } catch {}

  res.on("finish", () => {
    activeRequests = Math.max(0, activeRequests - 1);
    try {
      activeRequestsGauge.set(activeRequests);
    } catch {}
  });
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
      try {
        const statusLabel = String(res.statusCode);
        requestsCounter.labels(req.method, path, statusLabel).inc();
        requestDuration.labels(req.method, path, statusLabel).observe(duration / 1000);
      } catch (err) {
        /* metrics best-effort - don't fail requests */
      }
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

  // Prometheus metrics endpoint
  app.get("/metrics", async (_req, res) => {
    try {
      res.setHeader("Content-Type", metricsRegistry.contentType || "text/plain; version=0.0.4");
      const body = await metricsRegistry.metrics();
      res.send(body);
    } catch (err: any) {
      console.error("[METRICS] Failed to collect metrics:", err?.message || err);
      res.status(500).send("metrics error");
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

    // Stop accepting new connections first
    try {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          console.error("[SERVER] Timeout while waiting for httpServer.close");
          resolve();
        }, 10000);

        httpServer.close((err) => {
          clearTimeout(timeout);
          if (err) {
            console.error("[SERVER] Error closing HTTP server:", err);
            return reject(err);
          }
          console.log("[SERVER] HTTP server stopped accepting new connections");
          resolve();
        });
      });
    } catch (err) {
      console.error("[SERVER] Error during httpServer.close:", err);
    }

    // Drain active sockets and in-flight requests before stopping background workers
    try {
      const drainTimeoutMs = parseInt(process.env.SHUTDOWN_DRAIN_MS || "10000", 10);
      if (connections.size > 0 || activeRequests > 0) {
        console.log(
          `[SERVER] Waiting up to ${drainTimeoutMs}ms for ${connections.size} sockets and ${activeRequests} active requests to finish`,
        );

        // Politely ask sockets to end
        connections.forEach((sock) => {
          try {
            sock.end();
          } catch {}
        });

        const start = Date.now();
        while ((connections.size > 0 || activeRequests > 0) && Date.now() - start < drainTimeoutMs) {
          // sleep briefly
          await new Promise((r) => setTimeout(r, 200));
        }

        if (connections.size > 0) {
          console.warn(`[SERVER] Force-closing ${connections.size} sockets`);
          connections.forEach((sock) => {
            try {
              sock.destroy();
            } catch {}
          });
        }
      }
    } catch (err) {
      console.warn("[SERVER] Error while draining connections:", err);
    }

    // Stop the trading bot (if running)
    if (tradingBot) {
      try {
        await tradingBot.stop();
      } catch (err) {
        console.warn("[BOT] Error stopping trading bot:", err);
      }
    }

    // Cleanup learning engine
    try {
      const { learningEngine } = await import("./learningEngine");
      await learningEngine.cleanup();
    } catch (err) {
      console.warn("[LEARNING] Error during cleanup:", err);
    }

    // Now it's safe to close the DB pool when background activity has completed
    try {
      await pool.end();
      console.log("[DB] Pool closed");
    } catch (err) {
      console.warn("[DB] Error while closing pool:", err);
    }

    // Exit process gracefully
    console.log("[SERVER] Shutdown complete; exiting");
    process.exit(0);
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
