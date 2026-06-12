import type { ApplicationStatus, LoginState, Priority, ReminderType } from "./types";

export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  to_apply: "待投递",
  applied: "已投递",
  received: "已收到",
  under_review: "审核中",
  assessment: "测评",
  interview: "面试",
  final_interview: "终面",
  offer: "Offer",
  rejected: "已拒绝",
  withdrawn: "已撤回",
  unknown: "未知",
};

export const STATUS_COLORS: Record<ApplicationStatus, string> = {
  to_apply: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  applied: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  received: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400",
  under_review: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  assessment: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  interview: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400",
  final_interview: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
  offer: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  rejected: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  withdrawn: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  unknown: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
};

export const LOGIN_STATE_LABELS: Record<LoginState, string> = {
  valid: "正常",
  expired: "已过期",
  captcha_required: "需要验证码",
  mfa_required: "需要二次验证",
  blocked: "已封禁",
  unknown: "未知",
};

export const LOGIN_STATE_COLORS: Record<LoginState, string> = {
  valid: "text-green-600",
  expired: "text-red-600",
  captcha_required: "text-yellow-600",
  mfa_required: "text-orange-600",
  blocked: "text-red-700",
  unknown: "text-gray-500",
};

export const PRIORITY_LABELS: Record<Priority, string> = {
  low: "低",
  medium: "中",
  high: "高",
};

export const PRIORITY_COLORS: Record<Priority, string> = {
  low: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  medium: "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400",
  high: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400",
};

export const REMINDER_TYPE_LABELS: Record<ReminderType, string> = {
  interview: "面试",
  assessment_deadline: "测评截止",
  offer_deadline: "Offer截止",
  follow_up: "跟进",
  document_required: "需要材料",
  custom: "自定义",
};

export const ALL_STATUSES: ApplicationStatus[] = [
  "to_apply",
  "applied",
  "received",
  "under_review",
  "assessment",
  "interview",
  "final_interview",
  "offer",
  "rejected",
  "withdrawn",
  "unknown",
];

export const ACTIVE_STATUSES: ApplicationStatus[] = [
  "applied",
  "received",
  "under_review",
  "assessment",
  "interview",
  "final_interview",
];
