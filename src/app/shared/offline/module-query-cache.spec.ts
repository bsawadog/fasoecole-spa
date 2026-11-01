import { HttpResponse } from '@angular/common/http';
import { of, Subject } from 'rxjs';
import { ModuleQueryCache } from './module-query-cache';

describe('Module query coordination', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-01T12:00:00Z')); });
  afterEach(() => vi.useRealTimers());
  const grades = { school: 1, domain: 'grades' };
  it('returns independent recent data and clears it when the account or profile changes', () => {
    const cache = new ModuleQueryCache(); cache.useSession('account1/teacher');
    const body = { rows: [1] }; cache.put('grades', new HttpResponse({ body }), grades);
    body.rows.push(2);
    expect(cache.get('grades')?.response.body).toEqual({ rows: [1] });
    cache.useSession('account1/parent'); expect(cache.get('grades')).toBeUndefined();
  });
  it('invalidates related modules and dashboards while preserving other schools and domains', () => {
    const cache = new ModuleQueryCache();
    for (const [key, scope] of [['grades', grades], ['finance', { school: 1, domain: 'finance' }], ['dashboard', { school: 1, domain: 'dashboard' }], ['other-school', { school: 2, domain: 'grades' }]] as const)
      cache.put(key, new HttpResponse({ body: [1] }), scope);
    vi.advanceTimersByTime(1); cache.invalidate(grades);
    expect(cache.get('grades')).toBeUndefined(); expect(cache.get('dashboard')).toBeUndefined();
    expect(cache.get('finance')).toBeDefined(); expect(cache.get('other-school')).toBeDefined();
    cache.invalidateSchool(1); expect(cache.get('finance')).toBeUndefined();
    expect(cache.get('other-school')).toBeDefined();
  });
  it('shares concurrent reads and does not reuse an old request after a modification', () => {
    const cache = new ModuleQueryCache(), pending = new Subject<HttpResponse<unknown>>();
    const load = vi.fn(() => pending);
    const first = cache.fetch('grades', load).subscribe();
    const second = cache.fetch('grades', load).subscribe(); expect(load).toHaveBeenCalledOnce();
    cache.invalidate(grades);
    const fresh = vi.fn(() => of(new HttpResponse({ body: [2] })));
    cache.fetch('grades', fresh).subscribe(); expect(fresh).toHaveBeenCalledOnce();
    pending.complete(); first.unsubscribe(); second.unsubscribe();
  });
  it('bounds retained data and expires a memory copy', () => {
    const cache = new ModuleQueryCache();
    cache.put('large', new HttpResponse({ body: 'x'.repeat(2 * 1024 * 1024) }), grades);
    expect(cache.get('large')).toBeUndefined();
    cache.put('small', new HttpResponse({ body: 'ok' }), grades);
    vi.advanceTimersByTime(60_001); expect(cache.get('small')).toBeUndefined();
  });
});
