import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { type ViteDevServer } from "vite";
import { type Server } from "http";
import { nanoid } from "nanoid";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ✅ Keep only ONE log function
export function log(message: string, source = "vite") {
  const time = new Date().toLocaleTimeString("en-US", { hour12: false });
  console.log(`[${time}] [${source}] ${message}`);
}

export async function setupVite(app: Express, server: Server) {
  const frontendDir = path.resolve(__dirname, "..", "..", "frontend");

  // Load vite from the frontend package so require('vite') resolves to frontend/node_modules
  const { createRequire } = await import("module");
  let viteModule: any;
  try {
    // Prefer requiring the frontend's vite CJS entry directly to avoid accidental resolution
    const viteEntryCjs = path.resolve(
      frontendDir,
      "node_modules",
      "vite",
      "dist",
      "node",
      "index.js"
    );

    const req = createRequire(path.resolve(frontendDir, "package.json"));

    if (fs.existsSync(viteEntryCjs)) {
      viteModule = req(viteEntryCjs);
    } else {
      // fallback to requiring the package name from the frontend package scope
      viteModule = req("vite");
    }
  } catch (err) {
    // final fallback: try dynamic import from current resolution
    try {
      const imported = await import("vite");
      viteModule = (imported && (imported as any).default) ?? imported;
    } catch (err2) {
      console.error("Failed to load vite from frontend and fallback import:", err, err2);
      throw err2 ?? err;
    }
  }

  const createServer =
    viteModule?.createServer ??
    viteModule?.default?.createServer ??
    (typeof viteModule === "function" ? viteModule : undefined);

  if (typeof createServer !== "function") {
    console.error("Could not find createServer on the loaded vite module. Keys:", Object.keys(viteModule || {}));
    throw new Error("Vite's createServer not found. Ensure vite is installed in frontend/node_modules.");
  }

  const viteServer = await createServer({
    root: frontendDir,
    configFile: path.resolve(frontendDir, "vite.config.ts"),
    server: {
      middlewareMode: true,
      hmr: { server },
      allowedHosts: true,
    },
    appType: "custom",
  });

  app.use(viteServer.middlewares);

  // Safe catch-all for HTML requests (do NOT pass a path string like "*" into router.use,
  // which can cause path-to-regexp errors in some router versions).
  app.use(async (req, res, next) => {
    // only handle navigation/HTML GET requests — let assets / API routes fall through
    if (req.method !== "GET") return next();
    const accept = req.headers.accept || "";
    if (!accept.includes("text/html")) return next();

    const url = req.originalUrl;
    try {
      const clientTemplate = path.resolve(frontendDir, "index.html");
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      // cache-bust main script during dev
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`,
      );
      const page = await viteServer.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      viteServer.ssrFixStacktrace?.(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "..", "..", "frontend", "dist");

  if (!fs.existsSync(distPath)) {
    throw new Error(`Could not find the build directory: ${distPath}`);
  }

  app.use(express.static(distPath));
  app.use("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
