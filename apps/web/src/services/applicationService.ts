import { api } from "../lib/api";
import type { Application } from "@applyradar/shared";

export async function listApplications(
  search?: string,
  status?: string,
): Promise<Application[]> {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (status) params.set("status", status);
  const qs = params.toString();
  return api.get<Application[]>(`/api/applications${qs ? `?${qs}` : ""}`);
}

export async function getApplication(id: string): Promise<Application> {
  return api.get<Application>(`/api/applications/${id}`);
}

export async function createApplication(
  data: Partial<Application>,
): Promise<Application> {
  return api.post<Application>("/api/applications", data);
}

export async function updateApplication(
  id: string,
  data: Partial<Application>,
): Promise<Application> {
  return api.put<Application>(`/api/applications/${id}`, data);
}

export async function deleteApplication(id: string): Promise<void> {
  await api.delete(`/api/applications/${id}`);
}
