import { invoke } from "@tauri-apps/api/core";

export async function exportData(): Promise<Record<string, unknown>> {
  return invoke("export_data");
}

export async function exportDataToFile(path: string): Promise<void> {
  return invoke("export_data_to_file", { path });
}
