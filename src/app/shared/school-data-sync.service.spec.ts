import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { SchoolDataSyncService } from './school-data-sync.service';
import { ModuleQueryCache } from './offline/module-query-cache';
import { environment } from '../../environments/environment';

describe('School change notifications and query caches', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => { TestBed.resetTestingModule(); vi.restoreAllMocks(); vi.useRealTimers(); });
  it('suspends change polling during an outage and reconnects without clearing cached data', () => {
    let online=true;
    vi.spyOn(navigator,'onLine','get').mockImplementation(()=>online);
    TestBed.configureTestingModule({providers:[provideHttpClient(),provideHttpClientTesting()]});
    const http=TestBed.inject(HttpTestingController),cache=TestBed.inject(ModuleQueryCache);
    const invalidate=vi.spyOn(cache,'invalidateSchool');
    const subscription=TestBed.inject(SchoolDataSyncService).watch(1).subscribe();
    const pending=http.expectOne(environment.apiUrl+'/schools/1/changes');
    online=false;window.dispatchEvent(new Event('offline'));
    expect(pending.cancelled).toBe(true);
    vi.advanceTimersByTime(60_000);http.expectNone(()=>true);
    expect(invalidate).not.toHaveBeenCalled();
    online=true;window.dispatchEvent(new Event('online'));
    http.expectOne(environment.apiUrl+'/schools/1/changes').flush({revision:1,date:'2026-11-01'});
    subscription.unsubscribe();http.verify({ignoreCancelled:true});
  });
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
