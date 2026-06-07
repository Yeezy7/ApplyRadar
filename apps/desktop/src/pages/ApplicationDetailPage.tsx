import { useEffect, useState, useCallback, useRef } from "react";
import {
  ArrowLeft,
  ExternalLink,
  Edit2,
  Plus,
  X,
  Trash2,
  Play,
  ShieldCheck,
  AlertTriangle,
  Clock3,
  Check,
  RefreshCw,
} from "lucide-react";
import type {
  Application,
  ApplicationEvent,
  Reminder,
  TrackingTarget,
  TrackingRun,
  ApplicationStatus,
} from "@applyradar/shared";
import {
  STATUS_LABELS,
  STATUS_COLORS,
  PRIORITY_LABELS,
  PRIORITY_COLORS,
  LOGIN_STATE_LABELS,
  LOGIN_STATE_COLORS,
  ALL_STATUSES,
} from "@applyradar/shared";
import {
  applicationService,
  eventService,
  reminderService,
  trackerService,
  sidecarService,
} from "../services";
import {
  processSidecarCheckException,
  processSidecarCheckResult,
} from "../services/checkWorkflowService";
import { confirmDelete } from "../services/dialogService";
import ApplicationForm from "../components/ApplicationForm";

interface Props {
  applicationId: string;
  onBack: () => void;
}

function getStatusLabel(s: string) {
  return STATUS_LABELS[s as ApplicationStatus] || s;
}

function getStatusColor(s: string) {
  return STATUS_COLORS[s as ApplicationStatus] || STATUS_COLORS.unknown;
}

export default function ApplicationDetailPage({ applicationId, onBack }: Props) {
  const [app, setApp] = useState<Application | null>(null);
  const [events, setEvents] = useState<ApplicationEvent[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [targets, setTargets] = useState<TrackingTarget[]>([]);
  const [runs, setRuns] = useState<TrackingRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showEditForm, setShowEditForm] = useState(false);
  const [showTargetForm, setShowTargetForm] = useState(false);
  const [targetUrl, setTargetUrl] = useState("");
  const [targetError, setTargetError] = useState("");
  const [submittingTarget, setSubmittingTarget] = useState(false);
  const [checkingTarget, setCheckingTarget] = useState<string | null>(null);
  const [checkResults, setCheckResults] = useState<Map<string, { success: boolean; message: string }>>(new Map());
  const requestIdRef = useRef(0);

  const loadData = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const [appData, eventData, reminderData, targetData] = await Promise.all([
        applicationService.getApplication(applicationId),
        eventService.listEventsByApplication(applicationId),
        reminderService.listReminders(applicationId, true),
        trackerService.listTrackingTargets(applicationId),
      ]);

      if (requestId !== requestIdRef.current) return;

      setApp(appData);
      setEvents(eventData);
      setReminders(reminderData);
      setTargets(targetData);

      const runResults = await Promise.allSettled(
        targetData.map((t) => trackerService.listTrackingRuns(t.id))
      );
      if (requestId !== requestIdRef.current) return;

      const allRuns: TrackingRun[] = runResults
        .filter((r): r is PromiseFulfilledResult<TrackingRun[]> => r.status === "fulfilled")
        .flatMap((r) => r.value);
      allRuns.sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      setRuns(allRuns.slice(0, 30));
    } catch (e) {
      if (requestId !== requestIdRef.current) return;
      console.error("Failed to load application detail:", e);
      setError("加载失败，请重试");
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [applicationId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleDeleteTarget = async (targetId: string) => {
    const ok = await confirmDelete("确定要删除这个监控目标吗？");
    if (!ok) return;
    try {
      await trackerService.deleteTrackingTarget(targetId);
      await loadData();
    } catch (e) {
      console.error("Failed to delete tracking target:", e);
    }
  };

  const handleCreateTarget = async () => {
    if (submittingTarget) return;
    setTargetError("");

    const url = targetUrl.trim();
    if (!url) {
      setTargetError("请输入状态页 URL");
      return;
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      setTargetError("请输入有效的 URL");
      return;
    }
    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      setTargetError("仅支持 http:// 和 https:// 协议");
      return;
    }

    const exists = targets.some((t) => t.status_url === url);
    if (exists) {
      setTargetError("该状态页已存在");
      return;
    }

    setSubmittingTarget(true);
    try {
      await trackerService.createTrackingTarget({
        application_id: applicationId,
        status_url: url,
      });
      setTargetUrl("");
      setTargetError("");
      setShowTargetForm(false);
      await loadData();
    } catch (e) {
      setTargetError(`创建失败: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSubmittingTarget(false);
    }
  };

  const handleCheckTarget = async (target: TrackingTarget) => {
    setCheckingTarget(target.id);
    setCheckResults(prev => {
      const next = new Map(prev);
      next.delete(target.id);
      return next;
    });

    try {
      const profileDir = target.profile_dir || `profiles/${target.domain}`;
      const res = await sidecarService.runCheck(target.id, target.status_url, profileDir);
      const result = await processSidecarCheckResult(target, res, { application: app });

      setCheckResults(prev => {
        const next = new Map(prev);
        next.set(target.id, { success: result.success, message: result.message });
        return next;
      });

      await loadData();
    } catch (e) {
      console.error("Check failed:", e);
      const result = await processSidecarCheckException(target, e, { application: app });
      setCheckResults(prev => {
        const next = new Map(prev);
        next.set(target.id, { success: false, message: result.message });
        return next;
      });
      await loadData();
    } finally {
      setCheckingTarget(null);
    }
  };

  const handleOpenLogin = async (target: TrackingTarget) => {
    try {
      const profileDir = target.profile_dir || `profiles/${target.domain}`;
      await sidecarService.openForLogin(target.status_url, profileDir);
    } catch (e) {
      console.error("Failed to open login:", e);
    }
  };

  const handleMarkReminderDone = async (id: string) => {
    try {
      await reminderService.markReminderDone(id);
      setReminders((prev) =>
        prev.map((r) => (r.id === id ? { ...r, is_done: 1 } : r))
      );
    } catch (e) {
      console.error("Failed to mark reminder done:", e);
    }
  };

  const handleDeleteApp = async () => {
    const ok = await confirmDelete("确定要删除这条求职记录吗？关联的监控目标和事件将一并删除。");
    if (!ok) return;
    try {
      await applicationService.deleteApplication(applicationId);
      onBack();
    } catch (e) {
      console.error("Failed to delete application:", e);
    }
  };

  const handleStatusChange = async (newStatus: ApplicationStatus) => {
    if (!app || app.status === newStatus) return;
    const oldStatus = app.status;
    try {
      await applicationService.updateApplication(applicationId, { status: newStatus });
      setApp((prev) => (prev ? { ...prev, status: newStatus } : prev));
      await eventService.createEvent({
        application_id: applicationId,
        event_type: "status_change",
        title: "手动修改状态",
        old_status: oldStatus,
        new_status: newStatus,
      });
      await loadData();
    } catch (e) {
      console.error("Failed to update status:", e);
    }
  };

  const getLoginStateIcon = (state: string) => {
    switch (state) {
      case "valid":
        return <ShieldCheck className="w-3.5 h-3.5 text-green-500" />;
      case "expired":
      case "blocked":
        return <AlertTriangle className="w-3.5 h-3.5 text-red-500" />;
      default:
        return <Clock3 className="w-3.5 h-3.5 text-gray-400" />;
    }
  };

  const getEventDotColor = (event: ApplicationEvent) => {
    if (event.event_type === "status_change") {
      if (event.new_status === "offer") return "bg-emerald-400";
      if (event.new_status === "rejected") return "bg-red-400";
      return "bg-stone-400";
    }
    if (event.event_type === "login_expired") return "bg-amber-400";
    if (event.event_type === "check_failed") return "bg-red-300";
    if (event.event_type === "note_added") return "bg-orange-300";
    return "bg-gray-300";
  };

  // Loading state
  if (loading && !app) {
    return (
      <div className="p-5">
        <div className="animate-pulse space-y-6">
          <div className="h-8 w-48 bg-gray-200 rounded" />
          <div className="h-64 bg-gray-200 rounded-2xl" />
          <div className="h-48 bg-gray-200 rounded-2xl" />
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="p-5">
        <div className="text-center py-20">
          <p className="text-sm text-red-500 mb-3">{error}</p>
          <button
            onClick={loadData}
            className="px-4 py-2 text-sm text-stone-700 hover:bg-stone-100 rounded-lg transition-colors"
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  // Not found
  if (!app) {
    return (
      <div className="p-5">
        <div className="text-center py-20">
          <p className="text-sm text-gray-500 mb-3">求职记录未找到</p>
          <button
            onClick={onBack}
            className="px-4 py-2 text-sm text-stone-700 hover:bg-stone-100 rounded-lg transition-colors"
          >
            返回列表
          </button>
        </div>
      </div>
    );
  }

  const isOverdue = (r: Reminder) => !r.is_done && new Date(r.remind_at) < new Date();

  return (
    <div className="p-5 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{app.company_name}</h1>
            <p className="text-sm text-gray-500">{app.job_title}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={app.status}
            onChange={(e) => handleStatusChange(e.target.value as ApplicationStatus)}
            className="px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-500/20 focus:border-stone-400 transition-all appearance-none cursor-pointer"
          >
            {ALL_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
          <button
            onClick={() => setShowEditForm(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
          >
            <Edit2 className="w-3.5 h-3.5" />
            编辑
          </button>
          <button
            onClick={handleDeleteApp}
            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors"
            title="删除"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Basic Info */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">基本信息</h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-400">状态：</span>
            <span
              className={`ml-2 inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-medium ${getStatusColor(app.status)}`}
            >
              {getStatusLabel(app.status)}
            </span>
          </div>
          <div>
            <span className="text-gray-400">优先级：</span>
            <span
              className={`ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                PRIORITY_COLORS[app.priority as keyof typeof PRIORITY_COLORS] || ""
              }`}
            >
              {PRIORITY_LABELS[app.priority as keyof typeof PRIORITY_LABELS] || app.priority}
            </span>
          </div>
          <div>
            <span className="text-gray-400">来源：</span>
            <span className="ml-2 text-gray-700">{app.source || "-"}</span>
          </div>
          <div>
            <span className="text-gray-400">投递日期：</span>
            <span className="ml-2 text-gray-700">
              {app.applied_at ? new Date(app.applied_at).toLocaleDateString("zh-CN") : "-"}
            </span>
          </div>
          <div>
            <span className="text-gray-400">工作地点：</span>
            <span className="ml-2 text-gray-700">{app.location || "-"}</span>
          </div>
          <div>
            <span className="text-gray-400">薪资范围：</span>
            <span className="ml-2 text-gray-700">{app.salary_range || "-"}</span>
          </div>
          {app.job_url && (
            <div className="col-span-2">
              <span className="text-gray-400">JD 链接：</span>
              <a
                href={app.job_url}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-2 text-stone-700 hover:underline inline-flex items-center gap-1"
              >
                <span className="truncate max-w-[400px]">{app.job_url}</span>
                <ExternalLink className="w-3 h-3 flex-shrink-0" />
              </a>
            </div>
          )}
          {app.status_url && (
            <div className="col-span-2">
              <span className="text-gray-400">状态页：</span>
              <a
                href={app.status_url}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-2 text-stone-700 hover:underline inline-flex items-center gap-1"
              >
                <span className="truncate max-w-[400px]">{app.status_url}</span>
                <ExternalLink className="w-3 h-3 flex-shrink-0" />
              </a>
            </div>
          )}
          {app.notes && (
            <div className="col-span-2">
              <span className="text-gray-400">备注：</span>
              <span className="ml-2 text-gray-700">{app.notes}</span>
            </div>
          )}
          <div className="col-span-2 flex gap-6 text-xs text-gray-400 pt-2 border-t border-gray-50">
            <span>创建于 {new Date(app.created_at).toLocaleString("zh-CN")}</span>
            <span>更新于 {new Date(app.updated_at).toLocaleString("zh-CN")}</span>
          </div>
        </div>
      </div>

      {/* Tracking Targets */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-700">监控目标</h2>
          <button
            onClick={() => setShowTargetForm(true)}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-stone-700 hover:bg-stone-100 rounded-lg transition-colors"
          >
            <Plus className="w-3 h-3" />
            添加状态页
          </button>
        </div>
        {showTargetForm && (
          <div className="mb-4 p-4 bg-gray-50 rounded-xl">
            <div className="flex items-center gap-2">
              <input
                type="url"
                value={targetUrl}
                onChange={(e) => {
                  setTargetUrl(e.target.value);
                  setTargetError("");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateTarget();
                  if (e.key === "Escape") {
                    setShowTargetForm(false);
                    setTargetUrl("");
                    setTargetError("");
                  }
                }}
                placeholder="https://... 状态页 URL"
                maxLength={2048}
                className={`flex-1 px-3.5 py-2 bg-white border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-500/20 focus:border-stone-400 transition-all ${
                  targetError ? "border-red-300" : "border-gray-200"
                }`}
                autoFocus
              />
              <button
                onClick={handleCreateTarget}
                disabled={submittingTarget}
                className="px-4 py-2 bg-stone-900 text-white text-xs rounded-xl hover:bg-stone-800 disabled:opacity-50 transition-colors"
              >
                {submittingTarget ? "添加中..." : "添加"}
              </button>
              <button
                onClick={() => {
                  setShowTargetForm(false);
                  setTargetUrl("");
                  setTargetError("");
                }}
                className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {targetError && <p className="text-xs text-red-500 mt-2">{targetError}</p>}
          </div>
        )}
        {targets.length === 0 ? (
          <p className="text-sm text-gray-400 py-4">暂无监控目标，点击"添加状态页"开始追踪</p>
        ) : (
          <div className="space-y-3">
            {targets.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-xl"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900">{t.domain}</span>
                    <span className="text-xs text-gray-400">{t.ats_type}</span>
                    {t.current_status !== "unknown" && (
                      <span
                        className={`text-xs px-1.5 py-0.5 rounded ${getStatusColor(t.current_status)}`}
                      >
                        {getStatusLabel(t.current_status)}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-400 truncate mt-0.5">{t.status_url}</div>
                  <div className="flex items-center gap-3 mt-1">
                    <div className="flex items-center gap-1">
                      {getLoginStateIcon(t.login_state)}
                      <span
                        className={`text-xs ${
                          LOGIN_STATE_COLORS[t.login_state as keyof typeof LOGIN_STATE_COLORS] || ""
                        }`}
                      >
                        {LOGIN_STATE_LABELS[t.login_state as keyof typeof LOGIN_STATE_LABELS] || t.login_state}
                      </span>
                    </div>
                    <span className="text-xs text-gray-400">
                      {t.last_checked_at
                        ? `上次检查: ${new Date(t.last_checked_at).toLocaleString("zh-CN")}`
                        : "从未检查"}
                    </span>
                  </div>
                  {t.last_error && (
                    <p className="text-xs text-red-500 mt-1 truncate">{t.last_error}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 ml-3">
                  <button
                    onClick={() => handleOpenLogin(t)}
                    className="px-2.5 py-1.5 text-xs text-gray-500 hover:text-stone-700 hover:bg-stone-100 rounded-lg transition-colors"
                  >
                    登录
                  </button>
                  <button
                    onClick={() => handleCheckTarget(t)}
                    disabled={checkingTarget === t.id}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-stone-700 bg-stone-50 hover:bg-stone-100 rounded-lg disabled:opacity-50 transition-colors"
                  >
                    {checkingTarget === t.id ? (
                      <RefreshCw className="w-3 h-3 animate-spin" />
                    ) : (
                      <Play className="w-3 h-3" />
                    )}
                    检查
                  </button>
                  <button
                    onClick={() => handleDeleteTarget(t.id)}
                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
                {/* Check result */}
                {checkResults.has(t.id) && (
                  <div className={`text-xs mt-1.5 ${checkResults.get(t.id)?.success ? "text-green-600" : "text-red-500"}`}>
                    {checkResults.get(t.id)?.message}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Timeline */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">状态时间线</h2>
        {events.length === 0 ? (
          <p className="text-sm text-gray-400 py-4">暂无事件记录</p>
        ) : (
          <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
            {events.slice(0, 50).map((event) => (
              <div
                key={event.id}
                className="flex gap-3 text-sm"
              >
                <div
                  className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${getEventDotColor(event)}`}
                />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-800">{event.title}</div>
                  {event.content && (
                    <p className="text-gray-500 text-xs mt-0.5 line-clamp-2">{event.content}</p>
                  )}
                  {event.old_status && event.new_status && (
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded">
                        {getStatusLabel(event.old_status)}
                      </span>
                      <span className="text-xs text-gray-300">→</span>
                      <span className="text-xs px-1.5 py-0.5 bg-stone-50 text-stone-700 rounded">
                        {getStatusLabel(event.new_status)}
                      </span>
                    </div>
                  )}
                  <p className="text-xs text-gray-300 mt-1">
                    {new Date(event.event_time).toLocaleString("zh-CN")}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Check History */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">检查记录</h2>
        {runs.length === 0 ? (
          <p className="text-sm text-gray-400 py-4">暂无检查记录</p>
        ) : (
          <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
            {runs.map((run) => {
              const target = targets.find((t) => t.id === run.target_id);
              return (
                <div
                  key={run.id}
                  className="flex items-center justify-between text-sm py-2.5 px-3 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        run.status === "success"
                          ? "bg-green-400"
                          : run.status === "failed"
                          ? "bg-red-400"
                          : "bg-yellow-400"
                      }`}
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-xs font-medium ${
                            run.status === "success"
                              ? "text-green-600"
                              : run.status === "failed"
                              ? "text-red-600"
                              : "text-yellow-600"
                          }`}
                        >
                          {run.status === "success"
                            ? "成功"
                            : run.status === "failed"
                            ? "失败"
                            : run.status === "login_expired"
                            ? "登录过期"
                            : run.status}
                        </span>
                        {run.ai_used === 1 && (
                          <span className="text-xs px-1.5 py-0.5 bg-stone-50 text-stone-700 rounded">
                            AI
                          </span>
                        )}
                        {target && (
                          <span className="text-xs text-gray-400">{target.domain}</span>
                        )}
                        {run.normalized_status && (
                          <span
                            className={`text-xs px-1.5 py-0.5 rounded ${getStatusColor(run.normalized_status)}`}
                          >
                            {getStatusLabel(run.normalized_status)}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-400">
                        {run.confidence != null && !isNaN(run.confidence) && (
                          <span>置信度: {Math.round(run.confidence * 100)}%</span>
                        )}
                        {run.login_state && (
                          <span>
                            {LOGIN_STATE_LABELS[run.login_state as keyof typeof LOGIN_STATE_LABELS] || run.login_state}
                          </span>
                        )}
                        {run.error_message && (
                          <span className="text-red-400 truncate max-w-[200px]">
                            {run.error_message}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                    {/* Confirm button for low confidence results */}
                    {run.normalized_status && run.confidence != null && run.confidence >= 0.60 && run.confidence < 0.85 && (
                      <button
                        onClick={async () => {
                          try {
                            await applicationService.updateApplication(applicationId, { status: run.normalized_status as ApplicationStatus });
                            await eventService.createEvent({
                              application_id: applicationId,
                              event_type: "status_change",
                              title: "手动确认 AI 识别",
                              old_status: app?.status,
                              new_status: run.normalized_status!,
                            });
                            await loadData();
                          } catch (e) {
                            console.error("Failed to confirm status:", e);
                          }
                        }}
                        className="px-2 py-1 text-xs text-stone-700 bg-stone-50 hover:bg-stone-100 rounded transition-colors"
                      >
                        确认
                      </button>
                    )}
                    <span className="text-xs text-gray-300">
                      {new Date(run.created_at).toLocaleString("zh-CN")}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Reminders */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-700">提醒</h2>
          <button
            onClick={() => {
              const title = prompt("提醒标题：");
              if (!title) return;
              const remindAt = prompt("提醒时间（YYYY-MM-DD HH:mm）：", new Date().toISOString().slice(0, 16));
              if (!remindAt) return;
              reminderService.createReminder({
                application_id: applicationId,
                title,
                remind_at: new Date(remindAt).toISOString(),
              }).then(() => loadData());
            }}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-stone-700 hover:bg-stone-100 rounded-lg transition-colors"
          >
            <Plus className="w-3 h-3" />
            添加提醒
          </button>
        </div>
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
                  onClick={() => !r.is_done && handleMarkReminderDone(r.id)}
                  className={`flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                    r.is_done
                      ? "bg-green-500 border-green-500 text-white"
                      : "border-gray-300 hover:border-stone-400"
                  }`}
                >
                  {r.is_done && <Check className="w-3 h-3" />}
                </button>
                <div className="flex-1 min-w-0">
                  <p className={`font-medium ${r.is_done ? "line-through text-gray-400" : "text-gray-800"}`}>
                    {r.title}
                  </p>
                  {r.content && (
                    <p className="text-xs text-gray-400 truncate">{r.content}</p>
                  )}
                </div>
                <span
                  className={`text-xs flex-shrink-0 ${
                    !r.is_done && isOverdue(r) ? "text-red-500 font-medium" : "text-gray-400"
                  }`}
                >
                  {new Date(r.remind_at).toLocaleString("zh-CN")}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Edit Form */}
      {showEditForm && (
        <ApplicationForm
          application={app}
          onClose={() => {
            setShowEditForm(false);
            loadData();
          }}
        />
      )}
    </div>
  );
}
