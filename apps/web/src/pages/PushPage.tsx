import { useEffect, useState, useCallback, useMemo } from "react";
import { Send, Mail, AlertTriangle, ShieldAlert, Bell, CheckCircle2, RefreshCw, Filter, Trash2 } from "lucide-react";
import { listPushLogs, clearPushLogs, type PushLog } from "../services/pushLogService";

const TYPE_CONFIG: Record<string, { label: string; icon: typeof Mail; color: string; bg: string }> = {
  email: { label: "邮件", icon: Mail, color: "text-blue-600", bg: "bg-blue-50" },
  status_change: { label: "状态变更", icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50" },
  login_issue: { label: "登录异常", icon: ShieldAlert, color: "text-amber-600", bg: "bg-amber-50" },
  check_failed: { label: "检查失败", icon: AlertTriangle, color: "text-red-600", bg: "bg-red-50" },
  reminder: { label: "提醒", icon: Bell, color: "text-purple-600", bg: "bg-purple-50" },
  notification: { label: "通知", icon: Send, color: "text-gray-600", bg: "bg-gray-50" },
};

export default function PushPage() {
  const [logs, setLogs] = useState<PushLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listPushLogs(undefined, 500);
      setLogs(data);
    } catch (e) {
      console.error("Failed to load push logs:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const handleClear = async () => {
    if (!window.confirm("确定要清空所有推送记录吗？")) return;
    try {
      await clearPushLogs();
      setLogs([]);
    } catch (e) {
      console.error("Failed to clear push logs:", e);
    }
  };

  const filtered = useMemo(() => {
    if (!typeFilter) return logs;
    return logs.filter((r) => r.push_type === typeFilter);
  }, [logs, typeFilter]);

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of logs) {
      counts[r.push_type] = (counts[r.push_type] || 0) + 1;
    }
    return counts;
  }, [logs]);

  const formatTime = (isoStr: string) => {
    const d = new Date(isoStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "刚刚";
    if (diffMin < 60) return `${diffMin} 分钟前`;
    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return `${diffHour} 小时前`;
    const diffDay = Math.floor(diffHour / 24);
    if (diffDay < 7) return `${diffDay} 天前`;
    return d.toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
  };

  const getConfig = (pushType: string) =>
    TYPE_CONFIG[pushType] || TYPE_CONFIG.notification;

  return (
    <div className="px-4 pb-4 pt-2">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="pl-9 pr-7 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-stone-500/20 focus:border-stone-400 transition-all appearance-none cursor-pointer"
            >
              <option value="">全部类型 ({logs.length})</option>
              {Object.entries(TYPE_CONFIG).map(([key, cfg]) => (
                typeCounts[key] ? <option key={key} value={key}>{cfg.label} ({typeCounts[key]})</option> : null
              ))}
            </select>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadLogs}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 text-sm text-stone-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            刷新
          </button>
          {logs.length > 0 && (
            <button
              onClick={handleClear}
              className="flex items-center gap-2 px-3 py-2 text-sm text-gray-500 bg-white border border-gray-200 rounded-lg hover:text-red-600 hover:border-red-200 hover:bg-red-50 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              清空
            </button>
          )}
        </div>
      </div>

      {/* Type summary cards */}
      <div className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-6">
        {Object.entries(TYPE_CONFIG).map(([key, cfg]) => {
          const Icon = cfg.icon;
          const count = typeCounts[key] || 0;
          return (
            <button
              key={key}
              onClick={() => setTypeFilter(typeFilter === key ? "" : key)}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all ${
                typeFilter === key
                  ? "border-stone-300 bg-white shadow-sm ring-1 ring-stone-200"
                  : "border-gray-100 bg-white hover:border-gray-200"
              }`}
            >
              <div className={`w-9 h-9 rounded-lg ${cfg.bg} flex items-center justify-center`}>
                <Icon className={`w-4 h-4 ${cfg.color}`} />
              </div>
              <div className="text-left">
                <div className="text-lg font-semibold text-gray-900">{count}</div>
                <div className="text-xs text-gray-500">{cfg.label}</div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Timeline */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
            <Send className="w-7 h-7 text-gray-400" />
          </div>
          <p className="text-sm font-medium text-gray-500">
            {typeFilter ? "没有该类型的推送记录" : "暂无推送记录"}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            {typeFilter ? "尝试切换筛选条件" : "邮件发送、状态变更、提醒通知等会记录在这里"}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="divide-y divide-gray-50">
            {filtered.map((log) => {
              const cfg = getConfig(log.push_type);
              const Icon = cfg.icon;
              const isExpanded = expandedId === log.id;
              const hasExpandableContent = (log.body && log.body.length > 50);
              return (
                <div key={log.id}>
                  <div
                    className={`flex items-start gap-4 px-5 py-4 hover:bg-gray-50/50 transition-colors ${hasExpandableContent ? "cursor-pointer" : ""}`}
                    onClick={() => hasExpandableContent && setExpandedId(isExpanded ? null : log.id)}
                  >
                    <div className={`w-9 h-9 rounded-lg ${cfg.bg} flex items-center justify-center flex-shrink-0 mt-0.5`}>
                      <Icon className={`w-4 h-4 ${cfg.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-gray-900 truncate">{log.title}</p>
                        <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded ${cfg.bg} ${cfg.color} font-medium`}>
                          {cfg.label}
                        </span>
                        {log.status === "failed" && (
                          <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-600 font-medium">
                            失败
                          </span>
                        )}
                      </div>
                      {log.body && (
                        <p className={`text-xs text-gray-500 mt-0.5 ${isExpanded ? "" : "truncate"}`}>
                          {log.body}
                        </p>
                      )}
                    </div>
                    <span className="text-xs text-gray-400 whitespace-nowrap flex-shrink-0">
                      {formatTime(log.created_at)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
