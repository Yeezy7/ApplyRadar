import { userService, type DashboardStats } from '../../services/user';
import { STATUS_LABELS } from '../../utils/constants';
import { formatDate, getCompanyInitial } from '../../utils/format';
import type { ApplicationStatus } from '../../utils/types';

interface StatusBreakdownItem {
  status: string;
  label: string;
  count: number;
  percentage: number;
}

Page({
  data: {
    loading: true,
    stats: {
      total: 0,
      active: 0,
      thisWeek: 0,
      offers: 0,
      pendingReminders: 0,
      loginExpired: 0,
    } as DashboardStats,
    statusBreakdown: [] as StatusBreakdownItem[],
    recentApps: [] as any[],
  },

  onShow() {
    this.loadDashboard();
  },

  async loadDashboard() {
    this.setData({ loading: true });
    try {
      const stats = await userService.getStats();

      // Build status breakdown
      const breakdown: StatusBreakdownItem[] = [];
      const statusCounts = stats.statusCounts || {};
      for (const [status, count] of Object.entries(statusCounts)) {
        if (count > 0) {
          breakdown.push({
            status,
            label: STATUS_LABELS[status as ApplicationStatus] || status,
            count,
            percentage: stats.total > 0 ? Math.round((count / stats.total) * 100) : 0,
          });
        }
      }
      breakdown.sort((a, b) => b.count - a.count);

      // Format recent apps
      const recentApps = (stats.recentApps || []).map((app: any) => ({
        ...app,
        initial: getCompanyInitial(app.company_name || ''),
        statusLabel: STATUS_LABELS[app.status as ApplicationStatus] || app.status,
        dateStr: formatDate(app.updated_at),
      }));

      this.setData({
        stats: {
          ...stats,
          loginExpired: stats.loginExpired || 0,
        },
        statusBreakdown: breakdown,
        recentApps,
        loading: false,
      });
    } catch (e) {
      console.error('Failed to load dashboard:', e);
      wx.showToast({ title: '加载失败', icon: 'none' });
      this.setData({ loading: false });
    }
  },

  goToDetail(e: any) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/applications/detail/index?id=${id}` });
  },

  goToApplications() {
    wx.switchTab({ url: '/pages/applications/index' });
  },

  onPullDownRefresh() {
    this.loadDashboard().then(() => wx.stopPullDownRefresh());
  },
});
