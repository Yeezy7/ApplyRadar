export type ApplicationStatus =
  | 'to_apply'
  | 'applied'
  | 'received'
  | 'under_review'
  | 'assessment'
  | 'interview'
  | 'final_interview'
  | 'offer'
  | 'rejected'
  | 'withdrawn'
  | 'unknown';

export type ApplicationSource =
  | 'official'
  | 'email'
  | 'referral'
  | 'linkedin'
  | 'boss'
  | 'manual';

export type Priority = 'low' | 'medium' | 'high';

export type LoginState =
  | 'valid'
  | 'expired'
  | 'captcha_required'
  | 'mfa_required'
  | 'blocked'
  | 'unknown';

export type CheckFrequency = 'manual' | 'daily' | 'every_6h' | 'every_12h';

export type EventType =
  | 'status_change'
  | 'login_expired'
  | 'check_success'
  | 'check_failed'
  | 'note_added'
  | 'manual';

export type ReminderType =
  | 'interview'
  | 'assessment_deadline'
  | 'offer_deadline'
  | 'follow_up'
  | 'document_required'
  | 'custom';

export type CreatedBy = 'user' | 'ai' | 'system';

export interface Application {
  id: string;
  user_id: string;
  company_name: string;
  job_title: string;
  location?: string;
  salary_range?: string;
  job_url?: string;
  status_url?: string;
  source?: ApplicationSource;
  status: ApplicationStatus;
  priority: Priority;
  applied_at?: string;
  deadline_at?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface ApplicationEvent {
  id: string;
  user_id: string;
  application_id: string;
  event_type: EventType;
  title: string;
  content?: string;
  old_status?: ApplicationStatus;
  new_status?: ApplicationStatus;
  handled_at?: string;
  handled_action?: 'accepted' | 'dismissed';
  event_time: string;
  created_at: string;
}

export interface Reminder {
  id: string;
  user_id: string;
  application_id?: string;
  title: string;
  content?: string;
  reminder_type?: ReminderType;
  remind_at: string;
  is_done: boolean;
  notified_at?: string;
  created_by: CreatedBy;
  created_at: string;
  updated_at: string;
}

export interface UserSettings {
  id: string;
  user_id: string;
  api_key?: string;
  api_base_url?: string;
  model?: string;
  check_frequency?: CheckFrequency;
  notifications_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface User {
  id: string;
  email?: string;
  phone?: string;
  password_hash?: string;
  openid?: string;
  nickname?: string;
  created_at: string;
  updated_at: string;
}
