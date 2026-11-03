import express from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import compression from "compression";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

import { loadUser } from "./auth.js";
import { HttpError } from "./errors.js";
import authRoutes from "./routes/auth.js";
import accountRoutes from "./routes/accounts.js";
import tableRoutes from "./routes/table.js";
import rpcRoutes from "./routes/rpc.js";
import notificationRoutes from "./routes/notifications.js";

const here = path.dirname(fileURLToPath(import.meta.url));

/** Builds the Express app (no listening / DB connection — tests reuse this). */
export function createApp({ staticDir = path.resolve(here, "../dist/client") } = {}) {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        "script-src": ["'self'", "'unsafe-inline'"],
        "img-src": ["'self'", "data:", "blob:"],
        "connect-src": ["'self'"],
        "font-src": ["'self'", "data:", "https://fonts.gstatic.com"],
        "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      },
    },
  }));
  app.use(compression());
  app.use(cookieParser());
  // Excel imports post a few thousand rows; signatures are data-URL images.
  app.use("/api", express.json({ limit: "15mb" }));

  // CSRF defence: state-changing API calls must be same-origin JSON.
  app.use("/api", (req, _res, next) => {
    if (req.method === "GET" || req.method === "HEAD") return next();
    if (!req.is("application/json")) return next(new HttpError(415, "JSON required"));
    const origin = req.get("origin");
    if (origin && new URL(origin).host !== req.get("host")) return next(new HttpError(403, "Cross-origin request blocked"));
    next();
  });
  app.use("/api", loadUser);

  app.get("/api/health", (_req, res) => res.json({ ok: true }));
  app.use("/api/auth", authRoutes);
  app.use("/api/accounts", accountRoutes);
  app.use("/api/db", tableRoutes);
  app.use("/api/rpc", rpcRoutes);
  app.use("/api/notifications", notificationRoutes);
  app.use("/api", (_req, _res, next) => next(new HttpError(404, "Not found")));

  // Production: serve the built SPA with client-side routing fallback.
  if (fs.existsSync(staticDir)) {
    app.use(express.static(staticDir, { index: false, maxAge: "1h" }));
    app.get("*", (_req, res) => {
      res.set("Cache-Control", "no-cache");
      res.sendFile(path.join(staticDir, "index.html"));
    });
  }

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    const status = err.status ?? (err.name === "ValidationError" ? 400 : err.code === 11000 ? 409 : 500);
    if (status >= 500) console.error(err);
    const message = status >= 500 ? "שגיאת שרת" : err.code === 11000 ? "רשומה כפולה" : err.message;
    res.status(status).json({ error: message, code: err.code ?? null });
  });
  return app;
}
