import { applicationService } from '../../services/application';
import { ALL_STATUSES, STATUS_LABELS } from '../../utils/constants';
import type { Application, ApplicationStatus } from '../../utils/types';

Page({
  data: {
    applications: [] as Application[],
    search: '',
    statusFilter: '',
    loading: true,
    statusOptions: [{ label: '全部状态', value: '' }] as { label: string; value: string }[],
    statusPickerIndex: 0,
  },

  onLoad() {
    const statusOptions = [
      { label: '全部状态', value: '' },
      ...ALL_STATUSES.map((s) => ({ label: STATUS_LABELS[s], value: s })),
    ];
    this.setData({ statusOptions });
    this.loadApplications();
  },

  onShow() {
    // Refresh when coming back from detail/create
    this.loadApplications();
  },

  onPullDownRefresh() {
    this.loadApplications().then(() => wx.stopPullDownRefresh());
  },

  async loadApplications() {
    this.setData({ loading: true });
    try {
      const applications = await applicationService.list(
        this.data.search || undefined,
        this.data.statusFilter || undefined
      );
      this.setData({ applications, loading: false });
    } catch (e) {
      console.error('Failed to load applications:', e);
      wx.showToast({ title: '加载失败', icon: 'none' });
      this.setData({ loading: false });
    }
  },

  onSearchInput(e: any) {
    this.setData({ search: e.detail.value });
  },

  onSearch() {
    this.loadApplications();
  },

  onStatusFilter(e: any) {
    const index = e.detail.value;
    this.setData({
      statusPickerIndex: index,
      statusFilter: this.data.statusOptions[index].value,
    });
    this.loadApplications();
  },

  goToCreate() {
    wx.navigateTo({ url: '/pages/applications/detail/index' });
  },

  goToDetail(e: any) {
    const id = e.detail.id;
    wx.navigateTo({ url: `/pages/applications/detail/index?id=${id}` });
  },
});
