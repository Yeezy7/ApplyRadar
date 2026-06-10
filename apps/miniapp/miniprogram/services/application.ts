import type { Application, CreateApplicationInput, UpdateApplicationInput } from '../utils/types';
import { callCloud } from './common';

const NAME = 'application';

export const applicationService = {
  async create(input: CreateApplicationInput): Promise<Application> {
    return callCloud<Application>(NAME, 'create', input);
  },

  async list(search?: string, status?: string): Promise<Application[]> {
    return callCloud<Application[]>(NAME, 'list', { search, status });
  },

  async get(id: string): Promise<Application> {
    return callCloud<Application>(NAME, 'get', { id });
  },

  async update(id: string, input: UpdateApplicationInput): Promise<Application> {
    return callCloud<Application>(NAME, 'update', { id, ...input });
  },

  async remove(id: string): Promise<void> {
    await callCloud(NAME, 'delete', { id });
  },
};
