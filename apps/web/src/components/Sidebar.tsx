import {
  LayoutDashboard,
  BriefcaseBusiness,
  Columns3,
  Activity,
  Bell,
  Send,
  Settings,
  Radar,
  Menu,
  X,
  FileText,
} from "lucide-react";
import { getUser } from "../stores/authStore";

export type Page =
  | "dashboard"
  | "applications"
  | "kanban"
  | "tracker"
  | "reminders"
  | "push"
  | "resume"
  | "settings";

interface NavItem {
  key: Page;
  label: string;
  icon: typeof LayoutDashboard;
  count?: number;
}

interface SidebarProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
  counts: { applications: number; reminders: number };
  isMobileOpen: boolean;
  onMobileClose: () => void;
}

const navItems: Omit<NavItem, "count">[] = [
  { key: "dashboard", label: "仪表盘", icon: LayoutDashboard },
  { key: "applications", label: "求职记录", icon: BriefcaseBusiness },
  { key: "kanban", label: "看板", icon: Columns3 },
  { key: "tracker", label: "状态监控", icon: Activity },
  { key: "reminders", label: "提醒", icon: Bell },
  { key: "push", label: "推送日志", icon: Send },
  { key: "resume", label: "简历管理", icon: FileText },
  { key: "settings", label: "设置", icon: Settings },
];

export default function Sidebar({
  currentPage,
  onNavigate,
  counts,
  isMobileOpen,
  onMobileClose,
}: SidebarProps) {
  const user = getUser();
  const initials = (user?.nickname || user?.email || "U").slice(0, 1).toUpperCase();

  const handleClick = (key: Page) => {
    onNavigate(key);
    onMobileClose();
  };

  return (
    <>
      {/* Mobile overlay */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onMobileClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed lg:static inset-y-0 left-0 z-50 w-64 bg-gray-50 dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800
          transform transition-transform duration-200 ease-in-out
          ${isMobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
        `}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-800">
            <div className="flex items-center gap-2">
              <Radar className="w-6 h-6 text-blue-600" />
              <span className="font-bold text-gray-900 dark:text-white">
                投递雷达
              </span>
            </div>
            <button
              onClick={onMobileClose}
              className="lg:hidden p-1 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* User Info */}
          <div className="p-4 border-b border-gray-200 dark:border-gray-800">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold">
                {initials}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                  {user?.nickname || "用户"}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                  {user?.email || "未登录"}
                </p>
              </div>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-3 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = currentPage === item.key;
              const count =
                item.key === "applications"
                  ? counts.applications
                  : item.key === "reminders"
                    ? counts.reminders
                    : undefined;

              return (
                <button
                  key={item.key}
                  onClick={() => handleClick(item.key)}
                  className={`
                    flex items-center w-full gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
                    ${
                      active
                        ? "bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 shadow-sm"
                        : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                    }
                  `}
                >
                  <Icon className="w-5 h-5 shrink-0" />
                  <span>{item.label}</span>
                  {count !== undefined && count > 0 && (
                    <span className="ml-auto px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-full">
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Footer */}
          <div className="p-4 border-t border-gray-200 dark:border-gray-800">
            <div className="text-xs text-gray-500 dark:text-gray-400 text-center">
              ApplyRadar Web v0.1.0
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}

export function MobileHeader({ onMenuClick }: { onMenuClick: () => void }) {
  return (
    <header className="lg:hidden flex items-center gap-3 px-4 py-3 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
      <button
        onClick={onMenuClick}
        className="p-1 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
      >
        <Menu className="w-6 h-6" />
      </button>
      <div className="flex items-center gap-2">
        <Radar className="w-5 h-5 text-blue-600" />
        <span className="font-bold text-gray-900 dark:text-white">
          投递雷达
        </span>
      </div>
    </header>
  );
}
