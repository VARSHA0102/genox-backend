import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createHttpServer, type Server as HttpServer } from "http";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

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
  // If registerRoutes returned an already-listening Server, don't call listen again.
  const port = parseInt(process.env.PORT || "5000", 10);
  // declare httpServer in this outer scope so both branches can assign it
  let httpServer: HttpServer;

  // Attach error handler BEFORE calling listen so EADDRINUSE doesn't crash the process
  const attachListenHandler = (srv: HttpServer) => {
    srv.on("error", (err: any) => {
      if (err && err.code === "EADDRINUSE") {
        console.error(`Port ${port} in use. If you started the server twice, stop the other instance or set PORT to a different value.`);
      } else {
        // rethrow so it can be logged by existing handlers
        throw err;
      }
      
    });
  };

  if (server && typeof (server as any).listen === "function") {
    const s = server as unknown as HttpServer & { listening?: boolean; address?: () => any };
    attachListenHandler(s);
    // some Server implementations may not expose .listening; check address() instead
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

  // add process event handlers to surface why the process might exit
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

  // OPTIONAL (temporary) keep-alive for debugging — remove when root cause found
  // const _keepAlive = setInterval(() => {}, 1_000_000);

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    try {
      // pass the actual http.Server that is listening to Vite for HMR
      await setupVite(app, httpServer as unknown as Server);
      console.log("Vite middleware set up (development).");
    } catch (err) {
      console.error("Error while setting up Vite (development):", err);
      // do not exit — server is already listening, keep running so you can inspect logs
    }
  } else {
    // production: serve built assets from dist and only then fallback to index.html
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const clientDist = path.resolve(__dirname, "../dist");

    // serve static assets first (express sets correct Content-Type)
    app.use(express.static(clientDist, { maxAge: "1y", index: false }));

    // SPA fallback AFTER static middleware
    app.get("*", (_req, res) => {
      res.sendFile(path.join(clientDist, "index.html"));
    });
  }

  // server already started above
})();
