export interface QueuedFile { name: string; type: string; data: string; }
export interface PendingMessage {
  operationId: string; path: string; payload: unknown; files: QueuedFile[];
  createdAt: string; subject: string; role: string; school: string | null; year: string | null;
  issue?: string; attempted?: boolean;
}
export const MESSAGE_ID = 'X-Offline-Message-Id';
export const MESSAGE_REPLAY = 'X-Offline-Message-Replay';
export function isMessageWrite(method: string, path: string): boolean {
  return method === 'POST' && /^\/conversations(?:\/teacher\/messages|\/\d+\/messages)?$/.test(path);
}
export function messageQueued(error: unknown): boolean {
  return (error as { error?: { messageQueued?: boolean } })?.error?.messageQueued === true;
}
export async function packMessage(body: unknown): Promise<{ payload: unknown; files: QueuedFile[] }> {
  if (!(body instanceof FormData)) return { payload: structuredClone(body), files: [] };
  const request = body.get('request');
  const payload = JSON.parse(request instanceof Blob ? await request.text() : String(request));
  const files: QueuedFile[] = [];
  const uploads = body.getAll('files');
  if (uploads.length > 3) throw new Error('Choisissez au maximum trois pièces jointes.');
  for (const file of uploads) {
    if (!(file instanceof File) || !file.size || file.size > 10 * 1024 * 1024) throw new Error('Chaque pièce jointe doit être non vide et ne pas dépasser 10 Mo.');
    let binary = ''; for (const byte of new Uint8Array(await file.arrayBuffer())) binary += String.fromCharCode(byte);
    files.push({ name: file.name, type: file.type, data: btoa(binary) });
  }
  return { payload, files };
}
export function messageBody(message: PendingMessage): unknown {
  if (!message.files.length) return structuredClone(message.payload);
  const body = new FormData();
  body.append('request', new Blob([JSON.stringify(message.payload)], { type: 'application/json' }));
  for (const file of message.files) body.append('files', new Blob([Uint8Array.from(atob(file.data), value => value.charCodeAt(0))], { type: file.type }), file.name);
  return body;
}
