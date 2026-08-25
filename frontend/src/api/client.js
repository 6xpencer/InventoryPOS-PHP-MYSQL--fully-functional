const isDev = import.meta.env.DEV;
export const API_BASE = isDev ? '/api' : '../backend/api.php';

let authToken = localStorage.getItem('pos_token') || null;

export function getToken() {
  return authToken;
}

export function setToken(token) {
  authToken = token;
  if (token) {
    localStorage.setItem('pos_token', token);
  } else {
    localStorage.removeItem('pos_token');
  }
}

function buildUrl(route, params) {
  let url = `${API_BASE}?route=${route}`;
  if (params) {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') qs.set(k, v);
    });
    const s = qs.toString();
    if (s) url += `&${s}`;
  }
  return url;
}

export class ApiError extends Error {
  constructor(message, status, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

let unauthorizedHandler = null;
export function onUnauthorized(fn) {
  unauthorizedHandler = fn;
}

export async function api(route, { method = 'GET', body, params } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (authToken) {
    // Authorization for standard setups; X-Auth-Token as fallback
    // for Apache configurations that strip the Authorization header.
    headers['Authorization'] = `Bearer ${authToken}`;
    headers['X-Auth-Token'] = authToken;
  }

  let res;
  try {
    res = await fetch(buildUrl(route, params), {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('Cannot reach the server. Check that Apache and MySQL are running.', 0);
  }

  let data = null;
  try {
    data = await res.json();
  } catch {
    throw new ApiError('Invalid server response.', res.status);
  }

  if (!res.ok) {
    if (res.status === 401 && authToken && !route.startsWith('auth/')) {
      setToken(null);
      if (unauthorizedHandler) unauthorizedHandler();
    }
    throw new ApiError(data.error || `Request failed (${res.status})`, res.status, data.details);
  }
  return data;
}

export async function download(route, params, filename) {
  const url = buildUrl(route, params);
  const headers = {};
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
    headers['X-Auth-Token'] = authToken;
  }
  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new ApiError('Download failed.', res.status);
  }
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}

export async function uploadFile(route, file) {
  const url = buildUrl(route);
  const headers = {};
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
    headers['X-Auth-Token'] = authToken;
  }
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch(url, { method: 'POST', headers, body: fd });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(data.error || 'Upload failed.', res.status, data.details);
  }
  return data;
}
