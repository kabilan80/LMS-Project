import type { DoubtContact, DoubtMessageRow, DoubtThread } from '@lms/shared';
import { api } from './api';

export const getDoubtContacts = async () =>
  (await api.get<{ items: DoubtContact[] }>('/doubts/contacts')).data.items;

export const getDoubtThread = async (withId: number) =>
  (await api.get<DoubtThread>('/doubts/messages', { params: { withId } })).data;

export const sendDoubtMessage = async (toId: number, body: string) =>
  (await api.post<DoubtMessageRow>('/doubts/messages', { toId, body })).data;
