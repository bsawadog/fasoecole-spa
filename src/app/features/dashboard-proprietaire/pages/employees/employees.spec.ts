import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { of } from 'rxjs';
import { AuthService } from '../../../../core/auth';
import { OwnerManagementService } from '../../owner-management.service';
import { EmployeesPage } from './employees';
import { environment } from '../../../../../environments/environment';

describe('Teacher creation and initial compensation', () => {
  function setup() {
    const management = {
      getClasses: vi.fn(() => of([{ id: 11, schoolId: 1, name: 'CM1', academicYearId: 2 }])),
      getSubjects: vi.fn(() => of([{ id: 8, schoolId: 1, name: 'Maths' }])),
      getAcademicYears: vi.fn(() => of([{ id: 2, label: '2026-2027', startDate: '2026-09-01', endDate: '2027-07-31', closed: false }])),
    };
    TestBed.configureTestingModule({ imports: [EmployeesPage], providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
      { provide: AuthService, useValue: { user: () => ({ id: 7 }), getOwnedSchools: () => of([{ id: 1, name: 'École' }]) } },
      { provide: OwnerManagementService, useValue: management },
    ] });
    const fixture = TestBed.createComponent(EmployeesPage); fixture.detectChanges();
    const page = fixture.componentInstance;
    Object.assign(page.form, { firstName: 'Awa', lastName: 'Diallo', rateEffectiveFrom: '2026-10-01' });
    return { fixture, page, management, http: TestBed.inject(HttpTestingController) };
  }

  it('sends a fixed monthly salary without an hourly rate or a timetable', () => {
    const { page, http, management } = setup();
    page.form.monthlySalary = 95000;
    page.form.hourlyRate = 2500;
    page.save();
    const request = http.expectOne(`${environment.apiUrl}/teacher-work/schools/1/teachers`);
    expect(request.request.body).toMatchObject({ rateType: 'FIXED_MONTHLY', monthlySalary: 95000, hourlyRate: null, initialSlots: [] });
    request.flush({ id: 9, employeeNumber: 'EMP-9' });
    expect(page.form.monthlySalary).toBeNull(); expect(page.busy()).toBe(false);
    expect(management.getClasses).not.toHaveBeenCalled(); http.verify();
  });

  it('sends the hourly rate and all initial class and subject slots in a single creation request', () => {
    const { page, fixture, http } = setup();
    page.changeRateType('HOURLY'); page.addSlot(); page.form.hourlyRate = 2500; page.form.monthlySalary = 95000;
    Object.assign(page.slots[0], { classId: 11, subjectId: 8, dayOfWeek: 1, startTime: '08:00', endTime: '10:00', effectiveFrom: '2026-10-15' });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Créneaux hebdomadaires (facultatifs)');
    expect(page.weeklyHours()).toBe('2');
    page.save();
    const request = http.expectOne(`${environment.apiUrl}/teacher-work/schools/1/teachers`);
    expect(request.request.body).toMatchObject({ rateType: 'HOURLY', hourlyRate: 2500, monthlySalary: null,
      initialSlots: [{ classId: 11, subjectId: 8, dayOfWeek: 1, startTime: '08:00', endTime: '10:00', effectiveFrom: '2026-10-15' }] });
    request.flush({ id: 9, employeeNumber: 'EMP-9' });
    expect(page.slots).toHaveLength(0); expect(page.form.rateType).toBe('FIXED_MONTHLY'); http.verify();
  });

  it('validates the end time of an optional slot before making a request', () => {
    const { page, http } = setup();
    page.changeRateType('HOURLY'); page.form.hourlyRate = 2500;
    page.addSlot(); Object.assign(page.slots[0], { classId: 11, subjectId: 8, startTime: '10:00', endTime: '08:00', effectiveFrom: '2026-10-15' });
    page.save();
    expect(page.error()).toContain('Vérifiez chaque créneau'); http.expectNone(`${environment.apiUrl}/teacher-work/schools/1/teachers`);
  });

  it('preserves salary and slots when the server rejects the request', () => {
    const { page, http } = setup();
    page.changeRateType('HOURLY'); page.addSlot(); page.form.hourlyRate = 2500;
    Object.assign(page.slots[0], { classId: 11, subjectId: 8, effectiveFrom: '2026-10-15' });
    page.save();
    http.expectOne(`${environment.apiUrl}/teacher-work/schools/1/teachers`).flush({ message: 'Créneaux en conflit' }, { status: 400, statusText: 'Bad Request' });
    expect(page.error()).toBe('Créneaux en conflit'); expect(page.form.hourlyRate).toBe(2500);
    expect(page.slots).toHaveLength(1); expect(page.busy()).toBe(false); http.verify();
  });

  it('can create an hourly teacher with subjects but no class or schedule', () => {
    const { page, http } = setup();
    page.loadScheduleContext(); page.toggleSubject(8, true);
    page.changeRateType('HOURLY'); page.form.hourlyRate = 2500;
    page.save();
    const request = http.expectOne(`${environment.apiUrl}/teacher-work/schools/1/teachers`);
    expect(request.request.body).toMatchObject({ subjectIds: [8], classId: null, initialSlots: [], rateType: 'HOURLY' });
    request.flush({ id: 9 }); http.verify();
  });

  it('requires subjects when an initial class is selected', () => {
    const { page, http } = setup();
    page.loadScheduleContext(); page.form.classId = 11; page.form.monthlySalary = 95000;
    page.save();
    expect(page.error()).toContain('au moins une matière');
    http.expectNone(`${environment.apiUrl}/teacher-work/schools/1/teachers`);
    page.toggleSubject(8, true); page.save();
    const request = http.expectOne(`${environment.apiUrl}/teacher-work/schools/1/teachers`);
    expect(request.request.body).toMatchObject({ subjectIds: [8], classId: 11 });
    request.flush({ id: 9 }); http.verify();
  });
});
