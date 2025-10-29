# Backend — genox-separated-project/backend

Short summary
- Node + TypeScript backend for the project.
- API source lives under `src/` and `api/` (route handlers: `api/tools/*.ts` and `src/routes.ts`).
- Static/uploads: `uploads/`.
- Drizzle DB config: `drizzle.config.ts`.
- Environment file: `.env` (already present).

Quick run (local development)
1. Open a terminal (Windows):
   cd c:\Users\varsh\Downloads\separate_genox_separated\genox-separated-project\backend
2. Install:
   npm install
3. Start dev server:
   npm run dev
   - If the repo uses build start, instead:
     npm run build
     npm start

Common env variables (set in `.env`)
- PORT=5000
- DATABASE_URL=...
- SMTP_HOST=...
- SMTP_PORT=...
- SMTP_USER=...
- SMTP_PASS=...
- STORAGE_PROVIDER=...
- STORAGE_BUCKET=...
- CORS_ORIGIN=http://localhost:5173

Note: adjust names/values to match your `.env` file. The backend currently binds `0.0.0.0` for listening; use `http://localhost:5000` in the browser/frontend.

Main API endpoints (inspect `api/tools/*.ts` and `src/routes.ts` for full details)
- POST /api/tools/contact      — contact form
- POST /api/tools/newsletter   — subscribe
- POST /api/tools/upload       — file uploads
- Additional helpers under `src/utils` and `api/utils`

Quick test with curl
- Tokenize / other tool endpoints (example pattern — update path as needed):
  curl -i -X POST http://localhost:5000/api/tools/contact \
    -H "Content-Type: application/json" \
    -d '{"name":"Test","email":"a@b.com","message":"hi"}'

Troubleshooting: "Failed to execute 'json' on 'Response': Unexpected end of JSON input"
- This means the frontend attempted response.json() but response body was empty or not valid JSON.
- Check:
  1. Backend actually started on the expected port (check terminal logs).
  2. Use curl (above) to confirm the endpoint returns JSON.
  3. Use `http://localhost:5000` in browser/requests — do NOT use `0.0.0.0` as the frontend fetch URL.
  4. Ensure CORS is enabled (server should use cors middleware). If CORS is missing, browser requests may be blocked or aborted.
  5. Inspect backend logs for thrown exceptions that may return no body.
  6. If backend returns HTML error page, ensure your frontend handles non-JSON responses (or backend returns JSON error: `res.status(500).json({ error: '...' })`).

If CSS or frontend issues show raw Tailwind directives
- Not related to backend — ensure frontend PostCSS/Tailwind config and `index.css` import are correct and that the frontend dev server is running.

Minimal fix suggestions (if you need to patch backend)
- Add/verify CORS middleware in `src/index.ts`:
  app.use(require('cors')({ origin: process.env.CORS_ORIGIN || true }));

Need me to:
- Create a small PR-style patch to add CORS or example env.example in the backend.
- Or generate a troubleshooting checklist tailored to the exact failing endpoint (paste the failing network request details).