import { api } from "../lib/api";

export interface BackupData {
  version: string;
  exported_at: string;
  applications: any[];
  events: any[];
  reminders: any[];
  tracking_targets: any[];
  settings: any;
}

export interface ImportResult {
  applications: number;
  events: number;
  reminders: number;
  tracking_targets: number;
}

export async function exportData(): Promise<BackupData> {
  return api.get<BackupData>("/api/backup/export");
}

export async function importData(data: BackupData): Promise<ImportResult> {
  return api.post<ImportResult>("/api/backup/import", data);
}

export function downloadBackup(data: BackupData, filename = "applyradar-backup.json") {
  const jsonContent = JSON.stringify(data, null, 2);
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

export function readBackupFile(file: File): Promise<BackupData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);
        if (!data.applications || !Array.isArray(data.applications)) {
          reject(new Error("无效的备份文件"));
          return;
        }
        resolve(data);
      } catch {
        reject(new Error("无法解析备份文件"));
      }
    };
    reader.onerror = () => reject(new Error("读取文件失败"));
    reader.readAsText(file);
  });
}
