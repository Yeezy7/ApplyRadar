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
    greeting: '',
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
    this.setGreeting();
    this.loadDashboard();
    (this as any).selectComponent('#tabbar')?.setCurrent(0);
  },

  setGreeting() {
    const hour = new Date().getHours();
    let greeting = '你好';
    if (hour < 6) greeting = '夜深了';
    else if (hour < 9) greeting = '早上好';
    else if (hour < 12) greeting = '上午好';
    else if (hour < 14) greeting = '中午好';
    else if (hour < 18) greeting = '下午好';
    else if (hour < 22) greeting = '晚上好';
    else greeting = '夜深了';
    this.setData({ greeting });
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
