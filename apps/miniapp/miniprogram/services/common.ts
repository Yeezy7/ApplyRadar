/**
 * Call a cloud function with the given name, action, and data.
 * Returns the result data or throws an error.
 */
export async function callCloud<T = any>(
  name: string,
  action: string,
  data?: Record<string, any>
): Promise<T> {
  const res = await wx.cloud.callFunction({
    name,
    data: { action, data },
  });

  const result = res.result as { code: number; data?: T; msg?: string };
  if (result.code !== 0) {
    throw new Error(result.msg || '操作失败');
  }

  return result.data as T;
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
