import { HttpRequest } from '@angular/common/http';
import { OfflineRead, offlineApiPath, offlineReadKey, readBody, READ_RETENTION, serializeRead, storeRead } from './offline-read-cache';

describe('Offline read storage policy', () => {
  it('excludes authentication, encryption keys, identity and live revision endpoints', () => {
    for (const path of ['/auth/login', '/users/me', '/me/offline-devices/device/key', '/schools/1/changes', '/owner/permissions'])
      expect(offlineApiPath('/api' + path, '/api')).toBeNull();
    expect(offlineApiPath('/api-copy/students', '/api')).toBeNull();
    expect(offlineApiPath('/api/owner/finance?schoolId=1', '/api')).toBe('/owner/finance');
  });
  it('normalizes query ordering without storing credentials in request keys', () => {
    const a = new HttpRequest('GET', '/api/students?year=2&school=1');
    const b = new HttpRequest('GET', '/api/students?school=1&year=2').clone({ setHeaders: { Authorization: 'secret-token' } });
    expect(offlineReadKey(a, 'parent')).toBe(offlineReadKey(b, 'parent'));
    expect(offlineReadKey(b, 'parent')).not.toContain('secret-token');
    expect(offlineReadKey(b, 'parent')).not.toBe(offlineReadKey(b, 'etudiant'));
  });
  it('expires copies and rejects oversized replacements without touching pending attendance', () => {
    const now = Date.now();
    const reads: Record<string, OfflineRead> = { old: { body: 'old', savedAt: new Date(now - READ_RETENTION - 1).toISOString(), headers: {} } };
    expect(storeRead(reads, 'current', { body: 'ok', savedAt: new Date(now).toISOString(), headers: {} }, now)).toBe(true);
    expect(reads['old']).toBeUndefined();
    expect(storeRead(reads, 'current', { body: 'x'.repeat(2 * 1024 * 1024), savedAt: new Date(now).toISOString(), headers: {} }, now)).toBe(false);
    expect(reads['current']).toBeUndefined();
  });
  it('stores independent JSON copies and restores downloaded binary data with its type', async () => {
    const data = { students: ['Awa'] };
    const entry = await serializeRead(data, new Date().toISOString(), {});
    data.students.push('Changed');
    expect(readBody(entry)).toEqual({ students: ['Awa'] });
    const binary = readBody({ body: btoa('PDF'), binary: true, savedAt: new Date().toISOString(), headers: { 'content-type': 'application/pdf' } }) as Blob;
    expect(binary.size).toBe(3); expect(binary.type).toBe('application/pdf');
  });
});
