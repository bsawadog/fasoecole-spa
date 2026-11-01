import { HttpRequest } from '@angular/common/http';

export interface OfflineRead {
  body: unknown;
  savedAt: string;
  headers: Record<string, string>;
  binary?: boolean;
}
export const READ_RETENTION = 7 * 86400_000;
const MAX_READ_BYTES = 8 * 1024 * 1024;
const MAX_ENTRY_BYTES = 2 * 1024 * 1024;

/** Credentials and permission checks always go to the server, never to an offline copy. */
export function offlineApiPath(url: string, base: string): string | null {
  const prefix = base.replace(/\/+$/, '');
  if (url !== prefix && !url.startsWith(prefix + '/') && !url.startsWith(prefix + '?')) return null;
  const path = url.slice(prefix.length).split('?')[0];
  if (/^\/(auth|roles)(\/|$)/.test(path) || /^\/users\/me(\/|$)/.test(path)
      || /^\/owner\/staff\/my-access(\/|$)/.test(path)
      || /^\/me\/offline-devices(\/|$)/.test(path) || /\/(changes|permissions|access-check)(\/|$)/.test(path)) return null;
  return path;
}

export function offlineReadKey(request: HttpRequest<unknown>, role: string): string {
  const url = new URL(request.urlWithParams, 'http://offline.local');
  url.searchParams.sort();
  return JSON.stringify([role, url.href, request.responseType,
    request.headers.get('X-Academic-School'), request.headers.get('X-Academic-Year'), request.headers.get('Accept-Language'),
    request.headers.get('Accept'), request.headers.get('Range')]);
}

export function storeRead(reads: Record<string, OfflineRead>, key: string, entry: OfflineRead, now = Date.now()): boolean {
  for (const [id, value] of Object.entries(reads)) if (now - Date.parse(value.savedAt) > READ_RETENTION) delete reads[id];
  const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength;
  if (bytes(entry) > MAX_ENTRY_BYTES) { delete reads[key]; return false; }
  reads[key] = entry;
  let size = bytes(reads);
  for (const [id, value] of Object.entries(reads).sort((a, b) => Date.parse(a[1].savedAt) - Date.parse(b[1].savedAt))) {
    if (size <= MAX_READ_BYTES) break;
    size -= bytes(value) + bytes(id) + 2; delete reads[id];
  }
  return !!reads[key];
}

export async function serializeRead(body: unknown, savedAt: string, headers: Record<string, string>): Promise<OfflineRead> {
  if (body instanceof Blob) {
    const bytes = new Uint8Array(await body.arrayBuffer());
    let value = ''; for (const byte of bytes) value += String.fromCharCode(byte);
    return { body: btoa(value), savedAt, headers, binary: true };
  }
  return { body: structuredClone(body), savedAt, headers };
}

export function readBody(entry: OfflineRead): unknown {
  if (!entry.binary) return structuredClone(entry.body);
  const bytes = Uint8Array.from(atob(entry.body as string), char => char.charCodeAt(0));
  return new Blob([bytes], { type: entry.headers['content-type'] ?? 'application/octet-stream' });
}
