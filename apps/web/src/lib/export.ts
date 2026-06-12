import type { Application } from "@applyradar/shared";
import { STATUS_LABELS, PRIORITY_LABELS } from "@applyradar/shared";

export function exportApplicationsToCSV(applications: Application[], filename = "求职记录.csv") {
  const headers = [
    "公司名称",
    "岗位名称",
    "地点",
    "薪资范围",
    "状态",
    "优先级",
    "来源",
    "投递日期",
    "截止日期",
    "职位链接",
    "状态查询链接",
    "备注",
    "创建时间",
    "更新时间",
  ];

  const rows = applications.map((app) => [
    app.company_name,
    app.job_title,
    app.location || "",
    app.salary_range || "",
    STATUS_LABELS[app.status] || app.status,
    PRIORITY_LABELS[app.priority] || app.priority,
    app.source || "",
    app.applied_at ? new Date(app.applied_at).toLocaleDateString("zh-CN") : "",
    app.deadline_at ? new Date(app.deadline_at).toLocaleDateString("zh-CN") : "",
    app.job_url || "",
    app.status_url || "",
    app.notes || "",
    new Date(app.created_at).toLocaleString("zh-CN"),
    new Date(app.updated_at).toLocaleString("zh-CN"),
  ]);

  const csvContent = [
    headers.join(","),
    ...rows.map((row) =>
      row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")
    ),
  ].join("\n");

  // 添加 BOM 以支持中文
  const bom = "﻿";
  const blob = new Blob([bom + csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportApplicationsToJSON(applications: Application[], filename = "求职记录.json") {
  const jsonContent = JSON.stringify(applications, null, 2);
  const blob = new Blob([jsonContent], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
