import { api } from "../lib/api";

export interface AutoCheckStatus {
  enabled: boolean;
  isRunning: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastResult: string | null;
}

export interface AutoCheckResult {
  total: number;
  success: number;
  failed: number;
  statusChanges: number;
  loginIssues: number;
}

export async function getAutoCheckStatus(): Promise<AutoCheckStatus> {
  return api.get<AutoCheckStatus>("/api/auto-check/status");
}

export async function runAutoCheck(): Promise<AutoCheckResult> {
  return api.post<AutoCheckResult>("/api/auto-check/run");
}
