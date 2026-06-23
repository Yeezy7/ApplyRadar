import { invoke } from "@tauri-apps/api/core";
import type { Resume } from "@applyradar/shared";

export interface CreateResumeInput {
  name: string;
  is_default?: number;
  full_name?: string;
  phone?: string;
  email?: string;
  gender?: string;
  birth_date?: string;
  hometown?: string;
  political_status?: string;
  target_position?: string;
  target_city?: string;
  expected_salary?: string;
  job_type?: string;
  education?: any[];
  work_experience?: any[];
  projects?: any[];
  skills?: string[];
  certifications?: any[];
  summary?: string;
}

export interface UpdateResumeInput {
  name?: string;
  is_default?: number;
  full_name?: string | null;
  phone?: string | null;
  email?: string | null;
  gender?: string | null;
  birth_date?: string | null;
  hometown?: string | null;
  political_status?: string | null;
  target_position?: string | null;
  target_city?: string | null;
  expected_salary?: string | null;
  job_type?: string | null;
  education?: any[] | null;
  work_experience?: any[] | null;
  projects?: any[] | null;
  skills?: string[] | null;
  certifications?: any[] | null;
  summary?: string | null;
}

export async function listResumes(): Promise<Resume[]> {
  return invoke("list_resumes");
}

export async function getResume(id: string): Promise<Resume> {
  return invoke("get_resume", { id });
}

export async function createResume(input: CreateResumeInput): Promise<Resume> {
  return invoke("create_resume", { input });
}

export async function updateResume(id: string, input: UpdateResumeInput): Promise<Resume> {
  return invoke("update_resume", { id, input });
}

export async function deleteResume(id: string): Promise<void> {
  return invoke("delete_resume", { id });
}

export async function setDefaultResume(id: string): Promise<void> {
  return invoke("set_default_resume", { id });
}

export async function uploadResumePdf(id: string): Promise<string> {
  return invoke("upload_resume_pdf", { id });
}

export async function parseResumePdf(id: string): Promise<Resume> {
  return invoke("parse_resume_pdf", { id });
}

export async function getDefaultResume(): Promise<Resume> {
  return invoke("get_default_resume");
}
