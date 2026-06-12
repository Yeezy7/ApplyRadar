import { useState, useEffect, useCallback, lazy, Suspense } from "react";
import { isAuthenticated, logout } from "./stores/authStore";
import { useHashRouter } from "./hooks/useHashRouter";
import Layout from "./components/Layout";
import ErrorBoundary from "./components/ErrorBoundary";
import type { Page } from "./components/Sidebar";
import AuthPage from "./pages/AuthPage";
import { listApplications } from "./services/applicationService";
import { listReminders } from "./services/reminderService";

// 懒加载页面组件
const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const ApplicationsPage = lazy(() => import("./pages/ApplicationsPage"));
const KanbanPage = lazy(() => import("./pages/KanbanPage"));
const RemindersPage = lazy(() => import("./pages/RemindersPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const ApplicationDetailPage = lazy(() => import("./pages/ApplicationDetailPage"));
const TrackerPage = lazy(() => import("./pages/TrackerPage"));
const PushPage = lazy(() => import("./pages/PushPage"));

// 加载状态组件
function PageLoading() {
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-stone-200 dark:border-stone-700 border-t-stone-600 dark:border-t-stone-400 rounded-full animate-spin" />
        <p className="text-sm text-gray-500 dark:text-gray-400">加载中...</p>
      </div>
    </div>
  );
}

export default function App() {
  const [authenticated, setAuthenticated] = useState(
    isAuthenticated(),
  );
  const [counts, setCounts] = useState({ applications: 0, reminders: 0 });
  const { page: currentPage, selectedAppId, navigate, navigateToApp, navigateBack } = useHashRouter();

  const loadCounts = useCallback(async () => {
    try {
      const [apps, reminders] = await Promise.all([
        listApplications().catch(() => []),
        listReminders().catch(() => []),
      ]);
      setCounts({
        applications: apps.length,
        reminders: reminders.length,
      });
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (authenticated) {
      loadCounts();
      const timer = setInterval(loadCounts, 60000);
      return () => clearInterval(timer);
    }
  }, [authenticated, loadCounts]);

  const handleLogin = () => {
    setAuthenticated(true);
  };

  const handleLogout = () => {
    logout();
    setAuthenticated(false);
    navigate("dashboard");
  };

  const handleNavigate = (page: Page) => {
    navigate(page);
  };

  const handleNavigateWithParams = (page: string, _params?: Record<string, string>) => {
    navigate(page as Page);
  };

  if (!authenticated) {
    return <AuthPage onLogin={handleLogin} />;
  }

  return (
    <Layout
      currentPage={currentPage}
      onNavigate={handleNavigate}
      counts={counts}
    >
      <ErrorBoundary key={selectedAppId || currentPage}>
        <Suspense fallback={<PageLoading />}>
          {selectedAppId ? (
            <ApplicationDetailPage
              applicationId={selectedAppId}
              onBack={navigateBack}
            />
          ) : (
            <>
              {currentPage === "dashboard" && <DashboardPage onNavigate={handleNavigateWithParams} />}
              {currentPage === "applications" && (
                <ApplicationsPage onSelectApp={navigateToApp} />
              )}
              {currentPage === "kanban" && (
                <KanbanPage onSelectApp={navigateToApp} />
              )}
              {currentPage === "tracker" && <TrackerPage />}
              {currentPage === "reminders" && <RemindersPage />}
              {currentPage === "push" && <PushPage />}
              {currentPage === "settings" && (
                <SettingsPage onLogout={handleLogout} />
              )}
            </>
          )}
        </Suspense>
      </ErrorBoundary>
    </Layout>
  );
}
