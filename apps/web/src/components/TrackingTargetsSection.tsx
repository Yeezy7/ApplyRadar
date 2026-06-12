import { useState } from "react";
import { Plus, X, Play, ShieldCheck, AlertTriangle, Clock3, Trash2, RefreshCw } from "lucide-react";
import type { TrackingTarget, TrackingRun, ApplicationStatus } from "@applyradar/shared";
import { STATUS_LABELS, STATUS_COLORS, LOGIN_STATE_LABELS, LOGIN_STATE_COLORS } from "@applyradar/shared";
import { createTrackingTarget, deleteTrackingTarget, createTrackingRun } from "../services/trackingService";

interface Props {
  targets: TrackingTarget[];
  runs: Map<string, TrackingRun[]>;
  applicationId: string;
  onRefresh: () => void;
  onLoadRuns: (targetId: string) => void;
}

function getStatusLabel(s: string) {
  return STATUS_LABELS[s as ApplicationStatus] || s;
}

function getStatusColor(s: string) {
  return STATUS_COLORS[s as ApplicationStatus] || STATUS_COLORS.unknown;
}

function getLoginStateIcon(state: string) {
  switch (state) {
    case "valid":
      return <ShieldCheck className="w-4 h-4 text-green-500" />;
    case "expired":
    case "blocked":
      return <AlertTriangle className="w-4 h-4 text-red-500" />;
    default:
      return <Clock3 className="w-4 h-4 text-gray-400" />;
  }
}

export default function TrackingTargetsSection({ targets, runs, applicationId, onRefresh, onLoadRuns }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [targetUrl, setTargetUrl] = useState("");
  const [targetError, setTargetError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [checking, setChecking] = useState<string | null>(null);
  const [checkResults, setCheckResults] = useState<Map<string, { success: boolean; message: string }>>(new Map());

  const handleCreate = async () => {
    if (!targetUrl.trim()) return;
    try {
      new URL(targetUrl);
    } catch {
      setTargetError("请输入有效的 URL");
      return;
    }
    setSubmitting(true);
    setTargetError("");

    try {
      await createTrackingTarget({
        application_id: applicationId,
        status_url: targetUrl.trim(),
      });
      setShowForm(false);
      setTargetUrl("");
      onRefresh();
    } catch (e) {
      setTargetError(`创建失败: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (targetId: string) => {
    if (!window.confirm("确定要删除这个监控目标吗？")) return;

    try {
      await deleteTrackingTarget(targetId);
      onRefresh();
    } catch (e) {
      console.error("Failed to delete target:", e);
    }
  };

  const handleCheck = async (target: TrackingTarget) => {
    setChecking((prev) => (prev === target.id ? prev : target.id));
    setCheckResults((prev) => {
      const next = new Map(prev);
      next.delete(target.id);
      return next;
    });

    try {
      await createTrackingRun(target.id);
      setCheckResults((prev) => {
        const next = new Map(prev);
        next.set(target.id, { success: true, message: "检查完成" });
        return next;
      });
      onRefresh();
      onLoadRuns(target.id);
    } catch (e) {
      setCheckResults((prev) => {
        const next = new Map(prev);
        next.set(target.id, { success: false, message: `检查失败: ${e}` });
        return next;
      });
    } finally {
      setChecking(null);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-6 mb-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">监控目标</h2>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-stone-700 dark:text-stone-300 bg-stone-50 dark:bg-stone-800 hover:bg-stone-100 dark:hover:bg-stone-700 rounded-lg transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          添加状态页
        </button>
      </div>

      {targets.length === 0 ? (
        <p className="text-sm text-gray-400 py-4">暂无监控目标，点击"添加状态页"开始追踪</p>
      ) : (
        <div className="space-y-3">
          {targets.map((t) => {
            const isChecking = checking === t.id;
            const result = checkResults.get(t.id);
            const targetRuns = runs.get(t.id) || [];
            return (
              <div key={t.id}>
                <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900 rounded-xl">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900 dark:text-white">{t.domain}</span>
                      <span className="text-xs text-gray-400">{t.ats_type}</span>
                      {t.current_status !== "unknown" && (
                        <span className={`text-xs px-1.5 py-0.5 rounded ${getStatusColor(t.current_status)}`}>
                          {getStatusLabel(t.current_status)}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-400 truncate mt-0.5">{t.status_url}</div>
                    <div className="flex items-center gap-3 mt-1">
                      <div className="flex items-center gap-1">
                        {getLoginStateIcon(t.login_state)}
                        <span className={`text-xs ${LOGIN_STATE_COLORS[t.login_state as keyof typeof LOGIN_STATE_COLORS] || ""}`}>
                          {LOGIN_STATE_LABELS[t.login_state as keyof typeof LOGIN_STATE_LABELS] || t.login_state}
                        </span>
                      </div>
                      <span className="text-xs text-gray-400">
                        {t.last_checked_at ? `上次检查: ${new Date(t.last_checked_at).toLocaleString("zh-CN")}` : "从未检查"}
                      </span>
                    </div>
                    {t.last_error && (
                      <p className="text-xs text-red-500 mt-1 truncate">{t.last_error}</p>
                    )}
                    {result && (
                      <div className={`text-xs mt-1.5 ${result.success ? "text-green-600" : "text-red-500"}`}>
                        {result.message}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 ml-3">
                    <button
                      onClick={() => handleCheck(t)}
                      disabled={isChecking}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-stone-700 dark:text-stone-300 bg-stone-50 dark:bg-stone-800 hover:bg-stone-100 dark:hover:bg-stone-700 rounded-lg disabled:opacity-50 transition-colors"
                    >
                      {isChecking ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                      检查
                    </button>
                    <button
                      onClick={() => handleDelete(t.id)}
                      className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
                {targetRuns.length > 0 && (
                  <div className="mt-1.5 ml-3 text-xs text-gray-400">
                    最近: {targetRuns[0].status === "success" ? "成功" : "失败"}
                    {targetRuns[0].normalized_status && ` · ${getStatusLabel(targetRuns[0].normalized_status)}`}
                    {targetRuns[0].confidence != null && ` · ${Math.round(targetRuns[0].confidence * 100)}%`}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-900 rounded-xl">
          <div className="flex items-center gap-2">
            <input
              type="url"
              value={targetUrl}
              onChange={(e) => { setTargetUrl(e.target.value); setTargetError(""); }}
              placeholder="https://... 状态页 URL"
              className="flex-1 px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-stone-500/20 focus:border-stone-400 dark:text-white"
              autoFocus
            />
            <button
              onClick={handleCreate}
              disabled={submitting || !targetUrl.trim()}
              className="px-4 py-2 bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 rounded-lg text-sm font-medium hover:bg-stone-800 dark:hover:bg-stone-200 disabled:opacity-50 transition-colors"
            >
              {submitting ? "添加中..." : "添加"}
            </button>
            <button
              onClick={() => { setShowForm(false); setTargetUrl(""); setTargetError(""); }}
              className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          {targetError && <p className="text-xs text-red-500 mt-2">{targetError}</p>}
        </div>
      )}
    </div>
  );
}
