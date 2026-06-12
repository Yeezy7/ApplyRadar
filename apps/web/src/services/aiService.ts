import { api } from "../lib/api";

export interface TestConnectionResult {
  success: boolean;
  message: string;
  model: string;
  reply: string;
}

export interface ParsedJD {
  company_name?: string;
  job_title?: string;
  location?: string;
  salary_range?: string;
  requirements?: string;
}

export async function testConnection(): Promise<TestConnectionResult> {
  return api.post<TestConnectionResult>("/api/ai/test-connection");
}

export async function parseJobDescription(text: string): Promise<ParsedJD> {
  return api.post<ParsedJD>("/api/ai/parse-jd", { text });
}
