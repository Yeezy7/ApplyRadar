import { invoke } from "@tauri-apps/api/core";

export interface SidecarCheckResponse {
  success: boolean;
  targetId?: string;
  loginState?: string;
  pageText?: string;
  textHash?: string;
  pageTitle?: string;
  error?: string;
}

export interface BatchTarget {
  targetId: string;
  statusUrl: string;
}

export interface BatchCheckResponse {
  results: SidecarCheckResponse[];
}

export async function runCheck(
  targetId: string,
  statusUrl: string,
  profileDir: string
): Promise<SidecarCheckResponse> {
  return invoke("run_sidecar_check", { targetId, statusUrl, profileDir });
}

export async function runBatchCheck(
  domain: string,
  profileDir: string,
  targets: BatchTarget[]
): Promise<BatchCheckResponse> {
  return invoke("run_sidecar_batch_check", { domain, profileDir, targets });
}

export async function openForLogin(
  statusUrl: string,
  profileDir: string
): Promise<SidecarCheckResponse> {
  return invoke("run_sidecar_open_login", { statusUrl, profileDir });
}

export async function getAppDataDir(): Promise<string> {
  return invoke("get_app_data_dir");
}
