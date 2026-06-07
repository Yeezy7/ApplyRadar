import React, { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Radar,
  BriefcaseBusiness,
  Activity,
  Bell,
  Settings,
  Search,
  Plus,
  Play,
  RefreshCw,
  ShieldCheck,
  AlertTriangle,
  Clock3,
  CalendarDays,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Laptop,
  Cloud,
  Mail,
  Filter,
  ChevronDown,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Database,
  Wifi,
  Lock,
  FileText,
  Command,
} from "lucide-react";

const navItems = [
  { key: "applications", label: "Applications", icon: BriefcaseBusiness, count: 47 },
  { key: "tracker", label: "Tracker", icon: Activity, count: 6 },
  { key: "reminders", label: "Reminders", icon: Bell, count: 9 },
  { key: "documents", label: "Documents", icon: FileText, count: 12 },
  { key: "settings", label: "Settings", icon: Settings, count: null },
];

const applications = [
  {
    company: "ByteDance",
    role: "Backend Engineer",
    status: "Interview",
    statusTone: "blue",
    source: "Official",
    updated: "09:12",
    wait: "3d",
    priority: "High",
    tracker: "Valid",
    next: "Interview prep · Today 20:00",
  },
  {
    company: "Tencent",
    role: "Frontend Developer",
    status: "Under Review",
    statusTone: "purple",
    source: "Referral",
    updated: "08:46",
    wait: "11d",
    priority: "Medium",
    tracker: "Expired",
    next: "Re-login required",
  },
  {
    company: "Meituan",
    role: "Data Analyst",
    status: "Rejected",
    statusTone: "red",
    source: "Official",
    updated: "Yesterday",
    wait: "16d",
    priority: "Low",
    tracker: "Valid",
    next: "Archive suggested",
  },
  {
    company: "Xiaomi",
    role: "Product Manager",
    status: "Assessment",
    statusTone: "amber",
    source: "Email",
    updated: "Jun 01",
    wait: "2d",
    priority: "High",
    tracker: "Valid",
    next: "Assessment due tomorrow",
  },
  {
    company: "Alibaba Cloud",
    role: "AI Platform Intern",
    status: "Applied",
    statusTone: "green",
    source: "Official",
    updated: "May 30",
    wait: "5d",
    priority: "Medium",
    tracker: "Valid",
    next: "No action",
  },
  {
    company: "Shopee",
    role: "Data Engineer",
    status: "Under Review",
    statusTone: "purple",
    source: "Official",
    updated: "May 29",
    wait: "7d",
    priority: "Medium",
    tracker: "MFA",
    next: "Manual verification",
  },
];

const trackerTargets = [
  { site: "Workday · Company A", state: "Valid", tone: "green", checked: "09:12", count: 12 },
  { site: "Tencent Careers", state: "Expired", tone: "amber", checked: "Yesterday", count: 4 },
  { site: "Greenhouse", state: "Valid", tone: "green", checked: "08:46", count: 9 },
  { site: "Ashby", state: "MFA Required", tone: "red", checked: "2d ago", count: 3 },
];

const activity = [
  { label: "ByteDance moved to Interview", time: "12 min ago", type: "positive" },
  { label: "Xiaomi assessment deadline detected", time: "1 h ago", type: "warning" },
  { label: "Tencent login session expired", time: "3 h ago", type: "warning" },
  { label: "Meituan marked as Rejected", time: "Yesterday", type: "negative" },
];

function cn(...classes) {
  return classes.filter(Boolean).join(" ");
}

function toneClasses(tone) {
  const map = {
    blue: "bg-blue-50 text-blue-700 border-blue-200",
    purple: "bg-violet-50 text-violet-700 border-violet-200",
    red: "bg-rose-50 text-rose-700 border-rose-200",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    green: "bg-emerald-50 text-emerald-700 border-emerald-200",
    gray: "bg-stone-100 text-stone-600 border-stone-200",
  };
  return map[tone] || map.gray;
}

function StatusBadge({ status, tone }) {
  return (
    <span className={cn("inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium", toneClasses(tone))}>
      {status}
    </span>
  );
}

function WindowChrome() {
  return (
    <div className="flex h-10 select-none items-center justify-between border-b border-stone-200/80 bg-[#F7F5F0]/90 px-4 backdrop-blur-xl">
      <div className="flex items-center gap-2">
        <span className="h-3 w-3 rounded-full bg-[#FF5F57]" />
        <span className="h-3 w-3 rounded-full bg-[#FFBD2E]" />
        <span className="h-3 w-3 rounded-full bg-[#28C840]" />
      </div>
      <div className="flex items-center gap-2 rounded-md border border-stone-200 bg-white/70 px-3 py-1 text-xs text-stone-500 shadow-sm">
        <Radar className="h-3.5 w-3.5 text-stone-600" />
        ApplyRadar · Local Workspace
      </div>
      <div className="flex items-center gap-2 text-xs text-stone-400">
        <Command className="h-3.5 w-3.5" />
        K
      </div>
    </div>
  );
}

function Sidebar({ active, setActive, compact, setCompact }) {
  return (
    <motion.aside
      animate={{ width: compact ? 72 : 236 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      className="shrink-0 border-r border-stone-200 bg-[#F3F0E8]"
    >
      <div className="flex h-full flex-col p-3">
        <div className="mb-4 flex h-10 items-center justify-between">
          <button className="flex min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-stone-200/70" onClick={() => setActive("applications")}>
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-stone-900 text-white shadow-sm">
              <Radar className="h-4 w-4" />
            </div>
            {!compact && (
              <div className="min-w-0 text-left">
                <div className="truncate text-sm font-semibold text-stone-900">ApplyRadar</div>
                <div className="truncate text-[11px] text-stone-500">投递雷达</div>
              </div>
            )}
          </button>
          {!compact && (
            <button
              onClick={() => setCompact(true)}
              className="rounded-md p-1.5 text-stone-500 hover:bg-stone-200/70 hover:text-stone-900"
              aria-label="Collapse sidebar"
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
          )}
        </div>

        {compact && (
          <button
            onClick={() => setCompact(false)}
            className="mb-3 grid h-8 w-8 place-items-center self-center rounded-md text-stone-500 hover:bg-stone-200/70 hover:text-stone-900"
            aria-label="Expand sidebar"
          >
            <PanelLeftOpen className="h-4 w-4" />
          </button>
        )}

        <div className="mb-3 px-2 text-[11px] font-medium uppercase tracking-wider text-stone-400">
          {!compact ? "Workspace" : ""}
        </div>

        <nav className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const selected = active === item.key;
            return (
              <button
                key={item.key}
                onClick={() => setActive(item.key)}
                className={cn(
                  "flex h-9 w-full items-center gap-2 rounded-lg px-2 text-[13px] transition",
                  selected
                    ? "bg-white text-stone-950 shadow-sm ring-1 ring-stone-200"
                    : "text-stone-600 hover:bg-stone-200/70 hover:text-stone-950"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {!compact && <span className="truncate font-medium">{item.label}</span>}
                {!compact && item.count !== null && (
                  <span className="ml-auto rounded-md bg-stone-100 px-1.5 py-0.5 text-[11px] text-stone-500">{item.count}</span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="mt-auto space-y-2 rounded-xl border border-stone-200 bg-white/55 p-3 shadow-sm">
          <div className="flex items-center gap-2">
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100">
              <Laptop className="h-4 w-4" />
            </div>
            {!compact && (
              <div className="min-w-0">
                <div className="text-xs font-semibold text-stone-800">Local mode</div>
                <div className="text-[11px] text-stone-500">Profiles stay here</div>
              </div>
            )}
          </div>
          {!compact && (
            <div className="grid grid-cols-3 gap-1 text-[10px] text-stone-500">
              <div className="rounded-md bg-stone-100 px-1.5 py-1 text-center">SQLite</div>
              <div className="rounded-md bg-stone-100 px-1.5 py-1 text-center">Tauri</div>
              <div className="rounded-md bg-stone-100 px-1.5 py-1 text-center">Local</div>
            </div>
          )}
        </div>
      </div>
    </motion.aside>
  );
}

function Toolbar({ active }) {
  const titles = {
    applications: "Applications",
    tracker: "Status Tracker",
    reminders: "Reminders",
    documents: "Documents",
    settings: "Settings",
  };

  return (
    <div className="flex h-14 items-center justify-between border-b border-stone-200 bg-[#FAF9F5] px-5">
      <div className="flex items-center gap-3">
        <h1 className="text-[17px] font-semibold text-stone-950">{titles[active]}</h1>
        <button className="flex items-center gap-1 rounded-md border border-stone-200 bg-white px-2.5 py-1.5 text-xs text-stone-600 shadow-sm hover:bg-stone-50">
          All jobs
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex items-center gap-2">
        <div className="flex h-8 w-72 items-center gap-2 rounded-lg border border-stone-200 bg-white px-2.5 text-[13px] text-stone-400 shadow-sm">
          <Search className="h-3.5 w-3.5" />
          <span>Search company, role, status...</span>
        </div>
        <button className="flex h-8 items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-2.5 text-xs font-medium text-stone-600 shadow-sm hover:bg-stone-50">
          <Filter className="h-3.5 w-3.5" />
          Filter
        </button>
        <button className="flex h-8 items-center gap-1.5 rounded-lg bg-stone-900 px-3 text-xs font-medium text-white shadow-sm hover:bg-stone-800">
          <Plus className="h-3.5 w-3.5" />
          New
        </button>
      </div>
    </div>
  );
}

function CompactMetric({ label, value, icon: Icon, tone }) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-3 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="text-[12px] text-stone-500">{label}</div>
        <div className={cn("grid h-7 w-7 place-items-center rounded-lg border", toneClasses(tone))}>
          <Icon className="h-3.5 w-3.5" />
        </div>
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight text-stone-950">{value}</div>
    </div>
  );
}

function ApplicationTable({ selected, setSelected }) {
  return (
    <div className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
      <table className="w-full text-left text-[13px]">
        <thead className="border-b border-stone-200 bg-stone-50 text-[11px] uppercase tracking-wide text-stone-500">
          <tr>
            <th className="w-9 px-3 py-2.5"><input type="checkbox" className="h-3.5 w-3.5 rounded border-stone-300" /></th>
            <th className="px-2 py-2.5 font-medium">Company</th>
            <th className="px-2 py-2.5 font-medium">Role</th>
            <th className="px-2 py-2.5 font-medium">Status</th>
            <th className="px-2 py-2.5 font-medium">Tracker</th>
            <th className="px-2 py-2.5 font-medium">Wait</th>
            <th className="px-2 py-2.5 font-medium">Next action</th>
            <th className="px-3 py-2.5 font-medium">Updated</th>
          </tr>
        </thead>
        <tbody>
          {applications.map((app, index) => {
            const active = selected.company === app.company;
            return (
              <tr
                key={`${app.company}-${app.role}`}
                onClick={() => setSelected(app)}
                className={cn(
                  "cursor-default border-b border-stone-100 last:border-0 hover:bg-[#F7F4EC]",
                  active && "bg-[#F2EEE4]"
                )}
              >
                <td className="px-3 py-2.5"><input type="checkbox" className="h-3.5 w-3.5 rounded border-stone-300" /></td>
                <td className="px-2 py-2.5 font-medium text-stone-950">{app.company}</td>
                <td className="px-2 py-2.5 text-stone-600">{app.role}</td>
                <td className="px-2 py-2.5"><StatusBadge status={app.status} tone={app.statusTone} /></td>
                <td className="px-2 py-2.5">
                  <StatusBadge status={app.tracker} tone={app.tracker === "Valid" ? "green" : app.tracker === "Expired" ? "amber" : "red"} />
                </td>
                <td className="px-2 py-2.5 text-stone-500">{app.wait}</td>
                <td className="max-w-[210px] truncate px-2 py-2.5 text-stone-500">{app.next}</td>
                <td className="px-3 py-2.5 text-stone-500">{app.updated}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Inspector({ selected }) {
  return (
    <aside className="w-[320px] shrink-0 border-l border-stone-200 bg-[#F7F5F0]">
      <div className="flex h-14 items-center justify-between border-b border-stone-200 px-4">
        <div className="text-sm font-semibold text-stone-900">Inspector</div>
        <button className="rounded-md p-1.5 text-stone-500 hover:bg-stone-200/80 hover:text-stone-900">
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-4 p-4">
        <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-lg font-semibold text-stone-950">{selected.company}</div>
              <div className="mt-1 text-sm text-stone-500">{selected.role}</div>
            </div>
            <button className="rounded-lg border border-stone-200 bg-white p-2 text-stone-500 shadow-sm hover:bg-stone-50">
              <ExternalLink className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <StatusBadge status={selected.status} tone={selected.statusTone} />
            <StatusBadge status={selected.priority} tone={selected.priority === "High" ? "red" : selected.priority === "Medium" ? "amber" : "gray"} />
          </div>
        </div>

        <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
          <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-stone-400">Automation</div>
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-stone-500">Session</span>
              <StatusBadge status={selected.tracker} tone={selected.tracker === "Valid" ? "green" : selected.tracker === "Expired" ? "amber" : "red"} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-stone-500">Check policy</span>
              <span className="font-medium text-stone-800">Daily · 09:00</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-stone-500">AI parser</span>
              <span className="font-medium text-stone-800">On page change</span>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button className="flex h-8 items-center justify-center gap-1.5 rounded-lg bg-stone-900 px-3 text-xs font-medium text-white hover:bg-stone-800">
              <Play className="h-3.5 w-3.5" />
              Check
            </button>
            <button className="flex h-8 items-center justify-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3 text-xs font-medium text-stone-700 hover:bg-stone-50">
              <RefreshCw className="h-3.5 w-3.5" />
              Re-login
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
          <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-stone-400">Recent activity</div>
          <div className="space-y-3">
            {activity.map((item) => {
              const Icon = item.type === "positive" ? CheckCircle2 : item.type === "negative" ? XCircle : AlertTriangle;
              const tone = item.type === "positive" ? "green" : item.type === "negative" ? "red" : "amber";
              return (
                <div key={item.label} className="flex gap-2.5">
                  <div className={cn("mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md border", toneClasses(tone))}>
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-[13px] text-stone-800">{item.label}</div>
                    <div className="text-[11px] text-stone-400">{item.time}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </aside>
  );
}

function ApplicationsPage({ selected, setSelected }) {
  return (
    <div className="space-y-4 p-4">
      <div className="grid grid-cols-4 gap-3">
        <CompactMetric label="Tracked" value="47" icon={BriefcaseBusiness} tone="blue" />
        <CompactMetric label="Changed" value="6" icon={Activity} tone="green" />
        <CompactMetric label="Due today" value="2" icon={Bell} tone="amber" />
        <CompactMetric label="Login issues" value="2" icon={AlertTriangle} tone="red" />
      </div>
      <ApplicationTable selected={selected} setSelected={setSelected} />
    </div>
  );
}

function TrackerPage() {
  return (
    <div className="space-y-4 p-4">
      <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-base font-semibold text-stone-950">Batch Status Check</div>
            <div className="mt-1 text-[13px] text-stone-500">Use local browser profiles. Start Playwright only while checking.</div>
          </div>
          <div className="flex gap-2">
            <button className="flex h-8 items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3 text-xs font-medium text-stone-700 shadow-sm hover:bg-stone-50">
              <RefreshCw className="h-3.5 w-3.5" />
              Dry Run
            </button>
            <button className="flex h-8 items-center gap-1.5 rounded-lg bg-stone-900 px-3 text-xs font-medium text-white shadow-sm hover:bg-stone-800">
              <Play className="h-3.5 w-3.5" />
              Check All
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
          <div className="mb-3 text-sm font-semibold text-stone-950">Site sessions</div>
          <div className="space-y-2">
            {trackerTargets.map((target) => (
              <div key={target.site} className="flex items-center justify-between rounded-lg border border-stone-100 bg-stone-50/60 px-3 py-2.5">
                <div className="flex items-center gap-2.5">
                  <div className={cn("grid h-8 w-8 place-items-center rounded-lg border", toneClasses(target.tone))}>
                    {target.state === "Valid" ? <ShieldCheck className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                  </div>
                  <div>
                    <div className="text-[13px] font-medium text-stone-850">{target.site}</div>
                    <div className="text-[11px] text-stone-500">{target.count} pages · {target.checked}</div>
                  </div>
                </div>
                <StatusBadge status={target.state} tone={target.tone} />
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
          <div className="mb-3 text-sm font-semibold text-stone-950">Runtime policy</div>
          <div className="space-y-2">
            {[
              [Clock3, "Daily low-frequency check", "Default at 09:00, concurrency = 1"],
              [Database, "Local SQLite workspace", "Records are stored on this device"],
              [Lock, "No job-site passwords", "Only browser session profiles are reused"],
              [Wifi, "Cloud worker optional", "Disabled by default"],
            ].map(([Icon, title, desc]) => (
              <div key={title} className="flex gap-2.5 rounded-lg border border-stone-100 bg-stone-50/60 px-3 py-2.5">
                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-stone-200 bg-white text-stone-600">
                  <Icon className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-[13px] font-medium text-stone-850">{title}</div>
                  <div className="text-[11px] text-stone-500">{desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <ApplicationTable selected={applications[0]} setSelected={() => {}} />
    </div>
  );
}

function RemindersPage() {
  const reminders = [
    [CalendarDays, "Xiaomi assessment deadline", "Due tomorrow 18:00", "amber"],
    [Bell, "Follow up Tencent referral", "No update for 11 days", "purple"],
    [Clock3, "ByteDance interview prep", "Today 20:00", "blue"],
    [Mail, "Parse new career emails", "4 unread signals", "green"],
  ];

  return (
    <div className="grid grid-cols-[0.9fr_1.1fr] gap-4 p-4">
      <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
        <div className="mb-3 text-sm font-semibold text-stone-950">Today</div>
        <div className="space-y-2">
          {reminders.map(([Icon, title, desc, tone]) => (
            <div key={title} className="flex items-center justify-between rounded-lg border border-stone-100 bg-stone-50/60 px-3 py-2.5">
              <div className="flex items-center gap-2.5">
                <div className={cn("grid h-8 w-8 place-items-center rounded-lg border", toneClasses(tone))}>
                  <Icon className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-[13px] font-medium text-stone-850">{title}</div>
                  <div className="text-[11px] text-stone-500">{desc}</div>
                </div>
              </div>
              <button className="rounded-md px-2 py-1 text-[11px] font-medium text-stone-500 hover:bg-stone-200/70 hover:text-stone-900">Done</button>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
        <div className="mb-3 text-sm font-semibold text-stone-950">Weekly summary</div>
        <div className="rounded-lg border border-stone-100 bg-[#F7F4EC] p-4 text-[13px] leading-6 text-stone-600">
          This week, 12 new applications were added. 3 jobs moved forward, 2 were rejected, and 5 have been inactive for more than 14 days. Priority actions: complete Xiaomi assessment, prepare ByteDance interview, and refresh Tencent login session.
        </div>
      </div>
    </div>
  );
}

function SettingsPage() {
  const modes = [
    [Laptop, "Local automation", "Use local browser profiles. Recommended for privacy.", "Active"],
    [Cloud, "Cloud sync", "Sync records and push reminders across devices.", "Optional"],
    [RefreshCw, "Cloud worker", "Remote checks when this device is offline.", "Disabled"],
  ];

  return (
    <div className="grid grid-cols-[0.9fr_1.1fr] gap-4 p-4">
      <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
        <div className="mb-3 text-sm font-semibold text-stone-950">Automation modes</div>
        <div className="space-y-2">
          {modes.map(([Icon, title, desc, state]) => (
            <div key={title} className="flex items-center justify-between rounded-lg border border-stone-100 bg-stone-50/60 px-3 py-2.5">
              <div className="flex items-center gap-2.5">
                <div className="grid h-8 w-8 place-items-center rounded-lg border border-stone-200 bg-white text-stone-600">
                  <Icon className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-[13px] font-medium text-stone-850">{title}</div>
                  <div className="text-[11px] text-stone-500">{desc}</div>
                </div>
              </div>
              <span className="rounded-md border border-stone-200 bg-white px-2 py-0.5 text-[11px] text-stone-500">{state}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
        <div className="mb-3 text-sm font-semibold text-stone-950">Privacy boundary</div>
        <div className="space-y-2 rounded-lg border border-stone-100 bg-[#F7F4EC] p-4 text-[13px] leading-6 text-stone-600">
          <p>· No third-party job-site passwords are stored.</p>
          <p>· Browser sessions stay in local profile folders by default.</p>
          <p>· Captcha and MFA are handled manually by the user.</p>
          <p>· Cloud worker is opt-in and can be revoked at any time.</p>
        </div>
      </div>
    </div>
  );
}

function DocumentsPage() {
  return (
    <div className="p-4">
      <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
        <div className="mb-3 text-sm font-semibold text-stone-950">Resume versions</div>
        <div className="grid grid-cols-3 gap-3">
          {["Backend_2026.pdf", "Frontend_CN.pdf", "AI_Platform_EN.pdf"].map((name, index) => (
            <div key={name} className="rounded-lg border border-stone-200 bg-stone-50/60 p-3">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-stone-500" />
                <div className="truncate text-[13px] font-medium text-stone-800">{name}</div>
              </div>
              <div className="mt-2 text-[11px] text-stone-500">Linked to {index + 2} applications</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function ApplyRadarPrototype() {
  const [active, setActive] = useState("applications");
  const [compact, setCompact] = useState(false);
  const [selected, setSelected] = useState(applications[0]);

  const page = useMemo(() => {
    switch (active) {
      case "tracker":
        return <TrackerPage />;
      case "reminders":
        return <RemindersPage />;
      case "documents":
        return <DocumentsPage />;
      case "settings":
        return <SettingsPage />;
      default:
        return <ApplicationsPage selected={selected} setSelected={setSelected} />;
    }
  }, [active, selected]);

  return (
    <div className="min-h-screen bg-[#E9E4D8] p-5 text-stone-900">
      <div className="mx-auto flex h-[calc(100vh-40px)] max-w-[1440px] overflow-hidden rounded-2xl border border-stone-300 bg-[#FAF9F5] shadow-2xl shadow-stone-400/30">
        <div className="flex min-w-0 flex-1 flex-col">
          <WindowChrome />
          <div className="flex min-h-0 flex-1">
            <Sidebar active={active} setActive={setActive} compact={compact} setCompact={setCompact} />
            <main className="flex min-w-0 flex-1 flex-col bg-[#FAF9F5]">
              <Toolbar active={active} />
              <motion.div
                key={active}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18 }}
                className="min-h-0 flex-1 overflow-auto"
              >
                {page}
              </motion.div>
            </main>
            <Inspector selected={selected} />
          </div>
        </div>
      </div>
    </div>
  );
}
