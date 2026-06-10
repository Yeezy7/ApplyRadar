import { useEffect, useState, useCallback, useMemo } from "react";
import { Search, GripVertical, ExternalLink, MapPin, Plus } from "lucide-react";
import type { Application, ApplicationStatus } from "@applyradar/shared";
import { applicationService, eventService } from "../services";
import ApplicationForm from "../components/ApplicationForm";
import { getActiveWaitingDays } from "../utils/applications";

// Simplified Kanban columns - group related statuses
interface KanbanColumn {
  id: string;
  label: string;
  statuses: ApplicationStatus[];
  color: string;
  bgColor: string;
}

const KANBAN_COLUMNS: KanbanColumn[] = [
  {
    id: "todo",
    label: "待投递",
    statuses: ["to_apply"],
    color: "text-gray-600",
    bgColor: "bg-gray-100",
  },
  {
    id: "applied",
    label: "已投递",
    statuses: ["applied", "received"],
    color: "text-blue-600",
    bgColor: "bg-blue-100",
  },
  {
    id: "review",
    label: "审核中",
    statuses: ["under_review", "assessment"],
    color: "text-yellow-700",
    bgColor: "bg-yellow-100",
  },
  {
    id: "interview",
    label: "面试",
    statuses: ["interview", "final_interview"],
    color: "text-stone-700",
    bgColor: "bg-stone-100",
  },
  {
    id: "result",
    label: "结果",
    statuses: ["offer", "rejected", "withdrawn"],
    color: "text-emerald-600",
    bgColor: "bg-emerald-100",
  },
];

interface Props {
  onSelectApp?: (id: string) => void;
}

export default function KanbanPage({ onSelectApp }: Props) {
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(false);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverColumnId, setDragOverColumnId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [notice, setNotice] = useState<{ success: boolean; message: string } | null>(null);

  const loadApplications = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await applicationService.listApplications();
      setApplications(data);
      setInitialLoaded(true);
    } catch (e) {
      console.error("Failed to load applications:", e);
      setError("加载失败，请重试");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadApplications();
  }, [loadApplications]);

  const filteredApps = useMemo(() => {
    if (!search.trim()) return applications;
    const q = search.toLowerCase();
    return applications.filter(
      (a) =>
        a.company_name.toLowerCase().includes(q) ||
        a.job_title.toLowerCase().includes(q) ||
        a.location?.toLowerCase().includes(q)
    );
  }, [applications, search]);

  const columnAppsMap = useMemo(() => {
    const map = new Map<string, Application[]>();
    for (const col of KANBAN_COLUMNS) {
      map.set(col.id, []);
    }
    for (const app of filteredApps) {
      for (const col of KANBAN_COLUMNS) {
        if (col.statuses.includes(app.status as ApplicationStatus)) {
          map.get(col.id)!.push(app);
          break;
        }
      }
    }
    return map;
  }, [filteredApps]);

  const handleDragStart = (id: string) => {
    setDraggedId(id);
  };

  const handleDragEnd = () => {
    setDraggedId(null);
    setDragOverColumnId(null);
  };

  const handleDragOver = (e: React.DragEvent, columnId: string) => {
    e.preventDefault();
    setDragOverColumnId(columnId);
  };

  const handleDragLeave = () => {
    setDragOverColumnId(null);
  };

  const handleDrop = async (column: KanbanColumn) => {
    setDragOverColumnId(null);
    if (!draggedId) return;

    const app = applications.find((a) => a.id === draggedId);
    if (!app) {
      setDraggedId(null);
      return;
    }

    // Check if app is already in this column
    if (column.statuses.includes(app.status as ApplicationStatus)) {
      setDraggedId(null);
      return;
    }

    // Use the first status of the column as the new status
    const newStatus = column.statuses[0];
    const oldStatus = app.status;

    // Optimistic update
    setApplications((prev) =>
      prev.map((a) => (a.id === draggedId ? { ...a, status: newStatus } : a))
    );
    setDraggedId(null);

    try {
      await applicationService.updateApplication(draggedId, { status: newStatus });
      setNotice({ success: true, message: "状态已更新" });

      try {
        await eventService.createEvent({
          application_id: draggedId,
          event_type: "status_change",
          title: "看板拖拽修改状态",
          old_status: oldStatus,
          new_status: newStatus,
        });
      } catch (eventError) {
        console.error("Failed to record status change event:", eventError);
        setNotice({
          success: false,
          message: `状态已更新，但事件记录失败: ${eventError instanceof Error ? eventError.message : String(eventError)}`,
        });
      }
    } catch (e) {
      console.error("Failed to update status:", e);
      // Rollback on failure
      setApplications((prev) =>
        prev.map((a) => (a.id === draggedId ? { ...a, status: oldStatus } : a))
      );
      setNotice({ success: false, message: `更新状态失败: ${e instanceof Error ? e.message : String(e)}` });
    }
  };

  // Only show loading skeleton on initial load
  if (loading && !initialLoaded) {
    return (
      <div className="px-4 pb-4 pt-2">
        <div className="animate-pulse space-y-6">
          <div className="flex gap-4 overflow-hidden">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex-shrink-0 w-64 h-96 bg-gray-200 rounded-2xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-4 pb-4 pt-2">
        <div className="text-center py-20">
          <p className="text-sm text-red-500 mb-3">{error}</p>
          <button
            onClick={() => loadApplications()}
            className="px-4 py-2 text-sm text-stone-700 hover:bg-stone-100 rounded-lg transition-colors"
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 pb-4 pt-2">
      {/* Header */}
      <div className="mb-4 flex items-center justify-end">
        <div className="flex flex-wrap items-center justify-end gap-3">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="搜索公司、岗位、地点..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-56 pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-stone-500/20 focus:border-stone-400 transition-all sm:w-64"
            />
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-stone-900 text-white rounded-xl text-sm font-medium hover:bg-stone-800 transition-all shadow-sm"
          >
            <Plus className="w-4 h-4" />
            新建
          </button>
        </div>
      </div>

      {notice && (
        <div className={`mb-4 rounded-lg border px-4 py-3 text-sm ${
          notice.success
            ? "border-emerald-100 bg-emerald-50 text-emerald-700"
            : "border-red-100 bg-red-50 text-red-700"
        }`}>
          {notice.message}
        </div>
      )}

      {/* Kanban Board */}
      {applications.length === 0 ? (
        <div className="text-center py-20">
          <div className="w-16 h-16 rounded-2xl bg-stone-50 flex items-center justify-center mx-auto mb-4">
            <GripVertical className="w-7 h-7 text-stone-400" />
          </div>
          <p className="text-sm font-medium text-gray-500">暂无求职记录</p>
          <p className="text-xs text-gray-400 mt-1">点击"新建"添加求职记录</p>
        </div>
      ) : (
        <div className="overflow-x-auto pb-2">
          <div className="grid min-w-[980px] grid-cols-5 gap-4 pb-4">
          {KANBAN_COLUMNS.map((col) => {
            const apps = columnAppsMap.get(col.id) || [];
            const isDragOver = dragOverColumnId === col.id;

            return (
              <div
                key={col.id}
                className={`flex flex-col rounded-2xl transition-colors duration-150 min-w-0 ${
                  isDragOver ? "bg-stone-50/50 ring-2 ring-stone-300 ring-inset" : "bg-gray-50/50"
                }`}
                onDragOver={(e) => handleDragOver(e, col.id)}
                onDragLeave={handleDragLeave}
                onDrop={() => handleDrop(col)}
              >
                {/* Column Header */}
                <div className="px-4 py-3 flex items-center justify-between sticky top-0 bg-inherit rounded-t-2xl z-10">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-lg ${col.bgColor} ${col.color}`}>
                      {col.label}
                    </span>
                    <span className="text-xs text-gray-400 font-medium">{apps.length}</span>
                  </div>
                </div>

                {/* Cards */}
                <div className="flex-1 px-2 pb-2 space-y-2 min-h-[200px] overflow-y-auto max-h-[calc(100vh-190px)]">
                  {apps.length === 0 ? (
                    <div className="text-center py-8">
                      <p className="text-xs text-gray-300">拖拽到此列</p>
                    </div>
                  ) : (
                    apps.map((app) => {
                      const days = getActiveWaitingDays(app);
                      const isDragging = draggedId === app.id;

                      return (
                        <div
                          key={app.id}
                          draggable
                          onDragStart={() => handleDragStart(app.id)}
                          onDragEnd={handleDragEnd}
                          onClick={() => onSelectApp?.(app.id)}
                          className={`bg-white rounded-xl border border-gray-100 p-3.5 cursor-grab active:cursor-grabbing hover:shadow-md hover:border-gray-200 transition-all duration-150 group ${
                            isDragging ? "opacity-40 scale-95 shadow-lg" : ""
                          }`}
                        >
                          {/* Card Header */}
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-stone-100 to-stone-200 flex items-center justify-center text-stone-700 font-bold text-xs flex-shrink-0">
                                {app.company_name.slice(0, 1)}
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-gray-900 truncate">
                                  {app.company_name}
                                </p>
                                {app.location && (
                                  <div className="flex items-center gap-1 mt-0.5">
                                    <MapPin className="w-3 h-3 text-gray-400" />
                                    <p className="text-xs text-gray-400 truncate">{app.location}</p>
                                  </div>
                                )}
                              </div>
                            </div>
                            <GripVertical className="w-3.5 h-3.5 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-1" />
                          </div>

                          {/* Job Title */}
                          <p className="text-xs text-gray-600 mb-3 line-clamp-2 leading-relaxed">
                            {app.job_title}
                          </p>

                          {/* Footer */}
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {app.priority === "high" && (
                                <span className="text-[10px] px-1.5 py-0.5 bg-red-50 text-red-600 rounded font-medium">
                                  高优
                                </span>
                              )}
                              {days !== null && days > 7 && (
                                <span className="text-[10px] px-1.5 py-0.5 bg-amber-50 text-amber-600 rounded font-medium">
                                  {days}天
                                </span>
                              )}
                              {app.salary_range && (
                                <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded">
                                  {app.salary_range}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1">
                              {app.applied_at && (
                                <span className="text-[10px] text-gray-400">
                                  {new Date(app.applied_at).toLocaleDateString("zh-CN", {
                                    month: "short",
                                    day: "numeric",
                                  })}
                                </span>
                              )}
                              {app.job_url && (
                                <a
                                  href={app.job_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="p-1 text-gray-300 hover:text-stone-700 transition-colors"
                                >
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
          </div>
        </div>
      )}

      {/* Form Dialog */}
      {showForm && (
        <ApplicationForm
          onSaved={setNotice}
          onClose={() => {
            setShowForm(false);
            loadApplications();
          }}
        />
      )}
    </div>
  );
}
