import { api } from "../lib/api";

export interface SchedulerStatus {
  autoCheck: {
    isRunning: boolean;
    lastRunAt: string | null;
    lastResult: string | null;
  };
  emailReport: {
    isRunning: boolean;
    lastRunAt: string | null;
    lastResult: string | null;
  };
  reminderCheck: {
    isRunning: boolean;
    lastRunAt: string | null;
    lastResult: string | null;
  };
}

export interface AutoCheckResult {
  total: number;
  success: number;
  failed: number;
}

export async function getSchedulerStatus(): Promise<SchedulerStatus> {
  return api.get<SchedulerStatus>("/api/scheduler/status");
}

export async function triggerAutoCheck(): Promise<AutoCheckResult> {
  return api.post<AutoCheckResult>("/api/scheduler/auto-check");
}

export async function triggerEmailReport(): Promise<{ success: boolean; message: string }> {
  return api.post("/api/scheduler/email-report");
}
