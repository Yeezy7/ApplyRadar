import { useEffect, useState, useCallback } from "react";
import {
  BriefcaseBusiness,
  TrendingUp,
  CalendarDays,
  AlertTriangle,
  Clock3,
  CheckCircle2,
  BarChart3,
} from "lucide-react";
import type { ApplicationStatus } from "@applyradar/shared";
import { STATUS_LABELS, STATUS_COLORS } from "@applyradar/shared";
import { getStats, type DashboardStats } from "../services/statsService";

interface DashboardPageProps {
  onNavigate?: (page: string, params?: Record<string, string>) => void;
}

export default function DashboardPage(_props: DashboardPageProps) {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getStats();
      setStats(data);
    } catch (e) {
      console.error("Failed to load dashboard:", e);
      setError(`加载仪表盘失败: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  if (loading) {
    return (
      <div className="px-4 pb-4 pt-2">
        <div className="animate-pulse space-y-6">
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-28 bg-gray-200 rounded-2xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const statCards = stats
    ? [
        {
          label: "总投递",
          value: stats.total,
          icon: BriefcaseBusiness,
          gradient: "from-stone-700 to-stone-900",
        },
        {
          label: "进行中",
          value: stats.active,
          icon: TrendingUp,
          gradient: "from-emerald-500 to-teal-600",
        },
        {
          label: "本周新增",
          value: stats.thisWeek,
          icon: CalendarDays,
          gradient: "from-blue-500 to-cyan-600",
        },
        {
          label: "待处理",
          value: stats.pendingReminders,
          icon: Clock3,
          gradient: "from-amber-400 to-yellow-500",
        },
      ]
    : [];

  return (
    <div className="px-4 pb-4 pt-2">
      {error && (
        <div className="mb-5 flex items-center justify-between rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span>{error}</span>
          <button
            onClick={loadDashboard}
            className="rounded px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-100"
          >
            重试
          </button>
        </div>
      )}

      {/* Stat Cards */}
      <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className="relative overflow-hidden bg-white rounded-2xl border border-gray-100 p-5 hover:shadow-md transition-shadow duration-200"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-gray-500 mb-1">{card.label}</p>
                  <p className="text-3xl font-bold text-gray-900">{card.value}</p>
                </div>
                <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${card.gradient} flex items-center justify-center shadow-sm`}>
                  <Icon className="w-5 h-5 text-white" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        {/* Status Breakdown */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6 xl:col-span-1">
          <div className="flex items-center gap-2 mb-5">
            <BarChart3 className="w-4 h-4 text-gray-400" />
            <h2 className="text-base font-semibold text-gray-900">状态分布</h2>
          </div>
          {!stats || Object.keys(stats.statusCounts).length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">暂无数据</p>
          ) : (
            <div className="space-y-3">
              {Object.entries(stats.statusCounts)
                .sort(([, a], [, b]) => b - a)
                .map(([status, count]) => {
                  const percentage =
                    stats.total > 0
                      ? Math.round((count / stats.total) * 100)
                      : 0;
                  return (
                    <div key={status}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm text-gray-700">
                          {STATUS_LABELS[status as ApplicationStatus]}
                        </span>
                        <span className="text-sm font-medium text-gray-900">
                          {count}
                        </span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-2">
                        <div
                          className="bg-stone-600 rounded-full h-2 transition-all duration-500"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>

        {/* Recent Applications */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6 xl:col-span-2">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-base font-semibold text-gray-900">最近更新</h2>
            <span className="text-xs text-gray-400">
              {stats?.recentApps.length || 0} 条记录
            </span>
          </div>
          {!stats || stats.recentApps.length === 0 ? (
            <div className="text-center py-8">
              <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
                <BriefcaseBusiness className="w-5 h-5 text-gray-400" />
              </div>
              <p className="text-sm text-gray-400">暂无求职记录</p>
              <p className="text-xs text-gray-300 mt-1">在"求职记录"页面添加</p>
            </div>
          ) : (
            <div className="space-y-1">
              {stats.recentApps.map((app) => (
                <div
                  key={app.id}
                  className="flex items-center gap-4 px-3 py-3 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-stone-100 to-stone-200 flex items-center justify-center text-stone-700 font-bold text-xs flex-shrink-0">
                    {app.company_name.slice(0, 1)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {app.company_name}
                    </p>
                    <p className="text-xs text-gray-500 truncate">
                      {app.job_title}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span
                      className={`text-xs px-2 py-1 rounded-lg font-medium ${
                        STATUS_COLORS[app.status as ApplicationStatus] ||
                        STATUS_COLORS.unknown
                      }`}
                    >
                      {STATUS_LABELS[app.status as ApplicationStatus]}
                    </span>
                    <span className="text-xs text-gray-400">
                      {new Date(app.updated_at).toLocaleDateString("zh-CN", {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Offers Alert */}
      {stats && stats.offers > 0 && (
        <div className="mt-6">
          <div className="flex items-center gap-3 p-4 bg-green-50 rounded-xl border border-green-100">
            <CheckCircle2 className="w-5 h-5 text-green-500" />
            <div>
              <p className="text-sm font-medium text-green-800">
                {stats.offers} 个 Offer
              </p>
              <p className="text-xs text-green-600">恭喜！</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
