import { invoke } from "@tauri-apps/api/core";
import type { AIParseInput, AIParseOutput } from "@applyradar/shared";

export async function parseStatus(input: AIParseInput): Promise<AIParseOutput | null> {
  return invoke("parse_status", { input });
}

export async function testConnection(): Promise<string> {
  return invoke("test_ai_connection");
}

export interface JobInfo {
  company_name?: string;
  job_title?: string;
  location?: string;
  salary_range?: string;
}

export async function extractJobInfo(url: string): Promise<JobInfo> {
  return invoke("extract_job_info", { url });
}
