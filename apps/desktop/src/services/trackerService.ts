import { invoke } from "@tauri-apps/api/core";
import type { ManualCheckResult, TrackingTarget, TrackingRun } from "@applyradar/shared";

export interface CreateTrackingTargetInput {
  application_id: string;
  status_url: string;
  ats_type?: string;
  check_frequency?: string;
}

export interface UpdateTrackingTargetInput {
  status_url?: string;
  ats_type?: string;
  enabled?: number;
  check_frequency?: string;
  current_status?: string;
  last_status?: string;
  login_state?: string;
  last_checked_at?: string;
  last_success_at?: string;
  last_error?: string;
  last_text_hash?: string;
  profile_dir?: string;
}

export async function createTrackingTarget(input: CreateTrackingTargetInput): Promise<TrackingTarget> {
  return invoke("create_tracking_target", { input });
}

export async function listTrackingTargets(applicationId?: string): Promise<TrackingTarget[]> {
  return invoke("list_tracking_targets", { applicationId });
}

export async function updateTrackingTarget(
  id: string,
  input: UpdateTrackingTargetInput
): Promise<TrackingTarget> {
  return invoke("update_tracking_target", { id, input });
}

export async function deleteTrackingTarget(id: string): Promise<void> {
  return invoke("delete_tracking_target", { id });
}

// === Tracking Runs ===

export interface CreateTrackingRunInput {
  target_id: string;
  status: string;
  raw_status?: string;
  normalized_status?: string;
  confidence?: number;
  login_state?: string;
  error_message?: string;
  page_hash?: string;
  ai_used?: number;
}

export async function createTrackingRun(input: CreateTrackingRunInput): Promise<TrackingRun> {
  return invoke("create_tracking_run", { input });
}

export async function listTrackingRuns(targetId: string): Promise<TrackingRun[]> {
  return invoke("list_tracking_runs", { targetId });
}

export async function getTargetsNeedingCheck(): Promise<TrackingTarget[]> {
  return invoke("get_targets_needing_check");
}

export interface AutoCheckResult {
  total: number;
  success: number;
  failed: number;
  statusChanges: number;
  loginIssues: number;
}

export async function runAutoCheck(force: boolean = false): Promise<AutoCheckResult> {
  return invoke("run_auto_check", { force });
}

export interface AutoCheckStatus {
  enabled: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastResult: string | null;
  isRunning: boolean;
}

export async function getAutoCheckStatus(): Promise<AutoCheckStatus> {
  return invoke("get_auto_check_status");
}

export async function resetAutoCheck(): Promise<void> {
  return invoke("reset_auto_check");
}

export async function runTrackingTargetCheck(targetId: string): Promise<ManualCheckResult> {
  return invoke("run_tracking_target_check", { targetId });
}

export async function runTrackingTargetsCheck(targetIds?: string[]): Promise<ManualCheckResult> {
  return invoke("run_tracking_targets_check", { targetIds });
}
