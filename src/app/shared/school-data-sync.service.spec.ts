import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { SchoolDataSyncService } from './school-data-sync.service';
import { ModuleQueryCache } from './offline/module-query-cache';
import { environment } from '../../environments/environment';

describe('School change notifications and query caches', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => { TestBed.resetTestingModule(); vi.useRealTimers(); });
  it('shares the school connection, invalidates on a new version and routes local refreshes by domain', () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const http = TestBed.inject(HttpTestingController), cache = TestBed.inject(ModuleQueryCache), sync = TestBed.inject(SchoolDataSyncService);
    const invalidated = vi.spyOn(cache, 'invalidateSchool'), grades = vi.fn(), finance = vi.fn();
    const a = sync.watch(1, ['grades']).subscribe(grades), b = sync.watch(1, ['finance']).subscribe(finance);
    http.expectOne(environment.apiUrl + '/schools/1/changes').flush({ revision: 1, date: '2026-11-01' });
    vi.advanceTimersByTime(150);
    expect(grades).toHaveBeenCalledOnce(); expect(finance).toHaveBeenCalledOnce(); expect(invalidated).not.toHaveBeenCalled();
    http.expectOne(environment.apiUrl + '/schools/1/changes?since=1').flush({ revision: 2, date: '2026-11-01' });
    vi.advanceTimersByTime(150); expect(invalidated).toHaveBeenCalledWith(1);
    expect(grades).toHaveBeenCalledTimes(2); expect(finance).toHaveBeenCalledTimes(2);
    cache.announce({ school: 1, domain: 'grades' }); vi.advanceTimersByTime(150);
    expect(grades).toHaveBeenCalledTimes(3); expect(finance).toHaveBeenCalledTimes(2);
    a.unsubscribe(); b.unsubscribe(); http.verify({ ignoreCancelled: true });
  });
});
