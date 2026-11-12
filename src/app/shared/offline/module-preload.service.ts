import { HttpClient, HttpHeaders } from '@angular/common/http';
import { DestroyRef, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, filter, finalize, from, map, mergeMap, of, Subscription, switchMap, toArray } from 'rxjs';
import { AuthService } from '../../core/auth';
import { environment } from '../../../environments/environment';
import { OfflineAttendanceService } from './offline-attendance.service';
import { offlineApiPath } from './offline-read-cache';

export interface PreloadRead { url: string; headers?: HttpHeaders; }

export function recentModuleReads(keys: string[], role: string, school: number | null, year: string | null): PreloadRead[] {
  const result: PreloadRead[] = [];
  for (const key of keys) {
    try {
      const parts: unknown[] = JSON.parse(key);
      if (parts[0] !== role || parts[2] !== 'json' || typeof parts[1] !== 'string' || parts[7]) continue;
      const parsed = new URL(parts[1]);
      const url = parsed.origin === 'http://offline.local' ? parsed.pathname + parsed.search : parsed.href;
      if (offlineApiPath(url, environment.apiUrl) === null) continue;
      const requestedSchool = parsed.searchParams.get('schoolId') ?? /\/schools\/(\d+)(?:\/|$)/.exec(parsed.pathname)?.[1];
      if (requestedSchool && Number(requestedSchool) !== school || parts[3] && parts[3] !== String(school) || parts[4] && parts[4] !== year) continue;
      const headers: Record<string, string> = {};
      for (const [index, name] of [[3, 'X-Academic-School'], [4, 'X-Academic-Year'], [5, 'Accept-Language'], [6, 'Accept']] as const)
        if (typeof parts[index] === 'string') headers[name] = parts[index] as string;
      result.push({ url, headers: new HttpHeaders(headers) });
    } catch { /* Older or malformed keys are not a preload instruction. */ }
  }
  return result;
}

/** Prepare module reads at session start, with at most two requests in flight. */
@Injectable({ providedIn: 'root' })
export class ModulePreloadService {
  private readonly auth = inject(AuthService);
  private readonly offline = inject(OfflineAttendanceService);
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly destroy = inject(DestroyRef);
  private subscription?: Subscription;
  private context = '';
  private generation = 0;
  readonly busy = signal(false);
  readonly failed = signal(0);
  readonly prepared = signal(false);
  retry(): void { this.context = ''; this.prepare(); }
  constructor() {
    effect(() => {
      this.auth.user(); this.auth.getToken(); this.auth.schoolContextId();
      this.auth.ownerModules();
      this.offline.enabled(); this.offline.unlocked(); this.offline.online();
      untracked(() => this.prepare());
    });
    this.router.events.pipe(filter(event => event instanceof NavigationEnd), takeUntilDestroyed(this.destroy)).subscribe(() => this.prepare());
    this.destroy.onDestroy(() => this.subscription?.unsubscribe());
  }
  private prepare(): void {
    const user = this.auth.user();
    if (!user?.approved || !user.emailVerified || user.mustChangePassword || !this.offline.enabled() || !this.offline.unlocked() || !this.offline.online()) {
      if (!user?.approved || !user.emailVerified || user.mustChangePassword || !this.offline.enabled() || !this.offline.unlocked()) this.prepared.set(false);
      this.context = ''; this.generation++; this.subscription?.unsubscribe(); this.busy.set(false); return;
    }
    const school = this.auth.schoolContextId(), year = school ? localStorage.getItem(`fasoecole_year_${school}`) : null;
    const modules = this.auth.ownerModules();
    const context = `${user.id}/${user.role}/${this.auth.getToken()}/${school}/${year}/${[...modules].sort().join(',')}`;
    if (this.context === context) return;
    this.context = context;
    const generation = ++this.generation;
    this.subscription?.unsubscribe(); this.failed.set(0); this.prepared.set(false); this.busy.set(true);
    const api = environment.apiUrl;
    const common = [`${api}/academic-years/context-schools`];
    if (user.role === 'enseignant') common.push(`${api}/me/teacher/classes`, `${api}/me/teacher/schedule`);
    else if (user.role === 'parent' || user.role === 'etudiant') common.push(`${api}/me/students`);
    else if (school) common.push(...['academic-years', 'classes', 'levels', 'subjects'].map(path => `${api}/${path}?schoolId=${school}`));
    const administrative = user.role === 'admin' || user.role === 'proprietaire';
    if (administrative && school && modules.has('ENROLLMENT')) {
      common.push(`${api}/owner/enrollment/schools/${school}/overview`, `${api}/owner/enrollment/schools/${school}/fees`);
    }
    if (administrative && school && user.rawRoles?.some(role => role === 'SCHOOL_ADMIN' || role === 'SUPER_ADMIN')) {
      common.push(`${api}/owner/staff/schools/${school}/employees`);
    }
    if (administrative && school && modules.has('TEACHERS') && modules.has('PAYROLL')) {
      const month = new Date().toLocaleDateString('en-CA').slice(0, 7);
      common.push(`${api}/owner/payroll/schools/${school}?month=${month}`);
    }
    const recent = recentModuleReads(this.offline.recentReadKeys(), user.role, school, year);
    this.subscription = from(common).pipe(
      mergeMap(url => this.http.get<unknown>(url).pipe(map(body => ({ url, body })), catchError(() => { this.failed.update(n => n + 1); return of({ url, body: null }); })), 2),
      toArray(),
      switchMap(results => {
        const followups: PreloadRead[] = [];
        for (const result of results) {
          if (school && result.url === `${api}/owner/enrollment/schools/${school}/overview`) {
            const years = (result.body as { years?: { id: number; closed?: boolean }[] } | null)?.years;
            if (Array.isArray(years)) for (const year of years) {
              if (Number.isSafeInteger(year.id) && !year.closed) followups.push({ url: `${api}/owner/enrollment/schools/${school}/years/${year.id}/classes` });
            }
          }
          if (!Array.isArray(result.body)) continue;
          const date = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
          for (const item of result.body) {
            if (administrative && school && result.url === `${api}/classes?schoolId=${school}`
                && Number.isSafeInteger(item?.id) && item.schoolId === school) {
              if (modules.has('STUDENTS')) followups.push({ url: `${api}/classes/${item.id}/roster` });
              if (modules.has('TEACHERS')) followups.push({ url: `${api}/teacher-work/classes/${item.id}/teachers` });
            }
            if (result.url.endsWith('/me/teacher/classes') && Number.isSafeInteger(item?.classId)) {
              const base = `${api}/me/teacher/classes/${item.classId}`;
              followups.push({ url: `${api}/school-life/classes/${item.classId}?module=HOMEWORK` });
              followups.push(...['students', `attendance?date=${date}`, `family-reports?date=${date}`, 'periods', 'conversations', 'portal/appointments',
                ...['DOCUMENT', 'HOMEWORK', 'ANNOUNCEMENT'].map(kind => `portal/posts?kind=${kind}`)].map(path => ({ url: `${base}/${path}` })));
            } else if (result.url.endsWith('/me/students') && Number.isSafeInteger(item?.studentId)) {
              followups.push(...['schedule', 'grades', 'attendance', 'invoices', 'profile', 'absence-reports'].map(path => ({ url: `${api}/me/students/${item.studentId}/${path}` })),
                ...['appointments', 'payments', 'evaluations', ...['DOCUMENT', 'HOMEWORK', 'ANNOUNCEMENT'].map(kind => `posts?kind=${kind}`)].map(path => ({ url: `${api}/me/parent-portal/students/${item.studentId}/${path}` })));
            }
          }
        }
        const plan = [...new Map([...followups, ...recent].map(item => [JSON.stringify([item.url, item.headers?.keys().map(key => [key, item.headers?.getAll(key)])]), item])).values()].filter(item => !common.includes(item.url));
        return from(plan).pipe(mergeMap(item => this.http.get(item.url, { headers: item.headers }).pipe(catchError(() => { this.failed.update(n => n + 1); return of(null); })), 2));
      }),
      finalize(() => { if (generation === this.generation) this.busy.set(false); }),
    ).subscribe({ complete: () => {
      if (generation === this.generation && this.offline.online()) this.prepared.set(this.failed() === 0);
    } });
  }
}
