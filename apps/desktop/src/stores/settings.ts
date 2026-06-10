import { invoke } from "@tauri-apps/api/core";

export interface AppSettings {
  apiKey: string;
  apiBaseUrl: string;
  model: string;
  checkFrequency: string;
  notificationsEnabled: boolean;
  autoCheckEnabled: boolean;
  smtpHost: string;
  smtpPort: string;
  smtpUsername: string;
  smtpPassword: string;
  smtpRecipient: string;
  emailReportEnabled: boolean;
  emailReportTime: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  apiKey: "",
  apiBaseUrl: "https://api.openai.com/v1",
  model: "gpt-4o-mini",
  checkFrequency: "daily",
  notificationsEnabled: true,
  autoCheckEnabled: true,
  smtpHost: "",
  smtpPort: "465",
  smtpUsername: "",
  smtpPassword: "",
  smtpRecipient: "",
  emailReportEnabled: false,
  emailReportTime: "09:00",
};

// In-memory cache for synchronous access
let cachedSettings: AppSettings = { ...DEFAULT_SETTINGS };
let loaded = false;

// Load settings from Tauri backend (SQLite)
export async function loadSettings(): Promise<AppSettings> {
  try {
    const result = await invoke<AppSettings>("get_settings");
    cachedSettings = {
      apiKey: result.apiKey || "",
      apiBaseUrl: result.apiBaseUrl || DEFAULT_SETTINGS.apiBaseUrl,
      model: result.model || DEFAULT_SETTINGS.model,
      checkFrequency: result.checkFrequency || DEFAULT_SETTINGS.checkFrequency,
      notificationsEnabled: result.notificationsEnabled ?? true,
      autoCheckEnabled: result.autoCheckEnabled ?? true,
      smtpHost: result.smtpHost || "",
      smtpPort: result.smtpPort || "465",
      smtpUsername: result.smtpUsername || "",
      smtpPassword: result.smtpPassword || "",
      smtpRecipient: result.smtpRecipient || "",
      emailReportEnabled: result.emailReportEnabled ?? false,
      emailReportTime: result.emailReportTime || "09:00",
    };
    loaded = true;
    return cachedSettings;
  } catch (e) {
    console.error("Failed to load settings from DB:", e);
    return cachedSettings;
  }
}

// Save settings to Tauri backend (SQLite)
export async function saveSettings(settings: AppSettings): Promise<void> {
  try {
    await invoke("save_settings", { settings });
    cachedSettings = { ...settings };
  } catch (e) {
    console.error("Failed to save settings to DB:", e);
    throw e;
  }
}

// Synchronous access to cached settings
export function getSettings(): AppSettings {
  return cachedSettings;
}

export function getApiKey(): string {
  return cachedSettings.apiKey;
}

export function isAIConfigured(): boolean {
  return cachedSettings.apiKey.length > 0;
}

export function isLoaded(): boolean {
  return loaded;
}
