import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes.js";
import { setupVite, serveStatic, log } from "./vite.js";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createHttpServer, type Server as HttpServer } from "http";
import type { Server } from "http";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// --- CORS setup ---
import cors from "cors";

const rawOrigins = process.env.CORS_ORIGIN ?? "";
const allowedOrigins = rawOrigins
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const corsOptions = {
  origin: (requestOrigin: string | undefined, callback: (err: any, allow?: boolean) => void) => {
    if (!requestOrigin || allowedOrigins.length === 0 || allowedOrigins.includes("*")) {
      return callback(null, true);
    }
    if (allowedOrigins.includes(requestOrigin)) {
      return callback(null, true);
    }
    return callback(null, false);
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "Accept", "X-Requested-With"],
  credentials: true,
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions)); // ✅ handle preflight requests

// --- Logging middleware ---
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }
      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }
      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);
  console.log("registerRoutes returned:", server && (server.constructor?.name || typeof server));

  const port = parseInt(process.env.PORT || "5000", 10);
  let httpServer: HttpServer;

  const attachListenHandler = (srv: HttpServer) => {
    srv.on("error", (err: any) => {
      if (err && err.code === "EADDRINUSE") {
        console.error(`Port ${port} in use. If you started the server twice, stop the other instance or set PORT to a different value.`);
      } else {
        throw err;
      }
    });
  };

  if (server && typeof (server as any).listen === "function") {
    const s = server as unknown as HttpServer & { listening?: boolean; address?: () => any };
    attachListenHandler(s);
    try {
      const addr = typeof s.address === "function" ? s.address() : null;
      if (!addr) {
        s.listen({ port, host: "0.0.0.0" }, () => {
          console.log(`Backend listening on http://0.0.0.0:${port}`);
        });
      } else {
        console.log("Server returned by registerRoutes is already listening — skipping listen()");
      }
    } catch (e) {
      console.error("Error while attempting to listen on server returned by registerRoutes:", e);
    }
    httpServer = s as HttpServer;
  } else {
    console.log("registerRoutes did not return a listenable server — creating http.Server from Express app (fallback).");
    const fallback = createHttpServer(app);
    attachListenHandler(fallback);
    fallback.listen({ port, host: "0.0.0.0" }, () => {
      console.log(`Backend listening on http://0.0.0.0:${port}`);
    });
    httpServer = fallback;
  }

  process.on("exit", (code) => {
    console.log("process exit event, code =", code);
  });
  process.on("SIGINT", () => {
    console.log("SIGINT received, shutting down");
    process.exit(0);
  });
  process.on("uncaughtException", (err) => {
    console.error("uncaughtException:", err);
  });
  process.on("unhandledRejection", (reason) => {
    console.error("unhandledRejection:", reason);
  });

  if (app.get("env") === "development") {
    try {
      await setupVite(app, httpServer as unknown as Server);
      console.log("Vite middleware set up (development).");
    } catch (err) {
      console.error("Error while setting up Vite (development):", err);
    }
  } else {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const clientDist = path.resolve(__dirname, "../dist");

    app.use(express.static(clientDist, { maxAge: "1y", index: false }));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(clientDist, "index.html"));
    });
  }
})();
