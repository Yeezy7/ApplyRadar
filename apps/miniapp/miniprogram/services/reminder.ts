import type { Reminder, CreateReminderInput } from '../utils/types';
import { callCloud } from './common';

const NAME = 'reminder';

export const reminderService = {
  async create(input: CreateReminderInput): Promise<Reminder> {
    return callCloud<Reminder>(NAME, 'create', input);
  },

  async list(includeDone = false, applicationId?: string): Promise<Reminder[]> {
    return callCloud<Reminder[]>(NAME, 'list', { includeDone, application_id: applicationId });
  },

  async update(id: string, updates: Partial<Reminder>): Promise<void> {
    await callCloud(NAME, 'update', { id, ...updates });
  },

  async markDone(id: string): Promise<void> {
    await callCloud(NAME, 'markDone', { id });
  },

  async remove(id: string): Promise<void> {
    await callCloud(NAME, 'delete', { id });
  },
};
