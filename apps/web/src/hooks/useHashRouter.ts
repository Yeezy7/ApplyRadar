import { useState, useEffect, useCallback } from "react";

export type Page =
  | "dashboard"
  | "applications"
  | "kanban"
  | "tracker"
  | "reminders"
  | "push"
  | "resume"
  | "settings";

interface RouteState {
  page: Page;
  selectedAppId: string | null;
}

function parseHash(hash: string): RouteState {
  const cleanHash = hash.replace(/^#\/?/, "");
  const parts = cleanHash.split("/");

  const page = (parts[0] || "dashboard") as Page;
  const validPages: Page[] = ["dashboard", "applications", "kanban", "tracker", "reminders", "push", "resume", "settings"];
  const validPage = validPages.includes(page) ? page : "dashboard";

  const selectedAppId = parts[1] || null;

  return { page: validPage, selectedAppId };
}

function buildHash(page: Page, selectedAppId?: string | null): string {
  if (selectedAppId) {
    return `#/${page}/${selectedAppId}`;
  }
  return `#/${page}`;
}

export function useHashRouter() {
  const [route, setRoute] = useState<RouteState>(() => parseHash(window.location.hash));

  useEffect(() => {
    const handleHashChange = () => {
      setRoute(parseHash(window.location.hash));
    };

    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  const navigate = useCallback((page: Page, selectedAppId?: string | null) => {
    const newHash = buildHash(page, selectedAppId);
    window.location.hash = newHash;
  }, []);

  const navigateToApp = useCallback((appId: string) => {
    navigate(route.page, appId);
  }, [navigate, route.page]);

  const navigateBack = useCallback(() => {
    navigate(route.page);
  }, [navigate, route.page]);

  return {
    page: route.page,
    selectedAppId: route.selectedAppId,
    navigate,
    navigateToApp,
    navigateBack,
  };
}
