# רשף ביטחון — מערכת ניהול שוברי דלק

Node.js + Express (REST API) · MongoDB Atlas (Mongoose) · React + Tailwind (Vite, TanStack Router) · Render.

## Architecture

```
server/
  index.js            entry: connect MongoDB, serve API + built SPA
  app.js              Express app (helmet, CSRF guard, routes, SPA fallback)
  models.js           Mongoose schemas (one collection per former Postgres table)
  auth.js             JWT (httpOnly cookie) + bcrypt, role guards, dev-tools owner check
  db.js               connection + withTransaction() (snapshot txn, retries)
  routes/auth.js      /api/auth  login · logout · me · change-password (forced on first login)
  routes/accounts.js  /api/accounts  bootstrap · sync · reset · delete (admin)
  routes/table.js     /api/db/:table  row access with role/branch isolation (ex-RLS)
  routes/rpc.js       /api/rpc/:name  business logic (ex-Postgres functions)
  rpc/inventory.js    stock snapshot, atomic allocation & issuance, imports, Paz reconciliation
  rpc/vehicles.js     work / private vehicle delta sync
  rpc/workerLinks.js  public employee voucher link (ID + phone, 3-try lock, signature)
  rpc/devtools.js     demo data / reset — only מאיה קורן (DEV_TOOLS_OWNER_*)
  tests/              integration tests on an in-memory MongoDB replica set
src/                  React app; src/lib/apiClient.ts is the bridge to the API
scripts/migrate-from-supabase.mjs   one-time data copy from the old Supabase project
```

Roles: `admin` (אדמין), `branch` (מנהל סניף / אזור), `supervisor` (מפקח), `viewer` (צופה, read-only).

## Local development

```bash
cp .env.example .env        # fill MONGODB_URI, JWT_SECRET
npm install
npm run dev:server          # API on :3000
npm run dev                 # Vite on :8080, proxies /api → :3000
npm test                    # server integration tests + frontend unit tests
```

## Deploy on Render

1. Push the `DELEK` branch to GitHub.
2. Render → **New → Blueprint** → pick the repo (uses `render.yaml`), or create a **Web Service** manually:
   - Branch: `DELEK` · Runtime: Node
   - Build command: `npm ci --include=dev && npm run build`
   - Start command: `npm start`
   - Health check path: `/api/health`
3. Environment variables:
   - `MONGODB_URI` — Atlas connection string (Atlas clusters are replica sets, required for transactions).
   - `JWT_SECRET` — 32+ random characters.
   - `DEV_TOOLS_OWNER_NATIONAL_ID` (and optionally `DEV_TOOLS_OWNER_PHONE`) — מאיה קורן's ID; nobody else ever sees demo/reset tools.
   - `NODE_ENV=production`.
4. In Atlas → Network Access, allow Render's outbound IPs (or 0.0.0.0/0 with a strong DB password).

## Moving the existing data

```bash
node --env-file=.env scripts/migrate-from-supabase.mjs           # dry run
node --env-file=.env scripts/migrate-from-supabase.mjs --write   # copy
```

Passwords cannot be exported from Supabase Auth: after migration every user signs in with
their phone + ת.ז and is forced to choose a new password.
