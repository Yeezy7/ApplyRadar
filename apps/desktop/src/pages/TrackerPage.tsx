import { Fragment, useEffect, useState, useCallback } from "react";
import { Play, RefreshCw, AlertTriangle, ShieldCheck, Clock3, ExternalLink, CheckCircle2, XCircle, History, ChevronDown, ChevronUp } from "lucide-react";
import type { Application, ApplicationStatus, LoginState, TrackingTarget, TrackingRun } from "@applyradar/shared";
import {
  STATUS_LABELS,
  STATUS_COLORS,
  LOGIN_STATE_LABELS,
  LOGIN_STATE_COLORS,
} from "@applyradar/shared";
import {
  trackerService,
  sidecarService,
  notificationService,
  applicationService,
} from "../services";

export default function TrackerPage() {
  const [targets, setTargets] = useState<TrackingTarget[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState<Set<string>>(new Set());
  const [results, setResults] = useState<Map<string, { success: boolean; message: string }>>(new Map());
  const [autoCheckStatus, setAutoCheckStatus] = useState<trackerService.AutoCheckStatus | null>(null);
  const [expandedTarget, setExpandedTarget] = useState<string | null>(null);
  const [targetRuns, setTargetRuns] = useState<Map<string, TrackingRun[]>>(new Map());
  const [applications, setApplications] = useState<Map<string, Application>>(new Map());
  const [runningAutoCheck, setRunningAutoCheck] = useState(false);
  const [resettingAutoCheck, setResettingAutoCheck] = useState(false);
  const [summaryResult, setSummaryResult] = useState<{ success: boolean; message: string } | null>(null);
  const [openingLoginTargetId, setOpeningLoginTargetId] = useState<string | null>(null);

  const loadTargets = useCallback(async () => {
    setLoading(true);
    try {
      const [data, apps] = await Promise.all([
        trackerService.listTrackingTargets(),
        applicationService.listApplications(),
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

  const loadAutoCheckStatus = useCallback(async () => {
    try {
      const status = await trackerService.getAutoCheckStatus();
      setAutoCheckStatus(status);
    } catch (e) {
      console.error("Failed to load auto-check status:", e);
      setSummaryResult({ success: false, message: `加载自动检查状态失败: ${e instanceof Error ? e.message : String(e)}` });
    }
  }, []);

  useEffect(() => {
    loadTargets();
    loadAutoCheckStatus();
    // Refresh auto-check status every 30 seconds
    const timer = setInterval(loadAutoCheckStatus, 30000);
    return () => clearInterval(timer);
  }, [loadTargets, loadAutoCheckStatus]);

  const handleCheckSingle = async (target: TrackingTarget, refreshAfter: boolean = true): Promise<boolean> => {
    setChecking((prev) => new Set(prev).add(target.id));
    setResults((prev) => {
      const next = new Map(prev);
      next.delete(target.id);
      return next;
    });

    try {
      const result = await trackerService.runTrackingTargetCheck(target.id);
      const item = result.items.find((entry) => entry.targetId === target.id);
      const success = item?.success ?? result.failed === 0;
      const message = item?.message || (success ? "检查完成" : "检查失败");
      setResults((prev) => {
        const next = new Map(prev);
        next.set(target.id, { success, message });
        return next;
      });
      setSummaryResult({
        success: result.failed === 0,
        message: `检查完成：${result.success} 成功，${result.failed} 失败${result.statusChanges > 0 ? `，${result.statusChanges} 状态变更` : ""}${result.loginIssues > 0 ? `，${result.loginIssues} 登录问题` : ""}`,
      });
      if (refreshAfter) {
        await loadTargets();
        await loadAutoCheckStatus();
        await loadTargetRuns(target.id);
      }
      return success;
    } catch (e) {
      const message = `检查失败: ${e instanceof Error ? e.message : String(e)}`;
      setResults((prev) => {
        const next = new Map(prev);
        next.set(target.id, { success: false, message });
        return next;
      });
      setSummaryResult({ success: false, message });
      if (refreshAfter) {
        await loadTargets();
        await loadAutoCheckStatus();
        await loadTargetRuns(target.id);
      }
      return false;
    } finally {
      setChecking((prev) => {
        const next = new Set(prev);
        next.delete(target.id);
        return next;
      });
    }
  };

  const handleCheckAll = async () => {
    // Check all enabled targets
    const targetsToCheck = targets.filter((t) => t.enabled);

    if (targetsToCheck.length === 0) {
      setResults(new Map([["none", { success: true, message: "没有启用的监控目标" }]]));
      setSummaryResult({ success: true, message: "没有启用的监控目标" });
      return;
    }

    setChecking(new Set(targetsToCheck.map((t) => t.id)));
    setResults(new Map());
    setSummaryResult(null);

    try {
      const result = await trackerService.runTrackingTargetsCheck(
        targetsToCheck.map((target) => target.id)
      );
      const nextResults = new Map<string, { success: boolean; message: string }>();
      for (const item of result.items) {
        nextResults.set(item.targetId, { success: item.success, message: item.message });
      }
      setResults(nextResults);
      await notificationService.notifyCheckComplete(result.success, result.failed);
      setSummaryResult({
        success: result.failed === 0,
        message: `手动检查完成：${result.success} 成功，${result.failed} 失败${result.statusChanges > 0 ? `，${result.statusChanges} 状态变更` : ""}${result.loginIssues > 0 ? `，${result.loginIssues} 登录问题` : ""}`,
      });
      await loadTargets();
      await loadAutoCheckStatus();
      if (expandedTarget) {
        await loadTargetRuns(expandedTarget);
      }
    } catch (e) {
      const message = `手动检查失败: ${e instanceof Error ? e.message : String(e)}`;
      console.error("Manual check failed:", e);
      setSummaryResult({ success: false, message });
    } finally {
      setChecking(new Set());
    }
  };

  const handleRunAutoCheck = async () => {
    setRunningAutoCheck(true);
    setSummaryResult(null);
    try {
      const result = await trackerService.runAutoCheck(true);
      const message = result.total === 0
        ? "没有启用的监控目标"
        : `自动检查完成：检查 ${result.total} 个，${result.success} 成功，${result.failed} 失败，${result.statusChanges} 状态变更${result.loginIssues > 0 ? `，${result.loginIssues} 登录问题` : ""}`;
      setSummaryResult({ success: result.failed === 0, message });
      await notificationService.notifyCheckComplete(result.success, result.failed);
      await loadTargets();
      await loadAutoCheckStatus();
    } catch (e) {
      const message = `自动检查失败: ${e instanceof Error ? e.message : String(e)}`;
      setSummaryResult({ success: false, message });
    } finally {
      setRunningAutoCheck(false);
    }
  };

  const handleResetAutoCheck = async () => {
    setResettingAutoCheck(true);
    try {
      await trackerService.resetAutoCheck();
      setSummaryResult({ success: true, message: "已重置自动检查状态" });
      await loadAutoCheckStatus();
    } catch (e) {
      setSummaryResult({ success: false, message: `重置失败: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setResettingAutoCheck(false);
    }
  };

  const handleOpenLogin = async (target: TrackingTarget) => {
    if (openingLoginTargetId === target.id) return;
    setOpeningLoginTargetId(target.id);
    try {
      const profileDir = target.profile_dir || `profiles/${target.domain}`;
      const result = await sidecarService.openForLogin(target.status_url, profileDir);
      if (!result.success) {
        console.error("Open login failed:", result.error);
        setSummaryResult({ success: false, message: result.error || "打开登录页面失败" });
        setResults(prev => {
          const next = new Map(prev);
          next.set(target.id, { success: false, message: result.error || "打开登录页面失败" });
          return next;
        });
      } else {
        setSummaryResult({ success: true, message: "登录窗口已关闭，已尝试保存该站点登录态" });
        await loadTargets();
      }
    } catch (e) {
      console.error("Failed to open login:", e);
      setSummaryResult({ success: false, message: `打开登录页面失败: ${e instanceof Error ? e.message : String(e)}` });
      setResults(prev => {
        const next = new Map(prev);
        next.set(target.id, { success: false, message: `打开登录页面失败: ${e}` });
        return next;
      });
    } finally {
      setOpeningLoginTargetId(null);
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
      const runs = await trackerService.listTrackingRuns(targetId);
      setTargetRuns(prev => {
        const next = new Map(prev);
        next.set(targetId, runs);
        return next;
      });
    } catch (e) {
      console.error("Failed to load tracking runs:", e);
      setSummaryResult({ success: false, message: `加载检查历史失败: ${e instanceof Error ? e.message : String(e)}` });
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

  const formatNextTime = (isoStr: string | null) => {
    if (!isoStr) return "-";
    const d = new Date(isoStr);
    const now = new Date();
    const diffMs = d.getTime() - now.getTime();
    if (diffMs <= 0) return "即将执行";
    const diffMin = Math.ceil(diffMs / 60000);
    if (diffMin < 60) return `${diffMin} 分钟后`;
    const diffHour = Math.floor(diffMin / 60);
    return `${diffHour} 小时后`;
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
      <div className="mb-3 flex items-center justify-end">
        <button
          onClick={handleCheckAll}
          disabled={checking.size > 0 || runningAutoCheck || openingLoginTargetId !== null}
          className="flex items-center gap-2 px-4 py-2 bg-stone-900 text-white rounded-lg text-sm font-medium hover:bg-stone-800 disabled:opacity-50 transition-all shadow-sm"
        >
          {checking.size > 0 ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <Play className="w-4 h-4" />
          )}
          {checking.size > 0 ? "检查中..." : "检查全部"}
        </button>
      </div>

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

      {/* Auto-check status bar */}
      {autoCheckStatus && (
        <div className="mb-4 flex items-center justify-between gap-4 px-4 py-3 bg-white border border-gray-200 rounded-lg text-sm">
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              {autoCheckStatus.isRunning || runningAutoCheck ? (
                <RefreshCw className="w-4 h-4 text-blue-500 animate-spin" />
              ) : autoCheckStatus.enabled ? (
                <CheckCircle2 className="w-4 h-4 text-green-500" />
              ) : (
                <XCircle className="w-4 h-4 text-gray-400" />
              )}
              <span className="font-medium text-gray-700">
                自动检查: {autoCheckStatus.isRunning || runningAutoCheck ? "执行中" : autoCheckStatus.enabled ? "已启用" : "已禁用"}
              </span>
            </div>
            {autoCheckStatus.enabled && !autoCheckStatus.isRunning && (
              <>
                <span className="text-gray-300">|</span>
                <span className="text-gray-500">
                  上次: {formatTime(autoCheckStatus.lastRunAt)}
                </span>
                <span className="text-gray-300">|</span>
                <span className="text-gray-500">
                  下次: {formatNextTime(autoCheckStatus.nextRunAt)}
                </span>
              </>
            )}
            {autoCheckStatus.lastResult && (
              <>
                <span className="text-gray-300">|</span>
                <span className="text-gray-500">{autoCheckStatus.lastResult}</span>
              </>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {autoCheckStatus.isRunning && !runningAutoCheck && (
              <button
                onClick={handleResetAutoCheck}
                disabled={resettingAutoCheck}
                className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
              >
                {resettingAutoCheck ? "重置中..." : "重置状态"}
              </button>
            )}
            <button
              onClick={handleRunAutoCheck}
              disabled={runningAutoCheck || checking.size > 0 || autoCheckStatus.isRunning}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${runningAutoCheck ? "animate-spin" : ""}`} />
              立即自动检查
            </button>
          </div>
        </div>
      )}

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
                const isOpeningLogin = openingLoginTargetId === target.id;
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
                            onClick={() => handleOpenLogin(target)}
                            disabled={isOpeningLogin}
                            className="flex items-center gap-1 px-2 py-1.5 text-xs text-gray-500 hover:text-stone-700 rounded transition-colors disabled:opacity-50"
                            title="打开登录"
                          >
                            <ExternalLink className="w-3 h-3" />
                            {isOpeningLogin ? "打开中" : "登录"}
                          </button>
                          <button
                            onClick={() => handleCheckSingle(target)}
                            disabled={isChecking || runningAutoCheck || openingLoginTargetId !== null}
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
