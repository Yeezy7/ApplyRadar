import { api } from "../lib/api";

export interface UserSettings {
  id: string;
  user_id: string;
  api_key: string;
  api_base_url: string;
  model: string;
  check_frequency: string;
  notifications_enabled: number;
  auto_check_enabled: number;
  email_report_enabled: number;
  smtp_host: string;
  smtp_port: string;
  smtp_username: string;
  smtp_password: string;
  smtp_recipient: string;
  email_report_time: string;
  created_at: string;
  updated_at: string;
}

export async function getSettings(): Promise<UserSettings> {
  return api.get<UserSettings>("/api/settings");
}

export async function saveSettings(
  data: Partial<UserSettings>,
): Promise<UserSettings> {
  return api.put<UserSettings>("/api/settings", data);
}
