import { getServerUrl, getToken } from './storage.js';

async function request(method, path, body) {
  const serverUrl = await getServerUrl();
  const token = await getToken();

  const headers = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${serverUrl}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json();

  if (data.code !== 0) {
    throw new Error(data.msg || `请求失败: ${res.status}`);
  }

  return data.data;
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body),
  put: (path, body) => request('PUT', path, body),
  delete: (path) => request('DELETE', path),
};

export async function login(email, password) {
  const data = await request('POST', '/api/auth/login', { email, password });
  return data;
}

export async function getTrackingTargets(domain) {
  const params = domain ? `?domain=${encodeURIComponent(domain)}` : '';
  return api.get(`/api/tracking${params}`);
}

export async function getTrackingDomains() {
  return api.get('/api/tracking/domains');
}

export async function getTrackingRuns(targetId, limit = 10) {
  return api.get(`/api/tracking/${targetId}/runs?limit=${limit}`);
}

export async function updateTrackingCookies(targetId, cookies) {
  return api.put(`/api/tracking/${targetId}/cookies`, { cookies });
}

export async function createTrackingTarget(data) {
  return api.post('/api/tracking', data);
}

export async function getStats() {
  return api.get('/api/stats');
}
