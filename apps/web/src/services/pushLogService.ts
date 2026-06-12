import { api } from "../lib/api";

export interface PushLog {
  id: string;
  user_id: string;
  push_type: string;
  title: string;
  body: string;
  status: string;
  application_id?: string;
  created_at: string;
}

export interface PushLogStats {
  total: number;
  byType: { push_type: string; count: number }[];
}

export async function listPushLogs(
  pushType?: string,
  limit = 100,
): Promise<PushLog[]> {
  const params = new URLSearchParams();
  if (pushType) params.set("type", pushType);
  params.set("limit", String(limit));
  return api.get<PushLog[]>(`/api/push-logs?${params.toString()}`);
}

export async function createPushLog(
  data: Partial<PushLog>,
): Promise<PushLog> {
  return api.post<PushLog>("/api/push-logs", data);
}

export async function getPushLogStats(): Promise<PushLogStats> {
  return api.get<PushLogStats>("/api/push-logs/stats");
}
