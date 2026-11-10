import { useEffect, useRef, useState } from 'react';
import { createChart } from 'lightweight-charts';
import { subscribe, useStatus, useStream, messageCount } from './ws.js';
import { api } from './api.js';

const fmt = (n, d = 2) => Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const px = n => fmt(n, n < 1 ? 5 : n < 100 ? 3 : 2);
const base = s => s.replace('USDT', '');
const TAPE = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'DOGEUSDT', 'ADAUSDT', 'AVAXUSDT'];

function useTicker(sym) {
  const m = useStream(`${sym.toLowerCase()}@miniTicker`);
  if (!m) return null;
  const price = +m.c; return { price, pct: ((price - +m.o) / +m.o) * 100, vol: +m.q, high: +m.h, low: +m.l };
}

function Status() {
  const s = useStatus(), [rate, setRate] = useState(0), last = useRef(0);
  useEffect(() => { const t = setInterval(() => { const n = messageCount(); setRate(n - last.current); last.current = n; }, 1000); return () => clearInterval(t); }, []);
  return <div className={'status ' + s}><i />{s === 'live' ? `Live · ${rate} msg/s` : s === 'connecting' ? 'Connecting' : 'Reconnecting, data paused'}</div>;
}

function Tape() {
  return <div className="tape"><div className="tape-track">{[...TAPE, ...TAPE].map((s, i) => <TapeItem key={i} sym={s} />)}</div></div>;
}
function TapeItem({ sym }) {
  const t = useTicker(sym);
  return <span className="tape-item"><b>{base(sym)}</b>{t ? <>{px(t.price)}<em className={t.pct >= 0 ? 'up' : 'dn'}>{t.pct >= 0 ? '+' : ''}{t.pct.toFixed(2)}%</em></> : '…'}</span>;
}

function Chart({ sym }) {
  const el = useRef(), series = useRef(), vol = useRef(), [tf, setTf] = useState('1m'), st = useStatus();
  useEffect(() => {
    const c = createChart(el.current, { autoSize: true, layout: { background: { color: 'transparent' }, textColor: '#7d8aa5', fontFamily: 'IBM Plex Mono' },
      grid: { vertLines: { color: '#131b2b' }, horzLines: { color: '#131b2b' } }, rightPriceScale: { borderColor: '#1b2436' }, timeScale: { borderColor: '#1b2436', timeVisible: true } });
    series.current = c.addCandlestickSeries({ upColor: '#10d9a0', downColor: '#ff5c6c', borderVisible: false, wickUpColor: '#10d9a0', wickDownColor: '#ff5c6c' });
    vol.current = c.addHistogramSeries({ priceFormat: { type: 'volume' }, priceScaleId: '' });
    vol.current.priceScale().applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } });
    return () => c.remove();
  }, []);
  // Reloads history on symbol/timeframe change and again after every reconnect (gap backfill).
  useEffect(() => {
    if (st !== 'live') return;
    const k = x => ({ time: x[0] / 1000, open: +x[1], high: +x[2], low: +x[3], close: +x[4] });
    fetch(`https://data-api.binance.vision/api/v3/klines?symbol=${sym}&interval=${tf}&limit=300`).then(r => r.json()).then(d => {
      series.current.setData(d.map(k)); vol.current.setData(d.map(x => ({ time: x[0] / 1000, value: +x[5], color: +x[4] >= +x[1] ? '#10d9a055' : '#ff5c6c55' })));
    });
    return subscribe(`${sym.toLowerCase()}@kline_${tf}`, m => {
      const x = m.k; series.current.update({ time: x.t / 1000, open: +x.o, high: +x.h, low: +x.l, close: +x.c });
      vol.current.update({ time: x.t / 1000, value: +x.v, color: +x.c >= +x.o ? '#10d9a055' : '#ff5c6c55' });
    });
  }, [sym, tf, st]);
  return <div className="panel chart-panel">
    <div className="tfs">{['1m', '5m', '15m', '1h', '4h', '1d'].map(t => <button key={t} className={t === tf ? 'on' : ''} onClick={() => setTf(t)}>{t}</button>)}</div>
    <div ref={el} className="chart" />
  </div>;
}

function Hero({ sym }) {
  const t = useTicker(sym), prev = useRef(0), [flash, setFlash] = useState('');
  useEffect(() => { if (!t) return; setFlash(t.price >= prev.current ? 'fu' : 'fd'); prev.current = t.price; const id = setTimeout(() => setFlash(''), 250); return () => clearTimeout(id); }, [t?.price]);
  if (!t) return <div className="hero skeleton" />;
  return <div className="hero">
    <div><span className="pair">{base(sym)}<small>/USDT</small></span>
      <div className={'big ' + flash}>${px(t.price)}</div></div>
    <div className="stats">
      <div><label>24h change</label><span className={t.pct >= 0 ? 'up' : 'dn'}>{t.pct >= 0 ? '+' : ''}{t.pct.toFixed(2)}%</span></div>
      <div><label>24h high</label><span>{px(t.high)}</span></div><div><label>24h low</label><span>{px(t.low)}</span></div>
      <div><label>Volume</label><span>${fmt(t.vol / 1e6, 1)}M</span></div>
    </div></div>;
}

function Watchlist({ list, sym, setSym, onRemove, onAdd }) {
  const [q, setQ] = useState('');
  return <div className="panel"><h3>Watchlist</h3>
    <form className="add" onSubmit={e => { e.preventDefault(); if (q) onAdd(q.toUpperCase().replace('USDT', '') + 'USDT'); setQ(''); }}>
      <input placeholder="Add coin, e.g. LINK" value={q} onChange={e => setQ(e.target.value)} /></form>
    {list.map(s => <Row key={s} s={s} active={s === sym} pick={() => setSym(s)} rm={() => onRemove(s)} />)}
  </div>;
}
function Row({ s, active, pick, rm }) {
  const t = useTicker(s);
  return <div className={'row ' + (active ? 'active' : '')} onClick={pick}>
    <b>{base(s)}</b><span className="mono">{t ? px(t.price) : '…'}</span>
    <em className={t?.pct >= 0 ? 'up' : 'dn'}>{t ? (t.pct >= 0 ? '+' : '') + t.pct.toFixed(2) + '%' : ''}</em>
    <button className="x" onClick={e => { e.stopPropagation(); rm(); }} aria-label={'Remove ' + s}>×</button></div>;
}

function OrderBook({ sym }) {
  const d = useStream(`${sym.toLowerCase()}@depth10@100ms`);
  if (!d) return <div className="panel"><h3>Order book</h3><p className="muted">Waiting for depth data…</p></div>;
  const asks = d.asks.slice(0, 8).reverse(), bids = d.bids.slice(0, 8), max = Math.max(...[...asks, ...bids].map(x => +x[1]));
  const line = (x, c) => <div className="ob" key={x[0]}><i className={c} style={{ width: (x[1] / max) * 100 + '%' }} /><span className={c === 'a' ? 'dn' : 'up'}>{px(x[0])}</span><span>{(+x[1]).toFixed(4)}</span></div>;
  return <div className="panel"><h3>Order book</h3>{asks.map(x => line(x, 'a'))}<div className="spread">spread {px(asks[asks.length - 1][0] - bids[0][0])}</div>{bids.map(x => line(x, 'b'))}</div>;
}

function Trades({ sym }) {
  const [list, setList] = useState([]);
  useEffect(() => { setList([]); }, [sym]);
  useStream(`${sym.toLowerCase()}@trade`, m => setList(l => [{ id: m.t, p: +m.p, q: +m.q, sell: m.m, t: m.T }, ...l].slice(0, 12)));
  return <div className="panel"><h3>Recent trades</h3>{list.map(x => <div className="ob" key={x.id}><span className={x.sell ? 'dn' : 'up'}>{px(x.p)}</span><span>{x.q.toFixed(4)}</span><span className="muted">{new Date(x.t).toLocaleTimeString()}</span></div>)}</div>;
}

function TradePanel({ sym, me, setMe }) {
  const t = useTicker(sym), [qty, setQty] = useState(''), [msg, setMsg] = useState(null);
  const total = t && qty ? qty * t.price : 0, held = me.holdings[sym]?.qty || 0;
  const go = async side => {
    try { setMe(await api('/trade', { symbol: sym, side, quantity: qty })); setMsg({ ok: 1, t: `${side === 'buy' ? 'Bought' : 'Sold'} ${qty} ${base(sym)} (paper)` }); setQty(''); }
    catch (e) { setMsg({ t: e.message }); }
  };
  return <div className="panel"><h3>Trade <span className="tag">Paper trading</span></h3>
    <label>Quantity ({base(sym)})</label><input type="number" min="0" step="any" value={qty} onChange={e => setQty(e.target.value)} placeholder="0.00" />
    <div className="kv"><span>Estimated value</span><b>${fmt(total)}</b></div>
    <div className="kv"><span>Fee (0.1%)</span><b>${fmt(total * 0.001)}</b></div>
    <div className="kv"><span>Cash</span><b>${fmt(me.balance)}</b></div>
    <div className="kv"><span>You hold</span><b>{held.toFixed(5)} {base(sym)}</b></div>
    <div className="btns"><button className="buy" disabled={!(qty > 0)} onClick={() => go('buy')}>Buy</button><button className="sell" disabled={!(qty > 0)} onClick={() => go('sell')}>Sell</button></div>
    {msg && <p className={msg.ok ? 'up' : 'dn'}>{msg.t}</p>}</div>;
}

function HoldingRow({ s, h }) {
  const t = useTicker(s), val = t ? t.price * h.qty : 0, pnl = t ? (t.price - h.avg) * h.qty : 0;
  return <tr><td><b>{base(s)}</b></td><td>{h.qty.toFixed(5)}</td><td>{px(h.avg)}</td><td>${fmt(val)}</td><td className={pnl >= 0 ? 'up' : 'dn'}>{pnl >= 0 ? '+' : ''}{fmt(pnl)}</td></tr>;
}
function Portfolio({ me }) {
  const hs = Object.entries(me.holdings), invested = hs.reduce((a, [, h]) => a + h.qty * h.avg, 0), realised = me.trades.reduce((a, t) => a + (t.pnl || 0), 0);
  return <div className="panel wide"><h3>Portfolio</h3>
    <div className="cards"><div><label>Cash</label><b>${fmt(me.balance)}</b></div><div><label>Invested</label><b>${fmt(invested)}</b></div>
      <div><label>Realised P&L</label><b className={realised >= 0 ? 'up' : 'dn'}>{fmt(realised)}</b></div></div>
    <div className="split">
      <div>{hs.length ? <table><thead><tr><th>Asset</th><th>Qty</th><th>Avg entry</th><th>Value</th><th>Unrealised</th></tr></thead><tbody>{hs.map(([s, h]) => <HoldingRow key={s} s={s} h={h} />)}</tbody></table>
        : <p className="muted">No holdings yet. Pick a coin and place your first paper trade.</p>}</div>
      <div><label>Latest trades</label>{me.trades.slice(0, 6).map(t => <div className="kv" key={t.id}><span className={t.side === 'buy' ? 'up' : 'dn'}>{t.side} {t.quantity} {base(t.symbol)}</span><b>@ {px(t.price)}</b></div>)}</div>
    </div></div>;
}

function Login({ onAuth }) {
  const [mode, setMode] = useState('login'), [f, setF] = useState({ name: '', email: '', password: '' }), [err, setErr] = useState('');
  const submit = async e => { e.preventDefault(); try { const r = await api('/auth/' + (mode === 'login' ? 'login' : 'register'), f); localStorage.token = r.token; onAuth(r.user); } catch (x) { setErr(x.message); } };
  const set = k => e => setF({ ...f, [k]: e.target.value });
  return <div className="login"><div className="login-art"><h1>NEX<span>TRADE</span></h1><p>Trade live crypto markets with $100,000 of virtual cash. No risk, real prices.</p><Tape /></div>
    <form onSubmit={submit}><h2>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h2>
      {mode === 'signup' && <input placeholder="Name" value={f.name} onChange={set('name')} />}
      <input placeholder="Email" type="email" required autoComplete="email" value={f.email} onChange={set('email')} /><input placeholder="Password" type="password" required minLength={mode === "signup" ? 8 : undefined} maxLength={72} autoComplete={mode === "login" ? "current-password" : "new-password"} value={f.password} onChange={set('password')} />
      {err && <p className="dn">{err}</p>}<button className="buy">{mode === 'login' ? 'Log in' : 'Start trading'}</button>
      <p className="muted" onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setErr(''); }} style={{ cursor: 'pointer' }}>{mode === 'login' ? 'New here? Create an account' : 'Have an account? Log in'}</p></form></div>;
}

export default function App() {
  const [me, setMe] = useState(null), [sym, setSym] = useState('BTCUSDT'), [ready, setReady] = useState(false);
  useEffect(() => { if (localStorage.token) api('/me').then(setMe).catch(() => delete localStorage.token).finally(() => setReady(true)); else setReady(true); }, []);
  if (!ready) return null;
  if (!me) return <Login onAuth={setMe} />;
  const saveList = async l => setMe(await api('/watchlist', { symbols: l }, 'PUT'));
  return <div className="app">
    <header><div className="logo">NEXT<span>RADE</span></div><Status />
      <div className="user">{me.name}<button onClick={() => { delete localStorage.token; setMe(null); }}>Log out</button></div></header>
    <Tape />
    <main>
      <aside><Watchlist list={me.watchlist} sym={sym} setSym={setSym} onRemove={s => saveList(me.watchlist.filter(x => x !== s))} onAdd={s => !me.watchlist.includes(s) && saveList([...me.watchlist, s])} /></aside>
      <section><Hero sym={sym} /><Chart sym={sym} /><Portfolio me={me} /></section>
      <aside><TradePanel sym={sym} me={me} setMe={setMe} /><OrderBook sym={sym} /><Trades sym={sym} /></aside>
    </main></div>;
}
