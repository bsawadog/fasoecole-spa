import { Component, DestroyRef, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpInterceptorFn } from '@angular/common/http';
import { AuthService } from '../core/auth';
import { SchoolDataSyncService } from './school-data-sync.service';
import { Subscription } from 'rxjs';
import { environment } from '../../environments/environment';

export const academicContextInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthService);
  const school = Number(localStorage.getItem('fasoecole_owner_school'));
  const year = Number(localStorage.getItem(`fasoecole_year_${school}`));
  const path = request.url.startsWith(environment.apiUrl) ? request.url.slice(environment.apiUrl.length) : '';
  const requestedSchool = request.params.get('schoolId')
    ?? /\/schools\/(\d+)(?:\/|$)/.exec(path)?.[1]
    ?? /\/by-school\/(\d+)(?:\/|$)/.exec(path)?.[1];
  const matchesSchool = requestedSchool === undefined || requestedSchool === null || Number(requestedSchool) === school;
  const contextual = /^\/(academic-years(?!\/context-schools)|classes|students|teacher-work|owner\/(dashboard|grades|finance|expenses|enrollment|parent-portal)|me\/|schools\/\d+\/changes)/.test(path);
  if (contextual && matchesSchool && auth.user()?.approved && auth.user()?.emailVerified === true && school && year && request.url.startsWith(environment.apiUrl) && request.method === 'GET') {
    request = request.clone({ setHeaders: { 'X-Academic-School': String(school), 'X-Academic-Year': String(year) } });
  }
  return next(request);
};

interface Year { id: number; label: string; isCurrent: boolean; closed: boolean; }
@Component({
  selector: 'app-academic-context', standalone: true, imports: [FormsModule],
  template: `@if (schools().length) {
    <label>Établissement<select aria-label="Établissement consulté" [ngModel]="schoolId()" (ngModelChange)="chooseSchool($event)">
      @for (s of schools(); track s.id) { <option [ngValue]="s.id">{{ s.name }}</option> }
    </select></label>
    <label>Année scolaire<select aria-label="Année scolaire consultée" [ngModel]="yearId()" (ngModelChange)="chooseYear($event)">
      @for (y of years(); track y.id) { <option [ngValue]="y.id">{{ y.label }}{{ y.isCurrent ? ' · en cours' : y.closed ? ' · clôturée' : '' }}</option> }
    </select></label>
    @if (error()) { <small role="alert">{{ error() }}</small> }
  }`,
  styles: [`:host{display:flex;gap:12px;flex-wrap:wrap;margin-right:auto}label{display:flex;flex-direction:column;font-size:11px;gap:3px}select{max-width:220px;padding:7px;border:1px solid #d1d5db;border-radius:8px;background:white}`],
})
export class AcademicContextPicker {
  private readonly sync = inject(SchoolDataSyncService);
  private subscription?: Subscription;
  private readonly destroyRef = inject(DestroyRef);
  private readonly auth = inject(AuthService);
  private readonly http = inject(HttpClient);
  readonly schools = signal<{id:number;name:string;status?:string}[]>([]);
  readonly years = signal<Year[]>([]);
  readonly schoolId = signal<number | null>(null);
  readonly yearId = signal<number | null>(null);
  readonly error = signal('');
  constructor() {
    this.destroyRef.onDestroy(() => this.subscription?.unsubscribe());
    effect(() => {
      const id = this.auth.schoolContextId();
      if (id && id !== this.schoolId() && this.schools().some(s => s.id === id)) { this.schoolId.set(id); this.loadYears(id); }
    });
    effect(() => {
      if (!this.auth.user()?.approved || this.auth.user()?.emailVerified !== true || this.auth.user()?.mustChangePassword) return;
      this.http.get<{id:number;name:string;status?:string}[]>(`${environment.apiUrl}/academic-years/context-schools`).subscribe({next: schools => {
        this.schools.set(schools);
        const id = schools.find(s => s.id === Number(localStorage.getItem('fasoecole_owner_school')))?.id ?? schools[0]?.id;
        if (id) { this.schoolId.set(id); this.auth.selectSchoolContext(id); this.loadYears(id); }
      }, error: () => this.error.set('Sélection des établissements indisponible.')});
    });
  }
  private loadYears(schoolId: number): void {
    this.subscription?.unsubscribe();
    this.years.set([]);
    this.yearId.set(null);
    const school = this.schools().find(school => school.id === schoolId);
    if (school?.status && school.status !== 'ACTIVE' && !this.auth.user()?.rawRoles.includes('SUPER_ADMIN')) return;
    this.subscription = this.sync.watch(schoolId).subscribe(() => this.refreshYears(schoolId));
    this.refreshYears(schoolId);
  }
  private refreshYears(schoolId: number): void {
    this.http.get<Year[]>(`${environment.apiUrl}/academic-years`,{params:{schoolId}}).subscribe({next: years => {
      if (this.schoolId() !== schoolId) return;
      this.years.set(years);
      const saved = Number(localStorage.getItem(`fasoecole_year_${schoolId}`));
      const explicit = localStorage.getItem(`fasoecole_year_explicit_${schoolId}`) === 'true';
      const year = (explicit ? years.find(y => y.id === saved) : years.find(y => y.isCurrent)) ?? years.find(y => y.isCurrent) ?? years[0];
      this.yearId.set(year?.id ?? null);
      if (year && saved !== year.id) { localStorage.setItem(`fasoecole_year_${schoolId}`,String(year.id)); window.location.reload(); }
    },error: () => this.error.set('Impossible de charger les années.')});
  }
  chooseSchool(id: number): void {
    if (!this.schools().some(s => s.id === id)) return;
    this.auth.selectSchoolContext(id);
    window.location.reload();
  }
  chooseYear(id: number): void {
    const school = this.schoolId();
    if (!school || !this.years().some(y => y.id === id)) return;
    localStorage.setItem(`fasoecole_year_explicit_${school}`,String(!this.years().find(y => y.id === id)?.isCurrent));
    localStorage.setItem(`fasoecole_year_${school}`,String(id));
    window.location.reload();
  }
}
