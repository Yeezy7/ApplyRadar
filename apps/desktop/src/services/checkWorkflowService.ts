import type { Application, ApplicationStatus, TrackingTarget } from "@applyradar/shared";
import {
  LOGIN_STATE_LABELS,
  STATUS_LABELS,
} from "@applyradar/shared";
import * as applicationService from "./applicationService";
import * as trackerService from "./trackerService";
import * as eventService from "./eventService";
import * as aiService from "./aiService";
import * as notificationService from "./notificationService";
import type { SidecarCheckResponse } from "./sidecarService";
import { isAIConfigured } from "../stores/settings";

const INVALID_LOGIN_STATES = new Set([
  "expired",
  "blocked",
  "captcha_required",
  "mfa_required",
]);

export interface CheckWorkflowResult {
  success: boolean;
  message: string;
  statusChanged: boolean;
  loginIssue: boolean;
}

interface ProcessOptions {
  application?: Application | null;
}

function loginLabel(state?: string) {
  if (!state) return "未知";
  return LOGIN_STATE_LABELS[state as keyof typeof LOGIN_STATE_LABELS] || state;
}

function statusLabel(status: string) {
  return STATUS_LABELS[status as ApplicationStatus] || status;
}

function isInvalidLoginState(state?: string) {
  return !!state && INVALID_LOGIN_STATES.has(state);
}

async function getApplicationForTarget(
  target: TrackingTarget,
  knownApplication?: Application | null
) {
  if (knownApplication) return knownApplication;
  return applicationService.getApplication(target.application_id).catch(() => null);
}

async function createLoginEventIfNeeded(target: TrackingTarget, loginState?: string) {
  if (!isInvalidLoginState(loginState)) return;

  const oldLoginState = target.login_state;
  const wasInvalid = isInvalidLoginState(oldLoginState);
  const changed = loginState !== oldLoginState;
  if (wasInvalid && !changed) return;

  const title = wasInvalid ? `${target.domain} 登录状态变化` : `${target.domain} 登录需要处理`;
  const content = wasInvalid
    ? `${loginLabel(oldLoginState)} -> ${loginLabel(loginState)}`
    : `登录状态: ${loginLabel(loginState)}`;

  await eventService.createEvent({
    application_id: target.application_id,
    event_type: "login_expired",
    title,
    content,
  });

  await notificationService.notifyLoginExpired(target.domain);
}

function buildResultMessage(
  response: SidecarCheckResponse,
  aiStatus: string | undefined,
  aiConfidence: number | undefined,
  oldStatus: string,
  statusChanged: boolean
) {
  const parts: string[] = [];

  if (response.loginState && response.loginState !== "valid") {
    parts.push(`登录: ${loginLabel(response.loginState)}`);
  }
  if (response.pageText) {
    parts.push(`${response.pageText.length}字`);
  }
  if (aiStatus && aiConfidence != null) {
    const confidenceText = `${Math.round(aiConfidence * 100)}%`;
    if (aiConfidence >= 0.85) {
      parts.push(statusChanged ? `${statusLabel(oldStatus)} -> ${statusLabel(aiStatus)} ${confidenceText}` : `${statusLabel(aiStatus)} ${confidenceText}`);
    } else if (aiConfidence >= 0.60) {
      parts.push(`待确认: ${statusLabel(aiStatus)} ${confidenceText}`);
    }
  }

  return parts.join(" · ") || "检查完成";
}

export async function processSidecarCheckResult(
  target: TrackingTarget,
  response: SidecarCheckResponse,
  options: ProcessOptions = {}
): Promise<CheckWorkflowResult> {
  const now = new Date().toISOString();
  const baseUpdate: trackerService.UpdateTrackingTargetInput = {
    last_checked_at: now,
    last_text_hash: response.textHash || "",
  };

  if (response.loginState) {
    baseUpdate.login_state = response.loginState;
  }

  if (!response.success) {
    const message = response.error || "检查失败";
    baseUpdate.last_error = message;

    await trackerService.createTrackingRun({
      target_id: target.id,
      status: "failed",
      login_state: response.loginState,
      error_message: message,
      page_hash: response.textHash,
      ai_used: 0,
    });

    await trackerService.updateTrackingTarget(target.id, baseUpdate);

    await eventService.createEvent({
      application_id: target.application_id,
      event_type: "check_failed",
      title: "状态检查失败",
      content: message,
    });

    const appInfo = await getApplicationForTarget(target, options.application);
    if (appInfo) {
      await notificationService.notifyCheckFailed(appInfo.company_name, appInfo.job_title, message);
    }

    return {
      success: false,
      message,
      statusChanged: false,
      loginIssue: isInvalidLoginState(response.loginState),
    };
  }

  baseUpdate.last_success_at = now;
  baseUpdate.last_error = "";

  const isLoginValid = !response.loginState || response.loginState === "valid";
  await trackerService.createTrackingRun({
    target_id: target.id,
    status: isLoginValid ? "success" : "login_expired",
    login_state: response.loginState,
    page_hash: response.textHash,
    ai_used: 0,
  });

  if (!isLoginValid) {
    const message = `登录: ${loginLabel(response.loginState)}`;
    baseUpdate.last_error = message;
    await createLoginEventIfNeeded(target, response.loginState);
    await trackerService.updateTrackingTarget(target.id, baseUpdate);
    return {
      success: true,
      message,
      statusChanged: false,
      loginIssue: true,
    };
  }

  let aiStatus: string | undefined;
  let aiConfidence: number | undefined;
  let statusChanged = false;

  if (response.pageText && isAIConfigured()) {
    try {
      const appInfo = await getApplicationForTarget(target, options.application);
      const aiResult = await aiService.parseStatus({
        url: target.status_url,
        page_title: response.pageTitle || "",
        visible_text: response.pageText,
        previous_status: target.current_status !== "unknown" ? target.current_status : undefined,
        known_company: appInfo?.company_name,
        known_job_title: appInfo?.job_title,
      });
      if (!aiResult) {
        throw new Error("AI 未返回解析结果");
      }

      aiStatus = aiResult.normalized_status;
      aiConfidence = Math.max(0, Math.min(1, aiResult.confidence ?? 0));

      await trackerService.createTrackingRun({
        target_id: target.id,
        status: "success",
        raw_status: aiResult.raw_status || undefined,
        normalized_status: aiStatus,
        confidence: aiConfidence,
        login_state: response.loginState,
        page_hash: response.textHash,
        ai_used: 1,
      });

      if (aiStatus && aiConfidence >= 0.85) {
        const oldStatus = target.current_status;
        const newStatus = aiStatus as ApplicationStatus;
        statusChanged = oldStatus !== "unknown" && oldStatus !== newStatus;

        baseUpdate.current_status = newStatus;
        if (oldStatus !== "unknown") {
          baseUpdate.last_status = oldStatus;
        }

        await applicationService.updateApplication(target.application_id, { status: newStatus });

        if (statusChanged) {
          await eventService.createEvent({
            application_id: target.application_id,
            event_type: "status_change",
            title: "状态变更",
            content: aiResult.reason || undefined,
            old_status: oldStatus,
            new_status: newStatus,
          });

          const notifyApp = appInfo || await getApplicationForTarget(target);
          if (notifyApp) {
            await notificationService.notifyStatusChange(
              notifyApp.company_name,
              notifyApp.job_title,
              statusLabel(oldStatus),
              statusLabel(newStatus)
            );
          }
        } else if (oldStatus === "unknown") {
          await eventService.createEvent({
            application_id: target.application_id,
            event_type: "status_change",
            title: "AI 识别状态",
            content: `识别为 "${statusLabel(newStatus)}"，置信度 ${Math.round(aiConfidence * 100)}%`,
            new_status: newStatus,
          });
        }
      } else if (aiStatus && aiConfidence >= 0.60) {
        await eventService.createEvent({
          application_id: target.application_id,
          event_type: "note_added",
          title: "AI 识别待确认",
          content: `AI 识别状态为 "${statusLabel(aiStatus)}"，置信度 ${Math.round(aiConfidence * 100)}%，请人工确认`,
          new_status: aiStatus,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      baseUpdate.last_error = `AI 识别失败: ${message}`;

      await trackerService.createTrackingRun({
        target_id: target.id,
        status: "failed",
        error_message: message,
        login_state: response.loginState,
        page_hash: response.textHash,
        ai_used: 1,
      });

      await eventService.createEvent({
        application_id: target.application_id,
        event_type: "check_failed",
        title: "AI 识别失败",
        content: message,
      });
    }
  }

  await trackerService.updateTrackingTarget(target.id, baseUpdate);

  return {
    success: true,
    message: buildResultMessage(response, aiStatus, aiConfidence, target.current_status, statusChanged),
    statusChanged,
    loginIssue: false,
  };
}

export async function processSidecarCheckException(
  target: TrackingTarget,
  error: unknown,
  options: ProcessOptions = {}
): Promise<CheckWorkflowResult> {
  const message = error instanceof Error ? error.message : String(error);
  return processSidecarCheckResult(
    target,
    {
      success: false,
      targetId: target.id,
      loginState: target.login_state,
      error: message,
    },
    options
  );
}
