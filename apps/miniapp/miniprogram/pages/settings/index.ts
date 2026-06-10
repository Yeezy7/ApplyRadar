import { userService, type UserSettings } from '../../services/user';
import { applicationService } from '../../services/application';

const FREQUENCY_OPTIONS = [
  { label: '手动', value: 'manual' },
  { label: '每天', value: 'daily' },
  { label: '每12小时', value: 'every_12h' },
  { label: '每6小时', value: 'every_6h' },
];

Page({
  data: {
    settings: {
      apiKey: '',
      apiBaseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      checkFrequency: 'daily',
      notificationsEnabled: true,
    } as UserSettings,
    dirty: false,
    saved: false,
    showApiKey: false,
    testing: false,
    testResult: '',
    testOk: false,
    frequencyOptions: FREQUENCY_OPTIONS,
    frequencyIndex: 1,
  },

  onLoad() {
    this.loadSettings();
  },

  onShow() {
    (this as any).selectComponent('#tabbar')?.setCurrent(4);
  },

  async loadSettings() {
    try {
      const settings = await userService.getSettings();
      const freqIndex = FREQUENCY_OPTIONS.findIndex((f) => f.value === settings.checkFrequency);
      this.setData({
        settings,
        frequencyIndex: freqIndex >= 0 ? freqIndex : 1,
      });
    } catch (e) {
      console.error('Failed to load settings:', e);
    }
  },

  onSettingInput(e: any) {
    const field = e.currentTarget.dataset.field;
    this.setData({
      [`settings.${field}`]: e.detail.value,
      dirty: true,
      saved: false,
    });
  },

  toggleApiKey() {
    this.setData({ showApiKey: !this.data.showApiKey });
  },

  onFrequencyChange(e: any) {
    const index = e.detail.value;
    this.setData({
      frequencyIndex: index,
      'settings.checkFrequency': FREQUENCY_OPTIONS[index].value,
      dirty: true,
      saved: false,
    });
  },

  onNotificationToggle(e: any) {
    this.setData({
      'settings.notificationsEnabled': e.detail.value,
      dirty: true,
      saved: false,
    });
  },

  async testConnection() {
    this.setData({ testing: true, testResult: '' });
    try {
      // Save settings first
      await userService.saveSettings(this.data.settings);
      this.setData({ dirty: false });

      // Test by calling a simple cloud function
      wx.showToast({ title: '设置已保存', icon: 'success' });
      this.setData({ testResult: '连接配置已保存，AI 功能将在 Phase 2 中实现', testOk: true });
    } catch (e) {
      this.setData({ testResult: '保存失败', testOk: false });
    } finally {
      this.setData({ testing: false });
    }
  },

  async saveSettings() {
    try {
      await userService.saveSettings(this.data.settings);
      this.setData({ dirty: false, saved: true });
      wx.showToast({ title: '设置已保存', icon: 'success' });
      setTimeout(() => this.setData({ saved: false }), 3000);
    } catch (e) {
      wx.showToast({ title: '保存失败', icon: 'none' });
    }
  },

  async exportData() {
    try {
      wx.showLoading({ title: '导出中...' });
      const apps = await applicationService.list();
      const data = JSON.stringify(apps, null, 2);
      wx.hideLoading();

      wx.setClipboardData({
        data,
        success: () => wx.showToast({ title: '数据已复制到剪贴板', icon: 'success' }),
      });
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: '导出失败', icon: 'none' });
    }
  },

  clearAllData() {
    wx.showModal({
      title: '确认清除',
      content: '此操作将删除所有投递记录和提醒，且无法恢复。确定要继续吗？',
      confirmColor: '#dc2626',
      success: async (res) => {
        if (res.confirm) {
          try {
            wx.showLoading({ title: '清除中...' });
            const apps = await applicationService.list();
            for (const app of apps) {
              if (app._id) {
                await applicationService.remove(app._id);
              }
            }
            wx.hideLoading();
            wx.showToast({ title: '数据已清除', icon: 'success' });
          } catch (e) {
            wx.hideLoading();
            wx.showToast({ title: '清除失败', icon: 'none' });
          }
        }
      },
    });
  },
});
