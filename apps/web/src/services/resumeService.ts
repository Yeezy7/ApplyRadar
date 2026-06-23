import { api } from "../lib/api";
import type { Resume, FormTemplate } from "@applyradar/shared";

export async function listResumes(): Promise<Resume[]> {
  return api.get<Resume[]>("/api/resumes");
}

export async function getResume(id: string): Promise<Resume> {
  return api.get<Resume>(`/api/resumes/${id}`);
}

export async function createResume(data: Partial<Resume>): Promise<Resume> {
  return api.post<Resume>("/api/resumes", data);
}

export async function updateResume(
  id: string,
  data: Partial<Resume>,
): Promise<Resume> {
  return api.put<Resume>(`/api/resumes/${id}`, data);
}

export async function deleteResume(id: string): Promise<void> {
  await api.delete(`/api/resumes/${id}`);
}

export async function setDefaultResume(id: string): Promise<void> {
  await api.post(`/api/resumes/${id}/set-default`);
}

export async function uploadResumePdf(
  id: string,
  file: File,
): Promise<{ id: string; file_name: string; file_path: string }> {
  const formData = new FormData();
  formData.append("file", file);

  const headers: Record<string, string> = {};
  const token = localStorage.getItem("applyradar.web.token");
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const apiBase = localStorage.getItem("applyradar.web.apiBase") || "";
  const response = await fetch(`${apiBase}/api/resumes/${id}/upload-pdf`, {
    method: "POST",
    headers,
    body: formData,
  });

  if (!response.ok) {
    const result = await response.json();
    throw new Error(result.msg || "上传失败");
  }

  const result = await response.json();
  return result.data;
}

export async function parseResumePdf(id: string): Promise<Resume> {
  return api.post<Resume>(`/api/resumes/${id}/parse`);
}

export async function getDefaultResume(): Promise<Resume> {
  return api.get<Resume>("/api/resumes/extension/default");
}

export async function listFormTemplates(
  domain?: string,
): Promise<FormTemplate[]> {
  const params = domain ? `?domain=${encodeURIComponent(domain)}` : "";
  return api.get<FormTemplate[]>(`/api/form-templates${params}`);
}

export async function getFormTemplateByDomain(
  domain: string,
): Promise<FormTemplate> {
  return api.get<FormTemplate>(
    `/api/form-templates/by-domain/${encodeURIComponent(domain)}`,
  );
}

export async function saveFormTemplate(
  data: Partial<FormTemplate>,
): Promise<FormTemplate> {
  return api.post<FormTemplate>("/api/form-templates", data);
}

export async function deleteFormTemplate(id: string): Promise<void> {
  await api.delete(`/api/form-templates/${id}`);
}
