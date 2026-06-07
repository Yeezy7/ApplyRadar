import { confirm } from "@tauri-apps/plugin-dialog";

export async function confirmDelete(message: string): Promise<boolean> {
  return confirm(message, {
    title: "确认删除",
    kind: "warning",
    okLabel: "删除",
    cancelLabel: "取消",
  });
}
