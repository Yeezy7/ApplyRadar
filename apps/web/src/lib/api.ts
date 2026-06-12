const API_BASE_KEY = "applyradar.web.apiBase";
const TOKEN_KEY = "applyradar.web.token";

export function getApiBase(): string {
  return localStorage.getItem(API_BASE_KEY) || "";
}

export function setApiBase(url: string) {
  localStorage.setItem(API_BASE_KEY, url);
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

interface ApiResponse<T = unknown> {
  code: number;
  data?: T;
  msg?: string;
}

export async function apiRequest<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  const token = getToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${getApiBase()}${path}`, {
    ...options,
    headers,
  });

  const result: ApiResponse<T> = await response.json();

  if (response.status === 401) {
    setToken(null);
    window.location.reload();
    throw new Error("认证已过期，请重新登录");
  }

  if (!response.ok || result.code !== 0) {
    throw new Error(result.msg || "请求失败");
  }

  return result.data as T;
}

export const api = {
  get: <T = unknown>(path: string) => apiRequest<T>(path),

  post: <T = unknown>(path: string, body?: unknown) =>
    apiRequest<T>(path, {
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
    }),

  put: <T = unknown>(path: string, body?: unknown) =>
    apiRequest<T>(path, {
      method: "PUT",
      body: body ? JSON.stringify(body) : undefined,
    }),

  patch: <T = unknown>(path: string, body?: unknown) =>
    apiRequest<T>(path, {
      method: "PATCH",
      body: body ? JSON.stringify(body) : undefined,
    }),

  delete: <T = unknown>(path: string) =>
    apiRequest<T>(path, { method: "DELETE" }),
};
