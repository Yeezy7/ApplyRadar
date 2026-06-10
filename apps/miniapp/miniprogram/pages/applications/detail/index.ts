import { applicationService } from '../../../services/application';
import { eventService } from '../../../services/event';
import { reminderService } from '../../../services/reminder';
import { ALL_STATUSES, STATUS_LABELS, PRIORITY_LABELS, SOURCE_LABELS, REMINDER_TYPE_LABELS } from '../../../utils/constants';
import { formatDate, formatDateTime, getActiveWaitingDays, getCompanyInitial } from '../../../utils/format';
import type { Application, ApplicationEvent, Reminder, ApplicationStatus, Priority, ApplicationSource, ReminderType } from '../../../utils/types';

const PRIORITY_OPTIONS = [
  { label: '中', value: 'medium' },
  { label: '高', value: 'high' },
  { label: '低', value: 'low' },
];

const SOURCE_OPTIONS = [
  { label: '手动', value: 'manual' },
  { label: '官网', value: 'official' },
  { label: '邮箱', value: 'email' },
  { label: '内推', value: 'referral' },
  { label: 'LinkedIn', value: 'linkedin' },
  { label: 'Boss直聘', value: 'boss' },
];

const REMINDER_TYPE_OPTIONS = Object.entries(REMINDER_TYPE_LABELS).map(([k, v]) => ({ label: v, value: k }));

Page({
  data: {
    id: '',
    application: {} as Application,
    events: [] as any[],
    reminders: [] as any[],
    loading: true,
    isEditing: false,
    isCreate: false,
    submitting: false,

    // Form data
    form: {
      company_name: '',
      job_title: '',
      location: '',
      salary_range: '',
      job_url: '',
      status_url: '',
      status: 'to_apply',
      priority: 'medium',
      source: 'manual',
      applied_at: '',
      notes: '',
    },
    statusOptions: [] as { label: string; value: string }[],
    statusPickerIndex: 0,
    currentStatusIndex: 0,
    priorityOptions: PRIORITY_OPTIONS,
    priorityPickerIndex: 0,
    sourceOptions: SOURCE_OPTIONS,
    sourcePickerIndex: 0,

    // Detail display
    initial: '',
    sourceLabel: '',
    priorityLabel: '',
    appliedDateStr: '',
    waitingDays: null as number | null,

    // Reminder form
    showReminderForm: false,
    reminderForm: { title: '', date: '' },
    reminderTypeOptions: REMINDER_TYPE_OPTIONS,
    reminderTypeIndex: 0,
  },

  onLoad(options: any) {
    const statusOptions = ALL_STATUSES.map((s) => ({ label: STATUS_LABELS[s], value: s }));
    this.setData({ statusOptions });

    if (options.id) {
      this.setData({ id: options.id });
      this.loadApplication(options.id);
    } else {
      this.setData({
        isEditing: true,
        isCreate: true,
        loading: false,
      });
    }
  },

  async loadApplication(id: string) {
    this.setData({ loading: true });
    try {
      const [app, events, reminders] = await Promise.all([
        applicationService.get(id),
        eventService.listByApplication(id),
        reminderService.list(true, id),
      ]);

      const statusIndex = ALL_STATUSES.indexOf(app.status as ApplicationStatus);
      const priorityIndex = PRIORITY_OPTIONS.findIndex((p) => p.value === app.priority);
      const sourceIndex = SOURCE_OPTIONS.findIndex((s) => s.value === app.source);

      const eventsFormatted = events.map((e) => ({
        ...e,
        timeStr: formatDateTime(e.event_time || e.created_at),
        oldStatusStr: e.old_status ? STATUS_LABELS[e.old_status as ApplicationStatus] : '',
        newStatusStr: e.new_status ? STATUS_LABELS[e.new_status as ApplicationStatus] : '',
        dotClass: e.event_type === 'status_change' ? 'dot-status' : e.event_type === 'check_failed' ? 'dot-error' : 'dot-default',
      }));

      const remindersFormatted = reminders.map((r) => ({
        ...r,
        isDone: r.is_done,
        remindAtStr: formatDateTime(r.remind_at),
      }));

      this.setData({
        application: app,
        events: eventsFormatted,
        reminders: remindersFormatted,
        loading: false,
        currentStatusIndex: statusIndex >= 0 ? statusIndex : 0,
        initial: getCompanyInitial(app.company_name),
        sourceLabel: SOURCE_LABELS[app.source as ApplicationSource] || app.source || '',
        priorityLabel: PRIORITY_LABELS[app.priority as Priority] || app.priority,
        appliedDateStr: formatDate(app.applied_at),
        waitingDays: getActiveWaitingDays(app),
        // Set form for editing
        form: {
          company_name: app.company_name,
          job_title: app.job_title,
          location: app.location || '',
          salary_range: app.salary_range || '',
          job_url: app.job_url || '',
          status_url: app.status_url || '',
          status: app.status,
          priority: app.priority,
          source: app.source || 'manual',
          applied_at: app.applied_at ? app.applied_at.split('T')[0] : '',
          notes: app.notes || '',
        },
        statusPickerIndex: statusIndex >= 0 ? statusIndex : 0,
        priorityPickerIndex: priorityIndex >= 0 ? priorityIndex : 0,
        sourcePickerIndex: sourceIndex >= 0 ? sourceIndex : 0,
      });
    } catch (e) {
      console.error('Failed to load application:', e);
      wx.showToast({ title: '加载失败', icon: 'none' });
      this.setData({ loading: false });
    }
  },

  startEdit() {
    this.setData({ isEditing: true });
  },

  cancelEdit() {
    if (this.data.isCreate) {
      wx.navigateBack();
    } else {
      this.setData({ isEditing: false });
    }
  },

  onFormInput(e: any) {
    const field = e.currentTarget.dataset.field;
    this.setData({ [`form.${field}`]: e.detail.value });
  },

  onStatusPickerChange(e: any) {
    const index = e.detail.value;
    this.setData({
      statusPickerIndex: index,
      'form.status': ALL_STATUSES[index],
    });
  },

  onPriorityPickerChange(e: any) {
    const index = e.detail.value;
    this.setData({
      priorityPickerIndex: index,
      'form.priority': PRIORITY_OPTIONS[index].value,
    });
  },

  onSourcePickerChange(e: any) {
    const index = e.detail.value;
    this.setData({
      sourcePickerIndex: index,
      'form.source': SOURCE_OPTIONS[index].value,
    });
  },

  onDateChange(e: any) {
    this.setData({ 'form.applied_at': e.detail.value });
  },

  async saveApplication() {
    const { form, id, isCreate } = this.data;
    if (!form.company_name.trim() || !form.job_title.trim()) {
      wx.showToast({ title: '请填写公司和岗位名称', icon: 'none' });
      return;
    }

    this.setData({ submitting: true });
    try {
      const data = {
        company_name: form.company_name.trim(),
        job_title: form.job_title.trim(),
        location: form.location.trim() || undefined,
        salary_range: form.salary_range.trim() || undefined,
        job_url: form.job_url.trim() || undefined,
        status_url: form.status_url.trim() || undefined,
        status: form.status as ApplicationStatus,
        priority: form.priority as Priority,
        source: form.source as ApplicationSource,
        applied_at: form.applied_at ? new Date(form.applied_at).toISOString() : undefined,
        notes: form.notes.trim() || undefined,
      };

      if (isCreate) {
        const created = await applicationService.create(data);
        wx.showToast({ title: '创建成功', icon: 'success' });
        this.setData({ id: created._id, isCreate: false, isEditing: false });
        this.loadApplication(created._id!);
      } else {
        await applicationService.update(id, data);
        wx.showToast({ title: '已保存', icon: 'success' });
        this.setData({ isEditing: false });
        this.loadApplication(id);
      }
    } catch (e) {
      console.error('Failed to save:', e);
      wx.showToast({ title: '保存失败', icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  },

  async onQuickStatusChange(e: any) {
    const index = e.detail.value;
    const newStatus = ALL_STATUSES[index];
    const oldStatus = this.data.application.status;

    if (newStatus === oldStatus) return;

    try {
      await applicationService.update(this.data.id, { status: newStatus });

      // Create status change event
      await eventService.create({
        application_id: this.data.id,
        event_type: 'status_change',
        title: '手动修改状态',
        old_status: oldStatus,
        new_status: newStatus,
      });

      wx.showToast({ title: '状态已更新', icon: 'success' });
      this.loadApplication(this.data.id);
    } catch (e) {
      console.error('Failed to update status:', e);
      wx.showToast({ title: '更新失败', icon: 'none' });
    }
  },

  deleteApplication() {
    wx.showModal({
      title: '确认删除',
      content: '确定要删除这条投递记录吗？删除后无法恢复。',
      confirmColor: '#dc2626',
      success: async (res) => {
        if (res.confirm) {
          try {
            await applicationService.remove(this.data.id);
            wx.showToast({ title: '已删除', icon: 'success' });
            setTimeout(() => wx.navigateBack(), 1000);
          } catch (e) {
            wx.showToast({ title: '删除失败', icon: 'none' });
          }
        }
      },
    });
  },

  goToUrl(e: any) {
    const url = e.currentTarget.dataset.url;
    if (url) {
      wx.setClipboardData({
        data: url,
        success: () => wx.showToast({ title: '链接已复制', icon: 'success' }),
      });
    }
  },

  // Reminder management
  addReminder() {
    this.setData({ showReminderForm: true });
  },

  closeReminderForm() {
    this.setData({
      showReminderForm: false,
      reminderForm: { title: '', date: '' },
      reminderTypeIndex: 0,
    });
  },

  onReminderInput(e: any) {
    const field = e.currentTarget.dataset.field;
    this.setData({ [`reminderForm.${field}`]: e.detail.value });
  },

  onReminderDateChange(e: any) {
    this.setData({ 'reminderForm.date': e.detail.value });
  },

  onReminderTypeChange(e: any) {
    this.setData({ reminderTypeIndex: e.detail.value });
  },

  async saveReminder() {
    const { reminderForm, reminderTypeIndex, id } = this.data;
    if (!reminderForm.title || !reminderForm.date) return;

    try {
      await reminderService.create({
        application_id: id,
        title: reminderForm.title.trim(),
        reminder_type: REMINDER_TYPE_OPTIONS[reminderTypeIndex].value as ReminderType,
        remind_at: new Date(reminderForm.date).toISOString(),
      });
      wx.showToast({ title: '提醒已创建', icon: 'success' });
      this.closeReminderForm();
      this.loadApplication(id);
    } catch (e) {
      wx.showToast({ title: '创建失败', icon: 'none' });
    }
  },

  async markReminderDone(e: any) {
    const id = e.currentTarget.dataset.id;
    try {
      await reminderService.markDone(id);
      wx.showToast({ title: '已完成', icon: 'success' });
      this.loadApplication(this.data.id);
    } catch (e) {
      wx.showToast({ title: '操作失败', icon: 'none' });
    }
  },
});
