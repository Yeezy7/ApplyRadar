import { reminderService } from '../../services/reminder';
import { applicationService } from '../../services/application';
import { REMINDER_TYPE_LABELS } from '../../utils/constants';
import { formatDateTime, isReminderOverdue } from '../../utils/format';
import type { Reminder, ReminderType } from '../../utils/types';

const TYPE_OPTIONS = [
  { label: '全部类型', value: '' },
  ...Object.entries(REMINDER_TYPE_LABELS).map(([k, v]) => ({ label: v, value: k })),
];

Page({
  data: {
    reminders: [] as any[],
    filteredReminders: [] as any[],
    applicationNames: {} as Record<string, string>,
    search: '',
    typeFilter: '',
    includeDone: false,
    loading: true,

    // Filter options
    typeOptions: TYPE_OPTIONS,
    typePickerIndex: 0,

    // Form
    showForm: false,
    editingId: '',
    formTitle: '',
    formContent: '',
    formDate: '',
    formTypeIndex: 0,
    formAppIndex: 0,
    appOptions: [{ label: '不关联', value: '' }] as { label: string; value: string }[],
    submitting: false,
  },

  onShow() {
    this.loadReminders();
    this.loadApplications();
    (this as any).selectComponent('#tabbar')?.setCurrent(3);
  },

  onPullDownRefresh() {
    this.loadReminders().then(() => wx.stopPullDownRefresh());
  },

  async loadReminders() {
    this.setData({ loading: true });
    try {
      const reminders = await reminderService.list(this.data.includeDone);
      const formatted = reminders.map((r) => ({
        ...r,
        isDone: r.is_done,
        isOverdue: isReminderOverdue(r.remind_at, r.is_done),
        typeLabel: REMINDER_TYPE_LABELS[r.reminder_type as ReminderType] || r.reminder_type,
        remindAtStr: formatDateTime(r.remind_at),
        appName: r.application_id ? this.data.applicationNames[r.application_id] || '' : '',
      }));
      this.setData({ reminders: formatted, loading: false });
      this.filterReminders();
    } catch (e) {
      console.error('Failed to load reminders:', e);
      wx.showToast({ title: '加载失败', icon: 'none' });
      this.setData({ loading: false });
    }
  },

  async loadApplications() {
    try {
      const apps = await applicationService.list();
      const applicationNames = apps.reduce<Record<string, string>>((acc, app) => {
        if (app._id) {
          acc[app._id] = `${app.company_name} - ${app.job_title}`;
        }
        return acc;
      }, {});
      const options = [
        { label: '不关联', value: '' },
        ...apps.map((a) => ({ label: `${a.company_name} - ${a.job_title}`, value: a._id! })),
      ];
      this.setData({ appOptions: options, applicationNames });
      if (this.data.reminders.length > 0) {
        const reminders = this.data.reminders.map((reminder: any) => ({
          ...reminder,
          appName: reminder.application_id ? applicationNames[reminder.application_id] || '' : '',
        }));
        this.setData({ reminders });
        this.filterReminders();
      }
    } catch {}
  },

  filterReminders() {
    const { reminders, search, typeFilter } = this.data;
    let filtered = [...reminders];

    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(
        (r) =>
          r.title.toLowerCase().includes(q) ||
          r.content?.toLowerCase().includes(q)
      );
    }

    if (typeFilter) {
      filtered = filtered.filter((r) => r.reminder_type === typeFilter);
    }

    this.setData({ filteredReminders: filtered });
  },

  onSearchInput(e: any) {
    this.setData({ search: e.detail.value });
    this.filterReminders();
  },

  onTypeFilter(e: any) {
    const index = e.detail.value;
    this.setData({
      typePickerIndex: index,
      typeFilter: TYPE_OPTIONS[index].value,
    });
    this.filterReminders();
  },

  toggleIncludeDone() {
    this.setData({ includeDone: !this.data.includeDone });
    this.loadReminders();
  },

  async markDone(e: any) {
    const id = e.currentTarget.dataset.id;
    try {
      await reminderService.markDone(id);
      wx.showToast({ title: '已完成', icon: 'success' });
      this.loadReminders();
    } catch (e) {
      wx.showToast({ title: '操作失败', icon: 'none' });
    }
  },

  deleteReminder(e: any) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '确认删除',
      content: '确定要删除这个提醒吗？',
      confirmColor: '#dc2626',
      success: async (res) => {
        if (res.confirm) {
          try {
            await reminderService.remove(id);
            wx.showToast({ title: '已删除', icon: 'success' });
            this.loadReminders();
          } catch (e) {
            wx.showToast({ title: '删除失败', icon: 'none' });
          }
        }
      },
    });
  },

  // Form
  openCreateForm() {
    this.setData({
      showForm: true,
      editingId: '',
      formTitle: '',
      formContent: '',
      formDate: '',
      formTypeIndex: 0,
      formAppIndex: 0,
    });
  },

  openEditForm(e: any) {
    const r = e.currentTarget.dataset.reminder;
    const typeIndex = TYPE_OPTIONS.findIndex((t) => t.value === r.reminder_type);
    const appIndex = this.data.appOptions.findIndex((a) => a.value === r.application_id);

    this.setData({
      showForm: true,
      editingId: r._id,
      formTitle: r.title,
      formContent: r.content || '',
      formDate: r.remind_at ? r.remind_at.split('T')[0] : '',
      formTypeIndex: typeIndex >= 0 ? typeIndex : 0,
      formAppIndex: appIndex >= 0 ? appIndex : 0,
    });
  },

  closeForm() {
    this.setData({ showForm: false });
  },

  onFormTitleInput(e: any) {
    this.setData({ formTitle: e.detail.value });
  },

  onFormContentInput(e: any) {
    this.setData({ formContent: e.detail.value });
  },

  onFormDateChange(e: any) {
    this.setData({ formDate: e.detail.value });
  },

  onFormTypeChange(e: any) {
    this.setData({ formTypeIndex: e.detail.value });
  },

  onFormAppChange(e: any) {
    this.setData({ formAppIndex: e.detail.value });
  },

  async saveReminder() {
    const { formTitle, formDate, formContent, formTypeIndex, formAppIndex, editingId } = this.data;
    if (!formTitle || !formDate) return;

    this.setData({ submitting: true });
    try {
      const data = {
        title: formTitle.trim(),
        content: formContent.trim() || undefined,
        reminder_type: TYPE_OPTIONS[formTypeIndex].value as ReminderType,
        remind_at: new Date(formDate).toISOString(),
        application_id: this.data.appOptions[formAppIndex].value || undefined,
      };

      if (editingId) {
        await reminderService.update(editingId, data);
        wx.showToast({ title: '已保存', icon: 'success' });
      } else {
        await reminderService.create(data);
        wx.showToast({ title: '已创建', icon: 'success' });
      }

      this.closeForm();
      this.loadReminders();
    } catch (e) {
      wx.showToast({ title: '保存失败', icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  },
});
