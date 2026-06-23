// === Application ===

export type ApplicationStatus =
  | "to_apply"
  | "applied"
  | "received"
  | "under_review"
  | "assessment"
  | "interview"
  | "final_interview"
  | "offer"
  | "rejected"
  | "withdrawn"
  | "unknown";

export type ApplicationSource =
  | "official"
  | "email"
  | "referral"
  | "linkedin"
  | "boss"
  | "manual";

export type Priority = "low" | "medium" | "high";

export interface Application {
  id: string;
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

// === Tracking ===

export type LoginState =
  | "valid"
  | "expired"
  | "captcha_required"
  | "mfa_required"
  | "blocked"
  | "unknown";

export type CheckFrequency = "manual" | "daily" | "every_6h" | "every_12h";

export interface TrackingTarget {
  id: string;
  application_id: string;
  domain: string;
  status_url: string;
  ats_type: string;
  enabled: number;
  check_frequency: CheckFrequency;
  current_status: ApplicationStatus;
  last_status?: ApplicationStatus;
  login_state: LoginState;
  last_checked_at?: string;
  last_success_at?: string;
  last_error?: string;
  last_text_hash?: string;
  profile_dir?: string;
  created_at: string;
  updated_at: string;
}

// === Events ===

export type EventType =
  | "status_change"
  | "login_expired"
  | "check_success"
  | "check_failed"
  | "note_added"
  | "manual";

export interface ApplicationEvent {
  id: string;
  application_id: string;
  event_type: EventType;
  title: string;
  content?: string;
  old_status?: ApplicationStatus;
  new_status?: ApplicationStatus;
  handled_at?: string;
  handled_action?: "accepted" | "dismissed";
  event_time: string;
  created_at: string;
}

// === Reminders ===

export type ReminderType =
  | "interview"
  | "assessment_deadline"
  | "offer_deadline"
  | "follow_up"
  | "document_required"
  | "custom";

export type CreatedBy = "user" | "ai" | "system";

export interface Reminder {
  id: string;
  application_id?: string;
  title: string;
  content?: string;
  reminder_type?: ReminderType;
  remind_at: string;
  is_done: number;
  notified_at?: string;
  created_by: CreatedBy;
  created_at: string;
  updated_at: string;
}

// === Tracking Runs ===

export type RunStatus = "success" | "failed" | "login_expired" | "timeout";

export interface TrackingRun {
  id: string;
  target_id: string;
  started_at: string;
  finished_at?: string;
  status: RunStatus;
  raw_status?: string;
  normalized_status?: ApplicationStatus;
  confidence?: number;
  login_state?: LoginState;
  error_message?: string;
  page_hash?: string;
  ai_used: number;
  created_at: string;
}

export interface ManualCheckItem {
  targetId: string;
  success: boolean;
  message: string;
}

export interface ManualCheckResult {
  total: number;
  success: number;
  failed: number;
  statusChanges: number;
  loginIssues: number;
  items: ManualCheckItem[];
}

// === Site Sessions ===

export interface SiteSession {
  id: string;
  domain: string;
  profile_dir: string;
  login_state: LoginState;
  last_verified_at?: string;
  created_at: string;
  updated_at: string;
}

// === AI ===

export interface AIParseInput {
  url: string;
  page_title: string;
  visible_text: string;
  previous_status?: ApplicationStatus;
  known_company?: string;
  known_job_title?: string;
}

export interface AIParseOutput {
  company_name?: string;
  job_title?: string;
  raw_status?: string;
  normalized_status?: ApplicationStatus;
  confidence?: number;
  login_state?: LoginState;
  status_changed?: boolean;
  next_action?: string;
  deadline?: string;
  should_notify?: boolean;
  reason?: string;
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

// === Resume ===

export interface EducationEntry {
  school: string;
  degree: string;
  major: string;
  start_date?: string;
  end_date?: string;
  gpa?: string;
}

export interface WorkExperienceEntry {
  company: string;
  title: string;
  start_date?: string;
  end_date?: string;
  description?: string;
}

export interface ProjectEntry {
  name: string;
  role?: string;
  start_date?: string;
  end_date?: string;
  description?: string;
  tech_stack?: string[];
}

export interface CertificationEntry {
  name: string;
  date?: string;
  issuer?: string;
}

export interface Resume {
  id: string;
  user_id: string;
  name: string;
  is_default: number;
  full_name?: string;
  phone?: string;
  email?: string;
  gender?: string;
  birth_date?: string;
  hometown?: string;
  political_status?: string;
  target_position?: string;
  target_city?: string;
  expected_salary?: string;
  job_type?: string;
  education?: EducationEntry[];
  work_experience?: WorkExperienceEntry[];
  projects?: ProjectEntry[];
  skills?: string[];
  certifications?: CertificationEntry[];
  summary?: string;
  pdf_file_path?: string;
  raw_text?: string;
  parsed_at?: string;
  created_at: string;
  updated_at: string;
}

export interface ResumeAttachment {
  id: string;
  resume_id: string;
  file_name: string;
  file_path: string;
  file_size?: number;
  mime_type: string;
  uploaded_at: string;
}

export interface FormTemplate {
  id: string;
  user_id: string;
  domain: string;
  site_name?: string;
  field_mappings: Record<string, string>;
  is_ai_generated: number;
  confidence?: number;
  last_used_at?: string;
  created_at: string;
  updated_at: string;
}

// === Site Adapter ===

export interface PagePayload {
  visibleText: string;
  title: string;
  url: string;
}

export interface RawStatusResult {
  rawStatus: string;
  normalizedStatus: ApplicationStatus;
  confidence: number;
}

export interface SiteAdapter {
  name: string;
  match(url: string): boolean;
  detectLoginState(pageText: string, url: string): LoginState;
  extractPagePayload(pageText: string, url: string): PagePayload;
  extractRawStatus?(pageText: string, url: string): RawStatusResult | null;
}
