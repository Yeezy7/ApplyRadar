import { useState, useEffect } from "react";
import { loadSettings } from "./stores/settings";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import {
  BriefcaseBusiness,
  Activity,
  Bell,
  Settings,
  LayoutDashboard,
  Columns3,
  Laptop,
  ChevronsLeft,
} from "lucide-react";
import ApplicationsPage from "./pages/ApplicationsPage";
import ApplicationDetailPage from "./pages/ApplicationDetailPage";
import TrackerPage from "./pages/TrackerPage";
import RemindersPage from "./pages/RemindersPage";
import SettingsPage from "./pages/SettingsPage";
import DashboardPage from "./pages/DashboardPage";
import KanbanPage from "./pages/KanbanPage";
import { applicationService, trackerService, reminderService, notificationService } from "./services";

const appWindow = getCurrentWindow();

type Page = "dashboard" | "applications" | "kanban" | "tracker" | "reminders" | "settings";

interface NavCounts {
  applications: number;
  tracker: number;
  reminders: number;
}

interface AutoCheckNotifyPayload {
  type: string;
  title: string;
  body: string;
  targetId?: string | null;
  applicationId?: string | null;
}

interface ReminderDueNotifyPayload {
  title: string;
  body: string;
  reminderId: string;
  applicationId?: string | null;
}

const navItems: {
  key: Page;
  label: string;
  icon: typeof BriefcaseBusiness;
  countKey?: keyof NavCounts;
}[] = [
  { key: "dashboard", label: "仪表盘", icon: LayoutDashboard },
  { key: "applications", label: "求职记录", icon: BriefcaseBusiness, countKey: "applications" },
  { key: "kanban", label: "看板", icon: Columns3 },
  { key: "tracker", label: "状态监控", icon: Activity, countKey: "tracker" },
  { key: "reminders", label: "提醒", icon: Bell, countKey: "reminders" },
  { key: "settings", label: "设置", icon: Settings },
];

export default function App() {
  const [page, setPage] = useState<Page>("dashboard");
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null);
  const [compact, setCompact] = useState(false);
  const [counts, setCounts] = useState<NavCounts>({
    applications: 0,
    tracker: 0,
    reminders: 0,
  });

  useEffect(() => {
    loadSettings();
  }, []);

  useEffect(() => {
    const unlisteners: Array<() => void> = [];

    listen<AutoCheckNotifyPayload>("auto-check:notify", (event) => {
      const payload = event.payload;
      if (!payload?.title || !payload?.body) return;
      void notificationService.notify(payload.title, payload.body);
    }).then((fn) => {
      unlisteners.push(fn);
    }).catch((e) => {
      console.error("Failed to listen auto-check notifications:", e);
    });

    listen<ReminderDueNotifyPayload>("reminder:due", (event) => {
      const payload = event.payload;
      if (!payload?.title || !payload?.body) return;
      void notificationService.notify(payload.title, payload.body);
    }).then((fn) => {
      unlisteners.push(fn);
    }).catch((e) => {
      console.error("Failed to listen reminder notifications:", e);
    });

    return () => {
      for (const unlisten of unlisteners) {
        unlisten();
      }
    };
  }, []);

  const loadCounts = async () => {
    try {
      const [apps, targets, reminders] = await Promise.all([
        applicationService.listApplications(),
        trackerService.listTrackingTargets(),
        reminderService.listReminders(undefined, false),
      ]);
      setCounts({
        applications: apps.length,
        tracker: targets.filter((t) => t.enabled).length,
        reminders: reminders.length,
      });
    } catch (e) {
      console.error("Failed to load counts:", e);
    }
  };

  useEffect(() => {
    loadCounts();
  }, [page]);

  const handleNavigate = (p: Page) => {
    setPage(p);
    setSelectedAppId(null);
  };

  return (
    <div className="relative flex h-screen bg-[#FAF9F5] text-stone-900 font-sans">
      {/* Single drag strip covering entire top */}
      <div
        className="absolute top-0 left-0 right-0 z-10 h-[36px] cursor-default"
        onMouseDown={(e) => {
          if (e.button === 0) appWindow.startDragging();
        }}
      />

      {/* Sidebar */}
      <aside
        className="flex shrink-0 flex-col border-r border-stone-200 bg-[#F3F0E8] transition-all duration-200"
        style={{ width: compact ? 72 : 220 }}
      >
        {/* Traffic light area */}
        <div className="flex h-[36px] shrink-0 items-start pl-[70px] pt-[14px]">
          <button
            onClick={() => setCompact(!compact)}
            className="relative z-20 flex h-[18px] w-[18px] items-center justify-center rounded-md text-stone-400 hover:bg-stone-300/60 hover:text-stone-600"
            aria-label={compact ? "展开侧边栏" : "收起侧边栏"}
          >
            <ChevronsLeft
              className={`h-3 w-3 transition-transform duration-200 ${compact ? "rotate-180" : ""}`}
            />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 px-2 pt-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = page === item.key && !selectedAppId;
            return (
              <button
                key={item.key}
                onClick={() => handleNavigate(item.key)}
                className={`flex h-9 w-full items-center gap-2 rounded-lg px-2 text-[13px] transition ${
                  active
                    ? "bg-white text-stone-950 shadow-sm ring-1 ring-stone-200"
                    : "text-stone-600 hover:bg-stone-200/70 hover:text-stone-950"
                }`}
                title={compact ? item.label : undefined}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {!compact && (
                  <span className="truncate font-medium">{item.label}</span>
                )}
                {!compact && item.countKey && counts[item.countKey] > 0 && (
                  <span className="ml-auto rounded-md bg-stone-100 px-1.5 py-0.5 text-[11px] text-stone-500">
                    {counts[item.countKey]}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Bottom section */}
        <div className="shrink-0">
          {!compact && (
            <div className="mx-2 mb-2 space-y-2 rounded-xl border border-stone-200 bg-white/55 p-3 shadow-sm">
              <div className="flex items-center gap-2">
                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100">
                  <Laptop className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-stone-800">本地模式</div>
                  <div className="text-[11px] text-stone-500">数据存储在本机</div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-1 text-[10px] text-stone-500">
                <div className="rounded-md bg-stone-100 px-1.5 py-1 text-center">SQLite</div>
                <div className="rounded-md bg-stone-100 px-1.5 py-1 text-center">Tauri</div>
                <div className="rounded-md bg-stone-100 px-1.5 py-1 text-center">本地</div>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex min-w-0 flex-1 flex-col">
        <div className="h-[36px] shrink-0 bg-[#F3F0E8]" />
        <div className="min-h-0 flex-1 overflow-auto bg-[#FAF9F5]">
          {selectedAppId ? (
            <ApplicationDetailPage
              applicationId={selectedAppId}
              onBack={() => setSelectedAppId(null)}
            />
          ) : (
            <>
              {page === "dashboard" && <DashboardPage />}
              {page === "applications" && (
                <ApplicationsPage onSelectApp={(id) => setSelectedAppId(id)} />
              )}
              {page === "kanban" && (
                <KanbanPage onSelectApp={(id) => setSelectedAppId(id)} />
              )}
              {page === "tracker" && <TrackerPage />}
              {page === "reminders" && <RemindersPage />}
              {page === "settings" && <SettingsPage />}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
