import { useEffect, useState, useCallback } from "react";
import { ArrowLeft, ExternalLink, Edit2, Trash2 } from "lucide-react";
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
  ALL_STATUSES,
} from "@applyradar/shared";
import {
  getApplication,
  updateApplication,
  deleteApplication,
} from "../services/applicationService";
import { listEvents, createEvent } from "../services/eventService";
import { listReminders } from "../services/reminderService";
import { listTrackingTargets, listTrackingRuns } from "../services/trackingService";
import ApplicationForm from "../components/ApplicationForm";
import TrackingTargetsSection from "../components/TrackingTargetsSection";
import TimelineSection from "../components/TimelineSection";
import AppReminderSection from "../components/AppReminderSection";
import Notice from "../components/Notice";
import ConfirmDialog from "../components/ConfirmDialog";
import { useNotice } from "../hooks/useNotice";
import { useConfirm } from "../hooks/useConfirm";

interface Props {
  applicationId: string;
  onBack: () => void;
}

export default function ApplicationDetailPage({
  applicationId,
  onBack,
}: Props) {
  const [app, setApp] = useState<Application | null>(null);
  const [events, setEvents] = useState<ApplicationEvent[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [targets, setTargets] = useState<TrackingTarget[]>([]);
  const [runs, setRuns] = useState<Map<string, TrackingRun[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showEditForm, setShowEditForm] = useState(false);
  const { notice, showSuccess, showError } = useNotice();
  const { isOpen, options, confirm, handleConfirm, handleCancel } = useConfirm();

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [appData, eventsData, remindersData, targetsData] = await Promise.all([
        getApplication(applicationId),
        listEvents(applicationId),
        listReminders(applicationId, true),
        listTrackingTargets(applicationId).catch(() => []),
      ]);
      setApp(appData);
      setEvents(eventsData);
      setReminders(remindersData);
      setTargets(targetsData);

      // Load runs for each target
      const runsMap = new Map<string, TrackingRun[]>();
      await Promise.allSettled(
        targetsData.map(async (t) => {
          try {
            const r = await listTrackingRuns(t.id);
            runsMap.set(t.id, r);
          } catch {}
        })
      );
      setRuns(runsMap);
    } catch (e) {
      setError(
        `加载失败: ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      setLoading(false);
    }
  }, [applicationId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const loadRuns = async (targetId: string) => {
    try {
      const r = await listTrackingRuns(targetId);
      setRuns((prev) => {
        const next = new Map(prev);
        next.set(targetId, r);
        return next;
      });
    } catch {}
  };

  const handleDelete = async () => {
    const confirmed = await confirm({
      title: "删除确认",
      message: "确定要删除这条求职记录吗？此操作不可撤销。",
      confirmText: "删除",
      variant: "danger",
    });
    if (!confirmed) return;

    try {
      await deleteApplication(applicationId);
      onBack();
    } catch (e) {
      showError(`删除失败: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const handleStatusChange = async (newStatus: ApplicationStatus) => {
    if (!app || app.status === newStatus) return;
    const oldStatus = app.status;

    try {
      await updateApplication(applicationId, { status: newStatus });
      await createEvent({
        application_id: applicationId,
        event_type: "status_change",
        title: "手动修改状态",
        old_status: oldStatus,
        new_status: newStatus,
      });
      setApp((prev) => (prev ? { ...prev, status: newStatus } : prev));
      showSuccess("状态已更新");
      const eventsData = await listEvents(applicationId);
      setEvents(eventsData);
    } catch (e) {
      showError(`更新失败: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  if (loading) {
    return (
      <div className="px-6 py-4">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-32 bg-gray-200 dark:bg-gray-800 rounded" />
          <div className="h-24 bg-gray-200 dark:bg-gray-800 rounded-2xl" />
          <div className="h-48 bg-gray-200 dark:bg-gray-800 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (error || !app) {
    return (
      <div className="px-6 py-4">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 mb-4"
        >
          <ArrowLeft className="w-4 h-4" /> 返回
        </button>
        <p className="text-sm text-red-500">{error || "未找到记录"}</p>
      </div>
    );
  }

  return (
    <div className="px-6 py-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
        >
          <ArrowLeft className="w-4 h-4" /> 返回
        </button>
        <div className="flex items-center gap-2">
          {app.job_url && (
            <a
              href={app.job_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 px-3 py-1.5 text-xs text-gray-500 hover:text-stone-700 dark:hover:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-lg transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              JD
            </a>
          )}
          <button
            onClick={() => setShowEditForm(true)}
            className="flex items-center gap-1 px-3 py-1.5 text-xs text-stone-700 dark:text-stone-300 bg-stone-50 dark:bg-stone-800 hover:bg-stone-100 dark:hover:bg-stone-700 rounded-lg transition-colors"
          >
            <Edit2 className="w-3.5 h-3.5" />
            编辑
          </button>
          <button
            onClick={handleDelete}
            className="flex items-center gap-1 px-3 py-1.5 text-xs text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            删除
          </button>
        </div>
      </div>

      {notice && (
        <Notice
          success={notice.success}
          message={notice.message}
          onClose={() => {}}
        />
      )}

      <ConfirmDialog
        open={isOpen}
        title={options.title}
        message={options.message}
        confirmText={options.confirmText}
        variant={options.variant}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />

      {/* App Info */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-6 mb-5">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-stone-100 to-stone-200 dark:from-stone-700 dark:to-stone-800 flex items-center justify-center text-stone-700 dark:text-stone-300 font-bold">
                {app.company_name.slice(0, 1)}
              </div>
              <div>
                <h1 className="text-lg font-bold text-gray-900 dark:text-white">
                  {app.company_name}
                </h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {app.job_title}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <select
                value={app.status}
                onChange={(e) =>
                  handleStatusChange(e.target.value as ApplicationStatus)
                }
                className={`text-xs px-2.5 py-1 rounded-lg font-medium border-0 focus:ring-2 focus:ring-stone-500/20 cursor-pointer ${
                  STATUS_COLORS[app.status as ApplicationStatus] ||
                  STATUS_COLORS.unknown
                }`}
              >
                {ALL_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
              <span
                className={`text-xs px-2 py-0.5 rounded ${
                  PRIORITY_COLORS[
                    app.priority as keyof typeof PRIORITY_COLORS
                  ] || ""
                }`}
              >
                {PRIORITY_LABELS[
                  app.priority as keyof typeof PRIORITY_LABELS
                ] || app.priority}
              </span>
              {app.location && (
                <span className="text-xs text-gray-400">{app.location}</span>
              )}
              {app.salary_range && (
                <span className="text-xs text-gray-400">
                  {app.salary_range}
                </span>
              )}
            </div>
          </div>
        </div>
        {app.notes && (
          <p className="mt-3 text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap">
            {app.notes}
          </p>
        )}
        <div className="flex items-center gap-4 mt-3 text-xs text-gray-400">
          {app.applied_at && (
            <span>
              投递: {new Date(app.applied_at).toLocaleDateString("zh-CN")}
            </span>
          )}
          {app.deadline_at && (
            <span>
              截止: {new Date(app.deadline_at).toLocaleDateString("zh-CN")}
            </span>
          )}
          <span>来源: {app.source || "-"}</span>
          <span>
            创建: {new Date(app.created_at).toLocaleDateString("zh-CN")}
          </span>
        </div>
      </div>

      {/* Tracking Targets */}
      <TrackingTargetsSection
        targets={targets}
        runs={runs}
        applicationId={applicationId}
        onRefresh={loadData}
        onLoadRuns={loadRuns}
      />

      {/* Timeline */}
      <TimelineSection
        events={events}
        currentStatus={app.status}
        onResolve={async (eventId, action) => {
          // 由于 server 端没有 resolve API，我们在本地更新状态
          setEvents((prev) =>
            prev.map((e) =>
              e.id === eventId
                ? {
                    ...e,
                    handled_at: new Date().toISOString(),
                    handled_action: action,
                  }
                : e
            )
          );

          // 如果是接受操作，更新应用状态
          if (action === "accepted") {
            const event = events.find((e) => e.id === eventId);
            if (event?.new_status) {
              await handleStatusChange(event.new_status);
            }
          }

          setNotice({ success: true, message: action === "accepted" ? "已采用该状态变更" : "已忽略该状态变更" });
        }}
      />

      {/* Reminders */}
      <AppReminderSection
        reminders={reminders}
        applicationId={applicationId}
        onRefresh={loadData}
      />

      {/* Edit Form */}
      {showEditForm && (
        <ApplicationForm
          application={app}
          onSaved={setNotice}
          onClose={() => {
            setShowEditForm(false);
            loadData();
          }}
        />
      )}
    </div>
  );
}
