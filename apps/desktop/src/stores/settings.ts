import { invoke } from "@tauri-apps/api/core";

export interface AppSettings {
  apiKey: string;
  apiBaseUrl: string;
  model: string;
  checkFrequency: string;
  notificationsEnabled: boolean;
  autoCheckEnabled: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  apiKey: "",
  apiBaseUrl: "https://api.openai.com/v1",
  model: "gpt-4o-mini",
  checkFrequency: "daily",
  notificationsEnabled: true,
  autoCheckEnabled: true,
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
