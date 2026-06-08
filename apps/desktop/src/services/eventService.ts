import { invoke } from "@tauri-apps/api/core";
import type { ApplicationEvent } from "@applyradar/shared";

export interface CreateEventInput {
  application_id: string;
  event_type: string;
  title: string;
  content?: string;
  old_status?: string;
  new_status?: string;
  handled_at?: string;
  handled_action?: "accepted" | "dismissed";
}

export async function createEvent(input: CreateEventInput): Promise<ApplicationEvent> {
  return invoke("create_event", { input });
}

export async function listEventsByApplication(applicationId: string): Promise<ApplicationEvent[]> {
  return invoke("list_events_by_application", { applicationId });
}

export async function resolveApplicationEvent(
  eventId: string,
  action: "accepted" | "dismissed"
): Promise<ApplicationEvent> {
  return invoke("resolve_application_event", { eventId, input: { action } });
}
