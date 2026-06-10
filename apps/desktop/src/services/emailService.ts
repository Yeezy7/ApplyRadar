import { invoke } from "@tauri-apps/api/core";

export async function testEmailConfig(): Promise<string> {
  return invoke("test_email_config");
}

export async function sendDailyReport(): Promise<string> {
  return invoke("send_daily_report");
}

export async function sendDailyReportWithCheck(): Promise<string> {
  return invoke("send_daily_report_with_check");
}
