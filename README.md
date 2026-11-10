# NEXTRADE

A live cryptocurrency market dashboard and paper-trading app. It uses public Binance market data and simulated trades; no real orders or payments are made.

## Features

- Live prices, 24-hour market stats, order book, recent trades and candlestick charts
- Account registration and login
- Paper trading with $100,000 virtual starting balance and a 0.1% fee
- Portfolio, holdings, trade history and per-user watchlist
- Reconnecting market-data WebSocket with automatic resubscription

## Requirements

- Node.js 18 or later
- npm
- Internet access to Binance public REST and WebSocket market-data endpoints

## Run locally

Terminal 1 — backend:

```bash
cd backend
npm ci
npm run dev
```

Terminal 2 — frontend:

```bash
cd frontend
npm ci
npm run dev
```

Open the Vite URL (normally http://localhost:5173). The Vite development proxy forwards /api requests to http://127.0.0.1:4000.

Run backend API smoke tests:

```bash
cd backend
npm test
```

Build the frontend:

```bash
cd frontend
npm run build
```

## Environment variables

Backend variables:

| Variable | Purpose |
| --- | --- |
| PORT | HTTP port; hosting platforms provide this automatically |
| NODE_ENV | Set to production on deployment |
| JWT_SECRET | Required in production; use a random secret of at least 32 characters |
| FRONTEND_URL | Exact deployed frontend origin, e.g. https://your-app.vercel.app |
| DATA_FILE | Optional absolute path for JSON database; point this to a persistent disk |

Frontend variable:

| Variable | Purpose |
| --- | --- |
| VITE_API_URL | Backend base URL, e.g. https://your-api.onrender.com; leave empty for local Vite proxy |

Never commit .env files, JWT secrets or backend/data.json.

## JSON database warning

This project deliberately keeps JSON storage for the basic/demo setup. It is not a production database: simultaneous writes can conflict, there are no database transactions, and the data file must live on persistent storage. On Render, the included render.yaml config mounts a persistent disk at /var/data. Persistent disks may require a paid Render instance. Without persistent storage, accounts, balances, watchlists and trades can be lost when the service restarts or redeploys. For a real multi-user trading product, migrate to PostgreSQL before public production use.

The tracked sample database was removed because it contained private account information. The backend creates a fresh data.json file on first write. Existing accounts from that removed sample file are not migrated; users must register again.

## Deploy

### Backend — Render

1. Push this repository branch to GitHub and create a Render Blueprint from the repository, or create a Web Service manually.
2. For manual setup choose Root Directory `backend`, Build Command `npm ci`, Start Command `npm start`.
3. Set `NODE_ENV=production`, `JWT_SECRET` to a random value of at least 32 characters, and `FRONTEND_URL` to the exact Vercel frontend origin.
4. Attach a persistent disk mounted at `/var/data` and set `DATA_FILE=/var/data/data.json`. The included render.yaml describes this setup.
5. Confirm `https://YOUR-API.onrender.com/api/health` returns `{"ok":true}`.

### Frontend — Vercel

1. Import the GitHub repository into Vercel.
2. Set Root Directory to `frontend`, Framework Preset to Vite, Build Command to `npm run build`, and Output Directory to `dist`.
3. Add `VITE_API_URL=https://YOUR-API.onrender.com` (no trailing slash).
4. Deploy, then update the backend `FRONTEND_URL` with the exact Vercel domain and redeploy the backend.

### Post-deployment checks

- Register a new account and log in.
- Refresh the page and confirm the session still works.
- Confirm prices, chart, order book and recent trades receive live data.
- Add/remove a watchlist symbol.
- Test paper buy and sell with a small quantity.
- Confirm portfolio and trade history update.
- Restart/redeploy the backend and verify data remains on its persistent disk.

## API routes

- GET /api/health
- POST /api/auth/register
- POST /api/auth/login
- GET /api/me
- POST /api/trade
- PUT /api/watchlist

## Technology

- Frontend: React 18, Vite, Lightweight Charts
- Backend: Node.js, Express, JWT, bcryptjs
- Market data: Binance public REST API and WebSocket streams
