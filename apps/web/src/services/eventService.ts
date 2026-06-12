import { api } from "../lib/api";
import type { ApplicationEvent } from "@applyradar/shared";

export async function listEvents(
  applicationId?: string,
  limit = 50,
): Promise<ApplicationEvent[]> {
  const params = new URLSearchParams();
  if (applicationId) params.set("application_id", applicationId);
  params.set("limit", String(limit));
  return api.get<ApplicationEvent[]>(`/api/events?${params.toString()}`);
}

export async function createEvent(
  data: Partial<ApplicationEvent>,
): Promise<ApplicationEvent> {
  return api.post<ApplicationEvent>("/api/events", data);
}
