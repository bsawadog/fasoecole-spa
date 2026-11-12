import { HttpClient, HttpHeaders, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/auth';
import { environment } from '../../../environments/environment';
import { OfflineAttendanceService } from './offline-attendance.service';
import { offlineReadInterceptor } from './offline-read.interceptor';
import { OfflineRead } from './offline-read-cache';
import { ModuleQueryCache } from './module-query-cache';

describe('Offline module reads', () => {
  let connected: boolean;
  let http: HttpClient;
  let requests: HttpTestingController;
  let cache: ModuleQueryCache;
  const copies = new Map<string, OfflineRead>();
  const user = signal({ id: 7, role: 'enseignant', approved: true, emailVerified: true, mustChangePassword: false });
  const token = signal('test-token');
  const offline = {
    enabled: signal(true), unlocked: signal(true), online: signal(true),
    readCopy: vi.fn((key: string) => structuredClone(copies.get(key))),
    rememberRead: vi.fn(async (key: string, entry: OfflineRead) => { copies.set(key, structuredClone(entry)); }),
    forgetReads: vi.fn(async () => { copies.clear(); }),
    queueMessage: vi.fn(async (_message: unknown) => {}),
    queueAction: vi.fn(async (_action: unknown) => {}),
  };
  const url = environment.apiUrl + '/school-life/calendar';
  const headers = (school = '1', year = '10') => new HttpHeaders({ Authorization: 'Bearer test-token', 'X-Academic-School': school, 'X-Academic-Year': year });
  beforeEach(() => {
    connected = true; copies.clear(); vi.clearAllMocks();
    token.set('test-token'); user.set({ id: 7, role: 'enseignant', approved: true, emailVerified: true, mustChangePassword: false });
    offline.enabled.set(true); offline.unlocked.set(true); offline.online.set(true);
    vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => connected);
    TestBed.configureTestingModule({ providers: [
      provideHttpClient(withInterceptors([offlineReadInterceptor])), provideHttpClientTesting(),
      { provide: AuthService, useValue: { user, getToken: token, logout: vi.fn() } },
      { provide: OfflineAttendanceService, useValue: offline },
    ] });
    http = TestBed.inject(HttpClient); requests = TestBed.inject(HttpTestingController);
    cache = TestBed.inject(ModuleQueryCache);
  });
  afterEach(() => { requests.verify(); vi.restoreAllMocks(); });
  async function load() {
    const result = firstValueFrom(http.get(url, { headers: headers() }));
    requests.expectOne(url).flush([{ title: 'Calendrier privé' }]);
    await result;
  }
  it.each([
    ['enseignant', '/school-life/classes/11/observations'], ['proprietaire', '/school-life/schools/1/events'],
    ['parent', '/school-life/students/4/requests'], ['admin', '/school-life/schools/1/books'],
    ['enseignant', '/me/teacher/classes/11/lessons'], ['enseignant', '/me/teacher/daily/notes'],
    ['etudiant', '/me/student/profiles/4/tasks'],
    ...['admin', 'proprietaire'].flatMap(role => [
      '/owner/resources/schools/1/assets', '/owner/resources/schools/1/stock',
      '/owner/resources/schools/1/stock/2/movements',
      '/owner/expenses/schools/1/categories', '/owner/expenses/schools/1/expenses',
      '/owner/payables/schools/1', '/owner/payables/schools/1/fixed', '/owner/payables/schools/1/2/payments',
      '/owner/taxes/schools/1', '/owner/taxes/schools/1/2/payments',
      '/owner/cash-book/schools/1/entries', '/owner/bank-book/schools/1/entries',
      '/owner/finance/schools/1/fee-types', '/owner/finance/invoices/2/payments',
      '/owner/grades/classes/11/evaluations', '/owner/enrollment/schools/1/students',
      '/owner/staff/schools/1', '/teacher-work/schools/1/teachers',
    ].map(path => [role, path])),
  ])('durably queues supported creations for %s at %s without reporting server success', async (role, path) => {
    user.update(value => ({ ...value, role })); connected = false;
    await expect(firstValueFrom(http.post(environment.apiUrl + path, { title: 'Ajout', content: 'Contenu' }, { headers: headers() })))
      .rejects.toMatchObject({ error: { actionQueued: true } });
    requests.expectNone(environment.apiUrl + path);
    expect(offline.queueAction).toHaveBeenCalledWith(expect.objectContaining({ userId: 7, role, path, school: '1', year: '10', operationId: expect.any(String) }));
  });
  it('reuses the original action identity when a server response is lost', async () => {
    const path = environment.apiUrl + '/school-life/classes/11/observations';
    const result = firstValueFrom(http.post(path, { description: 'Observation' }, { headers: headers() }));
    const rejection = expect(result).rejects.toMatchObject({ error: { actionQueued: true } });
    const request = requests.expectOne(path), id = request.request.headers.get('X-Offline-Action-Id');
    expect(id).toBeTruthy(); request.error(new ProgressEvent('error')); await rejection;
    expect(offline.queueAction).toHaveBeenCalledWith(expect.objectContaining({ operationId: id }));
  });
  it('keeps recounts, edits, closures and unauthorized admin creations online only', async () => {
    connected = false;
    for (const role of ['admin', 'enseignant', 'parent', 'etudiant']) {
      user.update(value => ({ ...value, role }));
      const path = role === 'admin' ? '/owner/resources/schools/1/stock/2/movements' : '/owner/finance/invoices/2/payments';
      await expect(firstValueFrom(http.post(environment.apiUrl + path, { kind: 'COUNT' }, { headers: headers() }))).rejects.toMatchObject({ status: 0 });
    }
    user.update(value => ({ ...value, role: 'admin' }));
    for (const path of ['/owner/cash-book/schools/1/close', '/owner/enrollment/schools/1/promotion']) {
      await expect(firstValueFrom(http.post(environment.apiUrl + path, {}, { headers: headers() }))).rejects.toMatchObject({ status: 0 });
    }
    await expect(firstValueFrom(http.put(environment.apiUrl + '/owner/grades/evaluations/2/grades', {}, { headers: headers() }))).rejects.toMatchObject({ status: 0 });
    expect(offline.queueAction).not.toHaveBeenCalled();
  });
  it('keeps a storage failure distinct from successful queueing', async () => {
    connected = false; offline.queueAction.mockRejectedValueOnce(new Error('Coffre plein'));
    await expect(firstValueFrom(http.post(environment.apiUrl + '/me/teacher/daily/notes', { title: 'Note' }, { headers: headers() })))
      .rejects.toMatchObject({ error: { message: 'Coffre plein' } });
  });
  it('does not queue validation failures, denied actions, or replay failures again', async () => {
    const path = environment.apiUrl + '/school-life/classes/11/observations';
    for (const status of [400, 403]) {
      const result = firstValueFrom(http.post(path, {}, { headers: headers() }));
      const rejection = expect(result).rejects.toMatchObject({ status });
      requests.expectOne(path).flush({}, { status, statusText: 'Refused' }); await rejection;
    }
    const result = firstValueFrom(http.post(path, {}, { headers: headers().set('X-Offline-Action-Replay', 'true') }));
    const rejection = expect(result).rejects.toMatchObject({ status: 503 });
    requests.expectOne(path).flush({}, { status: 503, statusText: 'Unavailable' }); await rejection;
    expect(offline.queueAction).not.toHaveBeenCalled();
  });
  it.each(['/finance/payments', '/school-life/schools/1/loans', '/school-life/schools/1/observations/2', '/me/teacher/daily/availability'])('does not queue unsupported or conflicting actions: %s', async path => {
    connected = false;
    await expect(firstValueFrom(http.post(environment.apiUrl + path, {}, { headers: headers() }))).rejects.toMatchObject({ status: 0 });
    requests.expectNone(environment.apiUrl + path); expect(offline.queueAction).not.toHaveBeenCalled();
  });
  it.each(['enseignant', 'parent', 'etudiant', 'proprietaire', 'admin'])('serves the exact loaded data offline for %s', async role => {
    user.update(value => ({ ...value, role }));
    await load(); connected = false;
    expect(await firstValueFrom(http.get(url, { headers: headers() }))).toEqual([{ title: 'Calendrier privé' }]);
    requests.expectNone(url);
  });
  it('keeps schools, years, query parameters and active profiles separate', async () => {
    await load(); connected = false;
    await expect(firstValueFrom(http.get(url, { headers: headers('2') }))).rejects.toMatchObject({ error: { message: expect.stringContaining('pas disponibles') } });
    await expect(firstValueFrom(http.get(url, { headers: headers('1', '11') }))).rejects.toMatchObject({ status: 0 });
    await expect(firstValueFrom(http.get(url, { headers: headers(), params: { page: 2 } }))).rejects.toMatchObject({ status: 0 });
    user.update(value => ({ ...value, role: 'parent' }));
    await expect(firstValueFrom(http.get(url, { headers: headers() }))).rejects.toMatchObject({ status: 0 });
  });
  it('does not replay protected data while the local vault is locked', async () => {
    await load(); offline.readCopy.mockClear(); connected = false; offline.unlocked.set(false);
    await expect(firstValueFrom(http.get(url, { headers: headers() }))).rejects.toMatchObject({ error: { message: expect.stringContaining('déverrouiller') } });
    expect(offline.readCopy).not.toHaveBeenCalled();
  });
  it('refuses unsupported offline writes without a request or a false success', async () => {
    connected = false;
    await expect(firstValueFrom(http.post(url, { title: 'New' }, { headers: headers() }))).rejects.toMatchObject({ error: { message: expect.stringContaining('nécessite Internet') } });
    requests.expectNone(url); expect(offline.rememberRead).not.toHaveBeenCalled();
  });
  it.each(['enseignant', 'parent', 'etudiant', 'proprietaire', 'admin'])('queues a message for %s only after durable storage and makes no offline request', async role => {
    user.update(value => ({ ...value, role })); connected = false;
    const result = firstValueFrom(http.post(environment.apiUrl + '/conversations', { schoolId: 1, subject: 'Bonjour', content: 'Message privé' }, { headers: headers() }));
    await expect(result).rejects.toMatchObject({ error: { messageQueued: true } });
    requests.expectNone(environment.apiUrl + '/conversations');
    expect(offline.queueMessage).toHaveBeenCalledWith(expect.objectContaining({ role, path: '/conversations', subject: 'Bonjour', operationId: expect.any(String) }));
  });
  it('queues a lost-response message with the same operation identity used by its original request', async () => {
    const path = environment.apiUrl + '/conversations/teacher/messages';
    const result = firstValueFrom(http.post(path, { content: 'Bonjour' }, { headers: headers() }));
    const rejected = expect(result).rejects.toMatchObject({ error: { messageQueued: true } });
    const request = requests.expectOne(path), id = request.request.headers.get('X-Offline-Message-Id');
    request.error(new ProgressEvent('error')); await rejected;
    expect(offline.queueMessage).toHaveBeenCalledWith(expect.objectContaining({ operationId: id }));
  });
  it('does not falsely accept a queued message when encrypted storage fails', async () => {
    connected = false; offline.queueMessage.mockRejectedValueOnce(new Error('Stockage plein'));
    await expect(firstValueFrom(http.post(environment.apiUrl + '/conversations', { content: 'Bonjour' }, { headers: headers() })))
      .rejects.toMatchObject({ error: { message: 'Stockage plein' } });
  });
  it.each([401, 403])('never hides a server refusal %s and removes old copies', async status => {
    await load();
    cache.invalidateSchool(null);
    const result = firstValueFrom(http.get(url, { headers: headers() }));
    const rejected = expect(result).rejects.toMatchObject({ status });
    requests.expectOne(url).flush({}, { status, statusText: 'Forbidden' });
    await rejected; expect(copies.size).toBe(0);
  });
  it('never substitutes an online server error with a cached answer', async () => {
    await load();
    offline.readCopy.mockClear(); cache.invalidateSchool(null);
    const result = firstValueFrom(http.get(url, { headers: headers() }));
    const rejected = expect(result).rejects.toMatchObject({ status: 503 });
    requests.expectOne(url).flush({}, { status: 503, statusText: 'Unavailable' });
    await rejected; expect(offline.readCopy).toHaveBeenCalledTimes(1);
  });
  it('uses a loaded copy after a network failure even if the browser still reports online', async () => {
    await load();
    cache.invalidateSchool(null);
    const result = firstValueFrom(http.get(url, { headers: headers() }));
    requests.expectOne(url).error(new ProgressEvent('error'));
    expect(await result).toEqual([{ title: 'Calendrier privé' }]);
    expect(offline.online()).toBe(false);
  });
  it.each(['/classes/11/roster', '/teacher-work/classes/11/teachers'])
  ('uses the encrypted copy for %s after a service-worker 504 while the browser reports online', async path => {
    const endpoint=environment.apiUrl+path;
    const first=firstValueFrom(http.get(endpoint,{headers:headers()}));
    requests.expectOne(endpoint).flush([{id:11,name:'Données de la classe'}]);await first;
    cache.invalidateSchool(null);
    const result=firstValueFrom(http.get(endpoint,{headers:headers()}));
    requests.expectOne(endpoint).flush(null,{status:504,statusText:'Gateway Timeout'});
    expect(await result).toEqual([{id:11,name:'Données de la classe'}]);
    expect(connected).toBe(true);expect(offline.online()).toBe(false);
  });
  it('explains missing or locked copies after a 504 instead of displaying a gateway error', async () => {
    for(const unlocked of [true,false]) {
      offline.unlocked.set(unlocked);
      const result=firstValueFrom(http.get(url,{headers:headers()}));
      const rejected=expect(result).rejects.toMatchObject({status:0,error:{offline:true,message:expect.stringContaining(unlocked?'pas disponibles':'déverrouiller')}});
      requests.expectOne(url).flush(null,{status:504,statusText:'Gateway Timeout'});await rejected;
    }
  });
  it('does not save a late response under a different account', async () => {
    const result = firstValueFrom(http.get(url, { headers: headers() }));
    const request = requests.expectOne(url);
    token.set('other-token'); user.update(value => ({ ...value, id: 8 }));
    request.flush([{ title: 'Previous account' }]); await result;
    expect(offline.rememberRead).not.toHaveBeenCalled();
  });
  it('keeps identity checks out of offline copies', async () => {
    const identity = environment.apiUrl + '/users/me';
    const result = firstValueFrom(http.get(identity, { headers: headers() }));
    requests.expectOne(identity).flush({ id: 7 }); await result;
    expect(offline.rememberRead).not.toHaveBeenCalled();
  });
  it('shares identical simultaneous requests and immediately reuses recent online data', async () => {
    const first = firstValueFrom(http.get(url, { headers: headers() }));
    const second = firstValueFrom(http.get(url, { headers: headers() }));
    requests.expectOne(url).flush([1]);
    expect(await first).toEqual([1]); expect(await second).toEqual([1]);
    expect(await firstValueFrom(http.get(url, { headers: headers() }))).toEqual([1]);
    requests.expectNone(url);
  });
  it('prepares an existing memory copy after offline mode is enabled without another server request', async () => {
    offline.enabled.set(false);
    await load();
    expect(copies.size).toBe(0);
    offline.enabled.set(true);
    await firstValueFrom(http.get(url, { headers: headers() }));
    requests.expectNone(url);
    connected = false;
    expect(await firstValueFrom(http.get(url, { headers: headers() }))).toEqual([{ title: 'Calendrier privé' }]);
    requests.expectNone(url);
  });
  it('returns a recent copy immediately and updates it in the background when it becomes older', async () => {
    await load(); const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now + 20_000);
    expect(await firstValueFrom(http.get(url, { headers: headers() }))).toEqual([{ title: 'Calendrier privé' }]);
    requests.expectOne(url).flush([{ title: 'Nouveau calendrier' }]);
    await vi.waitFor(() => expect(cache.latestRefresh()).not.toBeNull());
    expect(await firstValueFrom(http.get(url, { headers: headers() }))).toEqual([{ title: 'Nouveau calendrier' }]);
    requests.expectNone(url);
  });
  it('does not cache a response started before a successful modification or share it with the following read', async () => {
    const old = firstValueFrom(http.get(url, { headers: headers() }));
    const pending = requests.expectOne(url);
    const write = firstValueFrom(http.post(url, { title: 'New' }, { headers: headers() }));
    requests.expectOne(url).flush({}, { status: 201, statusText: 'Created' }); await write;
    const fresh = firstValueFrom(http.get(url, { headers: headers() }));
    requests.expectOne(url).flush([2]); await fresh;
    pending.flush([1]); await old;
    expect(await firstValueFrom(http.get(url, { headers: headers() }))).toEqual([2]); requests.expectNone(url);
  });
});
