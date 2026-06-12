import { useState, useEffect, useRef } from "react";
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
  Send,
} from "lucide-react";
import ApplicationsPage from "./pages/ApplicationsPage";
import ApplicationDetailPage from "./pages/ApplicationDetailPage";
import TrackerPage from "./pages/TrackerPage";
import RemindersPage from "./pages/RemindersPage";
import SettingsPage from "./pages/SettingsPage";
import DashboardPage from "./pages/DashboardPage";
import KanbanPage from "./pages/KanbanPage";
import PushPage from "./pages/PushPage";
import { applicationService, trackerService, reminderService, notificationService } from "./services";
import ErrorBoundary from "./components/ErrorBoundary";

const appWindow = getCurrentWindow();
const MIN_SIDEBAR_WIDTH = 72;
const DEFAULT_SIDEBAR_WIDTH = 220;
const MAX_SIDEBAR_WIDTH = 300;
const COMPACT_SIDEBAR_THRESHOLD = 128;

const clampSidebarWidth = (width: number) =>
  Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, width));

const loadSidebarWidth = (): number => {
  try {
    const saved = localStorage.getItem("sidebarWidth");
    if (saved) {
      const w = parseInt(saved, 10);
      if (Number.isFinite(w)) return clampSidebarWidth(w);
    }
  } catch {}
  return DEFAULT_SIDEBAR_WIDTH;
};

type Page = "dashboard" | "applications" | "kanban" | "tracker" | "reminders" | "push" | "settings";

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
  { key: "push", label: "推送", icon: Send },
  { key: "settings", label: "设置", icon: Settings },
];

export default function App() {
  const [page, setPage] = useState<Page>("dashboard");
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(loadSidebarWidth);
  const sidebarWidthRef = useRef(sidebarWidth);
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const [counts, setCounts] = useState<NavCounts>({
    applications: 0,
    tracker: 0,
    reminders: 0,
  });
  const compact = sidebarWidth < COMPACT_SIDEBAR_THRESHOLD;

  useEffect(() => {
    sidebarWidthRef.current = sidebarWidth;
  }, [sidebarWidth]);

  useEffect(() => {
    loadSettings();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const unlisteners: Array<() => void> = [];

    listen<AutoCheckNotifyPayload>("auto-check:notify", (event) => {
      const payload = event.payload;
      if (!payload?.title || !payload?.body) return;
      void notificationService.notify(payload.title, payload.body);
    }).then((fn) => {
      if (cancelled) { fn(); return; }
      unlisteners.push(fn);
    }).catch((e) => {
      console.error("Failed to listen auto-check notifications:", e);
    });

    listen<ReminderDueNotifyPayload>("reminder:due", (event) => {
      const payload = event.payload;
      if (!payload?.title || !payload?.body) return;
      void notificationService.notify(payload.title, payload.body);
    }).then((fn) => {
      if (cancelled) { fn(); return; }
      unlisteners.push(fn);
    }).catch((e) => {
      console.error("Failed to listen reminder notifications:", e);
    });

    return () => {
      cancelled = true;
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
    // Refresh counts every 60 seconds instead of on every page change
    const timer = setInterval(loadCounts, 60000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!isResizingSidebar) return;

    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const handleMouseMove = (event: MouseEvent) => {
      setSidebarWidth(clampSidebarWidth(event.clientX));
    };

    const handleMouseUp = () => {
      setIsResizingSidebar(false);
      try { localStorage.setItem("sidebarWidth", String(sidebarWidthRef.current)); } catch {}
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizingSidebar]);

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
        className={`relative flex shrink-0 flex-col bg-[#F3F0E8] ${
          isResizingSidebar ? "" : "transition-all duration-200"
        }`}
        style={{ width: sidebarWidth }}
      >
        <div className="pointer-events-none absolute bottom-0 right-0 top-[36px] w-px bg-stone-200" />
        <div
          className="absolute bottom-0 right-[-3px] top-[36px] z-30 w-1.5 cursor-col-resize rounded-full hover:bg-stone-300/70"
          onMouseDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setIsResizingSidebar(true);
          }}
          aria-label="拖动调整侧边栏宽度"
          role="separator"
        />

        {/* Traffic light area */}
        <div className="flex h-[36px] shrink-0 items-start pl-[100px] pt-[7px]">
          <button
            onClick={() => {
              const w = compact ? DEFAULT_SIDEBAR_WIDTH : MIN_SIDEBAR_WIDTH;
              setSidebarWidth(w);
              try { localStorage.setItem("sidebarWidth", String(w)); } catch {}
            }}
            className="relative z-20 flex h-[20px] w-[20px] items-center justify-center rounded-md text-stone-400 hover:bg-stone-300/60 hover:text-stone-600"
            aria-label={compact ? "展开侧边栏" : "收起侧边栏"}
          >
            <ChevronsLeft
              className={`h-7 w-7 transition-transform duration-200 ${compact ? "rotate-180" : ""}`}
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
                className={`flex h-9 w-full items-center gap-2 rounded-lg text-[13px] transition ${
                  active
                    ? "bg-white text-stone-950 shadow-sm ring-1 ring-stone-200"
                    : "text-stone-600 hover:bg-stone-200/70 hover:text-stone-950"
                } ${compact ? "justify-center px-0" : "px-2"}`}
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
          <ErrorBoundary key={selectedAppId || page}>
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
                {page === "push" && <PushPage />}
                {page === "settings" && <SettingsPage />}
              </>
            )}
          </ErrorBoundary>
        </div>
      </main>
    </div>
  );
}
