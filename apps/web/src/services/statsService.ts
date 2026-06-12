import { api } from "../lib/api";
import type { Application, ApplicationStatus } from "@applyradar/shared";

export interface DashboardStats {
  total: number;
  active: number;
  thisWeek: number;
  offers: number;
  pendingReminders: number;
  statusCounts: Record<ApplicationStatus, number>;
  recentApps: Application[];
}

export async function getStats(): Promise<DashboardStats> {
  return api.get<DashboardStats>("/api/stats");
}
