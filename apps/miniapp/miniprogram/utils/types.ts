// === Application ===

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

export interface Application {
  _id?: string;
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
  created_at?: string;
  updated_at?: string;
}

// === Events ===

export type EventType =
  | 'status_change'
  | 'login_expired'
  | 'check_success'
  | 'check_failed'
  | 'note_added'
  | 'manual';

export interface ApplicationEvent {
  _id?: string;
  application_id: string;
  event_type: EventType;
  title: string;
  content?: string;
  old_status?: ApplicationStatus;
  new_status?: ApplicationStatus;
  handled_at?: string;
  handled_action?: 'accepted' | 'dismissed';
  event_time?: string;
  created_at?: string;
}

// === Reminders ===

export type ReminderType =
  | 'interview'
  | 'assessment_deadline'
  | 'offer_deadline'
  | 'follow_up'
  | 'document_required'
  | 'custom';

export type CreatedBy = 'user' | 'ai' | 'system';

export interface Reminder {
  _id?: string;
  application_id?: string;
  title: string;
  content?: string;
  reminder_type?: ReminderType;
  remind_at: string;
  is_done: boolean;
  notified_at?: string;
  created_by: CreatedBy;
  created_at?: string;
  updated_at?: string;
}

// === Input types for creating/updating ===

export interface CreateApplicationInput {
  company_name: string;
  job_title: string;
  location?: string;
  salary_range?: string;
  job_url?: string;
  status_url?: string;
  source?: ApplicationSource;
  status?: ApplicationStatus;
  priority?: Priority;
  applied_at?: string;
  deadline_at?: string;
  notes?: string;
}

export interface UpdateApplicationInput {
  company_name?: string;
  job_title?: string;
  location?: string;
  salary_range?: string;
  job_url?: string;
  status_url?: string;
  source?: ApplicationSource;
  status?: ApplicationStatus;
  priority?: Priority;
  applied_at?: string;
  deadline_at?: string;
  notes?: string;
}

export interface CreateEventInput {
  application_id: string;
  event_type: EventType;
  title: string;
  content?: string;
  old_status?: ApplicationStatus;
  new_status?: ApplicationStatus;
}

export interface CreateReminderInput {
  application_id?: string;
  title: string;
  content?: string;
  reminder_type?: ReminderType;
  remind_at: string;
}
