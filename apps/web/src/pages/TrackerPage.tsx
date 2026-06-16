import { Fragment, useEffect, useState, useCallback } from "react";
import { Play, RefreshCw, AlertTriangle, ShieldCheck, Clock3, History, ChevronDown, ChevronUp, CheckCircle2, Mail } from "lucide-react";
import type { Application, ApplicationStatus, LoginState, TrackingTarget, TrackingRun } from "@applyradar/shared";
import {
  STATUS_LABELS,
  STATUS_COLORS,
  LOGIN_STATE_LABELS,
  LOGIN_STATE_COLORS,
} from "@applyradar/shared";
import {
  listTrackingTargets,
  listTrackingRuns,
  triggerCheckTarget,
} from "../services/trackingService";
import { listApplications } from "../services/applicationService";
import {
  getSchedulerStatus,
  triggerAutoCheck,
  triggerEmailReport,
  type SchedulerStatus,
} from "../services/schedulerService";

const formatTime = (isoStr: string | null) => {
  if (!isoStr) return "-";
  const d = new Date(isoStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "刚刚";
  if (diffMin < 60) return `${diffMin} 分钟前`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} 小时前`;
  return d.toLocaleDateString("zh-CN");
};

export default function TrackerPage() {
  const [targets, setTargets] = useState<TrackingTarget[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState<Set<string>>(new Set());
  const [results, setResults] = useState<Map<string, { success: boolean; message: string }>>(new Map());
  const [expandedTarget, setExpandedTarget] = useState<string | null>(null);
  const [targetRuns, setTargetRuns] = useState<Map<string, TrackingRun[]>>(new Map());
  const [applications, setApplications] = useState<Map<string, Application>>(new Map());
  const [summaryResult, setSummaryResult] = useState<{ success: boolean; message: string } | null>(null);
  const [schedulerStatus, setSchedulerStatus] = useState<SchedulerStatus | null>(null);
  const [runningAutoCheck, setRunningAutoCheck] = useState(false);
  const [sendingReport, setSendingReport] = useState(false);

  const loadTargets = useCallback(async () => {
    setLoading(true);
    try {
      const [data, apps] = await Promise.all([
        listTrackingTargets(),
        listApplications(),
      ]);
      setTargets(data);
      setApplications(new Map(apps.map((app) => [app.id, app])));
    } catch (e) {
      console.error("Failed to load targets:", e);
      setSummaryResult({ success: false, message: `加载监控目标失败: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSchedulerStatus = useCallback(async () => {
    try {
      const status = await getSchedulerStatus();
      setSchedulerStatus(status);
    } catch (e) {
      console.error("Failed to load scheduler status:", e);
    }
  }, []);

  useEffect(() => {
    loadTargets();
    loadSchedulerStatus();
    // 每 30 秒刷新定时任务状态
    const timer = setInterval(loadSchedulerStatus, 30000);
    return () => clearInterval(timer);
  }, [loadTargets, loadSchedulerStatus]);

  const handleCheckSingle = async (target: TrackingTarget) => {
    setChecking((prev) => new Set(prev).add(target.id));
    setResults((prev) => {
      const next = new Map(prev);
      next.delete(target.id);
      return next;
    });

    try {
      await triggerCheckTarget(target.id);
      setResults((prev) => {
        const next = new Map(prev);
        next.set(target.id, { success: true, message: "检查任务已入队" });
        return next;
      });
      // 延迟刷新，等 worker 完成检查
      setTimeout(async () => {
        await loadTargets();
        await loadTargetRuns(target.id);
      }, 3000);
    } catch (e) {
      const message = `检查失败: ${e instanceof Error ? e.message : String(e)}`;
      setResults((prev) => {
        const next = new Map(prev);
        next.set(target.id, { success: false, message });
        return next;
      });
    } finally {
      setChecking((prev) => {
        const next = new Set(prev);
        next.delete(target.id);
        return next;
      });
    }
  };

  const handleCheckAll = async () => {
    setRunningAutoCheck(true);
    setSummaryResult(null);

    try {
      const result = await triggerAutoCheck();
      setSummaryResult({
        success: result.failed === 0,
        message: `手动检查完成：${result.success} 成功，${result.failed} 失败`,
      });
      await loadTargets();
      await loadSchedulerStatus();
    } catch (e) {
      setSummaryResult({ success: false, message: `检查失败: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setRunningAutoCheck(false);
    }
  };

  const handleSendReport = async () => {
    setSendingReport(true);
    try {
      const result = await triggerEmailReport();
      setSummaryResult(result);
      await loadSchedulerStatus();
    } catch (e) {
      setSummaryResult({ success: false, message: `发送失败: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setSendingReport(false);
    }
  };

  const getLoginStateIcon = (state: string) => {
    switch (state) {
      case "valid":
        return <ShieldCheck className="w-4 h-4 text-green-500" />;
      case "expired":
      case "blocked":
        return <AlertTriangle className="w-4 h-4 text-red-500" />;
      default:
        return <Clock3 className="w-4 h-4 text-gray-400" />;
    }
  };

  const loadTargetRuns = async (targetId: string) => {
    try {
      const runs = await listTrackingRuns(targetId);
      setTargetRuns((prev) => {
        const next = new Map(prev);
        next.set(targetId, runs);
        return next;
      });
    } catch (e) {
      console.error("Failed to load tracking runs:", e);
    }
  };

  const toggleExpand = (targetId: string) => {
    if (expandedTarget === targetId) {
      setExpandedTarget(null);
    } else {
      setExpandedTarget(targetId);
      if (!targetRuns.has(targetId)) {
        loadTargetRuns(targetId);
      }
    }
  };

  const invalidLoginTargets = targets.filter((target) =>
    ["expired", "blocked", "captcha_required", "mfa_required"].includes(target.login_state)
  ).length;
  const failedTargets = targets.filter((target) => !!target.last_error).length;
  const enabledTargets = targets.filter((target) => target.enabled).length;

  const statusLabel = (status?: string | null) =>
    status ? STATUS_LABELS[status as ApplicationStatus] || status : "-";

  const loginLabel = (state?: string | null) =>
    state ? LOGIN_STATE_LABELS[state as LoginState] || state : "-";

  const confidenceLabel = (confidence?: number) =>
    typeof confidence === "number" ? `${Math.round(confidence * 100)}%` : "-";

  return (
    <div className="px-4 pb-4 pt-2">
      {/* Header */}
      <div className="mb-3 flex items-center justify-end gap-2">
        <button
          onClick={handleSendReport}
          disabled={sendingReport}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-stone-700 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50 transition-all"
        >
          <Mail className={`w-4 h-4 ${sendingReport ? "animate-pulse" : ""}`} />
          {sendingReport ? "发送中..." : "发送日报"}
        </button>
        <button
          onClick={handleCheckAll}
          disabled={runningAutoCheck || checking.size > 0}
          className="flex items-center gap-2 px-4 py-2 bg-stone-900 text-white rounded-lg text-sm font-medium hover:bg-stone-800 disabled:opacity-50 transition-all shadow-sm"
        >
          {runningAutoCheck ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <Play className="w-4 h-4" />
          )}
          {runningAutoCheck ? "检查中..." : "检查全部"}
        </button>
      </div>

      {/* Scheduler Status */}
      {schedulerStatus && (
        <div className="mb-4 flex items-center justify-between gap-4 px-4 py-3 bg-white border border-gray-200 rounded-lg text-sm">
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              {schedulerStatus.autoCheck.isRunning ? (
                <RefreshCw className="w-4 h-4 text-blue-500 animate-spin" />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-green-500" />
              )}
              <span className="font-medium text-gray-700">
                自动检查: {schedulerStatus.autoCheck.isRunning ? "执行中" : "已启用"}
              </span>
            </div>
            <span className="text-gray-300">|</span>
            <span className="text-gray-500">
              上次: {formatTime(schedulerStatus.autoCheck.lastRunAt)}
            </span>
            {schedulerStatus.autoCheck.lastResult && (
              <>
                <span className="text-gray-300">|</span>
                <span className="text-gray-500">{schedulerStatus.autoCheck.lastResult}</span>
              </>
            )}
          </div>
        </div>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <div className="rounded-xl border border-gray-100 bg-white px-4 py-3">
          <div className="text-xs text-gray-400">启用目标</div>
          <div className="mt-1 text-2xl font-semibold text-gray-900">{enabledTargets}</div>
        </div>
        <div className="rounded-xl border border-gray-100 bg-white px-4 py-3">
          <div className="text-xs text-gray-400">登录待处理</div>
          <div className={`mt-1 text-2xl font-semibold ${invalidLoginTargets > 0 ? "text-amber-600" : "text-gray-900"}`}>
            {invalidLoginTargets}
          </div>
        </div>
        <div className="rounded-xl border border-gray-100 bg-white px-4 py-3">
          <div className="text-xs text-gray-400">失败或错误</div>
          <div className={`mt-1 text-2xl font-semibold ${failedTargets > 0 ? "text-red-600" : "text-gray-900"}`}>
            {failedTargets}
          </div>
        </div>
        <div className="rounded-xl border border-gray-100 bg-white px-4 py-3">
          <div className="text-xs text-gray-400">总目标</div>
          <div className="mt-1 text-2xl font-semibold text-gray-900">{targets.length}</div>
        </div>
      </div>

      {summaryResult && (
        <div className={`mb-4 rounded-lg border px-4 py-3 text-sm ${
          summaryResult.success
            ? "border-emerald-100 bg-emerald-50 text-emerald-700"
            : "border-red-100 bg-red-50 text-red-700"
        }`}>
          {summaryResult.message}
        </div>
      )}

      {/* Target list */}
      <div className="overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-sm">
        <table className="w-full min-w-[920px]">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="whitespace-nowrap px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-400">投递</th>
              <th className="whitespace-nowrap px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-400">状态页</th>
              <th className="whitespace-nowrap px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-400">当前状态</th>
              <th className="whitespace-nowrap px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-400">登录状态</th>
              <th className="hidden whitespace-nowrap px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-400 xl:table-cell">检查频率</th>
              <th className="whitespace-nowrap px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-400">上次检查</th>
              <th className="whitespace-nowrap px-4 py-3.5 text-right text-xs font-semibold uppercase tracking-wider text-gray-400">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-400 text-sm">
                  加载中...
                </td>
              </tr>
            ) : targets.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-400 text-sm">
                  暂无监控目标。在求职记录中添加状态页 URL 后，目标将自动出现在这里。
                </td>
              </tr>
            ) : (
              targets.map((target) => {
                const isChecking = checking.has(target.id);
                const result = results.get(target.id);
                const app = applications.get(target.application_id);
                const runs = targetRuns.get(target.id) || [];
                return (
                  <Fragment key={target.id}>
                    <tr className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="text-sm font-medium text-gray-900">
                          {app?.company_name || target.domain}
                        </div>
                        <div className="mt-0.5 max-w-[180px] truncate text-xs text-gray-400">
                          {app?.job_title || target.ats_type}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <a
                          href={target.status_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block max-w-[220px] truncate text-sm text-stone-700 hover:underline"
                        >
                          {target.status_url}
                        </a>
                        <div className="mt-0.5 text-xs text-gray-400">{target.domain}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block whitespace-nowrap px-2 py-0.5 rounded-full text-xs font-medium ${
                            STATUS_COLORS[target.current_status as keyof typeof STATUS_COLORS] || STATUS_COLORS.unknown
                          }`}
                        >
                          {STATUS_LABELS[target.current_status as keyof typeof STATUS_LABELS] || target.current_status}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          {getLoginStateIcon(target.login_state)}
                          <span
                            className={`text-xs font-medium ${
                              LOGIN_STATE_COLORS[target.login_state as keyof typeof LOGIN_STATE_COLORS] || ""
                            }`}
                          >
                            {LOGIN_STATE_LABELS[target.login_state as keyof typeof LOGIN_STATE_LABELS] || target.login_state}
                          </span>
                        </div>
                      </td>
                      <td className="hidden whitespace-nowrap px-4 py-3 text-sm text-gray-500 xl:table-cell">
                        {target.check_frequency === "manual" ? "手动" :
                         target.check_frequency === "daily" ? "每天" :
                         target.check_frequency === "every_12h" ? "每12小时" :
                         target.check_frequency === "every_6h" ? "每6小时" :
                         target.check_frequency}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {target.last_checked_at
                          ? new Date(target.last_checked_at).toLocaleString("zh-CN")
                          : "从未检查"}
                        {target.last_error && (
                          <div className="mt-0.5 max-w-[180px] truncate text-xs text-red-500">
                            {target.last_error}
                          </div>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => toggleExpand(target.id)}
                            className="flex items-center gap-1 px-2 py-1.5 text-xs text-gray-500 hover:text-stone-700 rounded transition-colors"
                            title="查看历史"
                          >
                            <History className="w-3 h-3" />
                            {expandedTarget === target.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                          </button>
                          <button
                            onClick={() => handleCheckSingle(target)}
                            disabled={isChecking}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-stone-700 bg-stone-50 rounded-md hover:bg-stone-100 disabled:opacity-50 transition-colors"
                          >
                            {isChecking ? (
                              <RefreshCw className="w-3 h-3 animate-spin" />
                            ) : (
                              <Play className="w-3 h-3" />
                            )}
                            {isChecking ? "检查中" : "检查"}
                          </button>
                        </div>
                        {result && (
                          <div className={`text-xs mt-1 ${result.success ? "text-green-600" : "text-red-600"}`}>
                            {result.message}
                          </div>
                        )}
                      </td>
                    </tr>
                    {expandedTarget === target.id && (
                      <tr className="border-b border-gray-100 bg-stone-50/60">
                        <td colSpan={7} className="px-5 py-4">
                          <div className="mb-3 flex items-center justify-between">
                            <div className="text-xs font-semibold text-gray-500">最近检查历史</div>
                            <button
                              onClick={() => loadTargetRuns(target.id)}
                              className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-gray-500 hover:bg-white hover:text-stone-700"
                            >
                              <RefreshCw className="h-3 w-3" />
                              刷新
                            </button>
                          </div>
                          {runs.length === 0 ? (
                            <div className="rounded-lg border border-dashed border-gray-200 bg-white px-4 py-5 text-center text-sm text-gray-400">
                              暂无检查历史
                            </div>
                          ) : (
                            <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
                              <table className="w-full min-w-[760px]">
                                <thead>
                                  <tr className="border-b border-gray-100 bg-gray-50">
                                    <th className="whitespace-nowrap px-3 py-2 text-left text-xs font-medium text-gray-400">时间</th>
                                    <th className="whitespace-nowrap px-3 py-2 text-left text-xs font-medium text-gray-400">结果</th>
                                    <th className="whitespace-nowrap px-3 py-2 text-left text-xs font-medium text-gray-400">登录</th>
                                    <th className="whitespace-nowrap px-3 py-2 text-left text-xs font-medium text-gray-400">识别状态</th>
                                    <th className="whitespace-nowrap px-3 py-2 text-left text-xs font-medium text-gray-400">置信度</th>
                                    <th className="whitespace-nowrap px-3 py-2 text-left text-xs font-medium text-gray-400">说明</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {runs.slice(0, 6).map((run) => (
                                    <tr key={run.id} className="border-b border-gray-50 last:border-0">
                                      <td className="px-3 py-2 text-xs text-gray-500">
                                        {new Date(run.created_at).toLocaleString("zh-CN")}
                                      </td>
                                      <td className="px-3 py-2">
                                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                                          run.status === "success"
                                            ? "bg-emerald-50 text-emerald-700"
                                            : run.status === "login_expired"
                                              ? "bg-amber-50 text-amber-700"
                                              : "bg-red-50 text-red-700"
                                        }`}>
                                          {run.status === "success" ? "成功" : run.status === "login_expired" ? "登录问题" : "失败"}
                                        </span>
                                      </td>
                                      <td className="px-3 py-2 text-xs text-gray-500">{loginLabel(run.login_state)}</td>
                                      <td className="px-3 py-2 text-xs text-gray-500">{statusLabel(run.normalized_status)}</td>
                                      <td className="px-3 py-2 text-xs text-gray-500">{confidenceLabel(run.confidence)}</td>
                                      <td className="max-w-[260px] truncate px-3 py-2 text-xs text-gray-500">
                                        {run.error_message || run.raw_status || (run.ai_used ? "AI 已解析" : "页面已读取")}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
