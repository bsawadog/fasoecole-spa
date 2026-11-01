import { HttpEvent, HttpRequest, HttpResponse } from '@angular/common/http';
import { Injectable, signal } from '@angular/core';
import { defer, finalize, Observable, shareReplay, Subject, timeout } from 'rxjs';

export interface QueryScope { school: number | null; domain: string; }
export const QUERY_FRESH_MS = 60_000;
export const QUERY_RECHECK_MS = 15_000;

export function queryScope(request: HttpRequest<unknown>): QueryScope {
  const url = new URL(request.urlWithParams, 'http://cache.local');
  const path = url.pathname;
  const school = Number(url.searchParams.get('schoolId') || /\/(?:schools|by-school|by-school-id)\/(\d+)(?:\/|$)/.exec(path)?.[1]
    || request.headers.get('X-Academic-School')) || null;
  const domain = /\/(?:grades|evaluations|periods)(?:\/|$)/.test(path) ? 'grades'
    : /\/(?:finance|expenses|payroll|taxes|payables|payments|invoices|bank-book|cash-book)(?:\/|$)/.test(path) ? 'finance'
    : /\/(?:attendance|attendances|absence-reports|family-reports)(?:\/|$)/.test(path) ? 'attendance'
    : /\/(?:posts|documents|homework|lessons|learning)(?:\/|$)/.test(path) ? 'resources'
    : /\/(?:conversations|messages|notifications)(?:\/|$)/.test(path) ? 'messages'
    : /\/(?:schedule|class-timetables|calendar|appointments|availability)(?:\/|$)/.test(path) ? 'calendar'
    : /\/(?:students|teachers|classes|academic-years|subjects|levels|enrollments|school-users|staff)(?:\/|$)/.test(path) ? 'structure'
    : /\/(?:dashboard|overview|summary)(?:\/|$)/.test(path) ? 'dashboard' : 'other';
  return { school, domain };
}

interface Entry { response: HttpResponse<unknown>; savedAt: number; scope: QueryScope; bytes: number; version: number; }

/** Session-only request coordination. Tokens are never part of persisted cache keys. */
@Injectable({ providedIn: 'root' })
export class ModuleQueryCache {
  private session = '';
  private readonly entries = new Map<string, Entry>();
  private readonly inFlight = new Map<string, Observable<HttpEvent<unknown>>>();
  private readonly invalidated = new Map<string, number>();
  private readonly versions = new Map<string, number>();
  private unknownSchoolChanged = 0;
  private unknownSchoolVersion = 0;
  private epoch = 0;
  readonly refreshed = new Subject<QueryScope>();
  readonly latestRefresh = signal<number | null>(null);
  readonly refreshIssue = signal<string | null>(null);

  useSession(session: string): void {
    if (session === this.session) return;
    this.session = session; this.entries.clear(); this.inFlight.clear(); this.invalidated.clear(); this.unknownSchoolChanged = 0;
    this.versions.clear(); this.unknownSchoolVersion = 0;
    this.epoch++;
    this.latestRefresh.set(null);
    this.refreshIssue.set(null);
  }
  valid(scope: QueryScope, savedAt: number): boolean {
    return savedAt > Math.max(this.invalidated.get('*/*') ?? 0, this.invalidated.get(`${scope.school}/*`) ?? 0,
      this.invalidated.get(`${scope.school}/${scope.domain}`) ?? 0,
      scope.school === null ? this.unknownSchoolChanged : 0);
  }
  get(key: string): Entry | undefined {
    const entry = this.entries.get(key);
    if (!entry || Date.now() - entry.savedAt > QUERY_FRESH_MS || entry.version !== this.scopeVersion(entry.scope)) return;
    return { ...entry, response: entry.response.clone({ body: structuredClone(entry.response.body) }) };
  }
  put(key: string, response: HttpResponse<unknown>, scope: QueryScope, savedAt = Date.now()): boolean {
    const previous = this.entries.get(key);
    const changed = !!previous && JSON.stringify(previous.response.body) !== JSON.stringify(response.body);
    this.entries.delete(key);
    const bytes = new TextEncoder().encode(JSON.stringify(response.body)).byteLength;
    if (bytes <= 2 * 1024 * 1024) this.entries.set(key, { response: response.clone({ body: structuredClone(response.body) }), scope, savedAt, bytes, version: this.scopeVersion(scope) });
    let size = [...this.entries.values()].reduce((total, entry) => total + entry.bytes, 0);
    while (this.entries.size > 80 || size > 8 * 1024 * 1024) {
      const oldest = this.entries.keys().next().value!;
      size -= this.entries.get(oldest)!.bytes; this.entries.delete(oldest);
    }
    return changed;
  }
  fetch(key: string, load: () => Observable<HttpEvent<unknown>>): Observable<HttpEvent<unknown>> {
    const existing = this.inFlight.get(key); if (existing) return existing;
    const stream = defer(load).pipe(timeout(20_000), finalize(() => { if (this.inFlight.get(key) === stream) this.inFlight.delete(key); }), shareReplay({ bufferSize: 1, refCount: false }));
    this.inFlight.set(key, stream); return stream;
  }
  invalidate(scope: QueryScope): void {
    const now = Date.now();
    if (scope.domain === 'structure' || scope.school === null) this.invalidateSchool(scope.school);
    else {
      this.epoch++; this.inFlight.clear();
      for (const domain of [scope.domain, 'dashboard']) { this.invalidated.set(`${scope.school}/${domain}`, now); this.versions.set(`${scope.school}/${domain}`, this.epoch); }
    }
  }
  invalidateSchool(school: number | null): void {
    this.epoch++; this.inFlight.clear();
    this.invalidated.set(`${school ?? '*' }/*`, Date.now()); this.unknownSchoolChanged = Date.now();
    this.versions.set(`${school ?? '*' }/*`, this.epoch); this.unknownSchoolVersion = this.epoch;
  }
  private scopeVersion(scope: QueryScope): number {
    return Math.max(this.versions.get('*/*') ?? 0, this.versions.get(`${scope.school}/*`) ?? 0,
      this.versions.get(`${scope.school}/${scope.domain}`) ?? 0, scope.school === null ? this.unknownSchoolVersion : 0);
  }
  generation(): number { return this.epoch; }
  announce(scope: QueryScope): void { this.refreshIssue.set(null); this.latestRefresh.set(Date.now()); this.refreshed.next(scope); }
}
