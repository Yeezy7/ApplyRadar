import { invoke } from "@tauri-apps/api/core";

export interface PushLog {
  id: string;
  pushType: string;
  title: string;
  detail: string | null;
  channel: string;
  status: string;
  errorMessage: string | null;
  createdAt: string;
}

export async function listPushLogs(limit?: number): Promise<PushLog[]> {
  return invoke("list_push_logs", { limit });
}

export async function clearPushLogs(): Promise<void> {
  return invoke("clear_push_logs");
}
