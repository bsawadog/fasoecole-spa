import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { AuthService, OwnerModule } from '../../core/auth';
import { environment } from '../../../environments/environment';
import { ModulePreloadService, recentModuleReads } from './module-preload.service';
import { OfflineAttendanceService } from './offline-attendance.service';

describe('Progressive module preparation', () => {
  let http: HttpTestingController;
  beforeEach(() => TestBed.resetTestingModule());
  afterEach(() => { http?.verify({ ignoreCancelled: true }); TestBed.resetTestingModule(); });
  function setup(role = 'enseignant', modules: OwnerModule[] = []) {
    const online = signal(true);
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(),
      { provide: AuthService, useValue: { user: () => ({ id: 7, role, approved: true, emailVerified: true }), getToken: () => 'test', schoolContextId: () => 1, ownerModules: () => new Set(modules) } },
      { provide: OfflineAttendanceService, useValue: { enabled: () => true, unlocked: () => true, online, recentReadKeys: () => [] } },
      { provide: Router, useValue: { events: new Subject() } },
    ] });
    http = TestBed.inject(HttpTestingController);
    const preload = TestBed.inject(ModulePreloadService); TestBed.tick();
    return { preload, online };
  }
  it('keeps the loading state until all classes are prepared with at most two requests', () => {
    const { preload } = setup();
    const initial = http.match(() => true); expect(initial).toHaveLength(2); expect(preload.busy()).toBe(true);
    initial.find(request => request.request.url.endsWith('/context-schools'))!.flush([{ id: 1 }]);
    const schedule = http.expectOne(environment.apiUrl + '/me/teacher/schedule');
    initial.find(request => request.request.url.endsWith('/classes'))!.flush([{ classId: 11 }, { classId: 12 }]);
    http.expectNone(environment.apiUrl + '/me/teacher/classes/11/students');
    schedule.flush([]);
    const urls: string[] = [];
    while (preload.busy()) {
      const batch = http.match(() => true);
      expect(batch.length).toBeGreaterThan(0);
      expect(batch.length).toBeLessThanOrEqual(2);
      if (!batch.length) break;
      for (const request of batch) { urls.push(request.request.url); request.flush([]); }
    }
    expect(urls).toContain(environment.apiUrl + '/me/teacher/classes/12/students');
    expect(urls).toContain(environment.apiUrl + '/me/teacher/classes/11/portal/posts?kind=DOCUMENT');
    expect(preload.busy()).toBe(false);
  });
  it.each(['admin','proprietaire'])('prepares every accessible class roster before a first offline visit for %s',role=>{
    const {preload,online}=setup(role,['STUDENTS','TEACHERS']);
    const urls:string[]=[];
    while(preload.busy()) {
      const batch=http.match(()=>true);expect(batch.length).toBeGreaterThan(0);expect(batch.length).toBeLessThanOrEqual(2);
      for(const request of batch) {
        urls.push(request.request.url);
        request.flush(request.request.url===environment.apiUrl+'/classes?schoolId=1'
          ?[{id:11,schoolId:1},{id:12,schoolId:1},{id:99,schoolId:2}]:[]);
      }
    }
    for(const id of [11,12]) {
      expect(urls).toContain(environment.apiUrl+`/classes/${id}/roster`);
      expect(urls).toContain(environment.apiUrl+`/teacher-work/classes/${id}/teachers`);
    }
    expect(urls.some(url=>url.includes('/99/'))).toBe(false);
    expect(preload.prepared()).toBe(true);
    online.set(false);TestBed.tick();expect(preload.prepared()).toBe(true);
  });
  it('does not preload teacher data when only the students module is delegated',()=>{
    const {preload}=setup('proprietaire',['STUDENTS']);const urls:string[]=[];
    while(preload.busy())for(const request of http.match(()=>true)) {
      urls.push(request.request.url);
      request.flush(request.request.url===environment.apiUrl+'/classes?schoolId=1'?[{id:11,schoolId:1}]:[]);
    }
    expect(urls).toContain(environment.apiUrl+'/classes/11/roster');
    expect(urls.some(url=>url.includes('/teacher-work/')||url.includes('/payroll/'))).toBe(false);
  });
  it('prepares enrollment fees and host classes for open years before a first offline registration',()=>{
    const {preload}=setup('admin',['ENROLLMENT']);const urls:string[]=[];
    while(preload.busy())for(const request of http.match(()=>true)) {
      urls.push(request.request.url);
      request.flush(request.request.url.endsWith('/owner/enrollment/schools/1/overview')
        ?{years:[{id:1,closed:false},{id:2,closed:false},{id:3,closed:true}]}:[]);
    }
    expect(urls).toContain(environment.apiUrl+'/owner/enrollment/schools/1/fees');
    for(const id of [1,2])expect(urls).toContain(environment.apiUrl+`/owner/enrollment/schools/1/years/${id}/classes`);
    expect(urls.some(url=>url.includes('/years/3/'))).toBe(false);expect(preload.prepared()).toBe(true);
  });
  it('reports incomplete preparation and allows a retry', () => {
    const { preload } = setup();
    const initial = http.match(() => true);
    initial[0].flush('Unavailable', { status: 503, statusText: 'Unavailable' });
    initial[1].flush([]);
    http.expectOne(environment.apiUrl + '/me/teacher/schedule').flush([]);
    expect(preload.failed()).toBe(1);
    expect(preload.prepared()).toBe(false);
    expect(preload.busy()).toBe(false);
    preload.retry();
    expect(preload.busy()).toBe(true);
    expect(preload.failed()).toBe(0);
    for (const request of http.match(() => true)) request.flush([]);
    http.expectOne(environment.apiUrl + '/me/teacher/schedule').flush([]);
    expect(preload.busy()).toBe(false);
  });
  it('stops preparing new pages when connectivity is lost', () => {
    const { preload, online } = setup();
    const initial = http.match(() => true);
    online.set(false); TestBed.tick();
    expect(initial.every(request => request.cancelled)).toBe(true);
    expect(preload.busy()).toBe(false);
  });
  it('never restores preload instructions from another profile, school or year, or for credentials', () => {
    const key = (role: string, path: string, school = '1', year = '10') => JSON.stringify([role, environment.apiUrl + path, 'json', school, year, null, null, null]);
    const reads = recentModuleReads([
      key('parent', '/students'), key('enseignant', '/students', '2'), key('enseignant', '/students', '1', '9'),
      key('enseignant', '/auth/login'), 'invalid', key('enseignant', '/me/teacher/classes'),
    ], 'enseignant', 1, '10');
    expect(reads.map(read => read.url)).toEqual([environment.apiUrl + '/me/teacher/classes']);
    expect(reads[0].headers?.has('Authorization')).toBe(false);
  });
});
