# NEXTRADE

A live cryptocurrency market dashboard and paper-trading app. It uses public Binance market data and simulated trades; no real orders or payments are made.

## Features

- Live prices, 24-hour market stats, order book, and recent trades
- Candlestick charts with selectable timeframes
- Account registration and login
- Paper trading with $100,000 virtual starting balance and a 0.1% fee
- Portfolio, holdings, trade history, and a per-user watchlist
- Reconnecting market-data WebSocket with automatic resubscription

## Requirements

- Node.js 18 or later
- npm
- Internet access to Binance public REST and WebSocket market-data endpoints

This project uses npm, not Python. Dependency requirements are maintained in [`backend/package.json`](./backend/package.json) and [`frontend/package.json`](./frontend/package.json); the corresponding `package-lock.json` files lock the installed versions. There is no `requirements.txt`.

## Run locally

Open two terminals from the project directory.

**Terminal 1 — backend API**

```bash
cd backend
npm ci
npm run dev
```

The API starts at `http://localhost:4000`.

**Terminal 2 — frontend**

```bash
cd frontend
npm ci
npm run dev
```

Open the URL printed by Vite (by default, `http://localhost:5173`). The Vite development server proxies `/api` requests to the backend on port 4000.

To create a production frontend build:

```bash
cd frontend
npm run build
```

## Configuration

The backend supports these environment variables:

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `4000` | Port used by the API server |
| `JWT_SECRET` | Development-only fallback | Secret used to sign login tokens; set a strong, private value outside local development |
| `FRONTEND_URL` | Allows any origin | Allowed frontend origin for CORS; set this to the deployed frontend URL in production |

Do not use the development JWT fallback in a deployed environment, and do not commit secrets.

## Data and API

User accounts, balances, holdings, watchlists, and trades are stored in `backend/data.json`. This simple file-based storage is intended for local/demo use, not concurrent or production deployments. Back up or remove this file only when you intend to reset local account data.

The frontend communicates with these backend routes:

- `GET /api/health` — health check
- `POST /api/auth/register` and `POST /api/auth/login` — account registration and login
- `GET /api/me` — current account and portfolio
- `POST /api/trade` — simulated buy/sell order, priced using Binance market data
- `PUT /api/watchlist` — update the current account's watchlist

## Technology

- Frontend: React 18, Vite, Lightweight Charts
- Backend: Node.js, Express, JWT, bcryptjs
- Market data: Binance public REST API and WebSocket streams
