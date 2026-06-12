// API 基础地址 - 备案通过后改为 https://www.yezzy7.xyz
const BASE_URL = 'https://www.yezzy7.xyz';

// 是否使用云开发（本地调试时设为 true）
const USE_CLOUD = false;

// Token 管理
let cachedToken: string | null = null;

export function getToken(): string | null {
  if (cachedToken) return cachedToken;
  try {
    cachedToken = wx.getStorageSync('token');
  } catch {}
  return cachedToken;
}

export function setToken(token: string) {
  cachedToken = token;
  try {
    wx.setStorageSync('token', token);
  } catch {}
}

export function clearToken() {
  cachedToken = null;
  try {
    wx.removeStorageSync('token');
  } catch {}
}

export function isLoggedIn(): boolean {
  return !!getToken();
}

/**
 * 微信登录 - 获取 code 并发送到服务端换取 token
 */
export async function wechatLogin(): Promise<{ token: string; user: any }> {
  return new Promise((resolve, reject) => {
    wx.login({
      success: async (loginRes) => {
        if (!loginRes.code) {
          reject(new Error('获取登录凭证失败'));
          return;
        }
        try {
          const res = await request('/api/auth/wechat-code', 'POST', {
            code: loginRes.code,
          });
          setToken(res.token);
          resolve(res);
        } catch (e) {
          reject(e);
        }
      },
      fail: () => reject(new Error('微信登录失败')),
    });
  });
}

/**
 * HTTP 请求封装
 */
async function request<T = any>(
  path: string,
  method: string = 'GET',
  data?: Record<string, any>
): Promise<T> {
  const token = getToken();
  const header: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    header['Authorization'] = `Bearer ${token}`;
  }

  return new Promise((resolve, reject) => {
    wx.request({
      url: `${BASE_URL}${path}`,
      method: method as any,
      header,
      data,
      success: (res) => {
        const result = res.data as any;
        if (result.code === 0) {
          const normalized = normalizeResponse(result.data);
          resolve(normalized);
        } else if (result.code === 401) {
          clearToken();
          reject(new Error('请重新登录'));
        } else {
          reject(new Error(result.msg || '请求失败'));
        }
      },
      fail: (err) => {
        reject(new Error(err.errMsg || '网络请求失败'));
      },
    });
  });
}

/**
 * Normalize response data - ensure _id exists for compatibility
 */
function normalizeResponse(data: any): any {
  if (!data) return data;
  if (Array.isArray(data)) {
    return data.map((item) => normalizeItem(item));
  }
  return normalizeItem(data);
}

function normalizeItem(item: any): any {
  if (!item || typeof item !== 'object') return item;
  if (item.id && !item._id) {
    return { ...item, _id: item.id };
  }
  return item;
}

/**
 * 调用云函数（兼容旧接口，内部改为 REST API）
 */
export async function callCloud<T = any>(
  name: string,
  action: string,
  data?: Record<string, any>
): Promise<T> {
  // 确保已登录
  if (!getToken()) {
    await wechatLogin();
  }

  const methodMap: Record<string, string> = {
    create: 'POST',
    list: 'GET',
    get: 'GET',
    update: 'PUT',
    delete: 'DELETE',
    markDone: 'PATCH',
    getSettings: 'GET',
    saveSettings: 'PUT',
    getStats: 'GET',
    listByApplication: 'GET',
    listAll: 'GET',
  };

  const method = methodMap[action] || 'POST';
  let path = `/api/${name}`;

  if (action === 'get' && data?.id) {
    path = `/api/${name}/${data.id}`;
  } else if (action === 'update' && data?.id) {
    path = `/api/${name}/${data.id}`;
  } else if (action === 'delete' && data?.id) {
    path = `/api/${name}/${data.id}`;
  } else if (action === 'markDone' && data?.id) {
    path = `/api/${name}/${data.id}/done`;
  } else if (action === 'listByApplication' && data?.applicationId) {
    path = `/api/${name}?application_id=${data.applicationId}`;
  } else if (action === 'list' && data) {
    const params = new URLSearchParams();
    if (data.search) params.set('search', data.search);
    if (data.status) params.set('status', data.status);
    if (data.includeDone) params.set('include_done', 'true');
    if (data.application_id) params.set('application_id', data.application_id);
    if (data.applicationId) params.set('application_id', data.applicationId);
    const qs = params.toString();
    if (qs) path = `/api/${name}?${qs}`;
  } else if (action === 'listAll' && data?.limit) {
    path = `/api/${name}?limit=${data.limit}`;
  }

  if (method === 'GET') {
    return request<T>(path, method);
  }

  return request<T>(path, method, data);
}

/**
 * Show a loading indicator while executing an async operation.
 */
export async function withLoading<T>(
  fn: () => Promise<T>,
  title = '加载中...'
): Promise<T> {
  wx.showLoading({ title, mask: true });
  try {
    return await fn();
  } finally {
    wx.hideLoading();
  }
}

/**
 * Show a success toast message.
 */
export function showSuccess(msg: string) {
  wx.showToast({ title: msg, icon: 'success' });
}

/**
 * Show an error toast message.
 */
export function showError(msg: string) {
  wx.showToast({ title: msg, icon: 'none', duration: 3000 });
}
