import { invoke } from "@tauri-apps/api/core";
import type { Reminder } from "@applyradar/shared";

export interface CreateReminderInput {
  application_id?: string;
  title: string;
  content?: string;
  reminder_type?: string;
  remind_at: string;
  notified_at?: string;
}

export interface UpdateReminderInput {
  application_id?: string | null;
  title?: string;
  content?: string | null;
  reminder_type?: string | null;
  remind_at?: string;
}

export async function createReminder(input: CreateReminderInput): Promise<Reminder> {
  return invoke("create_reminder", { input });
}

export async function updateReminder(id: string, input: UpdateReminderInput): Promise<Reminder> {
  return invoke("update_reminder", { id, input });
}

export async function listReminders(
  applicationId?: string,
  includeDone?: boolean
): Promise<Reminder[]> {
  return invoke("list_reminders", { applicationId, includeDone });
}

export async function markReminderDone(id: string): Promise<void> {
  return invoke("mark_reminder_done", { id });
}

export async function deleteReminder(id: string): Promise<void> {
  return invoke("delete_reminder", { id });
}
