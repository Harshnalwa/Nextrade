const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

export const api = async (path, body, method) => {
  const options = {
    method: method || (body !== undefined ? 'POST' : 'GET'),
    headers: { Authorization: 'Bearer ' + (localStorage.token || '') }
  };
  if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }
  let response;
  try { response = await fetch(`${API_BASE}/api${path}`, options); }
  catch { throw new Error('Cannot reach the API. Check your internet connection or backend URL.'); }
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; }
  catch { throw new Error('The API returned an invalid response. Please try again.'); }
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
};
