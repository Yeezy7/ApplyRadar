import { api } from "../lib/api";
import type { TrackingTarget, TrackingRun } from "@applyradar/shared";

export async function listTrackingTargets(
  applicationId?: string,
): Promise<TrackingTarget[]> {
  const params = new URLSearchParams();
  if (applicationId) params.set("application_id", applicationId);
  const qs = params.toString();
  return api.get<TrackingTarget[]>(`/api/tracking${qs ? `?${qs}` : ""}`);
}

export async function getTrackingTarget(id: string): Promise<TrackingTarget> {
  return api.get<TrackingTarget>(`/api/tracking/${id}`);
}

export async function createTrackingTarget(
  data: Partial<TrackingTarget>,
): Promise<TrackingTarget> {
  return api.post<TrackingTarget>("/api/tracking", data);
}

export async function updateTrackingTarget(
  id: string,
  data: Partial<TrackingTarget>,
): Promise<TrackingTarget> {
  return api.put<TrackingTarget>(`/api/tracking/${id}`, data);
}

export async function deleteTrackingTarget(id: string): Promise<void> {
  await api.delete(`/api/tracking/${id}`);
}

export async function listTrackingRuns(
  targetId: string,
  limit = 50,
): Promise<TrackingRun[]> {
  return api.get<TrackingRun[]>(
    `/api/tracking/${targetId}/runs?limit=${limit}`,
  );
}

export async function createTrackingRun(
  targetId: string,
): Promise<TrackingRun> {
  return api.post<TrackingRun>(`/api/tracking/${targetId}/runs`);
}
