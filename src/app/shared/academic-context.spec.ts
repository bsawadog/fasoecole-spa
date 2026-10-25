import { HttpRequest, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { EMPTY, Observable, of, Subject } from 'rxjs';
import { AuthService } from '../core/auth';
import { environment } from '../../environments/environment';
import { ACADEMIC_CONTEXT_RELOAD, AcademicContextPicker, academicContextInterceptor } from './academic-context';
import { SchoolDataSyncService } from './school-data-sync.service';
import { Router } from '@angular/router';

describe('AcademicContextPicker shared module selection', () => {
  const years = [
    { id: 2, label: '2026-2027', isCurrent: true, closed: false, startDate: '2026-09-01', endDate: '2027-06-30' },
    { id: 1, label: '2025-2026', isCurrent: false, closed: true, startDate: '2025-09-01', endDate: '2026-06-30' },
  ];
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.setItem('fasoecole_owner_school', '5');
    localStorage.setItem('fasoecole_year_5', '2');
  });
  afterEach(() => {
    http.verify({ ignoreCancelled: true });
    for (const key of ['fasoecole_owner_school', 'fasoecole_year_5', 'fasoecole_year_6', 'fasoecole_year_explicit_5']) localStorage.removeItem(key);
  });

  function setup(changes: Observable<void> = EMPTY, showSchool = true, showYear = true, routeUrl?: string) {
    const user = signal({ approved: true, emailVerified: true, mustChangePassword: false, rawRoles: ['SCHOOL_ADMIN'] });
    const schoolId = signal(5);
    const reload = vi.fn();
    const router = { url: routeUrl ?? '', navigateByUrl: vi.fn(() => Promise.resolve(true)) };
    const auth = { user, schoolContextId: schoolId, selectSchoolContext: vi.fn((id: number) => {
      localStorage.setItem('fasoecole_owner_school', String(id)); schoolId.set(id);
    }) };
    TestBed.configureTestingModule({ imports: [AcademicContextPicker], providers: [
      provideHttpClient(), provideHttpClientTesting(),
      { provide: AuthService, useValue: auth },
      { provide: SchoolDataSyncService, useValue: { watch: () => changes } },
      { provide: ACADEMIC_CONTEXT_RELOAD, useValue: reload },
      { provide: Router, useValue: router },
    ] });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(AcademicContextPicker);
    fixture.componentRef.setInput('showSchool', showSchool);
    fixture.componentRef.setInput('showYear', showYear);
    fixture.detectChanges();
    http.expectOne(environment.apiUrl + '/academic-years/context-schools').flush([{ id: 5, name: 'École A' }, { id: 6, name: 'École B' }]);
    fixture.detectChanges();
    if (showYear) http.expectOne(environment.apiUrl + '/academic-years?schoolId=5').flush(years);
    fixture.detectChanges();
    return { fixture, user, auth, reload, router };
  }

  it('restores the school and year with exactly one selector for each', () => {
    const { fixture, reload } = setup();
    expect(fixture.componentInstance.schoolId()).toBe(5);
    expect(fixture.componentInstance.yearId()).toBe(2);
    expect(fixture.nativeElement.querySelectorAll('app-select-field').length).toBe(2);
    expect(reload).not.toHaveBeenCalled();
  });

  it('shows only the global school selector without requesting years', () => {
    const { fixture, reload } = setup(EMPTY, true, false);
    expect(fixture.nativeElement.querySelectorAll('app-select-field').length).toBe(1);
    expect(fixture.nativeElement.querySelector('[role="combobox"][aria-label="Établissement consulté"]')).not.toBeNull();
    http.expectNone(environment.apiUrl + '/academic-years?schoolId=5');
    fixture.componentInstance.chooseSchool(6);
    expect(localStorage.getItem('fasoecole_owner_school')).toBe('6');
    expect(reload).toHaveBeenCalledOnce();
  });

  it('shows only the year selector in the module header', () => {
    const { fixture } = setup(EMPTY, false, true);
    expect(fixture.nativeElement.querySelectorAll('app-select-field').length).toBe(1);
    expect(fixture.nativeElement.querySelector('[role="combobox"][aria-label="Établissement consulté"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[role="combobox"][aria-label="Année scolaire consultée"]')).not.toBeNull();
  });

  it.each(['eleves', 'enseignants'])('leaves an old %s detail when choosing a different school', async resource => {
    const { fixture, router, reload } = setup(EMPTY, true, true, `/proprietaire/${resource}/42`);
    fixture.componentInstance.chooseSchool(6);
    expect(router.navigateByUrl).toHaveBeenCalledWith(`/proprietaire/${resource}`);
    await Promise.resolve();
    expect(reload).toHaveBeenCalledOnce();
  });

  it('persists a manual year for the selected school and refreshes all module data', () => {
    const { fixture, reload } = setup();
    fixture.componentInstance.chooseYear(1);
    expect(localStorage.getItem('fasoecole_year_5')).toBe('1');
    expect(localStorage.getItem('fasoecole_year_explicit_5')).toBe('true');
    expect(fixture.componentInstance.yearId()).toBe(1);
    expect(reload).toHaveBeenCalledOnce();
  });

  it('cancels an old year request when the school changes', () => {
    const changes = new Subject<void>();
    const { fixture, auth, reload } = setup(changes);
    changes.next();
    const old = http.expectOne(environment.apiUrl + '/academic-years?schoolId=5');
    fixture.componentInstance.chooseSchool(6);
    fixture.detectChanges();
    expect(old.cancelled).toBe(true);
    expect(auth.selectSchoolContext).toHaveBeenLastCalledWith(6);
    http.expectOne(environment.apiUrl + '/academic-years?schoolId=6').flush([
      { ...years[0], id: 9 },
    ]);
    expect(fixture.componentInstance.yearId()).toBe(9);
    expect(localStorage.getItem('fasoecole_year_5')).toBe('2');
    expect(localStorage.getItem('fasoecole_year_6')).toBe('9');
    expect(reload).toHaveBeenCalled();
  });

  it('keeps the selected context when an unchanged account is refreshed', () => {
    const { fixture, user } = setup();
    user.update(value => ({ ...value }));
    fixture.detectChanges();
    http.expectNone(environment.apiUrl + '/academic-years/context-schools');
    expect(fixture.componentInstance.yearId()).toBe(2);
  });
});

describe('academicContextInterceptor', () => {
  beforeEach(() => {
    localStorage.setItem('fasoecole_owner_school', '5');localStorage.setItem('fasoecole_year_5', '2');
    TestBed.configureTestingModule({providers: [{provide: AuthService, useValue: {user: () => ({approved: true, emailVerified: true})}}]});
  });
  afterEach(() => {localStorage.removeItem('fasoecole_owner_school');localStorage.removeItem('fasoecole_year_5');});
  it('uses the requested reporting year instead of the stored year', () => {
    const next = vi.fn((_request: HttpRequest<unknown>) => of());
    const request = new HttpRequest('GET', environment.apiUrl+'/owner/expenses/schools/5/summary', {params: undefined});
    const selected = request.clone({setParams: {academicYearId: '1'}});
    TestBed.runInInjectionContext(() => academicContextInterceptor(selected, next));
    expect(next.mock.calls[0][0].headers.get('X-Academic-Year')).toBe('1');
  });
  it('keeps the stored context when no reporting year is requested', () => {
    const next = vi.fn((_request: HttpRequest<unknown>) => of());
    TestBed.runInInjectionContext(() => academicContextInterceptor(new HttpRequest('GET', environment.apiUrl+'/owner/expenses/schools/5/summary'), next));
    expect(next.mock.calls[0][0].headers.get('X-Academic-Year')).toBe('2');
  });
});
