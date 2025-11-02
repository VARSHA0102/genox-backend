import dotenv from "dotenv";
import express from "express";
import { registerRoutes } from "./routes.js";
import { log } from "./vite.js";
import { createServer as createHttpServer } from "http";
import cors from "cors";
// load .env into process.env (works both locally and in many deployment setups)
dotenv.config();
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
// --- robust CORS setup (apply BEFORE registerRoutes) ---
const rawOrigins = (process.env.CORS_ORIGIN ?? "").toString();
const allowedOrigins = rawOrigins
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
// cors options usable with the cors middleware
const corsOptions = {
    origin: (requestOrigin, callback) => {
        // allow non-browser requests (no origin header) and allow all when no env specified
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
// Apply global CORS middleware and explicit OPTIONS handler
app.use(cors(corsOptions));
// remove app.options("/*", ...) which fails at runtime with path-to-regexp
// explicit preflight fallback middleware (handles OPTIONS for all routes)
app.use((req, res, next) => {
    if (req.method === "OPTIONS") {
        const requestOrigin = req.headers.origin;
        const allowAll = allowedOrigins.length === 0 || allowedOrigins.includes("*");
        if (requestOrigin && (allowAll || allowedOrigins.includes(requestOrigin))) {
            res.setHeader("Access-Control-Allow-Origin", allowAll ? "*" : requestOrigin);
            res.setHeader("Vary", "Origin");
            res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
            res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization,Accept,X-Requested-With");
            res.setHeader("Access-Control-Allow-Credentials", "true");
        }
        return res.sendStatus(204);
    }
    next();
});
// request logging middleware (existing)
app.use((req, res, next) => {
    const start = Date.now();
    const path = req.path;
    let capturedJsonResponse = undefined;
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
    let httpServer;
    const attachListenHandler = (srv) => {
        srv.on("error", (err) => {
            if (err && err.code === "EADDRINUSE") {
                console.error(`Port ${port} in use. If you started the server twice, stop the other instance or set PORT to a different value.`);
            }
            else {
                throw err;
            }
        });
    };
    if (server && typeof server.listen === "function") {
        const s = server;
        attachListenHandler(s);
        try {
            const addr = typeof s.address === "function" ? s.address() : null;
            if (!addr) {
                s.listen({ port, host: "0.0.0.0" }, () => {
                    console.log(`Backend listening on http://0.0.0.0:${port}`);
                });
            }
            else {
                console.log("Server returned by registerRoutes is already listening — skipping listen()");
            }
        }
        catch (e) {
            console.error("Error while attempting to listen on server returned by registerRoutes:", e);
        }
        httpServer = s;
    }
    else {
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
})();
