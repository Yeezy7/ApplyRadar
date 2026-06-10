import type { Application, ApplicationStatus } from './types';
import { STATUS_LABELS, ACTIVE_STATUSES, RESULT_STATUSES } from './constants';

/**
 * Format a date string to a readable short format
 */
export function formatDate(dateStr?: string): string {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '-';
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

/**
 * Format a date string with time
 */
export function formatDateTime(dateStr?: string): string {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '-';
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const hour = String(d.getHours()).padStart(2, '0');
  const minute = String(d.getMinutes()).padStart(2, '0');
  return `${month}月${day}日 ${hour}:${minute}`;
}

/**
 * Format a date to YYYY-MM-DD
 */
export function formatDateISO(dateStr?: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  return d.toISOString().split('T')[0];
}

/**
 * Calculate waiting days for an application
 * Returns null if the application has a final result or no applied_at date
 */
export function getActiveWaitingDays(app: Application): number | null {
  if (RESULT_STATUSES.includes(app.status as ApplicationStatus)) return null;
  if (!app.applied_at) return null;
  const applied = new Date(app.applied_at);
  if (isNaN(applied.getTime())) return null;
  const now = new Date();
  const diff = Math.floor((now.getTime() - applied.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(0, diff);
}

/**
 * Check if a status is a final/result status
 */
export function hasFinalResult(status: ApplicationStatus): boolean {
  return RESULT_STATUSES.includes(status);
}

/**
 * Check if a status is active (in progress)
 */
export function isActive(status: ApplicationStatus): boolean {
  return ACTIVE_STATUSES.includes(status);
}

/**
 * Get company initial for avatar display
 */
export function getCompanyInitial(companyName: string): string {
  return companyName.slice(0, 1);
}

/**
 * Check if a reminder is overdue
 */
export function isReminderOverdue(remindAt: string, isDone: boolean): boolean {
  if (isDone) return false;
  return new Date(remindAt) < new Date();
}
