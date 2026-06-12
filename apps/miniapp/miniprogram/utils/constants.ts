import type { ApplicationStatus, ApplicationSource, Priority, ReminderType, LoginState } from './types';

// === Status Labels ===
export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  to_apply: '待投递',
  applied: '已投递',
  received: '已收到',
  under_review: '审核中',
  assessment: '测评中',
  interview: '面试中',
  final_interview: '终面',
  offer: '已录用',
  rejected: '已拒绝',
  withdrawn: '已撤回',
  unknown: '未知',
};

// === Source Labels ===
export const SOURCE_LABELS: Record<ApplicationSource, string> = {
  official: '官网',
  email: '邮箱',
  referral: '内推',
  linkedin: 'LinkedIn',
  boss: 'Boss直聘',
  manual: '手动',
};

// === Priority Labels ===
export const PRIORITY_LABELS: Record<Priority, string> = {
  low: '低',
  medium: '中',
  high: '高',
};

// === Reminder Type Labels ===
export const REMINDER_TYPE_LABELS: Record<ReminderType, string> = {
  interview: '面试',
  assessment_deadline: '测评截止',
  offer_deadline: 'Offer截止',
  follow_up: '跟进',
  document_required: '材料提交',
  custom: '自定义',
};

// === Login State Labels ===
export const LOGIN_STATE_LABELS: Record<LoginState, string> = {
  valid: '正常',
  expired: '已过期',
  captcha_required: '需要验证码',
  mfa_required: '需要二次验证',
  blocked: '已封禁',
  unknown: '未知',
};

// === All Statuses ===
export const ALL_STATUSES: ApplicationStatus[] = [
  'to_apply',
  'applied',
  'received',
  'under_review',
  'assessment',
  'interview',
  'final_interview',
  'offer',
  'rejected',
  'withdrawn',
  'unknown',
];

// === Active Statuses (non-terminal) ===
export const ACTIVE_STATUSES: ApplicationStatus[] = [
  'applied',
  'received',
  'under_review',
  'assessment',
  'interview',
  'final_interview',
];

// === Kanban Columns ===
export interface KanbanColumn {
  id: string;
  label: string;
  statuses: ApplicationStatus[];
  color: string;
  bgColor: string;
}

export const KANBAN_COLUMNS: KanbanColumn[] = [
  {
    id: 'todo',
    label: '待投递',
    statuses: ['to_apply'],
    color: '#57534e',
    bgColor: '#f5f5f4',
  },
  {
    id: 'applied',
    label: '已投递',
    statuses: ['applied', 'received'],
    color: '#2563eb',
    bgColor: '#eff6ff',
  },
  {
    id: 'review',
    label: '审核中',
    statuses: ['under_review', 'assessment'],
    color: '#a16207',
    bgColor: '#fefce8',
  },
  {
    id: 'interview',
    label: '面试',
    statuses: ['interview', 'final_interview'],
    color: '#15803d',
    bgColor: '#f0fdf4',
  },
  {
    id: 'result',
    label: '结果',
    statuses: ['offer', 'rejected', 'withdrawn'],
    color: '#059669',
    bgColor: '#ecfdf5',
  },
];

// === Status for Kanban grouping ===
export const RESULT_STATUSES: ApplicationStatus[] = ['offer', 'rejected', 'withdrawn'];
