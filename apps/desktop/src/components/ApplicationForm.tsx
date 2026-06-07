import { useState } from "react";
import { X, Link, Loader2 } from "lucide-react";
import type { Application } from "@applyradar/shared";
import { ALL_STATUSES, STATUS_LABELS } from "@applyradar/shared";
import { applicationService, trackerService, eventService, aiService } from "../services";
import { getSettings, isAIConfigured } from "../stores/settings";

interface Props {
  application?: Application | null;
  onClose: () => void;
}

export default function ApplicationForm({ application, onClose }: Props) {
  const [form, setForm] = useState({
    company_name: application?.company_name || "",
    job_title: application?.job_title || "",
    location: application?.location || "",
    salary_range: application?.salary_range || "",
    job_url: application?.job_url || "",
    status_url: application?.status_url || "",
    source: application?.source || "manual",
    status: application?.status || "unknown",
    priority: application?.priority || "medium",
    applied_at: application?.applied_at?.split("T")[0] || "",
    notes: application?.notes || "",
  });
  const [saving, setSaving] = useState(false);
  const [fetchingUrl, setFetchingUrl] = useState(false);
  const [urlError, setUrlError] = useState("");

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleFetchUrl = async () => {
    const url = form.job_url?.trim();
    if (!url) {
      setUrlError("请先输入 JD 链接");
      return;
    }

    try {
      new URL(url);
    } catch {
      setUrlError("请输入有效的 URL");
      return;
    }

    if (!isAIConfigured()) {
      setUrlError("请先在设置中配置 AI API Key");
      return;
    }

    setFetchingUrl(true);
    setUrlError("");

    try {
      const info = await aiService.extractJobInfo(url);

      const hasResult = info.company_name || info.job_title || info.location || info.salary_range;
      if (!hasResult) {
        setUrlError("未能从页面提取到信息，请手动填写");
        return;
      }

      setForm((prev) => ({
        ...prev,
        company_name: info.company_name || prev.company_name,
        job_title: info.job_title || prev.job_title,
        location: info.location || prev.location,
        salary_range: info.salary_range || prev.salary_range,
      }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[URL识别] 失败:", msg);
      setUrlError(`识别失败: ${msg}`);
    } finally {
      setFetchingUrl(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.company_name.trim() || !form.job_title.trim()) return;

    setSaving(true);
    try {
      const input = {
        ...form,
        applied_at: form.applied_at || undefined,
        location: form.location || undefined,
        salary_range: form.salary_range || undefined,
        job_url: form.job_url || undefined,
        status_url: form.status_url || undefined,
        notes: form.notes || undefined,
      };

      let savedApp: Application;
      if (application) {
        savedApp = await applicationService.updateApplication(application.id, input);

        // Create event if status changed manually
        if (form.status && form.status !== application.status) {
          try {
            await eventService.createEvent({
              application_id: application.id,
              event_type: "status_change",
              title: "手动修改状态",
              old_status: application.status,
              new_status: form.status,
            });
          } catch {}
        }
      } else {
        savedApp = await applicationService.createApplication(input);
      }

      // Auto-create or update tracking target if status_url changed
      try {
        const existingTargets = await trackerService.listTrackingTargets(savedApp.id);
        const newUrl = form.status_url?.trim();

        if (newUrl) {
          // Validate URL
          let validUrl = false;
          try {
            const parsed = new URL(newUrl);
            validUrl = ["http:", "https:"].includes(parsed.protocol);
          } catch {}

          if (validUrl) {
            // Check if a target already exists for this URL (exact match)
            const exactMatch = existingTargets.find((t) => t.status_url === newUrl);

            if (!exactMatch) {
              if (application && existingTargets.length > 0) {
                // Edit mode: update the most recent target's URL
                await trackerService.updateTrackingTarget(existingTargets[0].id, {
                  status_url: newUrl,
                });
              } else {
                // New app: create target
                const settings = getSettings();
                await trackerService.createTrackingTarget({
                  application_id: savedApp.id,
                  status_url: newUrl,
                  check_frequency: settings.checkFrequency,
                });
              }
            }
            // If exact match exists, no-op
          }
        } else if (application) {
          // status_url was cleared in edit mode - only delete targets that match the OLD url
          const oldUrl = application.status_url?.trim();
          if (oldUrl) {
            const targetsToDelete = existingTargets.filter((t) => t.status_url === oldUrl);
            await Promise.all(
              targetsToDelete.map((t) => trackerService.deleteTrackingTarget(t.id))
            );
          }
        }
      } catch (err) {
        console.error("Failed to sync tracking target:", err);
      }

      onClose();
    } catch (e) {
      console.error("Failed to save:", e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-auto">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">
            {application ? "编辑求职记录" : "新建求职记录"}
          </h2>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">公司名称 *</label>
              <input
                name="company_name"
                value={form.company_name}
                onChange={handleChange}
                required
                placeholder="例如：字节跳动"
                className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-500/20 focus:border-stone-400 focus:bg-white transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">岗位名称 *</label>
              <input
                name="job_title"
                value={form.job_title}
                onChange={handleChange}
                required
                placeholder="例如：前端工程师"
                className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-500/20 focus:border-stone-400 focus:bg-white transition-all"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">工作地点</label>
              <input
                name="location"
                value={form.location}
                onChange={handleChange}
                placeholder="例如：北京"
                className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-500/20 focus:border-stone-400 focus:bg-white transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">薪资范围</label>
              <input
                name="salary_range"
                value={form.salary_range}
                onChange={handleChange}
                placeholder="例如：25-40K"
                className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-500/20 focus:border-stone-400 focus:bg-white transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">JD 链接</label>
            <div className="flex gap-2">
              <input
                name="job_url"
                value={form.job_url}
                onChange={handleChange}
                placeholder="https://..."
                className="flex-1 px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-500/20 focus:border-stone-400 focus:bg-white transition-all"
              />
              <button
                type="button"
                onClick={handleFetchUrl}
                disabled={fetchingUrl || !form.job_url?.trim()}
                className="px-3 py-2.5 bg-stone-50 text-stone-700 rounded-xl text-sm hover:bg-stone-100 disabled:opacity-50 transition-colors flex items-center gap-1.5"
              >
                {fetchingUrl ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Link className="w-4 h-4" />
                )}
                识别
              </button>
            </div>
            {urlError && <p className="text-xs text-red-500 mt-1.5">{urlError}</p>}
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">状态页 URL</label>
            <input
              name="status_url"
              value={form.status_url}
              onChange={handleChange}
              placeholder="https://... 用于自动检查申请状态"
              className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-500/20 focus:border-stone-400 focus:bg-white transition-all"
            />
            <p className="text-[11px] text-gray-400 mt-1">填写后将自动创建监控目标</p>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">状态</label>
              <select
                name="status"
                value={form.status}
                onChange={handleChange}
                className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-500/20 focus:border-stone-400 focus:bg-white transition-all appearance-none cursor-pointer"
              >
                {ALL_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">优先级</label>
              <select
                name="priority"
                value={form.priority}
                onChange={handleChange}
                className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-500/20 focus:border-stone-400 focus:bg-white transition-all appearance-none cursor-pointer"
              >
                <option value="low">低</option>
                <option value="medium">中</option>
                <option value="high">高</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">来源</label>
              <select
                name="source"
                value={form.source}
                onChange={handleChange}
                className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-500/20 focus:border-stone-400 focus:bg-white transition-all appearance-none cursor-pointer"
              >
                <option value="official">官网</option>
                <option value="email">邮件</option>
                <option value="referral">内推</option>
                <option value="linkedin">LinkedIn</option>
                <option value="boss">Boss直聘</option>
                <option value="manual">手动</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">投递日期</label>
            <input
              name="applied_at"
              type="date"
              value={form.applied_at}
              onChange={handleChange}
              className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-500/20 focus:border-stone-400 focus:bg-white transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">备注</label>
            <textarea
              name="notes"
              value={form.notes}
              onChange={handleChange}
              rows={3}
              placeholder="添加备注信息..."
              className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-500/20 focus:border-stone-400 focus:bg-white transition-all resize-none"
            />
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-xl transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2.5 bg-stone-900 text-white rounded-xl text-sm font-medium hover:bg-stone-800 disabled:opacity-50 transition-all shadow-sm"
            >
              {saving ? "保存中..." : "保存"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
