import { Component, computed, DestroyRef, effect, inject, InjectionToken, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpInterceptorFn } from '@angular/common/http';
import { AuthService } from '../core/auth';
import { SchoolDataSyncService } from './school-data-sync.service';
import { Subscription } from 'rxjs';
import { Router } from '@angular/router';
import { environment } from '../../environments/environment';
import { SelectableAcademicYear, selectAcademicYear } from './academic-year-selection';

export const academicContextInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthService);
  const school = Number(localStorage.getItem('fasoecole_owner_school'));
  const year = Number(request.params.get('academicYearId') ?? localStorage.getItem(`fasoecole_year_${school}`));
  const path = request.url.startsWith(environment.apiUrl) ? request.url.slice(environment.apiUrl.length) : '';
  const requestedSchool = request.params.get('schoolId')
    ?? /\/schools\/(\d+)(?:\/|$)/.exec(path)?.[1]
    ?? /\/by-school\/(\d+)(?:\/|$)/.exec(path)?.[1];
  const matchesSchool = requestedSchool === undefined || requestedSchool === null || Number(requestedSchool) === school;
  const contextual = /^\/(academic-years(?!\/context-schools)|classes|students|teacher-work|school-life|owner\/(dashboard|grades|finance|expenses|enrollment|parent-portal)|me\/|schools\/\d+\/changes)/.test(path);
  if (contextual && matchesSchool && auth.user()?.approved && auth.user()?.emailVerified === true && school && year && request.url.startsWith(environment.apiUrl) && request.method === 'GET') {
    request = request.clone({ setHeaders: { 'X-Academic-School': String(school), 'X-Academic-Year': String(year) } });
  }
  return next(request);
};

interface Year extends SelectableAcademicYear { label: string; closed: boolean; }
export const ACADEMIC_CONTEXT_RELOAD = new InjectionToken<() => void>('Academic context reload', {
  providedIn: 'root', factory: () => () => window.location.reload(),
});
@Component({
  selector: 'app-academic-context', standalone: true, imports: [FormsModule],
  template: `@if (schools().length) {
    @if (showSchool()) {
    <label>Établissement<select aria-label="Établissement consulté" [ngModel]="schoolId()" (ngModelChange)="chooseSchool($event)">
      @for (s of schools(); track s.id) { <option [ngValue]="s.id">{{ s.name }}</option> }
    </select></label>
    }
    @if (showYear()) {
    <label>Année scolaire<select aria-label="Année scolaire consultée" [ngModel]="yearId()" (ngModelChange)="chooseYear($event)" [disabled]="!years().length">
      @if (!yearId()) { <option [ngValue]="null">{{ years().length ? 'Choisir une année scolaire' : 'Aucune année scolaire disponible' }}</option> }
      @for (y of years(); track y.id) { <option [ngValue]="y.id">{{ y.label }}{{ y.isCurrent ? ' · en cours' : y.closed ? ' · clôturée' : '' }}</option> }
    </select></label>
    @if (manualSelection()) {
      <button type="button" (click)="useAutomaticYear()">Revenir à l’année en cours</button>
    }
    @if (years().length && !yearId()) { <small role="status">Choisissez une année scolaire.</small> }
    }
    @if (error()) { <small role="alert">{{ error() }}</small> }
  }`,
  styles: [`
    :host{display:flex;gap:12px;flex-wrap:wrap;min-width:0;width:100%}
    label{display:flex;flex:1 1 220px;min-width:0;max-width:360px;flex-direction:column;font-size:13px;font-weight:600;gap:5px}
    select{box-sizing:border-box;width:100%;min-width:0;max-width:100%;padding:7px;border:1px solid #d1d5db;border-radius:8px;background:white}
    small{flex-basis:100%;overflow-wrap:anywhere}
    button{align-self:flex-end;padding:7px;border:1px solid #d1d5db;border-radius:8px;background:white;cursor:pointer}
    @media(max-width:700px){:host{flex-direction:column;gap:8px}label{flex:0 0 auto;width:100%;max-width:none}select{min-height:44px;font-size:16px}button{align-self:flex-start;min-height:44px}}
  `],
})
export class AcademicContextPicker {
  readonly showSchool = input(true);
  readonly showYear = input(true);
  private readonly sync = inject(SchoolDataSyncService);
  private subscription?: Subscription;
  private yearsRequest?: Subscription;
  private readonly destroyRef = inject(DestroyRef);
  private readonly auth = inject(AuthService);
  private readonly http = inject(HttpClient);
  private readonly reload = inject(ACADEMIC_CONTEXT_RELOAD);
  private readonly router = inject(Router, { optional: true });
  private readonly ready = computed(() => {
    const user = this.auth.user();
    return !!user?.approved && user.emailVerified === true && !user.mustChangePassword;
  });
  readonly schools = signal<{id:number;name:string;status?:string}[]>([]);
  readonly years = signal<Year[]>([]);
  readonly schoolId = signal<number | null>(null);
  readonly yearId = signal<number | null>(null);
  readonly manualSelection = signal(false);
  readonly error = signal('');
  constructor() {
    this.destroyRef.onDestroy(() => { this.subscription?.unsubscribe(); this.yearsRequest?.unsubscribe(); });
    effect(() => {
      const id = this.auth.schoolContextId();
      if (id && id !== this.schoolId() && this.schools().some(s => s.id === id)) { this.schoolId.set(id); this.loadYears(id); }
    });
    effect(() => {
      if (!this.ready()) return;
      this.http.get<{id:number;name:string;status?:string}[]>(`${environment.apiUrl}/academic-years/context-schools`).subscribe({next: schools => {
        this.schools.set(schools);
        const saved = this.auth.schoolContextId() ?? Number(localStorage.getItem('fasoecole_owner_school'));
        const id = schools.find(s => s.id === saved)?.id ?? schools.find(s => s.status === 'ACTIVE')?.id ?? schools[0]?.id;
        if (id) { this.schoolId.set(id); this.auth.selectSchoolContext(id); this.loadYears(id); }
      }, error: () => this.error.set('Sélection des établissements indisponible.')});
    });
  }
  private loadYears(schoolId: number): void {
    if (!this.showYear()) return;
    this.subscription?.unsubscribe();
    this.yearsRequest?.unsubscribe();
    this.years.set([]);
    this.yearId.set(null);
    this.manualSelection.set(false);
    this.error.set('');
    const school = this.schools().find(school => school.id === schoolId);
    if (school?.status && school.status !== 'ACTIVE' && !this.auth.user()?.rawRoles.includes('SUPER_ADMIN')) return;
    this.subscription = this.sync.watch(schoolId).subscribe(() => this.refreshYears(schoolId));
    this.refreshYears(schoolId);
  }
  private refreshYears(schoolId: number): void {
    this.yearsRequest?.unsubscribe();
    this.yearsRequest = this.http.get<Year[]>(`${environment.apiUrl}/academic-years`,{params:{schoolId}}).subscribe({next: years => {
      if (this.schoolId() !== schoolId) return;
      this.years.set(years);
      const saved = Number(localStorage.getItem(`fasoecole_year_${schoolId}`));
      const explicit = localStorage.getItem(`fasoecole_year_explicit_${schoolId}`) === 'true';
      const year = selectAcademicYear(years, saved || null, explicit);
      this.error.set('');
      this.manualSelection.set(explicit && years.some(y => y.id === saved));
      if (!this.manualSelection()) localStorage.removeItem(`fasoecole_year_explicit_${schoolId}`);
      this.yearId.set(year?.id ?? null);
      if (year && saved !== year.id) { localStorage.setItem(`fasoecole_year_${schoolId}`,String(year.id)); this.reload(); }
      if (!year && saved) { localStorage.removeItem(`fasoecole_year_${schoolId}`); this.reload(); }
    },error: () => this.error.set('Impossible de charger les années.')});
  }
  chooseSchool(id: number): void {
    if (!this.schools().some(s => s.id === id)) return;
    this.auth.selectSchoolContext(id);
    const detail = /^\/(proprietaire|admin)\/(eleves|enseignants)\/\d+(?:[/?]|$)/.exec(this.router?.url ?? '');
    if (detail && this.router) {
      void this.router.navigateByUrl(`/${detail[1]}/${detail[2]}`).then(navigated => { if (navigated) this.reload(); });
      return;
    }
    this.reload();
  }
  chooseYear(id: number): void {
    const school = this.schoolId();
    if (!school || !this.years().some(y => y.id === id)) return;
    localStorage.setItem(`fasoecole_year_explicit_${school}`, 'true');
    localStorage.setItem(`fasoecole_year_${school}`,String(id));
    this.yearId.set(id);
    this.manualSelection.set(true);
    this.reload();
  }
  useAutomaticYear(): void {
    const school = this.schoolId();
    if (!school) return;
    localStorage.removeItem(`fasoecole_year_explicit_${school}`);
    this.manualSelection.set(false);
    this.refreshYears(school);
  }
}
