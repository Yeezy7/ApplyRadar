import { api } from "../lib/api";

export async function testEmail(): Promise<string> {
  return api.post<string>("/api/email/test");
}

export async function sendDailyReport(): Promise<string> {
  return api.post<string>("/api/email/daily-report");
}
