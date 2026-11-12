import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { AuthService } from '../../core/auth';
import { OfflineAttendanceService } from './offline-attendance.service';
import { AttendanceVault } from './attendance-queue';
import { ATTENDANCE_VAULT } from './attendance-vault';
import { TeacherClass } from '../self-space/self-space.service';
import { PendingMessage, MESSAGE_ID } from './message-outbox';
import { LocalPublication, PUBLICATION_ID } from './publication-outbox';
import { PendingAction, ACTION_ID } from './action-outbox';
import { environment } from '../../../environments/environment';
import { OfflineAppService } from './offline-app.service';

const storage = { value: undefined as unknown };
const vault = {
  importVaultKey: async () => ({}),
  openVault: async (_key: unknown, _owner: unknown, value: unknown) => structuredClone(value),
  sealVault: async (_key: unknown, _owner: unknown, value: unknown) => structuredClone(value),
  vaultStore: async (_owner: string, value?: unknown) => {
    if (value !== undefined) storage.value = structuredClone(value);
    return structuredClone(storage.value);
  },
};

describe('Offline attendance synchronization', () => {
  const locks = Object.getOwnPropertyDescriptor(navigator, 'locks');
  const row = { studentId: 1, fullName: 'Élève', registrationNumber: 'A', status: null, justification: null, version: null };
  beforeEach(() => {
    storage.value = undefined;
    vi.stubGlobal('indexedDB', {});
    localStorage.setItem('fasoecole_offline_7', 'false');
    localStorage.setItem('fasoecole_auth', JSON.stringify({ token: 'test-session', user: { id: 7 } }));
    Object.defineProperty(navigator, 'locks', { configurable: true, value: { request: async (_name: string, callback: () => unknown) => callback() } });
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    if (locks) Object.defineProperty(navigator, 'locks', locks);
    else Reflect.deleteProperty(navigator, 'locks');
    localStorage.removeItem('fasoecole_auth');
    localStorage.removeItem('fasoecole_offline_7');
    localStorage.removeItem('fasoecole_offline_device');
  });
  function setup(role = 'enseignant', application = { prepare: async () => {} }, account = { approved: true, emailVerified: true, mustChangePassword: false }) {
    const http = { post: vi.fn(() => of({ key: 'test-key' })), put: vi.fn(() => of([{ ...row, status: 'ABSENT', version: 0 }])) };
    TestBed.configureTestingModule({ providers: [
      { provide: AuthService, useValue: { user: () => ({ id: 7, role, ...account }), getToken: () => 'test-session' } },
      { provide: HttpClient, useValue: http },
      { provide: ATTENDANCE_VAULT, useValue: vault },
      { provide: OfflineAppService, useValue: application },
    ] });
    const service = TestBed.inject(OfflineAttendanceService);
    TestBed.tick();
    return { service, http };
  }
  it('waits for application files before enabling private offline storage',async()=>{
    let complete!:()=>void;
    const application={prepare:()=>new Promise<void>(resolve=>{complete=resolve;})};
    const {service,http}=setup('admin',application);
    const enabling=service.enable();
    expect(service.enabled()).toBe(true);expect(service.unlocked()).toBe(false);expect(service.busy()).toBe(true);expect(http.post).not.toHaveBeenCalled();
    complete();await enabling;
    expect(service.enabled()).toBe(true);expect(service.unlocked()).toBe(true);
  });
  it('automatically enables and unlocks offline mode for an eligible account with no saved preference',async()=>{
    localStorage.removeItem('fasoecole_offline_7');
    const {service}=setup('admin');
    expect(service.enabled()).toBe(true);
    await vi.waitFor(()=>expect(service.unlocked()).toBe(true));
  });
  it('waits for connectivity before automatically unlocking a restored offline session',async()=>{
    localStorage.removeItem('fasoecole_offline_7');
    vi.spyOn(navigator,'onLine','get').mockReturnValue(false);
    const {service,http}=setup();
    expect(service.enabled()).toBe(true);expect(service.unlocked()).toBe(false);expect(http.post).not.toHaveBeenCalled();
    vi.spyOn(navigator,'onLine','get').mockReturnValue(true);window.dispatchEvent(new Event('online'));
    await vi.waitFor(()=>expect(service.unlocked()).toBe(true));
  });
  it('does not enable storage on an unsupported browser',()=>{
    localStorage.removeItem('fasoecole_offline_7');vi.stubGlobal('indexedDB',undefined);
    const {service,http}=setup();
    expect(service.supported).toBe(false);expect(service.enabled()).toBe(false);expect(http.post).not.toHaveBeenCalled();
  });
  it('keeps an explicit opt-out after a new session and allows enabling it again',async()=>{
    const {service}=setup();
    expect(service.enabled()).toBe(false);
    await service.enable();await service.disable();
    expect(localStorage.getItem('fasoecole_offline_7')).toBe('false');
    TestBed.resetTestingModule();
    const next=setup().service;expect(next.enabled()).toBe(false);
    await next.enable();expect(next.unlocked()).toBe(true);
    expect(localStorage.getItem('fasoecole_offline_7')).toBe('true');
  });
  it.each([
    {approved:false,emailVerified:true,mustChangePassword:false},
    {approved:true,emailVerified:false,mustChangePassword:false},
    {approved:true,emailVerified:true,mustChangePassword:true},
  ])('does not automatically enable offline storage before account activation: %o',account=>{
    localStorage.removeItem('fasoecole_offline_7');
    const {service,http}=setup('admin',undefined,account);
    expect(service.enabled()).toBe(false);expect(http.post).not.toHaveBeenCalled();
  });
  const pending = (issue?: string): AttendanceVault => ({ snapshots: {}, pending: [{
    operationId: 'one', schoolId: 1, classId: 11, date: '2026-10-31', issue,
    entries: [{ studentId: 1, status: 'ABSENT', justification: null, expectedStatus: null, expectedJustification: null, expectedVersion: null }],
  }] });
  const message = (): PendingMessage => ({ operationId: crypto.randomUUID(), path: '/conversations/teacher/messages',
    payload: { schoolId: 1, classId: 11, subject: 'Devoir', content: 'Bonjour', recipientUserIds: [8] },
    files: [], createdAt: '2026-11-01T12:00:00Z', subject: 'Devoir', role: 'enseignant', school: '1', year: '2' });
  const publication = (draft = true): LocalPublication => ({ ...message(), userId: 7, draft, className: 'CP1', path: '/me/teacher/classes/11/portal/posts',
    payload: { kind: 'HOMEWORK', classId: 11, studentId: null, title: 'Exercices', content: 'Faire la page 12', dueDate: '2099-11-30' },
    files: [{ name: 'cours.txt', type: 'text/plain', data: btoa('Cours de calcul') }] });
  const action = (): PendingAction => ({ operationId: crypto.randomUUID(), userId: 7, role: 'enseignant', path: '/school-life/classes/11/observations',
    payload: { classId: 11, studentId: 4, description: 'Observation', observedOn: '2026-11-01' }, label: 'Observation de discipline', createdAt: new Date().toISOString(), school: '1', year: '2' });
  it.each(['/owner/finance/invoices/2/payments', '/owner/enrollment/schools/1/students', '/owner/resources/schools/1/stock/2/movements'])
  ('preserves an admin creation across a lost response and only removes it after confirmation: %s', async path => {
    const {service,http}=setup('admin'); await service.enable();
    const item:PendingAction={...action(),role:'admin',path,payload:{amount:100,kind:'OUT',quantity:2}};
    await service.queueAction(item);
    http.post.mockReturnValueOnce(throwError(()=>({status:0})));
    await service.synchronize();expect(service.pendingActions()).toHaveLength(1);
    window.dispatchEvent(new Event('pagehide'));
    http.post.mockReturnValueOnce(of({key:'test-key'}));
    await service.unlock();
    expect(service.pendingActions()).toEqual([]);
    const sends=(http.post.mock.calls as unknown as [string,unknown,{headers:Record<string,string>}][]).filter(call=>call[0]===environment.apiUrl+path);
    expect(sends).toHaveLength(2);
    for(const send of sends)expect(send[2].headers[ACTION_ID]).toBe(item.operationId);
  });
  it('retains actions and their original identity after closure and a lost response', async () => {
    const { service, http } = setup(); await service.enable(); const item = action();
    await service.queueAction(item); await service.queueAction(item); expect(service.pendingActions()).toHaveLength(1);
    await expect(service.disable()).rejects.toThrow('actions en attente');
    window.dispatchEvent(new Event('pagehide')); expect(service.pendingActions()).toEqual([]);
    http.post.mockReturnValueOnce(of({ key: 'test-key' })).mockReturnValueOnce(throwError(() => ({ status: 0 })));
    await service.unlock(); expect(service.pendingActions()[0].attempted).toBe(true); expect(service.lastActionSync()).toBeNull();
    await expect(service.removeAction(item.operationId)).rejects.toThrow('déjà tenté');
    await expect(service.updateAction(item.operationId, {})).rejects.toThrow('ne peut plus');
    await service.synchronize();
    const sent = http.post.mock.calls.at(-1) as unknown as [string, unknown, { headers: Record<string, string> }];
    expect(sent[2].headers[ACTION_ID]).toBe(item.operationId); expect(sent[2].headers['X-Academic-Year']).toBe('2');
    expect(service.pendingActions()).toEqual([]); expect(service.lastActionSync()?.label).toBe(item.label);
  });
  it('allows correcting or cancelling a definitively refused action', async () => {
    const { service, http } = setup(); await service.enable(); const item = action(); await service.queueAction(item);
    http.post.mockReturnValueOnce(throwError(() => ({ status: 403, error: { message: 'Classe non autorisée' } })));
    await service.synchronize(); expect(service.pendingActions()[0].issue).toBe('Classe non autorisée');
    await service.updateAction(item.operationId, { description: 'Correction' });
    expect(service.pendingActions()[0].payload).toEqual({ description: 'Correction' }); expect(service.pendingActions()[0].issue).toBeUndefined();
    await service.removeAction(item.operationId); expect(service.pendingActions()).toEqual([]);
  });
  it('suspends delivery while an action is being edited, including after reopening the browser', async () => {
    const { service, http } = setup(); await service.enable(); const item = action(); await service.queueAction(item);
    await service.editAction(item.operationId); const calls = http.post.mock.calls.length;
    await service.synchronize(); expect(http.post.mock.calls.length).toBe(calls);
    window.dispatchEvent(new Event('pagehide')); await service.unlock();
    expect(service.pendingActions()[0].paused).toBe(true); expect(service.lastActionSync()).toBeNull();
    await service.updateAction(item.operationId, { ...(item.payload as object), description: 'Correction conservée' });
    await service.synchronize(); expect(service.pendingActions()).toEqual([]);
    const sent = http.post.mock.calls.at(-1) as unknown as [string, { description: string }]; expect(sent[1].description).toBe('Correction conservée');
  });
  it('rejects another account and unsupported endpoints instead of broadening the queue to arbitrary writes', async () => {
    const { service } = setup(); await service.enable();
    await expect(service.queueAction({ ...action(), userId: 8 })).rejects.toThrow('ne peut pas');
    await expect(service.queueAction({ ...action(), path: '/finance/payments' })).rejects.toThrow('ne peut pas');
    expect(service.pendingActions()).toEqual([]);
  });
  it('queues class announcements with the same durable publication lifecycle', async () => {
    const { service } = setup(); await service.enable();
    const item: LocalPublication = { ...publication(), payload: { ...publication().payload, kind: 'ANNOUNCEMENT', dueDate: null }, files: [] };
    await service.savePublication(item); expect(service.publications()[0].payload.kind).toBe('ANNOUNCEMENT');
  });
  it('persists drafts and files without publishing, and restores them after locking', async () => {
    const { service, http } = setup(); await service.enable();
    const item = publication(); await service.savePublication(item);
    const calls = http.post.mock.calls.length;
    await service.synchronize(); expect(http.post.mock.calls.length).toBe(calls);
    expect(service.publications()[0].files).toEqual(item.files);
    await expect(service.disable()).rejects.toThrow('brouillons');
    window.dispatchEvent(new Event('pagehide')); expect(service.publications()).toEqual([]);
    await service.unlock(); expect(service.publications()[0]).toEqual(item);
    await service.removePublication(item.operationId); expect(service.publications()).toEqual([]);
  });
  it('keeps the same delivery identity and attachments after a lost publication response', async () => {
    const { service, http } = setup(); await service.enable();
    const item = publication(false); await service.savePublication(item);
    http.post.mockReturnValueOnce(throwError(() => ({ status: 0 })));
    await service.synchronize();
    expect(service.lastPublicationSync()).toBeNull(); expect(service.publications()[0].attempted).toBe(true);
    await expect(service.removePublication(item.operationId)).rejects.toThrow('déjà tenté');
    await expect(service.savePublication({ ...item, draft: true })).rejects.toThrow('déjà été tenté');
    const first = http.post.mock.calls.at(-1) as unknown as [string, FormData, { headers: Record<string, string> }];
    expect(first[2].headers[PUBLICATION_ID]).toBe(item.operationId);
    expect((first[1].get('files') as File).name).toBe('cours.txt');
    expect(first[2].headers['X-Academic-Year']).toBe('2');
    await service.synchronize();
    const retry = http.post.mock.calls.at(-1) as unknown as typeof first;
    expect(retry[2].headers[PUBLICATION_ID]).toBe(item.operationId);
    expect(service.publications()).toEqual([]); expect(service.lastPublicationSync()).not.toBeNull();
  });
  it('keeps rejected publications editable and never treats them as published', async () => {
    const { service, http } = setup(); await service.enable();
    const item = publication(false); await service.savePublication(item);
    http.post.mockReturnValueOnce(throwError(() => ({ status: 400, error: { message: 'La date ne doit pas être passée' } })));
    await service.synchronize();
    expect(service.publications()[0].issue).toContain('date'); expect(service.lastPublicationSync()).toBeNull();
    await service.savePublication({ ...item, draft: true });
    const calls = http.post.mock.calls.length; await service.synchronize(); expect(http.post.mock.calls.length).toBe(calls);
    await service.removePublication(item.operationId); expect(service.publications()).toEqual([]);
  });
  it('rejects publications captured by another account or targeting another write endpoint', async () => {
    const { service } = setup(); await service.enable();
    await expect(service.savePublication({ ...publication(), userId: 8 })).rejects.toThrow('non autorisée');
    await expect(service.savePublication({ ...publication(), path: '/owner/posts' })).rejects.toThrow('non autorisée');
    expect(service.publications()).toEqual([]);
  });
  it('preserves queued messages through locking, prevents disabling, and retries a lost response with the same identity', async () => {
    const { service, http } = setup(); await service.enable();
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const queued = message();
    await service.queueMessage(queued); await service.queueMessage(queued);
    expect(service.pendingMessages()).toHaveLength(1);
    await expect(service.disable()).rejects.toThrow('messages en attente');
    window.dispatchEvent(new Event('pagehide'));
    expect(service.pendingMessages()).toEqual([]);
    expect((storage.value as AttendanceVault).messages).toHaveLength(1);
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true); service.online.set(true);
    http.post.mockReturnValueOnce(of({ key: 'test-key' })).mockReturnValueOnce(throwError(() => ({ status: 0 })));
    await service.synchronize();
    expect(service.pendingMessages()).toHaveLength(1);
    const attempted = http.post.mock.calls.at(-1) as unknown as [string, unknown, { headers: Record<string, string> }];
    expect(attempted[2].headers[MESSAGE_ID]).toBe(queued.operationId);
    await service.synchronize();
    const retried = http.post.mock.calls.at(-1) as unknown as typeof attempted;
    expect(retried[2].headers[MESSAGE_ID]).toBe(queued.operationId);
    expect(service.pendingMessages()).toEqual([]);
    expect(service.lastMessageSync()).not.toBeNull();
  });
  it('retains a rejected message for explicit retry instead of reporting delivery', async () => {
    const { service, http } = setup(); await service.enable();
    const queued = message(); await service.queueMessage(queued);
    http.post.mockReturnValueOnce(throwError(() => ({ status: 403, error: { message: 'Destinataire non autorisé' } })));
    await service.synchronize();
    expect(service.pendingMessages()[0].issue).toBe('Destinataire non autorisé');
    expect(service.lastMessageSync()).toBeNull();
    const attempts = http.post.mock.calls.length; await service.synchronize();
    expect(http.post.mock.calls.length).toBe(attempts);
    await service.retryMessage(queued.operationId);
    expect(service.pendingMessages()).toEqual([]);
  });
  it('unlocks and sends persisted operations when manually synchronizing a locked vault', async () => {
    const { service, http } = setup();
    storage.value = pending(); service.enabled.set(true);
    await service.synchronize();
    expect(http.post).toHaveBeenCalledOnce();
    expect(http.put).toHaveBeenCalledOnce();
    expect(service.pending()).toEqual([]);
    expect((storage.value as AttendanceVault).pending).toEqual([]);
    expect(service.busy()).toBe(false);
  });
  it('explains why a persisted conflict prevents any sync request, including subsequent manual attempts', async () => {
    const { service, http } = setup();
    storage.value = pending('Une présence a changé.'); service.enabled.set(true);
    await service.synchronize();
    await service.synchronize();
    expect(http.put).not.toHaveBeenCalled();
    expect(service.issue()).toContain('Synchronisation bloquée');
    expect(service.issue()).toContain('Vérifier cet appel');
    expect(service.pending()).toHaveLength(1);
  });
  it('does not silently skip synchronization after the session changes in another tab', async () => {
    const { service, http } = setup();
    storage.value = pending(); service.enabled.set(true);
    localStorage.setItem('fasoecole_auth', JSON.stringify({ token: 'other-session', user: { id: 8 } }));
    await service.synchronize();
    expect(http.post).not.toHaveBeenCalled();
    expect(http.put).not.toHaveBeenCalled();
    expect(service.issue()).toContain('session a changé');
    expect((storage.value as AttendanceVault).pending).toHaveLength(1);
  });
  it('retries a temporary server limit instead of permanently blocking the operation', async () => {
    const { service, http } = setup();
    storage.value = pending(); service.enabled.set(true);
    http.put.mockReturnValueOnce(throwError(() => ({ status: 429 })));
    await service.synchronize();
    expect(service.pending()).toHaveLength(1);
    expect(service.pending()[0].issue).toBeUndefined();
    await service.synchronize();
    expect(http.put).toHaveBeenCalledTimes(2);
    expect(service.pending()).toEqual([]);
  });
  it('keeps navigation metadata only for the unlocked session and clears it on page closure', async () => {
    const { service } = setup();
    await service.enable();
    const classes = [{ classId: 11, schoolId: 1, className: 'CE1' }] as TeacherClass[];
    service.rememberClasses(classes); service.rememberView(11, '2026-10-15');
    service.rememberRoster(11, [{ studentId: 1, fullName: 'Awa', registrationNumber: 'A', gender: null, birthDate: null }]);
    service.rememberSchedule([]); service.rememberClassSelection(11);
    classes[0].className = 'Changed externally';
    expect(service.cachedClasses()[0].className).toBe('CE1');
    expect(service.cachedView()).toEqual({ classId: 11, date: '2026-10-15' });
    expect(service.cachedRoster(11)?.[0].fullName).toBe('Awa');
    expect(service.cachedRoster(12)).toBeUndefined();
    expect(service.cachedSchedule()).toEqual([]); expect(service.cachedClassSelection()).toBe(11);
    expect(storage.value).not.toHaveProperty('sessionClasses');
    window.dispatchEvent(new Event('pagehide'));
    expect(service.cachedClasses()).toEqual([]);
    expect(service.cachedView()).toBeNull();
    expect(service.cachedRoster(11)).toBeUndefined(); expect(service.cachedSchedule()).toBeUndefined();
    expect(service.cachedClassSelection()).toBeNull();
  });
  it('stores read copies alongside pending attendance and never exposes them to another session', async () => {
    const { service } = setup();
    storage.value = pending('Review required'); service.enabled.set(true);
    await service.synchronize();
    await service.rememberRead('parent/school1/year1', { body: { amount: 100 }, savedAt: new Date().toISOString(), headers: {} });
    expect(service.readCopy('parent/school1/year1')?.body).toEqual({ amount: 100 });
    expect((storage.value as AttendanceVault).pending).toHaveLength(1);
    localStorage.setItem('fasoecole_auth', JSON.stringify({ token: 'other-token', user: { id: 8 } }));
    expect(service.readCopy('parent/school1/year1')).toBeUndefined();
  });
});
