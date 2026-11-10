// NEXTRADE API: authentication and simulated paper trading.
// JSON storage is suitable for local/demo deployments only. Use a persistent disk.
import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const app = express();
const PORT = Number(process.env.PORT) || 4000;
const IS_PROD = process.env.NODE_ENV === 'production';
const SECRET = process.env.JWT_SECRET;
const FEE = 0.001;
const START_BALANCE = 100000;
const DEFAULT_WATCHLIST = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'DOGEUSDT'];
const here = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = process.env.DATA_FILE || path.join(here, 'data.json');

if (IS_PROD && (!SECRET || SECRET.length < 32 || SECRET === 'dev-secret-change-me')) {
  throw new Error('Set JWT_SECRET to a random secret of at least 32 characters in production.');
}
const JWT_SECRET = SECRET || 'local-development-secret-change-me-please-32chars';

function loadDatabase() {
  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    if (!parsed || !Array.isArray(parsed.users)) throw new Error('Invalid database structure');
    return parsed;
  } catch (error) {
    if (error.code !== 'ENOENT') throw new Error(`Cannot read JSON database: ${error.message}`);
    return { users: [] };
  }
}
const db = loadDatabase();

function saveDatabase() {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  const temp = DATA_FILE + '.tmp';
  fs.writeFileSync(temp, JSON.stringify(db, null, 2), { mode: 0o600 });
  fs.renameSync(temp, DATA_FILE);
}

const allowedOrigins = (process.env.FRONTEND_URL || '').split(',').map(value => value.trim()).filter(Boolean);
app.use(cors({
  origin(origin, callback) {
    if (!origin || (!IS_PROD && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Origin not allowed by CORS'));
  }
}));
app.use(express.json({ limit: '20kb' }));

const auth = (req, res, next) => {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return res.status(401).json({ error: 'Please log in again' });
  try {
    const payload = jwt.verify(header.slice(7), JWT_SECRET);
    req.user = db.users.find(user => user.id === payload.id);
    if (!req.user) return res.status(401).json({ error: 'Please log in again' });
    next();
  } catch { return res.status(401).json({ error: 'Please log in again' }); }
};
const createToken = user => jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '7d' });
const userView = user => ({ name: user.name, email: user.email, balance: user.balance, holdings: user.holdings, trades: user.trades.slice(-50).reverse(), watchlist: user.watchlist });

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.post('/api/auth/register', async (req, res, next) => {
  try {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (name.length < 2 || name.length > 60 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 8 || password.length > 72) {
      return res.status(400).json({ error: 'Enter a valid name, email and password (8–72 characters)' });
    }
    if (db.users.some(user => user.email === email)) return res.status(409).json({ error: 'That email is already registered' });
    const user = { id: `u_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`, name, email, hash: await bcrypt.hash(password, 12), balance: START_BALANCE, holdings: {}, trades: [], watchlist: [...DEFAULT_WATCHLIST] };
    db.users.push(user);
    saveDatabase();
    return res.status(201).json({ token: createToken(user), user: userView(user) });
  } catch (error) { next(error); }
});
app.post('/api/auth/login', async (req, res, next) => {
  try {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const user = db.users.find(item => item.email === email);
    if (!user || !(await bcrypt.compare(password, user.hash))) return res.status(401).json({ error: 'Wrong email or password' });
    return res.json({ token: createToken(user), user: userView(user) });
  } catch (error) { next(error); }
});
app.get('/api/me', auth, (req, res) => res.json(userView(req.user)));

app.post('/api/trade', auth, async (req, res) => {
  const symbol = typeof req.body?.symbol === 'string' ? req.body.symbol.toUpperCase() : '';
  const side = req.body?.side;
  const quantity = Number(req.body?.quantity);
  if (!/^[A-Z0-9]{2,15}USDT$/.test(symbol) || !['buy', 'sell'].includes(side) || !Number.isFinite(quantity) || quantity <= 0 || quantity > 1e9) return res.status(400).json({ error: 'Invalid order' });
  try {
    const response = await fetch(`https://data-api.binance.vision/api/v3/ticker/price?symbol=${encodeURIComponent(symbol)}`, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) return res.status(502).json({ error: 'Market price service is unavailable. Try again.' });
    const quote = await response.json();
    const price = Number(quote.price);
    if (!Number.isFinite(price) || price <= 0) return res.status(502).json({ error: 'Could not get a valid live price. Try again.' });
    const user = req.user;
    const value = quantity * price;
    const fee = value * FEE;
    if (!Number.isFinite(value) || !Number.isFinite(fee)) return res.status(400).json({ error: 'Order value is too large' });
    const holding = user.holdings[symbol] || { qty: 0, avg: 0 };
    let pnl = 0;
    if (side === 'buy') {
      if (value + fee > user.balance) return res.status(400).json({ error: 'Not enough virtual balance' });
      user.balance -= value + fee;
      holding.avg = (holding.avg * holding.qty + value) / (holding.qty + quantity);
      holding.qty += quantity;
    } else {
      if (quantity > holding.qty + 1e-12) return res.status(400).json({ error: `You only hold ${holding.qty} ${symbol.replace('USDT', '')}` });
      user.balance += value - fee;
      pnl = (price - holding.avg) * quantity - fee;
      holding.qty -= quantity;
    }
    if (holding.qty < 1e-12) delete user.holdings[symbol];
    else user.holdings[symbol] = holding;
    user.trades.push({ id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, symbol, side, quantity, price, fee, pnl, time: Date.now() });
    saveDatabase();
    return res.json(userView(user));
  } catch (error) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError') return res.status(504).json({ error: 'Market price request timed out. Try again.' });
    console.error('Trade failed:', error);
    return res.status(502).json({ error: 'Could not complete paper trade. Try again.' });
  }
});
app.put('/api/watchlist', auth, (req, res) => {
  const symbols = req.body?.symbols;
  if (!Array.isArray(symbols) || symbols.length > 30 || symbols.some(symbol => typeof symbol !== 'string' || !/^[A-Z0-9]{2,15}USDT$/.test(symbol))) return res.status(400).json({ error: 'Watchlist must contain up to 30 valid USDT market symbols' });
  req.user.watchlist = [...new Set(symbols)];
  saveDatabase();
  return res.json(userView(req.user));
});

app.use((error, _req, res, _next) => {
  if (error.message === 'Origin not allowed by CORS') return res.status(403).json({ error: 'Origin not allowed' });
  if (error instanceof SyntaxError) return res.status(400).json({ error: 'Invalid JSON request body' });
  console.error(error);
  return res.status(500).json({ error: 'Internal server error' });
});
app.listen(PORT, '0.0.0.0', () => console.log(`NEXTRADE API listening on port ${PORT}`));
