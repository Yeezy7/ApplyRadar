import { invoke } from "@tauri-apps/api/core";

export interface SyncConfig {
  enabled: boolean;
  apiBase: string;
  token: string;
  conflictStrategy: "local" | "remote" | "merge";
  lastSyncAt: string | null;
}

export interface SyncResult {
  applications: { created: number; updated: number; skipped?: number };
  events: { created: number; skipped: number };
  reminders: { created: number; updated: number; skipped?: number };
}

const SYNC_CONFIG_KEY = "applyradar.sync.config";

// 获取同步配置
export function getSyncConfig(): SyncConfig {
  const saved = localStorage.getItem(SYNC_CONFIG_KEY);
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch {}
  }
  return {
    enabled: false,
    apiBase: "http://127.0.0.1:3000",
    token: "",
    conflictStrategy: "merge",
    lastSyncAt: null,
  };
}

// 保存同步配置
export function saveSyncConfig(config: SyncConfig): void {
  localStorage.setItem(SYNC_CONFIG_KEY, JSON.stringify(config));
}

// 获取本地数据
async function getLocalData() {
  const applications = await invoke<any[]>("list_applications");
  const reminders = await invoke<any[]>("list_reminders", {
    includeDone: true,
  });
  return { applications, reminders };
}

// API 请求
async function apiRequest(
  path: string,
  token: string,
  apiBase: string,
  options: RequestInit = {}
) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ msg: "请求失败" }));
    throw new Error(error.msg || `HTTP ${response.status}`);
  }

  const result = await response.json();
  if (result.code !== 0) {
    throw new Error(result.msg || "请求失败");
  }

  return result.data;
}

// 上传本地数据到云端
export async function pushToCloud(): Promise<SyncResult> {
  const config = getSyncConfig();
  if (!config.enabled || !config.token) {
    throw new Error("同步未启用或未配置 token");
  }

  const localData = await getLocalData();

  const result = await apiRequest(
    "/api/sync/push",
    config.token,
    config.apiBase,
    {
      method: "POST",
      body: JSON.stringify({
        applications: localData.applications,
        reminders: localData.reminders,
      }),
    }
  );

  // 更新最后同步时间
  config.lastSyncAt = new Date().toISOString();
  saveSyncConfig(config);

  return result;
}

// 从云端下载数据
export async function pullFromCloud(): Promise<{
  applications: any[];
  events: any[];
  reminders: any[];
}> {
  const config = getSyncConfig();
  if (!config.enabled || !config.token) {
    throw new Error("同步未启用或未配置 token");
  }

  const data = await apiRequest(
    "/api/sync/pull",
    config.token,
    config.apiBase,
    { method: "POST" }
  );

  // 更新最后同步时间
  config.lastSyncAt = new Date().toISOString();
  saveSyncConfig(config);

  return data;
}

// 智能合并
export async function mergeData(): Promise<SyncResult> {
  const config = getSyncConfig();
  if (!config.enabled || !config.token) {
    throw new Error("同步未启用或未配置 token");
  }

  const localData = await getLocalData();

  const result = await apiRequest(
    "/api/sync/merge",
    config.token,
    config.apiBase,
    {
      method: "POST",
      body: JSON.stringify({
        applications: localData.applications,
        reminders: localData.reminders,
      }),
    }
  );

  // 更新最后同步时间
  config.lastSyncAt = new Date().toISOString();
  saveSyncConfig(config);

  return result;
}

// 执行同步（根据冲突策略）
export async function executeSync(): Promise<{
  strategy: string;
  result: SyncResult | any;
}> {
  const config = getSyncConfig();

  switch (config.conflictStrategy) {
    case "local":
      return { strategy: "local", result: await pushToCloud() };
    case "remote":
      return { strategy: "remote", result: await pullFromCloud() };
    case "merge":
    default:
      return { strategy: "merge", result: await mergeData() };
  }
}
