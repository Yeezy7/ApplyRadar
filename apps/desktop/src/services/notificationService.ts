import { sendNotification, requestPermission, isPermissionGranted } from "@tauri-apps/plugin-notification";
import { getSettings } from "../stores/settings";

export async function ensurePermission(): Promise<boolean> {
  let granted = await isPermissionGranted();
  if (!granted) {
    const result = await requestPermission();
    granted = result === "granted";
  }
  return granted;
}

export async function notify(title: string, body: string): Promise<void> {
  const settings = getSettings();
  if (!settings.notificationsEnabled) return;

  const granted = await ensurePermission();
  if (granted) {
    sendNotification({ title, body });
  }
}

export async function notifyStatusChange(
  companyName: string,
  jobTitle: string,
  oldStatus: string,
  newStatus: string
): Promise<void> {
  await notify(
    "状态变化",
    `${companyName} - ${jobTitle}: ${oldStatus} → ${newStatus}`
  );
}

export async function notifyLoginExpired(domain: string): Promise<void> {
  await notify("登录已过期", `${domain} 的登录状态已失效，请重新登录`);
}

export async function notifyCheckComplete(successCount: number, failCount: number): Promise<void> {
  await notify(
    "检查完成",
    `成功: ${successCount}, 失败: ${failCount}`
  );
}

export async function notifyCheckFailed(companyName: string, jobTitle: string, error: string): Promise<void> {
  await notify(
    "检查失败",
    `${companyName} - ${jobTitle}: ${error}`
  );
}
