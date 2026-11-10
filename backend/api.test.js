import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
const port = 4317;
const dir = await mkdtemp(path.join(tmpdir(), 'nextrade-test-'));
let server;
const base = 'http://127.0.0.1:' + port + '/api';
before(async () => {
  server = spawn(process.execPath, ['server.js'], { cwd: process.cwd(), env: { ...process.env, PORT: String(port), NODE_ENV: 'test', JWT_SECRET: 'test-secret-at-least-32-characters-long', DATA_FILE: path.join(dir, 'data.json') }, stdio: 'ignore' });
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    try { const r = await fetch(base + '/health'); if (r.ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error('API server did not start');
});
after(async () => { server?.kill(); await rm(dir, { recursive: true, force: true }); });
test('health endpoint responds', async () => {
  const r = await fetch(base + '/health');
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true });
});
test('register, login, profile and watchlist flow works', async () => {
  const reg = await fetch(base + '/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Test User', email: 'TEST@example.com', password: 'password123' }) });
  assert.equal(reg.status, 201);
  const created = await reg.json();
  assert.ok(created.token);
  assert.equal(created.user.balance, 100000);
  const duplicate = await fetch(base + '/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Test User', email: 'test@example.com', password: 'password123' }) });
  assert.equal(duplicate.status, 409);
  const login = await fetch(base + '/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'test@example.com', password: 'password123' }) });
  assert.equal(login.status, 200);
  const headers = { authorization: 'Bearer ' + created.token, 'content-type': 'application/json' };
  const profile = await fetch(base + '/me', { headers });
  assert.equal(profile.status, 200);
  assert.equal((await profile.json()).email, 'test@example.com');
  const bad = await fetch(base + '/watchlist', { method: 'PUT', headers, body: JSON.stringify({ symbols: ['INVALID'] }) });
  assert.equal(bad.status, 400);
  const good = await fetch(base + '/watchlist', { method: 'PUT', headers, body: JSON.stringify({ symbols: ['BTCUSDT', 'ETHUSDT', 'BTCUSDT'] }) });
  assert.equal(good.status, 200);
  assert.deepEqual((await good.json()).watchlist, ['BTCUSDT', 'ETHUSDT']);
});
