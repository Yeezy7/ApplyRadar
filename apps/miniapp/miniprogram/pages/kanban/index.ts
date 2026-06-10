import { applicationService } from '../../services/application';
import { eventService } from '../../services/event';
import { KANBAN_COLUMNS, ALL_STATUSES, STATUS_LABELS } from '../../utils/constants';
import { getCompanyInitial, getActiveWaitingDays, formatDate } from '../../utils/format';
import type { Application, ApplicationStatus } from '../../utils/types';

interface KanbanApp {
  _id: string;
  company_name: string;
  job_title: string;
  location?: string;
  salary_range?: string;
  priority: string;
  status: string;
  initial: string;
  waitingDays: number | null;
  dateStr: string;
}

interface KanbanColumnData {
  id: string;
  label: string;
  statuses: string[];
  color: string;
  bgColor: string;
  apps: KanbanApp[];
}

Page({
  data: {
    applications: [] as Application[],
    columns: [] as KanbanColumnData[],
    search: '',
    loading: true,
    initialLoaded: false,
    showStatusSheet: false,
    selectedAppId: '',
    selectedAppStatus: '',
    statusOptions: [] as { label: string; value: string }[],
  },

  onShow() {
    this.loadApplications();
  },

  onPullDownRefresh() {
    this.loadApplications().then(() => wx.stopPullDownRefresh());
  },

  async loadApplications() {
    this.setData({ loading: true });
    try {
      const apps = await applicationService.list(this.data.search || undefined);
      this.setData({ applications: apps });
      this.buildColumns(apps);
      this.setData({ loading: false, initialLoaded: true });
    } catch (e) {
      console.error('Failed to load applications:', e);
      wx.showToast({ title: '加载失败', icon: 'none' });
      this.setData({ loading: false });
    }
  },

  buildColumns(apps: Application[]) {
    const search = this.data.search.toLowerCase();
    const filtered = search
      ? apps.filter(
          (a) =>
            a.company_name.toLowerCase().includes(search) ||
            a.job_title.toLowerCase().includes(search)
        )
      : apps;

    const columns: KanbanColumnData[] = KANBAN_COLUMNS.map((col) => {
      const columnApps = filtered
        .filter((a) => col.statuses.includes(a.status as ApplicationStatus))
        .map((a) => ({
          _id: a._id!,
          company_name: a.company_name,
          job_title: a.job_title,
          location: a.location,
          salary_range: a.salary_range,
          priority: a.priority,
          status: a.status,
          initial: getCompanyInitial(a.company_name),
          waitingDays: getActiveWaitingDays(a),
          dateStr: formatDate(a.applied_at),
        }));

      return {
        ...col,
        apps: columnApps,
      };
    });

    this.setData({ columns });
  },

  searchTimer: null as any,

  onSearchInput(e: any) {
    this.setData({ search: e.detail.value });
    // Debounce search
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => {
      this.buildColumns(this.data.applications);
    }, 300);
  },

  goToCreate() {
    wx.navigateTo({ url: '/pages/applications/detail/index' });
  },

  goToDetail(e: any) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/applications/detail/index?id=${id}` });
  },

  onCardLongPress(e: any) {
    const { appId, currentStatus } = e.currentTarget.dataset;
    // Show status options excluding current status
    const currentCol = KANBAN_COLUMNS.find((c) => c.statuses.includes(currentStatus as ApplicationStatus));
    const options = KANBAN_COLUMNS.filter((c) => c.id !== currentCol?.id).map((c) => ({
      label: c.label,
      value: c.statuses[0],
    }));

    this.setData({
      showStatusSheet: true,
      selectedAppId: appId,
      selectedAppStatus: currentStatus,
      statusOptions: options,
    });
  },

  closeStatusSheet() {
    this.setData({ showStatusSheet: false });
  },

  async moveToStatus(e: any) {
    const newStatus = e.currentTarget.dataset.status;
    const { selectedAppId, selectedAppStatus } = this.data;

    this.setData({ showStatusSheet: false });

    if (newStatus === selectedAppStatus) return;

    // Optimistic update
    const apps = this.data.applications.map((a) =>
      a._id === selectedAppId ? { ...a, status: newStatus as ApplicationStatus } : a
    );
    this.setData({ applications: apps });
    this.buildColumns(apps);

    try {
      await applicationService.update(selectedAppId, { status: newStatus as ApplicationStatus });
      await eventService.create({
        application_id: selectedAppId,
        event_type: 'status_change',
        title: '看板修改状态',
        old_status: selectedAppStatus as ApplicationStatus,
        new_status: newStatus as ApplicationStatus,
      });
      wx.showToast({ title: '状态已更新', icon: 'success' });
    } catch (e) {
      console.error('Failed to update status:', e);
      // Rollback
      this.loadApplications();
      wx.showToast({ title: '更新失败', icon: 'none' });
    }
  },
});
