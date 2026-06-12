const API_BASE_KEY = "applyradar.web.apiBase";
const TOKEN_KEY = "applyradar.web.token";

// 401 回调函数，用于通知上层组件
let onUnauthorized: (() => void) | null = null;

export function setUnauthorizedHandler(handler: () => void) {
  onUnauthorized = handler;
}

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

  // 401 处理：触发回调而非直接刷新页面
  if (response.status === 401) {
    setToken(null);
    if (onUnauthorized) {
      onUnauthorized();
    }
    throw new Error("认证已过期，请重新登录");
  }

  // 安全解析响应：先检查 content-type
  const contentType = response.headers.get("content-type");
  if (!contentType || !contentType.includes("application/json")) {
    // 非 JSON 响应（如 502 网关错误的 HTML 页面）
    if (!response.ok) {
      throw new Error(`服务器错误 (${response.status})`);
    }
    throw new Error("响应格式错误");
  }

  const result: ApiResponse<T> = await response.json();

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
