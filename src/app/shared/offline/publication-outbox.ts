import { PendingMessage, messageBody } from './message-outbox';

export const PUBLICATION_ID = 'X-Offline-Publication-Id';
export const PUBLICATION_REPLAY = 'X-Offline-Publication-Replay';
export interface PublicationPayload {
  kind: 'HOMEWORK' | 'DOCUMENT' | 'ANNOUNCEMENT'; title: string; content: string; dueDate: string | null;
  classId: number; studentId: null;
}
export interface LocalPublication extends PendingMessage {
  userId: number;
  payload: PublicationPayload;
  draft: boolean;
  className: string;
}
export function isPublicationPath(path: string): boolean {
  return /^\/me\/teacher\/classes\/\d+\/portal\/posts$/.test(path);
}
export function publicationBody(publication: LocalPublication): FormData {
  const body = messageBody(publication);
  if (body instanceof FormData) return body;
  const form = new FormData();
  form.append('request', new Blob([JSON.stringify(body)], { type: 'application/json' }));
  return form;
}
