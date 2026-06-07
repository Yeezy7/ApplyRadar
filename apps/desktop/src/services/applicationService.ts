import { invoke } from "@tauri-apps/api/core";
import type { Application } from "@applyradar/shared";

export interface CreateApplicationInput {
  company_name: string;
  job_title: string;
  location?: string;
  salary_range?: string;
  job_url?: string;
  status_url?: string;
  source?: string;
  status?: string;
  priority?: string;
  applied_at?: string;
  deadline_at?: string;
  notes?: string;
}

export interface UpdateApplicationInput {
  company_name?: string;
  job_title?: string;
  location?: string;
  salary_range?: string;
  job_url?: string;
  status_url?: string;
  source?: string;
  status?: string;
  priority?: string;
  applied_at?: string;
  deadline_at?: string;
  notes?: string;
}

export async function createApplication(input: CreateApplicationInput): Promise<Application> {
  return invoke("create_application", { input });
}

export async function listApplications(
  search?: string,
  status?: string,
  source?: string
): Promise<Application[]> {
  return invoke("list_applications", { search, status, source });
}

export async function getApplication(id: string): Promise<Application> {
  return invoke("get_application", { id });
}

export async function updateApplication(
  id: string,
  input: UpdateApplicationInput
): Promise<Application> {
  return invoke("update_application", { id, input });
}

export async function deleteApplication(id: string): Promise<void> {
  return invoke("delete_application", { id });
}
