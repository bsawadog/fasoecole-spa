import { HttpClient } from '@angular/common/http';
import { DestroyRef, Injectable, effect, inject, signal, untracked } from '@angular/core';
import { firstValueFrom, fromEvent, merge, timer, timeout } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AuthService } from '../../core/auth';
import { environment } from '../../../environments/environment';
import { apiError, RosterStudent, ScheduleEntry, TeacherAttendanceItem, TeacherClass } from '../self-space/self-space.service';
import { ATTENDANCE_VAULT } from './attendance-vault';
import { OfflineRead, READ_RETENTION, storeRead } from './offline-read-cache';
import { PendingMessage, MESSAGE_ID, MESSAGE_REPLAY, messageBody, isMessageWrite } from './message-outbox';
import { MessageActivityService } from '../message-activity.service';
import { LocalPublication, PUBLICATION_ID, PUBLICATION_REPLAY, isPublicationPath, publicationBody } from './publication-outbox';
import { PendingAction, ACTION_ID, ACTION_REPLAY, queuedActionLabel } from './action-outbox';
import { OfflineAppService } from './offline-app.service';
import { AttendanceVault as Vault, OfflineEntry, PendingCall, Snapshot, attendanceContext as context, confirmCall, enqueueCall, firstForContext, localSnapshot } from './attendance-queue';
export type { OfflineEntry, PendingCall } from './attendance-queue';
const empty = (): Vault => ({ snapshots: {}, pending: [] });

@Injectable({ providedIn: 'root' })
export class OfflineAttendanceService {
  private readonly auth = inject(AuthService);
  private readonly http = inject(HttpClient);
  private readonly vault = inject(ATTENDANCE_VAULT);
  private readonly destroy = inject(DestroyRef);
  private readonly activity = inject(MessageActivityService);
  private readonly application = inject(OfflineAppService);
  readonly supported = typeof window !== 'undefined' && !!globalThis.crypto?.subtle && !!globalThis.indexedDB && !!navigator.locks;
  readonly online = signal(typeof navigator === 'undefined' || navigator.onLine);
  readonly enabled = signal(false);
  readonly unlocked = signal(false);
  readonly busy = signal(false);
  readonly pending = signal<PendingCall[]>([]);
  readonly pendingMessages = signal<PendingMessage[]>([]);
  readonly publications = signal<LocalPublication[]>([]);
  readonly pendingActions = signal<PendingAction[]>([]);
  readonly lastActionSync = signal<{ label: string; at: string } | null>(null);
  readonly lastPublicationSync = signal<string | null>(null);
  private readonly confirmedPublications = new Set<string>();
  publicationConfirmed(id: string): boolean { return this.confirmedPublications.has(id); }
  readonly lastMessageSync = signal<string | null>(null);
  readonly issue = signal<string | null>(null);
  readonly lastSync = signal<string | null>(null);
  readonly revision = signal(0);
  readonly lastOfflineRead = signal<string | null>(null);
  readonly readCacheIssue = signal<string | null>(null);
  private key?: CryptoKey;
  private owner = '';
  private token: string | null = null;
  private state = empty();
  private generation = 0;
  private sessionClasses: TeacherClass[] = [];
  private sessionView: { classId: number; date: string } | null = null;
  private sessionRosters: Record<number, RosterStudent[]> = {};
  private sessionSchedule: ScheduleEntry[] | null = null;
  private sessionClassSelection: number | null = null;
  private clearSessionNavigation(): void {
    this.pendingActions.set([]); this.lastActionSync.set(null);
    this.confirmedPublications.clear();
    this.publications.set([]); this.lastPublicationSync.set(null);
    this.sessionClasses = []; this.sessionView = null;
    this.sessionRosters = {}; this.sessionSchedule = null; this.sessionClassSelection = null;
    this.lastOfflineRead.set(null); this.readCacheIssue.set(null);
  }

  constructor() {
    effect(() => {
      const user = this.auth.user(); const token = this.auth.getToken();
      const eligible = !!user?.approved && user.emailVerified === true && !user.mustChangePassword && this.supported;
      untracked(() => { if (!user || token !== this.token || !this.owner.startsWith(`${user.id}/`) || (!eligible && this.enabled())) {
        this.generation++; this.key = undefined; this.owner = ''; this.token = token;
        this.state = empty(); this.pending.set([]); this.pendingMessages.set([]); this.lastMessageSync.set(null); this.unlocked.set(false); this.busy.set(false);
        this.clearSessionNavigation();
        // Absence of a preference means enabled by default. An explicit opt-out
        // must survive reconnecting and opening the application again.
        this.enabled.set(eligible && localStorage.getItem(`fasoecole_offline_${user!.id}`) !== 'false');
        if (this.enabled() && this.online()) void this.unlock();
      } });
    });
    if (typeof window !== 'undefined') {
      fromEvent<StorageEvent>(window, 'storage').pipe(takeUntilDestroyed(this.destroy)).subscribe(event => {
        if ((!event.key || event.key === 'fasoecole_auth') && !this.sameSession()) this.lock();
      });
      fromEvent(window, 'pagehide').pipe(takeUntilDestroyed(this.destroy)).subscribe(() => this.lock());
      merge(fromEvent(window, 'online'), fromEvent(window, 'offline'), fromEvent(window, 'pageshow'), timer(30_000, 30_000))
        .pipe(takeUntilDestroyed(this.destroy)).subscribe(() => {
          this.online.set(navigator.onLine);
          if (this.enabled() && this.online()) void (this.unlocked() ? this.synchronize() : this.unlock());
        });
    }
  }
  private sameSession(): boolean {
    try {
      const stored = JSON.parse(localStorage.getItem('fasoecole_auth') ?? 'null');
      return !!stored && stored.token === this.auth.getToken() && stored.user?.id === this.auth.user()?.id;
    } catch { return false; }
  }
  private lock(): void {
    this.generation++; this.key = undefined; this.owner = ''; this.state = empty();
    this.unlocked.set(false); this.busy.set(false); this.pending.set([]); this.lastSync.set(null);
    this.pendingMessages.set([]); this.lastMessageSync.set(null);
    this.clearSessionNavigation();
  }
  async enable(): Promise<void> {
    const user = this.auth.user();
    if (!user?.approved || user.emailVerified !== true || user.mustChangePassword || !this.supported) return;
    localStorage.setItem(`fasoecole_offline_${user.id}`, 'true'); this.enabled.set(true);
    await this.unlock();
  }
  async disable(): Promise<void> {
    if (this.busy() || !this.unlocked()) return;
    await this.change(state => {
      if (state.actions?.length) throw new Error('Synchronisez ou annulez les actions en attente avant de désactiver.');
      if (state.publications?.length) throw new Error('Publiez ou supprimez les brouillons et publications en attente avant de désactiver.');
      if (state.pending.length || state.messages?.length) throw new Error('Synchronisez les présences et messages en attente avant de désactiver.');
      state.snapshots = {};
      state.reads = {};
    });
    const user = this.auth.user();
    if (user) localStorage.setItem(`fasoecole_offline_${user.id}`, 'false');
    this.generation++; this.key = undefined; this.owner = ''; this.state = empty();
    this.enabled.set(false); this.unlocked.set(false); this.pending.set([]);
    this.pendingMessages.set([]); this.lastMessageSync.set(null);
    this.clearSessionNavigation();
  }
  async unlock(): Promise<void> {
    if (this.busy() || !this.enabled() || !this.supported) return;
    if (!this.sameSession()) { this.issue.set('Votre session a changé dans un autre onglet. Reconnectez-vous avec le compte qui a effectué ces saisies pour les synchroniser.'); return; }
    if (!this.online()) { this.issue.set('Connexion Internet indisponible. Les envois reprendront automatiquement à son retour.'); return; }
    const userId = this.auth.user()?.id, token = this.auth.getToken(), generation = this.generation;
    if (!userId || !token) return;
    this.busy.set(true); this.issue.set(null);
    try {
      await this.application.prepare();
      if (generation !== this.generation || token !== this.auth.getToken() || !this.enabled()) return;
      let device = localStorage.getItem('fasoecole_offline_device');
      if (!device) { device = crypto.randomUUID(); localStorage.setItem('fasoecole_offline_device', device); }
      const response = await firstValueFrom(this.http.post<{ key: string }>(`${environment.apiUrl}/me/offline-devices/${device}/key`, {}).pipe(timeout(20_000)));
      const key = await this.vault.importVaultKey(response.key);
      if (generation !== this.generation || token !== this.auth.getToken() || userId !== this.auth.user()?.id) return;
      this.owner = `${userId}/${device}`; this.key = key;
      await this.change(() => {});
      if (generation !== this.generation) return;
      this.unlocked.set(true);
    } catch (err) {
      if (generation === this.generation) { this.key = undefined; this.unlocked.set(false); this.issue.set(apiError(err, 'Connexion nécessaire pour ouvrir les saisies locales.')); }
    } finally { if (generation === this.generation) this.busy.set(false); }
    if (this.unlocked()) await this.synchronize();
  }
  private async change<T>(update: (state: Vault) => T): Promise<T> {
    const key = this.key, owner = this.owner, generation = this.generation;
    if (!key || !owner) throw new Error('Reconnectez-vous pour ouvrir les saisies locales.');
    return navigator.locks.request(`fasoecole-attendance/${owner}`, async () => {
      const stored = await this.vault.vaultStore(owner);
      const state = stored ? await this.vault.openVault<Vault>(key, owner, stored) : empty();
      if (generation !== this.generation || !this.sameSession()) throw new Error('La session a changé.');
      const result = update(state);
      // Expire copies only; pending calls never expire automatically.
      const keep = new Set(state.pending.map(call => context(call.schoolId, call.classId, call.date)));
      for (const [id, snapshot] of Object.entries(state.snapshots)) {
        if (!keep.has(id) && Date.now() - Date.parse(snapshot.savedAt) > 7 * 86400_000) delete state.snapshots[id];
      }
      for (const [id, entry] of Object.entries(state.reads ?? {})) {
        if (Date.now() - Date.parse(entry.savedAt) > READ_RETENTION) delete state.reads![id];
      }
      await this.vault.vaultStore(owner, await this.vault.sealVault(key, owner, state));
      if (generation === this.generation) {
        this.pendingActions.set(state.actions ?? []);
        this.publications.set(state.publications ?? []);
        this.state = state; this.pending.set(state.pending); this.pendingMessages.set(state.messages ?? []); this.revision.update(value => value + 1);
      }
      return result;
    });
  }
  rememberClasses(classes: TeacherClass[]): void {
    if (this.unlocked()) this.sessionClasses = structuredClone(classes);
  }
  readCopy(key: string): OfflineRead | undefined {
    if (!this.enabled() || !this.unlocked() || !this.sameSession()) return;
    const entry = this.state.reads?.[key];
    if (!entry || Date.now() - Date.parse(entry.savedAt) > READ_RETENTION) return;
    this.lastOfflineRead.set(entry.savedAt);
    return structuredClone(entry);
  }
  async rememberRead(key: string, entry: OfflineRead): Promise<void> {
    if (!this.enabled() || !this.unlocked() || !this.sameSession()) return;
    const generation = this.generation;
    try {
      const stored = await this.change(state => storeRead(state.reads ??= {}, key, entry));
      if (!stored) this.readCacheIssue.set('Certaines données ou pièces jointes sont trop volumineuses pour être disponibles hors connexion Internet.');
    } catch {
      if (generation === this.generation) this.readCacheIssue.set('La copie hors connexion n’a pas pu être enregistrée sur cet appareil.');
    }
  }
  async forgetReads(): Promise<void> {
    if (this.unlocked() && this.sameSession()) await this.change(state => { state.reads = {}; });
  }
  recentReadKeys(): string[] {
    if (!this.enabled() || !this.unlocked() || !this.sameSession()) return [];
    return Object.entries(this.state.reads ?? {}).sort((a, b) => Date.parse(b[1].savedAt) - Date.parse(a[1].savedAt)).map(([key]) => key);
  }
  async queueMessage(message: PendingMessage): Promise<void> {
    if (!this.enabled() || !this.unlocked() || !this.sameSession()) throw new Error('Activez et déverrouillez le mode hors connexion Internet avant de conserver des messages.');
    if (!isMessageWrite('POST', message.path)) throw new Error('Ce type de message ne peut pas être mis en attente.');
    await this.change(state => {
      const messages = state.messages ??= [];
      if (messages.some(item => item.operationId === message.operationId)) return;
      if (messages.length >= 100 || new TextEncoder().encode(JSON.stringify([...messages, message])).byteLength > 50 * 1024 * 1024)
        throw new Error('La file de messages est pleine. Synchronisez les envois existants ; votre nouveau message reste dans le formulaire.');
      messages.push(structuredClone(message));
    });
  }
  async retryMessage(operationId: string): Promise<void> {
    await this.change(state => { const message = state.messages?.find(item => item.operationId === operationId); if (message) delete message.issue; });
    await this.synchronize();
  }
  async savePublication(publication: LocalPublication): Promise<void> {
    if (!this.enabled() || !this.unlocked() || !this.sameSession()) throw new Error('Activez et déverrouillez le mode hors connexion pour conserver vos brouillons et publications.');
    if (publication.userId !== this.auth.user()?.id || this.auth.user()?.role !== 'enseignant' || publication.role !== 'enseignant' || !isPublicationPath(publication.path)
        || !['HOMEWORK', 'DOCUMENT', 'ANNOUNCEMENT'].includes(publication.payload.kind)) throw new Error('Publication hors connexion non autorisée.');
    await this.change(state => {
      const items = state.publications ??= [];
      const index = items.findIndex(item => item.operationId === publication.operationId);
      if (index >= 0 && items[index].attempted) throw new Error('Cet envoi a déjà été tenté. Vérifiez sa confirmation avant de le modifier.');
      const next = items.filter(item => item.operationId !== publication.operationId).concat(structuredClone(publication));
      if (next.length > 100 || new TextEncoder().encode(JSON.stringify(next)).byteLength > 50 * 1024 * 1024) throw new Error('Le stockage des publications est plein. Votre saisie reste dans le formulaire.');
      state.publications = next;
    });
  }
  async removePublication(id: string): Promise<void> {
    await this.change(state => {
      const item = state.publications?.find(item => item.operationId === id);
      if (item?.attempted) throw new Error('Envoi déjà tenté : sa publication doit être vérifiée avant toute suppression.');
      state.publications = state.publications?.filter(item => item.operationId !== id);
    });
  }
  async retryPublication(id: string): Promise<void> {
    await this.change(state => { const item = state.publications?.find(item => item.operationId === id); if (item) delete item.issue; });
    await this.synchronize();
  }
  async queueAction(action: PendingAction): Promise<void> {
    if (!this.enabled() || !this.unlocked() || !this.sameSession()) throw new Error('Activez et déverrouillez le mode hors connexion pour conserver cette action.');
    if (action.userId !== this.auth.user()?.id || action.role !== this.auth.user()?.role || !queuedActionLabel('POST', action.path, action.role, action.payload)) throw new Error('Cette action ne peut pas être mise en attente.');
    await this.change(state => {
      const actions = state.actions ??= [];
      if (actions.some(item => item.operationId === action.operationId)) return;
      if (actions.length >= 100 || new TextEncoder().encode(JSON.stringify([...actions, action])).byteLength > 50 * 1024 * 1024) throw new Error('La file des actions est pleine. Votre saisie reste dans le formulaire.');
      actions.push(structuredClone(action));
    });
  }
  async removeAction(id: string): Promise<void> {
    await this.change(state => {
      if (state.actions?.find(item => item.operationId === id)?.attempted) throw new Error('Envoi déjà tenté : attendez la confirmation ou le refus du serveur avant de l’annuler.');
      state.actions = state.actions?.filter(item => item.operationId !== id);
    });
  }
  async updateAction(id: string, payload: unknown): Promise<void> {
    await this.change(state => {
      const item = state.actions?.find(item => item.operationId === id);
      if (!item || item.attempted || item.role !== this.auth.user()?.role) throw new Error('Cette action ne peut plus être modifiée avant confirmation du serveur.');
      const updated = structuredClone(payload);
      if (new TextEncoder().encode(JSON.stringify(updated)).byteLength > 2 * 1024 * 1024) throw new Error('Le contenu est trop volumineux.');
      const total = (state.actions ?? []).map(action => action.operationId === id ? { ...action, payload: updated } : action);
      if (new TextEncoder().encode(JSON.stringify(total)).byteLength > 50 * 1024 * 1024) throw new Error('La file des actions est pleine.');
      item.payload = updated; delete item.issue; delete item.paused;
    });
  }
  async editAction(id: string): Promise<PendingAction> {
    return this.change(state => {
      const item = state.actions?.find(action => action.operationId === id);
      if (!item || item.attempted || item.role !== this.auth.user()?.role) throw new Error('Cet envoi ne peut plus être modifié avant confirmation.');
      item.paused = true; return structuredClone(item);
    });
  }
  async closeActionEditor(id: string): Promise<void> {
    await this.change(state => { const item = state.actions?.find(action => action.operationId === id); if (item) delete item.paused; });
  }
  async retryAction(id: string): Promise<void> {
    await this.change(state => { const item = state.actions?.find(item => item.operationId === id); if (item) { delete item.issue; delete item.paused; } });
    await this.synchronize();
  }
  cachedClasses(): TeacherClass[] {
    return this.unlocked() ? structuredClone(this.sessionClasses) : [];
  }
  rememberRoster(classId: number, students: RosterStudent[]): void {
    if (this.unlocked()) this.sessionRosters[classId] = structuredClone(students);
  }
  cachedRoster(classId: number): RosterStudent[] | undefined {
    return this.unlocked() && this.sessionRosters[classId] ? structuredClone(this.sessionRosters[classId]) : undefined;
  }
  rememberSchedule(entries: ScheduleEntry[]): void {
    if (this.unlocked()) this.sessionSchedule = structuredClone(entries);
  }
  cachedSchedule(): ScheduleEntry[] | undefined {
    return this.unlocked() && this.sessionSchedule ? structuredClone(this.sessionSchedule) : undefined;
  }
  rememberClassSelection(classId: number): void {
    if (this.unlocked()) this.sessionClassSelection = classId;
  }
  cachedClassSelection(): number | null {
    return this.unlocked() ? this.sessionClassSelection : null;
  }
  rememberView(classId: number, date: string): void {
    if (this.unlocked()) this.sessionView = { classId, date };
  }
  cachedView(): { classId: number; date: string } | null {
    return this.unlocked() && this.sessionView ? { ...this.sessionView } : null;
  }
  snapshot(schoolId: number, classId: number, date: string): Snapshot | undefined {
    return this.unlocked() ? localSnapshot(this.state, schoolId, classId, date) : undefined;
  }
  async remember(schoolId: number, classId: number, date: string, rows: TeacherAttendanceItem[]): Promise<void> {
    if (!this.unlocked()) return;
    await this.change(state => {
      const id = context(schoolId, classId, date);
      if (!state.pending.some(call => context(call.schoolId, call.classId, call.date) === id)) state.snapshots[id] = { rows, savedAt: new Date().toISOString() };
    });
  }
  async queue(schoolId: number, classId: number, date: string, rows: TeacherAttendanceItem[], entries: OfflineEntry[], label: { className?: string; schoolName?: string } = {}): Promise<void> {
    await this.change(state => {
      enqueueCall(state, { operationId: crypto.randomUUID(), schoolId, classId, date, entries, ...label }, rows);
    });
    if (this.online()) await this.synchronize();
  }
  async synchronize(): Promise<void> {
    if (this.busy() || !this.enabled()) return;
    this.online.set(navigator.onLine);
    if (!this.sameSession()) { this.issue.set('Votre session a changé dans un autre onglet. Reconnectez-vous avec le compte qui a effectué ces saisies pour les synchroniser.'); return; }
    if (!this.online()) { this.issue.set('Connexion Internet indisponible. Les envois reprendront automatiquement à son retour.'); return; }
    if (!this.unlocked()) { await this.unlock(); return; }
    const generation = this.generation, token = this.auth.getToken();
    this.busy.set(true); this.issue.set(null);
    try {
      await this.change(() => {});
      for (const operationId of this.pending().map(call => call.operationId)) {
        if (generation !== this.generation || token !== this.auth.getToken()) return;
        const call = await this.change(state => {
          const candidate = state.pending.find(item => item.operationId === operationId);
          if (!candidate || candidate.issue || !firstForContext(state, candidate)) return;
          candidate.attempted = true;
          return structuredClone(candidate);
        });
        if (generation !== this.generation || token !== this.auth.getToken()) return;
        if (!call) continue;
        try {
          const rows = await firstValueFrom(this.http.put<TeacherAttendanceItem[]>(`${environment.apiUrl}/me/teacher/classes/${call.classId}/attendance/sync`, {
            operationId: call.operationId, date: call.date, entries: call.entries,
          }).pipe(timeout(20_000)));
          if (generation !== this.generation || token !== this.auth.getToken()) return;
          await this.change(state => {
            confirmCall(state, operationId, rows);
          });
          this.lastSync.set(new Date().toISOString());
        } catch (err: any) {
          if (generation !== this.generation) return;
          if (!err?.status || err.status >= 500 || [401, 408, 429].includes(err.status)) {
            this.issue.set('Envoi en attente. Vos saisies sont conservées ; reconnectez-vous si nécessaire.'); break;
          }
          const message = apiError(err, 'Cet appel doit être vérifié avant son envoi.');
          await this.change(state => { const pending = state.pending.find(item => item.operationId === operationId); if (pending) pending.issue = message; });
        }
      }
      const blocked = this.pending().find(call => call.issue && firstForContext(this.state, call));
      if (blocked && !this.issue()) this.issue.set(`Synchronisation bloquée : ${blocked.issue} Ouvrez les détails et cliquez sur « Vérifier cet appel » pour poursuivre.`);
      // One ordered stream per account. A blocked message must not silently overtake another.
      for (const operationId of this.pendingMessages().map(message => message.operationId)) {
        if (generation !== this.generation || token !== this.auth.getToken() || !navigator.onLine) break;
        const message = await this.change(state => {
          const candidate = state.messages?.find(item => item.operationId === operationId);
          if (!candidate || candidate.issue || candidate.role !== this.auth.user()?.role) return;
          candidate.attempted = true;
          return structuredClone(candidate);
        });
        if (!message || generation !== this.generation || token !== this.auth.getToken()) break;
        try {
          if (!isMessageWrite('POST', message.path)) throw { status: 400, error: { message: 'Type de message non reconnu.' } };
          const headers: Record<string, string> = { [MESSAGE_ID]: message.operationId, [MESSAGE_REPLAY]: 'true' };
          if (message.school) headers['X-Academic-School'] = message.school;
          if (message.year) headers['X-Academic-Year'] = message.year;
          await firstValueFrom(this.http.post(`${environment.apiUrl}${message.path}`, messageBody(message), { headers }).pipe(timeout(30_000)));
          if (generation !== this.generation || token !== this.auth.getToken()) return;
          await this.change(state => { state.messages = state.messages?.filter(item => item.operationId !== operationId); });
          this.lastMessageSync.set(new Date().toISOString()); this.activity.changed();
        } catch (err: any) {
          if (generation !== this.generation) return;
          if (!err?.status || err.status >= 500 || [401, 408, 429].includes(err.status)) break;
          await this.change(state => { const pending = state.messages?.find(item => item.operationId === operationId); if (pending) pending.issue = apiError(err, 'Cet envoi doit être vérifié.'); });
          break;
        }
      }
      for (const operationId of this.publications().filter(item => !item.draft).map(item => item.operationId)) {
        if (generation !== this.generation || token !== this.auth.getToken() || !navigator.onLine) break;
        try {
          const claimed = await this.change(state => {
            const item = state.publications?.find(item => item.operationId === operationId);
            if (!item || item.draft || item.issue || item.role !== this.auth.user()?.role) return;
            item.attempted = true;
            return structuredClone(item);
          });
          if (!claimed || generation !== this.generation) continue;
          if (!isPublicationPath(claimed.path)) throw { status: 400, error: { message: 'Type de publication non reconnu.' } };
          const headers: Record<string, string> = { [PUBLICATION_ID]: claimed.operationId, [PUBLICATION_REPLAY]: 'true' };
          if (claimed.school) headers['X-Academic-School'] = claimed.school;
          if (claimed.year) headers['X-Academic-Year'] = claimed.year;
          await firstValueFrom(this.http.post(`${environment.apiUrl}${claimed.path}`, publicationBody(claimed), { headers }).pipe(timeout(30_000)));
          if (generation !== this.generation || token !== this.auth.getToken()) return;
          await this.change(state => { state.publications = state.publications?.filter(item => item.operationId !== operationId); });
          if (generation !== this.generation || token !== this.auth.getToken()) return;
          this.confirmedPublications.add(operationId);
          this.lastPublicationSync.set(new Date().toISOString());
        } catch (err: any) {
          if (generation !== this.generation) return;
          if (!err?.status || err.status >= 500 || [401, 408, 429].includes(err.status)) break;
          await this.change(state => { const item = state.publications?.find(item => item.operationId === operationId); if (item) { item.issue = apiError(err, 'Publication refusée. Vérifiez le contenu et vos droits.'); item.attempted = false; } });
        }
      }
      for (const operationId of this.pendingActions().map(item => item.operationId)) {
        if (generation !== this.generation || token !== this.auth.getToken() || !navigator.onLine) break;
        try {
          const action = await this.change(state => {
            const item = state.actions?.find(item => item.operationId === operationId);
            if (!item || item.issue || item.paused || item.role !== this.auth.user()?.role || item.userId !== this.auth.user()?.id) return;
            item.attempted = true; return structuredClone(item);
          });
          if (!action || generation !== this.generation) continue;
          if (!queuedActionLabel('POST', action.path, action.role, action.payload)) throw { status: 400, error: { message: 'Action non reconnue.' } };
          const headers: Record<string, string> = { [ACTION_ID]: action.operationId, [ACTION_REPLAY]: 'true' };
          if (action.school) headers['X-Academic-School'] = action.school;
          if (action.year) headers['X-Academic-Year'] = action.year;
          await firstValueFrom(this.http.post(`${environment.apiUrl}${action.path}`, action.payload, { headers }).pipe(timeout(30_000)));
          if (generation !== this.generation || token !== this.auth.getToken()) return;
          await this.change(state => { state.actions = state.actions?.filter(item => item.operationId !== operationId); });
          if (generation !== this.generation) return;
          this.lastActionSync.set({ label: action.label, at: new Date().toISOString() });
        } catch (err: any) {
          if (generation !== this.generation) return;
          if (!err?.status || err.status >= 500 || [401, 408, 429].includes(err.status)) break;
          await this.change(state => { const item = state.actions?.find(item => item.operationId === operationId); if (item) { item.issue = apiError(err, 'Action refusée par le serveur.'); item.attempted = false; } });
        }
      }
    } catch (err) { if (generation === this.generation) this.issue.set(apiError(err, 'Impossible d’accéder au stockage local. Vos saisies ne sont pas confirmées.')); }
    finally { if (generation === this.generation) this.busy.set(false); }
  }
  /** Explicit user review only: never silently replace the expected server values. */
  async removeAfterReview(operationId: string, rows: TeacherAttendanceItem[]): Promise<void> {
    await this.change(state => {
      confirmCall(state, operationId, rows);
    });
  }
  async retryAfterReview(operationId: string, rows: TeacherAttendanceItem[]): Promise<void> {
    await this.change(state => {
      const call = state.pending.find(item => item.operationId === operationId);
      if (!call) throw new Error('Cet appel a déjà été traité.');
      if (call.entries.some(entry => !rows.some(row => row.studentId === entry.studentId))) throw new Error('Un élève n’est plus dans cette classe. Contactez l’établissement avant de supprimer cette saisie.');
      call.entries = call.entries.map(entry => {
        const row = rows.find(item => item.studentId === entry.studentId)!;
        return { ...entry, expectedStatus: row.status, expectedJustification: row.justification, expectedVersion: row.version ?? null };
      });
      if (!firstForContext(state, call)) throw new Error('Vérifiez d’abord le premier envoi en attente pour cette classe et cette date.');
      call.operationId = crypto.randomUUID(); call.attempted = false; delete call.issue;
    });
    await this.synchronize();
  }
}
