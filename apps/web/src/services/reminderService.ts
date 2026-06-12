import { api } from "../lib/api";
import type { Reminder } from "@applyradar/shared";

export async function listReminders(
  applicationId?: string,
  includeDone = false,
): Promise<Reminder[]> {
  const params = new URLSearchParams();
  if (applicationId) params.set("application_id", applicationId);
  if (includeDone) params.set("include_done", "true");
  const qs = params.toString();
  return api.get<Reminder[]>(`/api/reminders${qs ? `?${qs}` : ""}`);
}

export async function createReminder(
  data: Partial<Reminder>,
): Promise<Reminder> {
  return api.post<Reminder>("/api/reminders", data);
}

export async function updateReminder(
  id: string,
  data: Partial<Reminder>,
): Promise<Reminder> {
  return api.put<Reminder>(`/api/reminders/${id}`, data);
}

export async function markReminderDone(id: string): Promise<void> {
  await api.patch(`/api/reminders/${id}/done`);
}

export async function deleteReminder(id: string): Promise<void> {
  await api.delete(`/api/reminders/${id}`);
}
