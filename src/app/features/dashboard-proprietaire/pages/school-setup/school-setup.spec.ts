import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AuthService } from '../../../../core/auth';
import { ConfirmationService } from '../../../../shared/confirmation/confirmation.service';
import { OwnerManagementService } from '../../owner-management.service';
import { SchoolSetup } from './school-setup';

describe('SchoolSetup global school selection', () => {
  afterEach(() => localStorage.removeItem('fasoecole_school_draft_7'));

  it('preserves the approved school selection while viewing and refreshing another school request', () => {
    const selectedSchool = signal(2);
    const pending = { id: 3, name: 'BOUBACAR SAWADOGO', type: 'PRIMAIRE', status: 'PENDING_APPROVAL',
      address: 'Ouagadougou', expectedStudentCount: 20, expectedClassCount: 2, expectedTeacherCount: 2 };
    const api = { getSchool: vi.fn(() => of(pending)) };
    const auth = { user: () => ({ id: 7 }),
      selectSchoolContext: vi.fn((id: number) => selectedSchool.set(id)), loadOwnerAccess: () => of([]) };
    TestBed.configureTestingModule({ imports: [SchoolSetup], providers: [provideRouter([]),
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({ schoolId: '3' }) } } },
      { provide: AuthService, useValue: auth },
      { provide: OwnerManagementService, useValue: api },
      { provide: ConfirmationService, useValue: { confirm: () => Promise.resolve(true) } },
    ] });
    const fixture = TestBed.createComponent(SchoolSetup);
    fixture.detectChanges();
    expect(fixture.componentInstance.schoolName()).toBe('BOUBACAR SAWADOGO');
    expect(selectedSchool()).toBe(2);
    expect(auth.selectSchoolContext).not.toHaveBeenCalled();
    fixture.componentInstance.refresh();
    expect(selectedSchool()).toBe(2);
    api.getSchool.mockReturnValueOnce(of({ ...pending, status: 'ACTIVE' }));
    fixture.componentInstance.refresh();
    expect(fixture.componentInstance.active()).toBe(true);
    expect(selectedSchool()).toBe(2);
    expect(auth.selectSchoolContext).not.toHaveBeenCalled();
  });
});
