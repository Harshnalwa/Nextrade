import { useEffect, useRef, useState } from 'react';

const HOSTS = ['wss://data-stream.binance.vision/stream', 'wss://stream.binance.com:443/stream', 'wss://stream.binance.com:9443/stream'];
const subscriptions = new Map();
const statusListeners = new Set();
let socket = null, retryTimer = null, connectTimer = null, retryCount = 0, hostIndex = 0, status = 'connecting', messages = 0, nextId = 1;
const setStatus = value => { status = value; statusListeners.forEach(listener => listener(value)); };
function sendSubscription(method, streams) {
  if (socket?.readyState === WebSocket.OPEN && streams.length) socket.send(JSON.stringify({ method, params: streams, id: nextId++ }));
}
function scheduleReconnect() {
  if (retryTimer) return;
  const delay = Math.min(1000 * (2 ** retryCount), 15000);
  retryCount++;
  retryTimer = setTimeout(() => { retryTimer = null; connect(); }, delay);
}
function connect() {
  if (socket && [WebSocket.OPEN, WebSocket.CONNECTING].includes(socket.readyState)) return;
  setStatus('connecting');
  let opened = false;
  try { socket = new WebSocket(HOSTS[hostIndex % HOSTS.length]); }
  catch { hostIndex++; scheduleReconnect(); return; }
  const current = socket;
  connectTimer = setTimeout(() => { if (!opened && current.readyState === WebSocket.CONNECTING) current.close(); }, 8000);
  current.onopen = () => { opened = true; clearTimeout(connectTimer); retryCount = 0; setStatus('live'); sendSubscription('SUBSCRIBE', [...subscriptions.keys()]); };
  current.onmessage = event => {
    try {
      const message = JSON.parse(event.data);
      if (message.stream && message.data) {
        messages++;
        subscriptions.get(message.stream)?.callbacks.forEach(callback => { try { callback(message.data); } catch (error) { console.error('Stream callback failed:', error); } });
      }
    } catch (error) { console.warn('Ignored malformed market stream message:', error); }
  };
  current.onerror = () => current.close();
  current.onclose = () => {
    clearTimeout(connectTimer);
    if (socket === current) socket = null;
    if (!opened) hostIndex++;
    setStatus('reconnecting');
    scheduleReconnect();
  };
}
connect();
export function subscribe(stream, callback) {
  let entry = subscriptions.get(stream);
  if (!entry) { entry = { callbacks: new Set() }; subscriptions.set(stream, entry); sendSubscription('SUBSCRIBE', [stream]); }
  entry.callbacks.add(callback);
  return () => {
    entry.callbacks.delete(callback);
    if (!entry.callbacks.size) { subscriptions.delete(stream); sendSubscription('UNSUBSCRIBE', [stream]); }
  };
}
export function useStatus() {
  const [value, setValue] = useState(status);
  useEffect(() => { statusListeners.add(setValue); setValue(status); return () => statusListeners.delete(setValue); }, []);
  return value;
}
export function useStream(stream, onMessage) {
  const [data, setData] = useState(null);
  const latest = useRef(null), animationFrame = useRef(0), callbackRef = useRef(onMessage);
  useEffect(() => { callbackRef.current = onMessage; }, [onMessage]);
  useEffect(() => {
    const unsubscribe = subscribe(stream, message => {
      callbackRef.current?.(message);
      latest.current = message;
      if (!animationFrame.current) animationFrame.current = requestAnimationFrame(() => { animationFrame.current = 0; setData(latest.current); });
    });
    return () => { unsubscribe(); if (animationFrame.current) cancelAnimationFrame(animationFrame.current); };
  }, [stream]);
  return data;
}
export const messageCount = () => messages;
