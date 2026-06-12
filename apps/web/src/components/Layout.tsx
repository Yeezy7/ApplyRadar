import { useState } from "react";
import Sidebar, { MobileHeader, type Page } from "./Sidebar";

interface LayoutProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
  counts: { applications: number; reminders: number };
  children: React.ReactNode;
}

export default function Layout({
  currentPage,
  onNavigate,
  counts,
  children,
}: LayoutProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-950">
      <Sidebar
        currentPage={currentPage}
        onNavigate={onNavigate}
        counts={counts}
        isMobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <MobileHeader onMenuClick={() => setMobileOpen(true)} />
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
