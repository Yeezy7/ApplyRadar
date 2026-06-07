import { useEffect, useState, useCallback } from "react";
import { Play, RefreshCw, AlertTriangle, ShieldCheck, Clock3, ExternalLink, CheckCircle2, XCircle, History, ChevronDown, ChevronUp } from "lucide-react";
import type { TrackingTarget, TrackingRun } from "@applyradar/shared";
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
} from "../services";
import {
  processSidecarCheckException,
  processSidecarCheckResult,
} from "../services/checkWorkflowService";

export default function TrackerPage() {
  const [targets, setTargets] = useState<TrackingTarget[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState<Set<string>>(new Set());
  const [results, setResults] = useState<Map<string, { success: boolean; message: string }>>(new Map());
  const [autoCheckStatus, setAutoCheckStatus] = useState<trackerService.AutoCheckStatus | null>(null);
  const [expandedTarget, setExpandedTarget] = useState<string | null>(null);
  const [targetRuns, setTargetRuns] = useState<Map<string, TrackingRun[]>>(new Map());

  const loadTargets = useCallback(async () => {
    setLoading(true);
    try {
      const data = await trackerService.listTrackingTargets();
      setTargets(data);
    } catch (e) {
      console.error("Failed to load targets:", e);
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
    }
  }, []);

  useEffect(() => {
    loadTargets();
    loadAutoCheckStatus();
    // Refresh auto-check status every 30 seconds
    const timer = setInterval(loadAutoCheckStatus, 30000);
    return () => clearInterval(timer);
  }, [loadTargets, loadAutoCheckStatus]);

  const handleCheckSingle = async (target: TrackingTarget): Promise<boolean> => {
    setChecking((prev) => new Set(prev).add(target.id));
    setResults((prev) => {
      const next = new Map(prev);
      next.delete(target.id);
      return next;
    });

    try {
      const profileDir = target.profile_dir || `profiles/${target.domain}`;
      const res = await sidecarService.runCheck(target.id, target.status_url, profileDir);
      const result = await processSidecarCheckResult(target, res);
      setResults((prev) => {
        const next = new Map(prev);
        next.set(target.id, { success: result.success, message: result.message });
        return next;
      });
      return result.success;
    } catch (e) {
      const result = await processSidecarCheckException(target, e);
      setResults((prev) => {
        const next = new Map(prev);
        next.set(target.id, { success: false, message: result.message });
        return next;
      });
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
      return;
    }

    setChecking(new Set(targetsToCheck.map((t) => t.id)));
    setResults(new Map());

    // Group targets by domain for batch checking
    const targetsByDomain = new Map<string, TrackingTarget[]>();
    for (const target of targetsToCheck) {
      const domain = target.domain;
      if (!targetsByDomain.has(domain)) {
        targetsByDomain.set(domain, []);
      }
      targetsByDomain.get(domain)!.push(target);
    }

    let successCount = 0;
    let failCount = 0;

    // Process each domain as a batch
    for (const [domain, domainTargets] of targetsByDomain) {
      const profileDir = domainTargets[0].profile_dir || `profiles/${domain}`;

      try {
        // Use batch check for multiple targets on same domain
        if (domainTargets.length > 1) {
          const batchTargets = domainTargets.map(t => ({
            targetId: t.id,
            statusUrl: t.status_url,
          }));

          const batchResult = await sidecarService.runBatchCheck(domain, profileDir, batchTargets);

          for (const res of batchResult.results) {
            const target = domainTargets.find(t => t.id === res.targetId);
            if (!target) continue;

            const result = await processSidecarCheckResult(target, res);
            setResults(prev => {
              const next = new Map(prev);
              next.set(target.id, { success: result.success, message: result.message });
              return next;
            });

            if (result.success) {
              successCount++;
            } else {
              failCount++;
            }
          }
        } else {
          // Single target - use regular check
          const target = domainTargets[0];
          const ok = await handleCheckSingle(target);
          if (ok) successCount++;
          else failCount++;
        }
      } catch (e) {
        console.error(`Batch check failed for domain ${domain}:`, e);
        for (const target of domainTargets) {
          const result = await processSidecarCheckException(target, e);
          setResults(prev => {
            const next = new Map(prev);
            next.set(target.id, { success: false, message: result.message });
            return next;
          });
          failCount++;
        }
      }

      // Remove completed targets from checking set
      setChecking(prev => {
        const next = new Set(prev);
        for (const t of domainTargets) {
          next.delete(t.id);
        }
        return next;
      });
    }

    await notificationService.notifyCheckComplete(successCount, failCount);
    await loadTargets();
  };

  const handleOpenLogin = async (target: TrackingTarget) => {
    try {
      const profileDir = target.profile_dir || `profiles/${target.domain}`;
      const result = await sidecarService.openForLogin(target.status_url, profileDir);
      if (!result.success) {
        console.error("Open login failed:", result.error);
        alert(`打开登录页面失败: ${result.error}`);
      }
    } catch (e) {
      console.error("Failed to open login:", e);
      alert(`打开登录页面失败: ${e}`);
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

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900">状态监控</h1>
          <p className="text-sm text-gray-500 mt-1">
            自动检查求职状态页，追踪进度变化
          </p>
        </div>
        <button
          onClick={handleCheckAll}
          disabled={checking.size > 0}
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

      {/* Auto-check status bar */}
      {autoCheckStatus && (
        <div className="mb-4 flex items-center gap-4 px-4 py-3 bg-white border border-gray-200 rounded-lg text-sm">
          <div className="flex items-center gap-2">
            {autoCheckStatus.isRunning ? (
              <RefreshCw className="w-4 h-4 text-blue-500 animate-spin" />
            ) : autoCheckStatus.enabled ? (
              <CheckCircle2 className="w-4 h-4 text-green-500" />
            ) : (
              <XCircle className="w-4 h-4 text-gray-400" />
            )}
            <span className="font-medium text-gray-700">
              自动检查: {autoCheckStatus.isRunning ? "执行中" : autoCheckStatus.enabled ? "已启用" : "已禁用"}
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
      )}

      {/* Target list */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">状态页</th>
              <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">当前状态</th>
              <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">登录状态</th>
              <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">检查频率</th>
              <th className="text-left px-5 py-3.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">上次检查</th>
              <th className="text-right px-5 py-3.5 text-xs font-semibold text-gray-400 uppercase tracking-wider">操作</th>
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
                return (
                  <tr key={target.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium">{target.domain}</div>
                      <div className="text-xs text-gray-400 mt-0.5">{target.ats_type}</div>
                    </td>
                    <td className="px-4 py-3">
                      <a
                        href={target.status_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-stone-700 hover:underline truncate max-w-[200px] block"
                      >
                        {target.status_url}
                      </a>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
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
                    <td className="px-4 py-3 text-sm text-gray-500">
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
                    </td>
                    <td className="px-4 py-3 text-right">
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
                          className="flex items-center gap-1 px-2 py-1.5 text-xs text-gray-500 hover:text-stone-700 rounded transition-colors"
                          title="打开登录"
                        >
                          <ExternalLink className="w-3 h-3" />
                          登录
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
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
