import type { ApplicationEvent, CreateEventInput } from '../utils/types';
import { callCloud } from './common';

const NAME = 'event';

export const eventService = {
  async create(input: CreateEventInput): Promise<ApplicationEvent> {
    return callCloud<ApplicationEvent>(NAME, 'create', input);
  },

  async listByApplication(applicationId: string): Promise<ApplicationEvent[]> {
    return callCloud<ApplicationEvent[]>(NAME, 'listByApplication', { application_id: applicationId });
  },

  async listAll(limit?: number): Promise<ApplicationEvent[]> {
    return callCloud<ApplicationEvent[]>(NAME, 'listAll', { limit });
  },
};
