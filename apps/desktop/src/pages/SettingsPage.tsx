import { useState, useEffect, useRef } from "react";
import { Eye, EyeOff, RotateCcw, TestTube2, Check, AlertCircle, FolderOpen, Download, Upload } from "lucide-react";
import type { Application, ApplicationEvent, Reminder, TrackingTarget } from "@applyradar/shared";
import { getSettings, saveSettings, loadSettings, DEFAULT_SETTINGS, type AppSettings } from "../stores/settings";
import { aiService, sidecarService, applicationService, trackerService, reminderService, eventService } from "../services";
import { requestPermission, isPermissionGranted } from "@tauri-apps/plugin-notification";

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
  [
    normalizeImportValue(app.company_name).toLowerCase(),
    normalizeImportValue(app.job_title).toLowerCase(),
    normalizeImportValue(app.status_url),
    normalizeImportValue(app.job_url),
    normalizeImportValue(app.applied_at),
    normalizeImportValue(app.source),
  ].join("\u001f");

const targetImportKey = (applicationId: string, statusUrl?: string | null) =>
  [applicationId, normalizeImportValue(statusUrl)].join("\u001f");

const reminderImportKey = (applicationId: string | undefined, reminder: Pick<Reminder, "title" | "content" | "reminder_type" | "remind_at">) =>
  [
    applicationId || "",
    normalizeImportValue(reminder.title),
    normalizeImportValue(reminder.content),
    normalizeImportValue(reminder.reminder_type),
    normalizeImportValue(reminder.remind_at),
  ].join("\u001f");

const eventImportKey = (applicationId: string, event: Pick<ApplicationEvent, "event_type" | "title" | "content" | "old_status" | "new_status">) =>
  [
    applicationId,
    normalizeImportValue(event.event_type),
    normalizeImportValue(event.title),
    normalizeImportValue(event.content),
    normalizeImportValue(event.old_status),
    normalizeImportValue(event.new_status),
  ].join("\u001f");

export default function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings>(getSettings);
  const [saved, setSaved] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [appDataDir, setAppDataDir] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState<{ ok: boolean; msg: string } | null>(null);
  const [importResult, setImportResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadSettings().then(setSettings).catch(() => {});
    sidecarService.getAppDataDir().then(setAppDataDir).catch(() => {});
  }, []);

  const handleChange = (updates: Partial<AppSettings>) => {
    setSettings((s) => ({ ...s, ...updates }));
    setDirty(true);
    setTestResult(null);
    setSettingsMessage(null);
  };

  const handleSave = async () => {
    try {
      await saveSettings(settings);
      setSaved(true);
      setDirty(false);
      setSettingsMessage({ ok: true, msg: "设置已保存" });
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      console.error("Failed to save settings:", e);
      setSettingsMessage({ ok: false, msg: `保存设置失败: ${e instanceof Error ? e.message : String(e)}` });
    }
  };

  const handleReset = () => {
    if (!confirm("确定要恢复默认设置吗？")) return;
    setSettings({ ...DEFAULT_SETTINGS });
    setDirty(true);
    setTestResult(null);
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      // Save first so the backend can read the latest settings
      await saveSettings(settings);
      setDirty(false);
      const msg = await aiService.testConnection();
      setTestResult({ ok: true, msg });
    } catch (e) {
      setTestResult({ ok: false, msg: String(e) });
    } finally {
      setTesting(false);
    }
  };

  const handleExport = async () => {
    try {
      const apps = await applicationService.listApplications();
      const [targets, reminders, events] = await Promise.all([
        trackerService.listTrackingTargets(),
        reminderService.listReminders(undefined, true),
        Promise.all(apps.map(a => eventService.listEventsByApplication(a.id)))
          .then(eventsArrays => eventsArrays.flat()),
      ]);

      const data = {
        version: 1,
        exportedAt: new Date().toISOString(),
        applications: apps,
        trackingTargets: targets,
        reminders: reminders,
        events: events,
      };

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `applyradar-backup-${new Date().toISOString().split("T")[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setImportResult({ ok: true, msg: "数据已导出" });
      setTimeout(() => setImportResult(null), 3000);
    } catch (e) {
      console.error("Export failed:", e);
      setImportResult({ ok: false, msg: `导出失败: ${e instanceof Error ? e.message : String(e)}` });
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text) as BackupData;

      if (!data.version || !Array.isArray(data.applications)) {
        setImportResult({ ok: false, msg: "无效的备份文件" });
        return;
      }

      const existingApps = await applicationService.listApplications();
      const [existingTargets, existingReminders, existingEvents] = await Promise.all([
        trackerService.listTrackingTargets(),
        reminderService.listReminders(undefined, true),
        Promise.all(existingApps.map((app) => eventService.listEventsByApplication(app.id)))
          .then((eventsArrays) => eventsArrays.flat()),
      ]);

      const appIdMap = new Map<string, string>();
      const existingAppByKey = new Map(
        existingApps.map((app) => [applicationImportKey(app), app])
      );
      const existingTargetKeys = new Set(
        existingTargets.map((target) => targetImportKey(target.application_id, target.status_url))
      );
      const existingReminderKeys = new Set(
        existingReminders.map((reminder) => reminderImportKey(reminder.application_id, reminder))
      );
      const existingEventKeys = new Set(
        existingEvents.map((event) => eventImportKey(event.application_id, event))
      );
      let appCount = 0;
      let targetCount = 0;
      let reminderCount = 0;
      let eventCount = 0;
      let skippedCount = 0;
      let failedCount = 0;

      for (const app of data.applications) {
        try {
          const key = applicationImportKey(app);
          const existing = existingAppByKey.get(key);
          if (existing) {
            appIdMap.set(app.id, existing.id);
            skippedCount++;
            continue;
          }

          const created = await applicationService.createApplication({
            company_name: app.company_name,
            job_title: app.job_title,
            location: app.location,
            salary_range: app.salary_range,
            job_url: app.job_url,
            status_url: app.status_url,
            source: app.source,
            status: app.status,
            priority: app.priority,
            applied_at: app.applied_at,
            deadline_at: app.deadline_at,
            notes: app.notes,
          });
          appIdMap.set(app.id, created.id);
          existingAppByKey.set(key, created);
          appCount++;
        } catch (e) {
          console.error("Failed to import app:", e);
          failedCount++;
        }
      }

      for (const target of data.trackingTargets || []) {
        try {
          const applicationId = appIdMap.get(target.application_id);
          if (!applicationId || !target.status_url) continue;
          const key = targetImportKey(applicationId, target.status_url);
          if (existingTargetKeys.has(key)) {
            skippedCount++;
            continue;
          }

          const created = await trackerService.createTrackingTarget({
            application_id: applicationId,
            status_url: target.status_url,
            ats_type: target.ats_type,
            check_frequency: target.check_frequency,
          });

          await trackerService.updateTrackingTarget(created.id, {
            enabled: target.enabled,
            current_status: target.current_status,
            last_status: target.last_status,
            login_state: target.login_state,
            last_checked_at: target.last_checked_at,
            last_success_at: target.last_success_at,
            last_error: target.last_error,
            last_text_hash: target.last_text_hash,
            profile_dir: target.profile_dir,
          });
          existingTargetKeys.add(key);
          targetCount++;
        } catch (e) {
          console.error("Failed to import tracking target:", e);
          failedCount++;
        }
      }

      for (const reminder of data.reminders || []) {
        try {
          const applicationId = reminder.application_id
            ? appIdMap.get(reminder.application_id)
            : undefined;
          if (reminder.application_id && !applicationId) continue;

          const key = reminderImportKey(applicationId, reminder);
          if (existingReminderKeys.has(key)) {
            skippedCount++;
            continue;
          }

          const created = await reminderService.createReminder({
            application_id: applicationId,
            title: reminder.title,
            content: reminder.content,
            reminder_type: reminder.reminder_type,
            remind_at: reminder.remind_at,
            notified_at: reminder.notified_at,
          });
          if (reminder.is_done) {
            await reminderService.markReminderDone(created.id);
          }
          existingReminderKeys.add(key);
          reminderCount++;
        } catch (e) {
          console.error("Failed to import reminder:", e);
          failedCount++;
        }
      }

      for (const event of data.events || []) {
        try {
          const applicationId = appIdMap.get(event.application_id);
          if (!applicationId) continue;

          const key = eventImportKey(applicationId, event);
          if (existingEventKeys.has(key)) {
            skippedCount++;
            continue;
          }

          await eventService.createEvent({
            application_id: applicationId,
            event_type: event.event_type,
            title: event.title,
            content: event.content,
            old_status: event.old_status,
            new_status: event.new_status,
            handled_at: event.handled_at,
            handled_action: event.handled_action,
          });
          existingEventKeys.add(key);
          eventCount++;
        } catch (e) {
          console.error("Failed to import event:", e);
          failedCount++;
        }
      }

      setImportResult({
        ok: failedCount === 0,
        msg: `成功导入 ${appCount} 条求职记录、${targetCount} 个监控目标、${reminderCount} 个提醒、${eventCount} 条事件${skippedCount ? `，跳过 ${skippedCount} 条已存在数据` : ""}${failedCount ? `，${failedCount} 条失败` : ""}`,
      });
      setTimeout(() => setImportResult(null), 5000);
    } catch (e) {
      setImportResult({ ok: false, msg: `导入失败: ${e instanceof Error ? e.message : String(e)}` });
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleNotificationToggle = async () => {
    if (!settings.notificationsEnabled) {
      // Turning on - request permission first
      const granted = await isPermissionGranted();
      if (!granted) {
        const result = await requestPermission();
        if (result !== "granted") {
          setSettingsMessage({ ok: false, msg: "通知权限被拒绝，请在系统设置中允许通知" });
          return;
        }
      }
    }
    handleChange({ notificationsEnabled: !settings.notificationsEnabled });
  };

  return (
    <div className="p-8 max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">设置</h1>
          <p className="text-sm text-gray-500 mt-1">配置 AI、自动化和通知</p>
        </div>
        <button
          onClick={handleReset}
          className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          恢复默认
        </button>
      </div>

      {/* AI Configuration */}
      <section className="bg-white rounded-2xl border border-gray-100 p-6 mb-5">
        <h2 className="text-base font-semibold text-gray-900 mb-5">AI 配置</h2>
        <div className="space-y-5">
          <div>
            <label htmlFor="apiKey" className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">
              API Key
            </label>
            <div className="relative">
              <input
                id="apiKey"
                type={showApiKey ? "text" : "password"}
                value={settings.apiKey}
                onChange={(e) => handleChange({ apiKey: e.target.value })}
                placeholder="sk-..."
                className="w-full px-3.5 py-2.5 pr-10 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-500/20 focus:border-stone-400 focus:bg-white transition-all"
              />
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 transition-colors"
              >
                {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-[11px] text-gray-400 mt-1.5">支持 OpenAI 兼容 API（OpenAI、Deepseek、本地 Ollama 等）</p>
          </div>

          <div>
            <label htmlFor="apiBaseUrl" className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">
              API Base URL
            </label>
            <input
              id="apiBaseUrl"
              type="url"
              value={settings.apiBaseUrl}
              onChange={(e) => handleChange({ apiBaseUrl: e.target.value })}
              placeholder="https://api.openai.com/v1"
              className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-500/20 focus:border-stone-400 focus:bg-white transition-all"
            />
            <p className="text-[11px] text-gray-400 mt-1.5">不需要填写 /chat/completions，只需填写基础 URL</p>
          </div>

          <div>
            <label htmlFor="model" className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">
              模型
            </label>
            <input
              id="model"
              type="text"
              value={settings.model}
              onChange={(e) => handleChange({ model: e.target.value })}
              placeholder="gpt-4o-mini"
              className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-500/20 focus:border-stone-400 focus:bg-white transition-all"
            />
          </div>

          {/* Test Connection */}
          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={handleTestConnection}
              disabled={testing || !settings.apiKey}
              className="flex items-center gap-2 px-4 py-2 text-sm text-stone-700 bg-stone-50 hover:bg-stone-100 rounded-xl disabled:opacity-50 transition-colors"
            >
              <TestTube2 className="w-4 h-4" />
              {testing ? "测试中..." : "测试连接"}
            </button>
            {testResult && (
              <div className={`flex items-center gap-1.5 text-sm ${testResult.ok ? "text-green-600" : "text-red-500"}`}>
                {testResult.ok ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                {testResult.msg}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Automation */}
      <section className="bg-white rounded-2xl border border-gray-100 p-6 mb-5">
        <h2 className="text-base font-semibold text-gray-900 mb-5">自动化</h2>
        <div className="space-y-5">
          <div>
            <label htmlFor="checkFrequency" className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">
              默认检查频率
            </label>
            <select
              id="checkFrequency"
              value={settings.checkFrequency}
              onChange={(e) => handleChange({ checkFrequency: e.target.value })}
              className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-500/20 focus:border-stone-400 focus:bg-white transition-all appearance-none cursor-pointer"
            >
              <option value="manual">手动</option>
              <option value="daily">每天</option>
              <option value="every_12h">每12小时</option>
              <option value="every_6h">每6小时</option>
            </select>
            <p className="text-[11px] text-gray-400 mt-1.5">新建监控目标时的默认检查频率</p>
          </div>

          <div className="flex items-center justify-between py-2">
            <div>
              <div className="text-sm font-medium text-gray-900">系统通知</div>
              <div className="text-xs text-gray-400 mt-0.5">
                状态变化、登录过期、检查完成/失败时发送通知
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={settings.notificationsEnabled}
              onClick={handleNotificationToggle}
              className={`relative w-11 h-6 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-stone-500/20 ${
                settings.notificationsEnabled ? "bg-stone-900" : "bg-gray-300"
              }`}
            >
              <div
                className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                  settings.notificationsEnabled ? "translate-x-[22px]" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between py-2">
            <div>
              <div className="text-sm font-medium text-gray-900">自动检查</div>
              <div className="text-xs text-gray-400 mt-0.5">
                后台定时自动检查状态页，按配置频率执行
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={settings.autoCheckEnabled}
              onClick={() => handleChange({ autoCheckEnabled: !settings.autoCheckEnabled })}
              className={`relative w-11 h-6 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-stone-500/20 ${
                settings.autoCheckEnabled ? "bg-stone-900" : "bg-gray-300"
              }`}
            >
              <div
                className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                  settings.autoCheckEnabled ? "translate-x-[22px]" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>
        </div>
      </section>

      {/* Data */}
      <section className="bg-white rounded-2xl border border-gray-100 p-6 mb-5">
        <h2 className="text-base font-semibold text-gray-900 mb-5">数据存储</h2>
        {appDataDir && (
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
            <FolderOpen className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-medium text-gray-500 mb-0.5">数据目录</p>
              <p className="text-sm text-gray-700 truncate">{appDataDir}</p>
            </div>
          </div>
        )}
        <p className="text-[11px] text-gray-400 mt-3">
          数据库、浏览器 Profile 和配置文件存储在此目录
        </p>
      </section>

      {/* Data Import/Export */}
      <section className="bg-white rounded-2xl border border-gray-100 p-6 mb-5">
        <h2 className="text-base font-semibold text-gray-900 mb-5">数据备份</h2>
        <div className="flex items-center gap-3">
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            <Download className="w-4 h-4" />
            导出数据
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            <Upload className="w-4 h-4" />
            导入数据
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleImport}
            className="hidden"
          />
        </div>
        <p className="text-[11px] text-gray-400 mt-3">
          导出为 JSON 文件，可随时导入恢复数据
        </p>
        {importResult && (
          <p className={`text-sm mt-2 ${importResult.ok ? "text-green-600" : "text-red-500"}`}>
            {importResult.msg}
          </p>
        )}
      </section>

      {/* Save Button */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={!dirty}
          className="px-6 py-2.5 bg-stone-900 text-white rounded-xl text-sm font-medium hover:bg-stone-800 disabled:opacity-40 transition-all shadow-sm"
        >
          保存设置
        </button>
        {saved && (
          <span className="flex items-center gap-1.5 text-sm text-green-600">
            <Check className="w-4 h-4" />
            已保存
          </span>
        )}
        {dirty && !saved && (
          <span className="text-sm text-gray-400">有未保存的更改</span>
        )}
        {settingsMessage && (
          <span className={`text-sm ${settingsMessage.ok ? "text-green-600" : "text-red-500"}`}>
            {settingsMessage.msg}
          </span>
        )}
      </div>
    </div>
  );
}
