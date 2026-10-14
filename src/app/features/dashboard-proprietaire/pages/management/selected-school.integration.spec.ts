import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AuthService } from '../../../../core/auth';
import { ConfirmationService } from '../../../../shared/confirmation/confirmation.service';
import { environment } from '../../../../../environments/environment';
import { OwnerManagementService } from '../../owner-management.service';
import { OwnerManagement } from './management';

describe('Global school selection through AuthService and OwnerManagement', () => {
  afterEach(() => {
    localStorage.removeItem('fasoecole_auth');
    localStorage.removeItem('fasoecole_owner_school');
  });

  it('loads all management data for the selected school and keeps the selection when opening the module again', () => {
    localStorage.setItem('fasoecole_auth', JSON.stringify({ token: 'test', user: {
      id: 7, role: 'proprietaire', rawRoles: ['SCHOOL_ADMIN'], approved: true, emailVerified: true,
    } }));
    localStorage.setItem('fasoecole_owner_school', '2');
    const schools = [
      { id: 1, name: 'École A', type: 'PRIMAIRE', status: 'ACTIVE' },
      { id: 2, name: 'École B', type: 'PRIMAIRE', status: 'ACTIVE' },
    ];
    const api = {
      getSchool: vi.fn((id: number) => of(schools.find(school => school.id === id))),
      getAcademicYears: vi.fn(() => of([])), getLevels: vi.fn(() => of([])),
      getClasses: vi.fn(() => of([])), getSubjects: vi.fn(() => of([])),
      getFeeTypes: vi.fn(() => of([])), getStudents: vi.fn(() => of([])), getTeachers: vi.fn(() => of([])),
    };
    TestBed.configureTestingModule({ imports: [OwnerManagement], providers: [
      provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
      { provide: OwnerManagementService, useValue: api }, { provide: ConfirmationService, useValue: {} },
    ] });
    const auth = TestBed.inject(AuthService);
    const http = TestBed.inject(HttpTestingController);
    const changeSelection = vi.spyOn(auth, 'selectSchoolContext');
    const access = schools.map(school => ({ schoolId: school.id, schoolName: school.name,
      schoolType: school.type, status: school.status, owner: true, jobTitle: 'Propriétaire', modules: ['MANAGEMENT'] }));

    let fixture = TestBed.createComponent(OwnerManagement);
    fixture.detectChanges();
    http.expectOne(environment.apiUrl + '/owner/staff/my-access').flush(access);
    fixture.detectChanges();
    expect(fixture.componentInstance.school()?.name).toBe('École B');
    for (const method of Object.values(api)) expect(method).toHaveBeenLastCalledWith(2);
    expect(changeSelection).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('École B');
    fixture.destroy();

    auth.selectSchoolContext(1);
    changeSelection.mockClear();
    fixture = TestBed.createComponent(OwnerManagement);
    fixture.detectChanges();
    http.expectOne(environment.apiUrl + '/owner/staff/my-access').flush(access);
    fixture.detectChanges();
    expect(fixture.componentInstance.school()?.name).toBe('École A');
    for (const method of Object.values(api)) expect(method).toHaveBeenLastCalledWith(1);
    expect(changeSelection).not.toHaveBeenCalled();
    expect(auth.schoolContextId()).toBe(1);
    fixture.destroy();
    http.verify();
  });
});
