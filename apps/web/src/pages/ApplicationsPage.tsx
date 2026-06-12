import { useEffect, useState, useCallback, useMemo } from "react";
import { Plus, Search, Trash2, Edit2, ExternalLink, Filter, BriefcaseBusiness, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import type { Application, ApplicationStatus } from "@applyradar/shared";
import { STATUS_LABELS, STATUS_COLORS, PRIORITY_LABELS, PRIORITY_COLORS, ALL_STATUSES } from "@applyradar/shared";
import { listApplications, deleteApplication } from "../services/applicationService";
import ApplicationForm from "../components/ApplicationForm";

type SortField = "company_name" | "job_title" | "status" | "priority" | "applied_at" | "updated_at";
type SortDirection = "asc" | "desc";

const SortIcon = ({ field, sortField, sortDirection }: { field: SortField; sortField: SortField; sortDirection: SortDirection }) => {
  if (sortField !== field) return <ArrowUpDown className="w-3 h-3 text-gray-300" />;
  return sortDirection === "asc"
    ? <ArrowUp className="w-3 h-3 text-stone-600" />
    : <ArrowDown className="w-3 h-3 text-stone-600" />;
};

function getActiveWaitingDays(app: Application): number | null {
  if (!app.applied_at) return null;
  const finalStatuses: ApplicationStatus[] = ["offer", "rejected", "withdrawn", "unknown"];
  if (finalStatuses.includes(app.status as ApplicationStatus)) return null;
  const applied = new Date(app.applied_at);
  const now = new Date();
  return Math.floor((now.getTime() - applied.getTime()) / (1000 * 60 * 60 * 24));
}

function hasFinalResult(status: string): boolean {
  return ["offer", "rejected", "withdrawn", "unknown"].includes(status);
}

interface Props {
  onSelectApp?: (id: string) => void;
}

export default function ApplicationsPage({ onSelectApp }: Props) {
  const [applications, setApplications] = useState<Application[]>([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [showForm, setShowForm] = useState(false);
  const [editingApp, setEditingApp] = useState<Application | null>(null);
  const [loading, setLoading] = useState(true);
  const [sortField, setSortField] = useState<SortField>("updated_at");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [notice, setNotice] = useState<{ success: boolean; message: string } | null>(null);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Notice 自动消失
  useEffect(() => {
    if (notice) {
      const timer = setTimeout(() => setNotice(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [notice]);

  const loadApplications = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listApplications(
        debouncedSearch || undefined,
        statusFilter || undefined
      );
      setApplications(data);
    } catch (e) {
      console.error("Failed to load applications:", e);
      setNotice({ success: false, message: `加载求职记录失败: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, statusFilter]);

  useEffect(() => {
    loadApplications();
  }, [loadApplications]);

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!window.confirm("确定要删除这条记录吗？")) return;
    try {
      await deleteApplication(id);
      setNotice({ success: true, message: "求职记录已删除" });
      await loadApplications();
    } catch (e) {
      console.error("Failed to delete:", e);
      setNotice({ success: false, message: `删除失败: ${e instanceof Error ? e.message : String(e)}` });
    }
  };

  const handleEdit = (e: React.MouseEvent, app: Application) => {
    e.stopPropagation();
    setEditingApp(app);
    setShowForm(true);
  };

  const handleFormClose = () => {
    setShowForm(false);
    setEditingApp(null);
    loadApplications();
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const sortedApplications = useMemo(() => {
    const sorted = [...applications];
    sorted.sort((a, b) => {
      let aVal: string | number = "";
      let bVal: string | number = "";

      switch (sortField) {
        case "company_name":
          aVal = a.company_name.toLowerCase();
          bVal = b.company_name.toLowerCase();
          break;
        case "job_title":
          aVal = a.job_title.toLowerCase();
          bVal = b.job_title.toLowerCase();
          break;
        case "status":
          aVal = a.status;
          bVal = b.status;
          break;
        case "priority": {
          const priorityOrder = { high: 0, medium: 1, low: 2 };
          aVal = priorityOrder[a.priority as keyof typeof priorityOrder] ?? 1;
          bVal = priorityOrder[b.priority as keyof typeof priorityOrder] ?? 1;
          break;
        }
        case "applied_at":
          aVal = a.applied_at || "";
          bVal = b.applied_at || "";
          break;
        case "updated_at":
          aVal = a.updated_at;
          bVal = b.updated_at;
          break;
      }

      if (aVal < bVal) return sortDirection === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [applications, sortField, sortDirection]);

  return (
    <div className="px-4 pb-4 pt-2">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="搜索公司或岗位..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-56 pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-stone-500/20 focus:border-stone-400 transition-all sm:w-64"
            />
          </div>
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="pl-9 pr-7 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-stone-500/20 focus:border-stone-400 transition-all appearance-none cursor-pointer"
            >
              <option value="">全部状态</option>
              {ALL_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-stone-900 text-white rounded-lg text-sm font-medium hover:bg-stone-800 transition-all shadow-sm"
        >
          <Plus className="w-4 h-4" />
          新建记录
        </button>
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

      {/* Table */}
      <div className="overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-sm">
        <table className="w-full min-w-[760px]">
          <thead>
            <tr className="border-b border-gray-100">
              <th
                onClick={() => handleSort("company_name")}
                className="whitespace-nowrap px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-400 cursor-pointer select-none hover:text-gray-600"
              >
                <div className="flex items-center gap-1">公司 <SortIcon field="company_name" sortField={sortField} sortDirection={sortDirection} /></div>
              </th>
              <th
                onClick={() => handleSort("job_title")}
                className="whitespace-nowrap px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-400 cursor-pointer select-none hover:text-gray-600"
              >
                <div className="flex items-center gap-1">岗位 <SortIcon field="job_title" sortField={sortField} sortDirection={sortDirection} /></div>
              </th>
              <th
                onClick={() => handleSort("status")}
                className="whitespace-nowrap px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-400 cursor-pointer select-none hover:text-gray-600"
              >
                <div className="flex items-center gap-1">状态 <SortIcon field="status" sortField={sortField} sortDirection={sortDirection} /></div>
              </th>
              <th
                onClick={() => handleSort("priority")}
                className="hidden whitespace-nowrap px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-400 cursor-pointer select-none hover:text-gray-600 xl:table-cell"
              >
                <div className="flex items-center gap-1">优先级 <SortIcon field="priority" sortField={sortField} sortDirection={sortDirection} /></div>
              </th>
              <th className="hidden whitespace-nowrap px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-400 xl:table-cell">来源</th>
              <th
                onClick={() => handleSort("applied_at")}
                className="whitespace-nowrap px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-400 cursor-pointer select-none hover:text-gray-600"
              >
                <div className="flex items-center gap-1">投递日期 <SortIcon field="applied_at" sortField={sortField} sortDirection={sortDirection} /></div>
              </th>
              <th className="whitespace-nowrap px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-400">等待天数</th>
              <th className="whitespace-nowrap px-4 py-3.5 text-right text-xs font-semibold uppercase tracking-wider text-gray-400">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="px-5 py-16 text-center">
                  <div className="inline-block w-6 h-6 border-2 border-stone-200 border-t-stone-600 rounded-full animate-spin" />
                </td>
              </tr>
            ) : sortedApplications.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-5 py-16 text-center">
                  <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
                    <BriefcaseBusiness className="w-6 h-6 text-gray-400" />
                  </div>
                  <p className="text-sm font-medium text-gray-500">暂无求职记录</p>
                  <p className="text-xs text-gray-400 mt-1">点击"新建记录"开始添加</p>
                </td>
              </tr>
            ) : (
              sortedApplications.map((app) => {
                const days = getActiveWaitingDays(app);
                return (
                  <tr
                    key={app.id}
                    onClick={() => onSelectApp?.(app.id)}
                    className="border-b border-gray-50 hover:bg-[#F7F4EC] transition-colors cursor-pointer group"
                  >
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-stone-100 to-stone-200 flex items-center justify-center text-stone-600 font-bold text-xs flex-shrink-0">
                          {app.company_name.slice(0, 1)}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-gray-900">{app.company_name}</p>
                          {app.location && (
                            <p className="truncate text-xs text-gray-400">{app.location}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <p className="max-w-[220px] truncate text-sm text-gray-700">{app.job_title}</p>
                      {app.salary_range && (
                        <p className="max-w-[220px] truncate text-xs text-gray-400">{app.salary_range}</p>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      <span
                        className={`inline-flex items-center whitespace-nowrap px-2.5 py-1 rounded-lg text-xs font-medium ${
                          STATUS_COLORS[app.status as ApplicationStatus] || STATUS_COLORS.unknown
                        }`}
                      >
                        {STATUS_LABELS[app.status as ApplicationStatus] || app.status}
                      </span>
                    </td>
                    <td className="hidden px-4 py-3.5 xl:table-cell">
                      <span
                        className={`inline-flex items-center whitespace-nowrap px-2 py-0.5 rounded text-xs font-medium ${
                          PRIORITY_COLORS[app.priority as keyof typeof PRIORITY_COLORS] || ""
                        }`}
                      >
                        {PRIORITY_LABELS[app.priority as keyof typeof PRIORITY_LABELS] || app.priority}
                      </span>
                    </td>
                    <td className="hidden max-w-[120px] truncate px-4 py-3.5 text-sm text-gray-500 xl:table-cell">{app.source || "-"}</td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-sm text-gray-500">
                      {app.applied_at
                        ? new Date(app.applied_at).toLocaleDateString("zh-CN")
                        : "-"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5">
                      {hasFinalResult(app.status) ? (
                        <span className="text-sm text-gray-300">已结束</span>
                      ) : days !== null ? (
                        <span className={`text-sm font-medium ${days > 14 ? "text-amber-600" : days > 7 ? "text-gray-600" : "text-gray-400"}`}>
                          {days} 天
                        </span>
                      ) : (
                        <span className="text-sm text-gray-300">-</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {app.job_url && (
                          <a
                            href={app.job_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="p-2 text-gray-400 hover:text-stone-900 hover:bg-stone-100 rounded-lg transition-colors"
                            title="打开链接"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                        <button
                          onClick={(e) => handleEdit(e, app)}
                          className="p-2 text-gray-400 hover:text-stone-900 hover:bg-stone-100 rounded-lg transition-colors"
                          title="编辑"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => handleDelete(e, app.id)}
                          className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="删除"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Form Dialog */}
      {showForm && (
        <ApplicationForm
          application={editingApp}
          onSaved={setNotice}
          onClose={handleFormClose}
        />
      )}
    </div>
  );
}
