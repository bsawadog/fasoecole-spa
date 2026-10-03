import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AuthService } from '../../../../core/auth';
import { ConfirmationService } from '../../../../shared/confirmation/confirmation.service';
import { OwnerManagementService } from '../../owner-management.service';
import { ClassRoster } from './class-roster';

describe('ClassRoster transfer', () => {
  const row = {
    studentId: 7, firstName: 'Ali', lastName: 'Kaboré', email: 'ali@ecole.bf', phone: null,
    registrationNumber: 'M-7', birthDate: null, gender: null, parents: [], teacherNames: [],
  };
  const classes = [
    { id: 100, name: 'A', levelId: 1, academicYearId: 5 },
    { id: 101, name: 'B', levelId: 1, academicYearId: 5 },
    { id: 200, name: 'A', levelId: 2, academicYearId: 6 },
  ];

  function setup() {
    localStorage.removeItem('fasoecole_owner_school');
    const api = {
      getClasses: vi.fn(() => of(classes)),
      getLevels: vi.fn(() => of([{ id: 1, name: 'CM1' }, { id: 2, name: 'CM2' }])),
      getAcademicYears: vi.fn(() => of([
        { id: 5, schoolId: 1, label: '2025-2026', startDate: '', endDate: '', isCurrent: true },
        { id: 6, schoolId: 1, label: '2026-2027', startDate: '', endDate: '', isCurrent: false },
      ])),
      getClassRoster: vi.fn(() => of([row])),
      transferRosterStudent: vi.fn(() => of({ ...row })),
    };
    const confirmation = { confirm: vi.fn(() => Promise.resolve(true)) };
    TestBed.configureTestingModule({
      imports: [ClassRoster],
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: { user: () => ({ id: 10 }), selectSchoolContext: vi.fn(), selectedSchoolType: () => 'PRIMAIRE', getOwnedSchools: vi.fn(() => of([{ id: 1, name: 'École A', type: 'PRIMAIRE' }])) },
        },
        { provide: OwnerManagementService, useValue: api },
        { provide: ConfirmationService, useValue: confirmation },
      ],
    });
    const fixture = TestBed.createComponent(ClassRoster);
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance, api, confirmation };
  }

  it('offers every other class of the school, grouped by academic year', () => {
    const { component } = setup();
    expect(component.transferTargets().map((c) => c.id)).toEqual([101, 200]);
    expect(component.transferTargetGroups().map((g) => g.label)).toEqual(['2025-2026', '2026-2027']);
  });

  it('transfers the student and removes them from the current list', async () => {
    const { fixture, component, api, confirmation } = setup();
    component.startTransfer(row as never);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Classe de destination');

    await component.confirmTransfer(row as never);

    expect(confirmation.confirm).toHaveBeenCalled();
    expect(api.transferRosterStudent).toHaveBeenCalledWith(100, 7, 101);
    expect(component.rows()).toEqual([]);
    expect(component.successMessage()).toContain('CM1 · B (2025-2026)');
    expect(component.successMessage()).toContain('fiche est conservée');
  });
});
