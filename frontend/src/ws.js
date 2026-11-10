import { useEffect, useRef, useState } from 'react';
const HOSTS = ['wss://data-stream.binance.vision/stream', 'wss://stream.binance.com:443/stream', 'wss://stream.binance.com:9443/stream'];
const subs = new Map(), listeners = new Set(); let ws, retry = 0, h = 0, status = 'connecting', msgs = 0;
const setStatus = s => { status = s; listeners.forEach(f => f(s)); };
function connect() {
  let opened = false;
  ws = new WebSocket(HOSTS[h % HOSTS.length]);
  const timer = setTimeout(() => ws.close(), 6000); // give up on a hanging host
  ws.onopen = () => { opened = true; clearTimeout(timer); retry = 0; setStatus('live'); if (subs.size) ws.send(JSON.stringify({ method: 'SUBSCRIBE', params: [...subs.keys()], id: 1 })); };
  ws.onmessage = e => { const m = JSON.parse(e.data); msgs++; subs.get(m.stream)?.cbs.forEach(cb => cb(m.data)); };
  ws.onclose = () => { clearTimeout(timer); if (!opened) h++; setStatus('reconnecting'); setTimeout(connect, Math.min(1000 * 2 ** retry++, 15000)); };
}
connect();
export function subscribe(stream, cb) {
  let s = subs.get(stream);
  if (!s) { s = { cbs: new Set() }; subs.set(stream, s); if (ws.readyState === 1) ws.send(JSON.stringify({ method: 'SUBSCRIBE', params: [stream], id: 2 })); }
  s.cbs.add(cb);
  return () => { s.cbs.delete(cb); if (!s.cbs.size) { subs.delete(stream); if (ws.readyState === 1) ws.send(JSON.stringify({ method: 'UNSUBSCRIBE', params: [stream], id: 3 })); } };
}
export function useStatus() {
  const [s, set] = useState(status);
  useEffect(() => { listeners.add(set); return () => listeners.delete(set); }, []);
  return s;
}
export function useStream(stream, on) {
  const [d, set] = useState(null), buf = useRef(null), raf = useRef(0);
  useEffect(() => subscribe(stream, m => {
    on?.(m); buf.current = m;
    if (!raf.current) raf.current = requestAnimationFrame(() => { raf.current = 0; set(buf.current); });
  }), [stream]);
  return d;
}
export const messageCount = () => msgs;