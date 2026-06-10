import type { Application, ApplicationStatus } from "@applyradar/shared";

export const FINAL_RESULT_STATUSES: ApplicationStatus[] = [
  "offer",
  "rejected",
  "withdrawn",
];

export function hasFinalResult(status: string | null | undefined): boolean {
  return FINAL_RESULT_STATUSES.includes(status as ApplicationStatus);
}

export function getActiveWaitingDays(app: Application): number | null {
  if (!app.applied_at || hasFinalResult(app.status)) return null;

  const appliedAt = new Date(app.applied_at).getTime();
  if (!Number.isFinite(appliedAt)) return null;

  const days = Math.floor((Date.now() - appliedAt) / (1000 * 60 * 60 * 24));
  return Math.max(0, days);
}
