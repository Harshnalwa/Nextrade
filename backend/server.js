// NEXTRADE API: auth + paper trading. Data is stored in data.json (swap for Postgres later).
import express from 'express'; import cors from 'cors'; import jwt from 'jsonwebtoken'; import bcrypt from 'bcryptjs';
import fs from 'fs';
const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me', FEE = 0.001, START = 100000;
const FILE = 'data.json', db = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE)) : { users: [] };
const save = () => fs.writeFileSync(FILE, JSON.stringify(db, null, 1));
const app = express(); app.use(cors({ origin: process.env.FRONTEND_URL || true })); app.use(express.json());

const auth = (req, res, next) => {
  try { req.user = db.users.find(u => u.id === jwt.verify((req.headers.authorization || '').slice(7), SECRET).id); if (!req.user) throw 0; next(); }
  catch { res.status(401).json({ error: 'Please log in again' }); }
};
const token = u => jwt.sign({ id: u.id }, SECRET, { expiresIn: '7d' });
const view = u => ({ name: u.name, email: u.email, balance: u.balance, holdings: u.holdings, trades: u.trades.slice(-50).reverse(), watchlist: u.watchlist });

app.get('/api/health', (_, r) => r.json({ ok: true }));
app.post('/api/auth/register', (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || (password || '').length < 6) return res.status(400).json({ error: 'Name, email and a 6+ character password are required' });
  if (db.users.some(u => u.email === email)) return res.status(409).json({ error: 'That email is already registered' });
  const u = { id: Date.now().toString(36), name, email, hash: bcrypt.hashSync(password, 10), balance: START, holdings: {}, trades: [], watchlist: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'DOGEUSDT'] };
  db.users.push(u); save(); res.json({ token: token(u), user: view(u) });
});
app.post('/api/auth/login', (req, res) => {
  const u = db.users.find(x => x.email === req.body.email);
  if (!u || !bcrypt.compareSync(req.body.password || '', u.hash)) return res.status(401).json({ error: 'Wrong email or password' });
  res.json({ token: token(u), user: view(u) });
});
app.get('/api/me', auth, (req, res) => res.json(view(req.user)));

// Paper trade at the live Binance price, fetched server-side so the client can't fake it.
app.post('/api/trade', auth, async (req, res) => {
  const { symbol, side, quantity } = req.body, q = Number(quantity), u = req.user;
  if (!/^[A-Z]{2,10}USDT$/.test(symbol) || !['buy', 'sell'].includes(side) || !(q > 0)) return res.status(400).json({ error: 'Invalid order' });
  let price; try { price = +(await (await fetch(`https://data-api.binance.vision/api/v3/ticker/price?symbol=${symbol}`)).json()).price; } catch {}
  if (!price) return res.status(502).json({ error: 'Could not get a live price. Try again.' });
  const value = q * price, fee = value * FEE, h = u.holdings[symbol] || { qty: 0, avg: 0 };
  let pnl = 0;
  if (side === 'buy') {
    if (value + fee > u.balance) return res.status(400).json({ error: 'Not enough virtual balance' });
    u.balance -= value + fee; h.avg = (h.avg * h.qty + value) / (h.qty + q); h.qty += q;
  } else {
    if (q > h.qty + 1e-12) return res.status(400).json({ error: `You only hold ${h.qty} ${symbol.replace('USDT', '')}` });
    u.balance += value - fee; pnl = (price - h.avg) * q - fee; h.qty -= q;
  }
  if (h.qty < 1e-12) delete u.holdings[symbol]; else u.holdings[symbol] = h;
  u.trades.push({ id: Date.now(), symbol, side, quantity: q, price, fee, pnl, time: Date.now() });
  save(); res.json(view(u));
});
app.put('/api/watchlist', auth, (req, res) => { req.user.watchlist = (req.body.symbols || []).slice(0, 30); save(); res.json(view(req.user)); });

app.listen(process.env.PORT || 4000, () => console.log('NEXTRADE API on :' + (process.env.PORT || 4000)));
