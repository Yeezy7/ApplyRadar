import { useState } from "react";
import { Plus, X, Check, Trash2 } from "lucide-react";
import type { Reminder, ReminderType } from "@applyradar/shared";
import { REMINDER_TYPE_LABELS } from "@applyradar/shared";
import { reminderService } from "../services";
import { confirmDelete } from "../services/dialogService";

interface Props {
  reminders: Reminder[];
  applicationId: string;
  onRefresh: () => void;
}

export default function AppReminderSection({ reminders, applicationId, onRefresh }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [type, setType] = useState<ReminderType>("custom");
  const [remindAt, setRemindAt] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const isOverdue = (r: Reminder) => !r.is_done && new Date(r.remind_at) < new Date();

  const resetForm = () => {
    setTitle("");
    setContent("");
    setType("custom");
    setRemindAt("");
    setError("");
    setShowForm(false);
  };

  const handleCreate = async () => {
    if (!title.trim() || !remindAt) return;
    setSubmitting(true);
    try {
      await reminderService.createReminder({
        application_id: applicationId,
        title: title.trim(),
        content: content.trim() || undefined,
        reminder_type: type,
        remind_at: new Date(remindAt).toISOString(),
      });
      resetForm();
      onRefresh();
    } catch (e) {
      setError(`创建失败: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleMarkDone = async (id: string) => {
    try {
      await reminderService.markReminderDone(id);
      onRefresh();
    } catch (e) {
      console.error("Failed to mark reminder done:", e);
    }
  };

  const handleDelete = async (id: string) => {
    const ok = await confirmDelete("确定要删除这个提醒吗？");
    if (!ok) return;
    try {
      await reminderService.deleteReminder(id);
      onRefresh();
    } catch (e) {
      console.error("Failed to delete reminder:", e);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-700">提醒</h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-stone-700 hover:bg-stone-100 rounded-lg transition-colors"
        >
          <Plus className="w-3 h-3" />
          添加提醒
        </button>
      </div>

      {showForm && (
        <div className="mb-4 rounded-xl border border-stone-200 bg-stone-50/60 p-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="mb-1 block text-xs font-medium text-gray-500">标题</label>
              <input
                value={title}
                onChange={(e) => { setTitle(e.target.value); setError(""); }}
                placeholder="例如：准备面试材料"
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-500/20"
                autoFocus
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">类型</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as ReminderType)}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-500/20"
              >
                {Object.entries(REMINDER_TYPE_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">时间</label>
              <input
                type="datetime-local"
                value={remindAt}
                onChange={(e) => { setRemindAt(e.target.value); setError(""); }}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-500/20"
              />
            </div>
            <div className="col-span-2">
              <label className="mb-1 block text-xs font-medium text-gray-500">备注</label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="可选"
                rows={2}
                className="w-full resize-none rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-500/20"
              />
            </div>
          </div>
          {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
          <div className="mt-3 flex items-center justify-end gap-2">
            <button onClick={resetForm} className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-100">
              <X className="h-3 w-3" />
              取消
            </button>
            <button
              onClick={handleCreate}
              disabled={submitting || !title.trim() || !remindAt}
              className="rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-stone-800 disabled:opacity-50"
            >
              {submitting ? "添加中..." : "保存提醒"}
            </button>
          </div>
        </div>
      )}

      {reminders.length === 0 ? (
        <p className="text-sm text-gray-400 py-4">暂无提醒</p>
      ) : (
        <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2">
          {reminders.map((r) => (
            <div
              key={r.id}
              className={`flex items-center gap-3 text-sm py-2.5 px-3 rounded-lg transition-colors ${
                r.is_done ? "opacity-50" : isOverdue(r) ? "bg-red-50" : "hover:bg-gray-50"
              }`}
            >
              <button
                onClick={() => !r.is_done && handleMarkDone(r.id)}
                className={`flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                  r.is_done ? "bg-green-500 border-green-500 text-white" : "border-gray-300 hover:border-stone-400"
                }`}
              >
                {r.is_done ? <Check className="w-3 h-3" /> : null}
              </button>
              <div className="flex-1 min-w-0">
                <span className={`text-sm ${r.is_done ? "line-through text-gray-400" : "text-gray-900"}`}>
                  {r.title}
                </span>
                {r.reminder_type && (
                  <span className="ml-2 text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded">
                    {REMINDER_TYPE_LABELS[r.reminder_type as ReminderType] || r.reminder_type}
                  </span>
                )}
              </div>
              <span className={`text-xs ${isOverdue(r) && !r.is_done ? "text-red-500 font-medium" : "text-gray-400"}`}>
                {new Date(r.remind_at).toLocaleString("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
              </span>
              {!r.is_done && (
                <button
                  onClick={() => handleDelete(r.id)}
                  className="p-1 text-gray-300 hover:text-red-500 rounded transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
