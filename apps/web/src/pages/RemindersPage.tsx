import { useEffect, useState, useCallback } from "react";
import { Check, Plus, Trash2, Search, Bell, X, Pencil } from "lucide-react";
import type { Reminder, ReminderType } from "@applyradar/shared";
import { REMINDER_TYPE_LABELS } from "@applyradar/shared";
import {
  listReminders,
  markReminderDone,
  deleteReminder,
  createReminder,
  updateReminder,
} from "../services/reminderService";
import { listApplications } from "../services/applicationService";

const REMINDER_TYPE_COLORS: Record<string, string> = {
  interview: "bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300",
  assessment_deadline: "bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400",
  offer_deadline: "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400",
  follow_up: "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400",
  document_required: "bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400",
  custom: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};

export default function RemindersPage() {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [appNames, setAppNames] = useState<Map<string, string>>(new Map());
  const [includeDone, setIncludeDone] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [showForm, setShowForm] = useState(false);
  const [editingReminder, setEditingReminder] = useState<Reminder | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formContent, setFormContent] = useState("");
  const [formType, setFormType] = useState<string>("custom");
  const [formRemindAt, setFormRemindAt] = useState("");
  const [formAppId, setFormAppId] = useState("");
  const [applications, setApplications] = useState<{ id: string; company_name: string; job_title: string }[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<{ success: boolean; message: string } | null>(null);

  const loadReminders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [data, apps] = await Promise.all([
        listReminders(undefined, includeDone),
        listApplications(),
      ]);
      setReminders(data);

      const names = new Map<string, string>();
      for (const app of apps) {
        names.set(app.id, `${app.company_name} - ${app.job_title}`);
      }
      setAppNames(names);
    } catch (e) {
      console.error("Failed to load reminders:", e);
      setError("加载失败，请重试");
    } finally {
      setLoading(false);
    }
  }, [includeDone]);

  useEffect(() => {
    loadReminders();
  }, [loadReminders]);

  // Notice 自动消失
  useEffect(() => {
    if (notice) {
      const timer = setTimeout(() => setNotice(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [notice]);

  const handleMarkDone = async (id: string) => {
    try {
      setReminders((prev) =>
        prev.map((r) => (r.id === id ? { ...r, is_done: 1 } : r))
      );
      await markReminderDone(id);
      setNotice({ success: true, message: "提醒已完成" });
    } catch (e) {
      console.error("Failed to mark reminder done:", e);
      setReminders((prev) =>
        prev.map((r) => (r.id === id ? { ...r, is_done: 0 } : r))
      );
      setNotice({ success: false, message: `完成提醒失败: ${e instanceof Error ? e.message : String(e)}` });
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("确定要删除这个提醒吗？")) return;

    try {
      setReminders((prev) => prev.filter((r) => r.id !== id));
      await deleteReminder(id);
      setNotice({ success: true, message: "提醒已删除" });
    } catch (e) {
      console.error("Failed to delete reminder:", e);
      setNotice({ success: false, message: `删除提醒失败: ${e instanceof Error ? e.message : String(e)}` });
      await loadReminders();
    }
  };

  const resetForm = () => {
    setEditingReminder(null);
    setFormTitle("");
    setFormContent("");
    setFormType("custom");
    setFormRemindAt("");
    setFormAppId("");
  };

  const handleCreate = async () => {
    if (!formTitle.trim() || !formRemindAt) return;

    setSubmitting(true);
    try {
      if (editingReminder) {
        await updateReminder(editingReminder.id, {
          title: formTitle.trim(),
          content: formContent.trim() || undefined,
          reminder_type: formType as ReminderType,
          remind_at: new Date(formRemindAt).toISOString(),
          application_id: formAppId || undefined,
        });
        setNotice({ success: true, message: "提醒已更新" });
      } else {
        await createReminder({
          title: formTitle.trim(),
          content: formContent.trim() || undefined,
          reminder_type: formType as ReminderType,
          remind_at: new Date(formRemindAt).toISOString(),
          application_id: formAppId || undefined,
        });
        setNotice({ success: true, message: "提醒已创建" });
      }
      setShowForm(false);
      resetForm();
      await loadReminders();
    } catch (e) {
      console.error("Failed to save reminder:", e);
      setNotice({ success: false, message: `保存提醒失败: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setSubmitting(false);
    }
  };

  const loadApplicationsForForm = async () => {
    try {
      const apps = await listApplications();
      setApplications(apps.map((a) => ({ id: a.id, company_name: a.company_name, job_title: a.job_title })));
    } catch {}
  };

  const openCreateForm = async () => {
    resetForm();
    setShowForm(true);
    await loadApplicationsForForm();
  };

  const openEditForm = async (r: Reminder) => {
    setEditingReminder(r);
    setFormTitle(r.title);
    setFormContent(r.content || "");
    setFormType(r.reminder_type || "custom");
    const d = new Date(r.remind_at);
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    setFormRemindAt(local.toISOString().slice(0, 16));
    setFormAppId(r.application_id || "");
    setShowForm(true);
    await loadApplicationsForForm();
  };

  const isOverdue = (r: Reminder) => !r.is_done && new Date(r.remind_at) < new Date();

  const filteredReminders = reminders.filter((r) => {
    if (search.trim()) {
      const q = search.toLowerCase();
      const matchesTitle = r.title.toLowerCase().includes(q);
      const matchesContent = r.content?.toLowerCase().includes(q);
      const appName = r.application_id ? appNames.get(r.application_id) : "";
      const matchesApp = appName?.toLowerCase().includes(q);
      if (!matchesTitle && !matchesContent && !matchesApp) return false;
    }
    if (typeFilter && r.reminder_type !== typeFilter) return false;
    return true;
  });

  return (
    <div className="px-4 pb-4 pt-2">
      {/* Header */}
      <div className="mb-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="搜索提醒内容..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-56 pl-9 pr-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-stone-500/20 focus:border-stone-400 transition-all sm:w-64"
            />
          </div>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-stone-500/20 focus:border-stone-400 transition-all appearance-none cursor-pointer"
          >
            <option value="">全部类型</option>
            {Object.entries(REMINDER_TYPE_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
          <label className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={includeDone}
              onChange={(e) => setIncludeDone(e.target.checked)}
              className="rounded border-gray-300 dark:border-gray-600 text-stone-700 focus:ring-stone-500"
            />
            <span className="whitespace-nowrap text-gray-600 dark:text-gray-400">显示已完成</span>
          </label>
        </div>
        <button
          onClick={openCreateForm}
          className="flex items-center gap-2 px-4 py-2 bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 rounded-lg text-sm font-medium hover:bg-stone-800 dark:hover:bg-stone-200 transition-all shadow-sm"
        >
          <Plus className="w-4 h-4" />
          新建提醒
        </button>
      </div>

      {notice && (
        <div className={`mb-4 rounded-lg border px-4 py-3 text-sm ${
          notice.success
            ? "border-emerald-100 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400"
            : "border-red-100 dark:border-red-900 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400"
        }`}>
          {notice.message}
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-16 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div className="text-center py-16">
          <p className="text-sm text-red-500 mb-3">{error}</p>
          <button
            onClick={loadReminders}
            className="px-4 py-2 text-sm text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-lg transition-colors"
          >
            重试
          </button>
        </div>
      ) : filteredReminders.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-14 h-14 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mx-auto mb-4">
            <Bell className="w-6 h-6 text-gray-400" />
          </div>
          <p className="text-sm font-medium text-gray-500">
            {search || typeFilter ? "没有匹配的提醒" : includeDone ? "暂无提醒" : "暂无未完成的提醒"}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            {search || typeFilter ? "尝试调整筛选条件" : "点击「新建提醒」开始添加"}
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 overflow-hidden shadow-sm">
          <div className="divide-y divide-gray-50 dark:divide-gray-700">
            {filteredReminders.map((r) => {
              const overdue = isOverdue(r);
              const typeColor = REMINDER_TYPE_COLORS[r.reminder_type || ""] || REMINDER_TYPE_COLORS.custom;
              const appName = r.application_id ? appNames.get(r.application_id) : null;

              return (
                <div
                  key={r.id}
                  className={`group flex items-center gap-4 px-5 py-4 transition-colors ${
                    r.is_done ? "opacity-50" : overdue ? "bg-red-50/50 dark:bg-red-900/10" : "hover:bg-gray-50 dark:hover:bg-gray-700/50"
                  }`}
                >
                  <button
                    onClick={() => !r.is_done && handleMarkDone(r.id)}
                    className={`flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                      r.is_done
                        ? "bg-green-500 border-green-500 text-white"
                        : "border-gray-300 dark:border-gray-600 hover:border-stone-400"
                    }`}
                  >
                    {r.is_done ? <Check className="w-3 h-3" /> : null}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                      <p
                        className={`truncate text-sm font-medium ${
                          r.is_done ? "line-through text-gray-400" : "text-gray-900 dark:text-white"
                        }`}
                      >
                        {r.title}
                      </p>
                      {r.reminder_type && (
                        <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded ${typeColor}`}>
                          {REMINDER_TYPE_LABELS[r.reminder_type as ReminderType] || r.reminder_type}
                        </span>
                      )}
                      {r.created_by === "ai" && (
                        <span className="shrink-0 text-[10px] px-1.5 py-0.5 bg-stone-50 dark:bg-stone-800 text-stone-500 rounded">
                          AI
                        </span>
                      )}
                    </div>
                    {r.content && (
                      <p className="text-xs text-gray-400 mt-0.5 truncate" title={r.content}>
                        {r.content}
                      </p>
                    )}
                    {appName && (
                      <p className="text-xs text-gray-400 mt-0.5">{appName}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span
                      className={`text-xs ${
                        !r.is_done && overdue ? "text-red-500 font-medium" : "text-gray-400"
                      }`}
                    >
                      {new Date(r.remind_at).toLocaleString("zh-CN", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    {!r.is_done && overdue && (
                      <span className="text-[10px] px-1.5 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-full">
                        已过期
                      </span>
                    )}
                    <button
                      onClick={() => openEditForm(r)}
                      className="p-1.5 text-gray-300 hover:text-stone-700 dark:hover:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                      title="编辑"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(r.id)}
                      className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                      title="删除"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Create/Edit Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 dark:border-gray-700">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                {editingReminder ? "编辑提醒" : "新建提醒"}
              </h2>
              <button
                onClick={() => { setShowForm(false); resetForm(); }}
                className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">
                  提醒标题 *
                </label>
                <input
                  type="text"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="例如：准备面试"
                  className="w-full px-3.5 py-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-600 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-500/20 focus:border-stone-400 focus:bg-white dark:focus:bg-gray-800 transition-all"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">
                  提醒时间 *
                </label>
                <input
                  type="datetime-local"
                  value={formRemindAt}
                  onChange={(e) => setFormRemindAt(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-600 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-500/20 focus:border-stone-400 focus:bg-white dark:focus:bg-gray-800 transition-all"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">
                    类型
                  </label>
                  <select
                    value={formType}
                    onChange={(e) => setFormType(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-600 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-500/20 focus:border-stone-400 focus:bg-white dark:focus:bg-gray-800 transition-all appearance-none cursor-pointer"
                  >
                    {Object.entries(REMINDER_TYPE_LABELS).map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">
                    关联求职
                  </label>
                  <select
                    value={formAppId}
                    onChange={(e) => setFormAppId(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-600 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-500/20 focus:border-stone-400 focus:bg-white dark:focus:bg-gray-800 transition-all appearance-none cursor-pointer"
                  >
                    <option value="">不关联</option>
                    {applications.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.company_name} - {a.job_title}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">
                  备注
                </label>
                <textarea
                  value={formContent}
                  onChange={(e) => setFormContent(e.target.value)}
                  placeholder="添加备注信息..."
                  rows={3}
                  className="w-full px-3.5 py-2.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-600 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-500/20 focus:border-stone-400 focus:bg-white dark:focus:bg-gray-800 transition-all resize-none"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100 dark:border-gray-700">
              <button
                onClick={() => { setShowForm(false); resetForm(); }}
                className="px-5 py-2.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleCreate}
                disabled={!formTitle.trim() || !formRemindAt || submitting}
                className="px-6 py-2.5 bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 rounded-xl text-sm font-medium hover:bg-stone-800 dark:hover:bg-stone-200 disabled:opacity-50 transition-all shadow-sm"
              >
                {submitting ? "保存中..." : editingReminder ? "保存" : "创建"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
