import { callCloud } from './common';

const NAME = 'user';

export interface UserSettings {
  apiKey: string;
  apiBaseUrl: string;
  model: string;
  checkFrequency: string;
  notificationsEnabled: boolean;
}

export interface DashboardStats {
  total: number;
  active: number;
  thisWeek: number;
  offers: number;
  pendingReminders: number;
  statusCounts: Record<string, number>;
  recentApps: any[];
}

export const userService = {
  async getSettings(): Promise<UserSettings> {
    return callCloud<UserSettings>(NAME, 'getSettings');
  },

  async saveSettings(settings: Partial<UserSettings>): Promise<void> {
    await callCloud(NAME, 'saveSettings', settings);
  },

  async getStats(): Promise<DashboardStats> {
    return callCloud<DashboardStats>(NAME, 'getStats');
  },
};
