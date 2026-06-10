import type { Application } from '../utils/types';
import { callCloud } from './common';

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
  loginExpired: number;
  statusCounts: Record<string, number>;
  recentApps: Application[];
}

export const userService = {
  async getSettings(): Promise<UserSettings> {
    return callCloud<UserSettings>('settings', 'getSettings');
  },

  async saveSettings(settings: Partial<UserSettings>): Promise<void> {
    await callCloud('settings', 'saveSettings', settings);
  },

  async getStats(): Promise<DashboardStats> {
    return callCloud<DashboardStats>('stats', 'getStats');
  },
};
