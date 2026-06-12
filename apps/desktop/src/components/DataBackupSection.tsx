import { useState, useRef } from "react";
import { Download, Upload } from "lucide-react";
import type { Application, ApplicationEvent, Reminder, TrackingTarget } from "@applyradar/shared";
import { applicationService, trackerService, reminderService, eventService } from "../services";

interface BackupData {
  version: number;
  exportedAt?: string;
  applications?: Application[];
  trackingTargets?: TrackingTarget[];
  reminders?: Reminder[];
  events?: ApplicationEvent[];
}

const normalizeImportValue = (value?: string | null) => (value || "").trim();

const applicationImportKey = (app: Pick<Application, "company_name" | "job_title" | "status_url" | "job_url" | "applied_at" | "source">) =>
  [normalizeImportValue(app.company_name).toLowerCase(), normalizeImportValue(app.job_title).toLowerCase(), normalizeImportValue(app.status_url), normalizeImportValue(app.job_url), normalizeImportValue(app.applied_at), normalizeImportValue(app.source)].join("");

const targetImportKey = (applicationId: string, statusUrl?: string | null) =>
  [applicationId, normalizeImportValue(statusUrl)].join("");

const reminderImportKey = (applicationId: string | undefined, reminder: Pick<Reminder, "title" | "content" | "reminder_type" | "remind_at">) =>
  [applicationId || "", normalizeImportValue(reminder.title), normalizeImportValue(reminder.content), normalizeImportValue(reminder.reminder_type), normalizeImportValue(reminder.remind_at)].join("");

const eventImportKey = (applicationId: string, event: Pick<ApplicationEvent, "event_type" | "title" | "content" | "old_status" | "new_status">) =>
  [applicationId, normalizeImportValue(event.event_type), normalizeImportValue(event.title), normalizeImportValue(event.content), normalizeImportValue(event.old_status), normalizeImportValue(event.new_status)].join("");

const VALID_STATUSES = new Set(["to_apply", "applied", "received", "under_review", "assessment", "interview", "final_interview", "offer", "rejected", "withdrawn", "unknown"]);
const VALID_PRIORITIES = new Set(["low", "medium", "high"]);
const VALID_SOURCES = new Set(["official", "email", "referral", "linkedin", "boss", "manual"]);
const VALID_CHECK_FREQUENCIES = new Set(["manual", "daily", "every_6h", "every_12h"]);
const VALID_LOGIN_STATES = new Set(["valid", "expired", "captcha_required", "mfa_required", "blocked", "unknown"]);
const VALID_REMINDER_TYPES = new Set(["interview", "assessment_deadline", "offer_deadline", "follow_up", "document_required", "custom"]);
const VALID_EVENT_TYPES = new Set(["status_change", "login_expired", "check_success", "check_failed", "note_added", "manual"]);
const VALID_HANDLED_ACTIONS = new Set(["accepted", "dismissed"]);

const optionalText = (value?: string | null) => { const t = normalizeImportValue(value); return t || undefined; };
const optionalHttpUrl = (value?: string | null) => { const t = normalizeImportValue(value); if (!t) return undefined; try { const p = new URL(t); return ["http:", "https:"].includes(p.protocol) && p.host ? t : undefined; } catch { return undefined; } };
const optionalDateString = (value?: string | null) => { const t = normalizeImportValue(value); if (!t) return undefined; return Number.isNaN(Date.parse(t)) ? undefined : t; };
const optionalIsoDateTime = (value?: string | null) => { const t = normalizeImportValue(value); if (!t) return undefined; const time = Date.parse(t); return Number.isNaN(time) ? undefined : new Date(time).toISOString(); };
const validOrDefault = <T extends string>(value: string | undefined | null, allowed: Set<string>, fallback: T) => { const t = normalizeImportValue(value); return (allowed.has(t) ? t : fallback) as T; };
const validOrUndefined = <T extends string>(value: string | undefined | null, allowed: Set<string>) => { const t = normalizeImportValue(value); return (t && allowed.has(t) ? t : undefined) as T | undefined; };

export default function DataBackupSection() {
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExport = async () => {
    try {
      const apps = await applicationService.listApplications();
      const [targets, reminders, events] = await Promise.all([
        trackerService.listTrackingTargets(),
        reminderService.listReminders(undefined, true),
        Promise.all(apps.map(a => eventService.listEventsByApplication(a.id))).then(arrays => arrays.flat()),
      ]);
      const data = { version: 1, exportedAt: new Date().toISOString(), applications: apps, trackingTargets: targets, reminders, events };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `applyradar-backup-${new Date().toISOString().split("T")[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setResult({ ok: true, msg: "数据已导出" });
      setTimeout(() => setResult(null), 3000);
    } catch (e) {
      setResult({ ok: false, msg: `导出失败: ${e instanceof Error ? e.message : String(e)}` });
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text) as BackupData;
      if (!data.version || !Array.isArray(data.applications)) {
        setResult({ ok: false, msg: "无效的备份文件" });
        return;
      }

      const existingApps = await applicationService.listApplications();
      const [existingTargets, existingReminders, existingEvents] = await Promise.all([
        trackerService.listTrackingTargets(),
        reminderService.listReminders(undefined, true),
        Promise.all(existingApps.map((app) => eventService.listEventsByApplication(app.id))).then((arrays) => arrays.flat()),
      ]);

      const appIdMap = new Map<string, string>();
      const existingAppByKey = new Map(existingApps.map((app) => [applicationImportKey(app), app]));
      const existingTargetKeys = new Set(existingTargets.map((target) => targetImportKey(target.application_id, target.status_url)));
      const existingReminderKeys = new Set(existingReminders.map((reminder) => reminderImportKey(reminder.application_id, reminder)));
      const existingEventKeys = new Set(existingEvents.map((event) => eventImportKey(event.application_id, event)));
      let appCount = 0, targetCount = 0, reminderCount = 0, eventCount = 0, skippedCount = 0, failedCount = 0;

      for (const app of data.applications) {
        try {
          const companyName = optionalText(app.company_name);
          const jobTitle = optionalText(app.job_title);
          if (!companyName || !jobTitle) throw new Error("公司名称或岗位名称缺失");
          const sanitizedApp = { company_name: companyName, job_title: jobTitle, location: optionalText(app.location), salary_range: optionalText(app.salary_range), job_url: optionalHttpUrl(app.job_url), status_url: optionalHttpUrl(app.status_url), source: validOrDefault(app.source, VALID_SOURCES, "manual"), status: validOrDefault(app.status, VALID_STATUSES, "unknown"), priority: validOrDefault(app.priority, VALID_PRIORITIES, "medium"), applied_at: optionalDateString(app.applied_at), deadline_at: optionalDateString(app.deadline_at), notes: optionalText(app.notes) };
          const key = applicationImportKey(sanitizedApp);
          const existing = existingAppByKey.get(key);
          if (existing) { appIdMap.set(app.id, existing.id); skippedCount++; continue; }
          const created = await applicationService.createApplication(sanitizedApp);
          appIdMap.set(app.id, created.id);
          existingAppByKey.set(key, created);
          appCount++;
        } catch (e) { console.error("Failed to import app:", e); failedCount++; }
      }

      for (const target of data.trackingTargets || []) {
        try {
          const applicationId = appIdMap.get(target.application_id);
          const statusUrl = optionalHttpUrl(target.status_url);
          if (!applicationId || !statusUrl) continue;
          const key = targetImportKey(applicationId, statusUrl);
          if (existingTargetKeys.has(key)) { skippedCount++; continue; }
          const created = await trackerService.createTrackingTarget({ application_id: applicationId, status_url: statusUrl, ats_type: optionalText(target.ats_type) || "generic", check_frequency: validOrDefault(target.check_frequency, VALID_CHECK_FREQUENCIES, "daily") });
          await trackerService.updateTrackingTarget(created.id, { enabled: target.enabled === 0 ? 0 : 1, current_status: validOrDefault(target.current_status, VALID_STATUSES, "unknown"), last_status: validOrUndefined(target.last_status, VALID_STATUSES), login_state: validOrDefault(target.login_state, VALID_LOGIN_STATES, "unknown"), last_checked_at: optionalDateString(target.last_checked_at), last_success_at: optionalDateString(target.last_success_at), last_error: optionalText(target.last_error), last_text_hash: optionalText(target.last_text_hash), profile_dir: optionalText(target.profile_dir) });
          existingTargetKeys.add(key);
          targetCount++;
        } catch (e) { console.error("Failed to import tracking target:", e); failedCount++; }
      }

      for (const reminder of data.reminders || []) {
        try {
          const applicationId = reminder.application_id ? appIdMap.get(reminder.application_id) : undefined;
          if (reminder.application_id && !applicationId) continue;
          const title = optionalText(reminder.title);
          const remindAt = optionalIsoDateTime(reminder.remind_at);
          if (!title || !remindAt) throw new Error("提醒标题或时间缺失");
          const sanitizedReminder = { title, content: optionalText(reminder.content), reminder_type: validOrDefault(reminder.reminder_type, VALID_REMINDER_TYPES, "custom"), remind_at: remindAt };
          const key = reminderImportKey(applicationId, sanitizedReminder);
          if (existingReminderKeys.has(key)) { skippedCount++; continue; }
          const created = await reminderService.createReminder({ application_id: applicationId, title: sanitizedReminder.title, content: sanitizedReminder.content, reminder_type: sanitizedReminder.reminder_type, remind_at: sanitizedReminder.remind_at, notified_at: optionalIsoDateTime(reminder.notified_at) });
          if (reminder.is_done) await reminderService.markReminderDone(created.id);
          existingReminderKeys.add(key);
          reminderCount++;
        } catch (e) { console.error("Failed to import reminder:", e); failedCount++; }
      }

      for (const event of data.events || []) {
        try {
          const applicationId = appIdMap.get(event.application_id);
          if (!applicationId) continue;
          const title = optionalText(event.title);
          if (!title) throw new Error("事件标题缺失");
          const handledAt = optionalIsoDateTime(event.handled_at);
          const handledAction = handledAt ? validOrUndefined(event.handled_action, VALID_HANDLED_ACTIONS) : undefined;
          const sanitizedEvent = { event_type: validOrDefault(event.event_type, VALID_EVENT_TYPES, "manual") as ApplicationEvent["event_type"], title, content: optionalText(event.content), old_status: validOrUndefined(event.old_status, VALID_STATUSES) as ApplicationEvent["old_status"], new_status: validOrUndefined(event.new_status, VALID_STATUSES) as ApplicationEvent["new_status"], handled_at: handledAt, handled_action: handledAction as ApplicationEvent["handled_action"] };
          const key = eventImportKey(applicationId, sanitizedEvent);
          if (existingEventKeys.has(key)) { skippedCount++; continue; }
          await eventService.createEvent({ application_id: applicationId, event_type: sanitizedEvent.event_type, title: sanitizedEvent.title, content: sanitizedEvent.content, old_status: sanitizedEvent.old_status, new_status: sanitizedEvent.new_status, handled_at: sanitizedEvent.handled_at, handled_action: sanitizedEvent.handled_action });
          existingEventKeys.add(key);
          eventCount++;
        } catch (e) { console.error("Failed to import event:", e); failedCount++; }
      }

      setResult({ ok: failedCount === 0, msg: `成功导入 ${appCount} 条求职记录、${targetCount} 个监控目标、${reminderCount} 个提醒、${eventCount} 条事件${skippedCount ? `，跳过 ${skippedCount} 条已存在数据` : ""}${failedCount ? `，${failedCount} 条失败` : ""}` });
      setTimeout(() => setResult(null), 5000);
    } catch (e) {
      setResult({ ok: false, msg: `导入失败: ${e instanceof Error ? e.message : String(e)}` });
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <section className="bg-white rounded-2xl border border-gray-100 p-6 mb-5">
      <h2 className="text-base font-semibold text-gray-900 mb-5">数据备份</h2>
      <div className="flex items-center gap-3">
        <button onClick={handleExport} className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors">
          <Download className="w-4 h-4" />
          导出数据
        </button>
        <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors">
          <Upload className="w-4 h-4" />
          导入数据
        </button>
        <input ref={fileInputRef} type="file" accept=".json" onChange={handleImport} className="hidden" />
      </div>
      <p className="text-[11px] text-gray-400 mt-3">导出为 JSON 文件，可随时导入恢复数据</p>
      {result && (
        <p className={`text-sm mt-2 ${result.ok ? "text-green-600" : "text-red-500"}`}>{result.msg}</p>
      )}
    </section>
  );
}
