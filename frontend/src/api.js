export const api = async (path, body, method) => {
  const r = await fetch('/api' + path, { method: method || (body ? 'POST' : 'GET'),
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (localStorage.token || '') },
    body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  if (!text) throw new Error('Cannot reach the API. Is the backend running on port 4000?');
  const j = JSON.parse(text);
  if (!r.ok) throw new Error(j.error || 'Something went wrong');
  return j;
};