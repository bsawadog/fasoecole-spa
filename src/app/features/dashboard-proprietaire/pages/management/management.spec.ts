import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AuthService } from '../../../../core/auth';
import { ConfirmationService } from '../../../../shared/confirmation/confirmation.service';
import { OwnerManagementService } from '../../owner-management.service';
import { OwnerManagement } from './management';

describe('OwnerManagement academic years', () => {
  it('saves an academic year for a university when the form is submitted', () => {
    const school = { id: 11, name: 'Université', type: 'UNIVERSITE', address: null,
      phone: null, email: null, ownerId: 2, status: 'ACTIVE' };
    const saveAcademicYear = vi.fn((year: { schoolId: number; label: string; startDate: string;
      endDate: string; isCurrent: boolean }) => of({ ...year, id: 5 }));
    TestBed.configureTestingModule({
      imports: [OwnerManagement],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: {
          user: () => ({ id: 2 }),
          selectSchoolContext: vi.fn(), selectedSchoolType: () => 'PRIMAIRE', getOwnedSchools: () => of([school]),
        } },
        { provide: ConfirmationService, useValue: {} },
        { provide: OwnerManagementService, useValue: {
          getSchool: () => of(school),
          getAcademicYears: () => of([]),
          getLevels: () => of([]),
          getClasses: () => of([]),
          getSubjects: () => of([]),
          getFeeTypes: () => of([]),
          getStudents: () => of([]),
          getTeachers: () => of([]),
          saveAcademicYear,
        } },
      ],
    });

    const fixture = TestBed.createComponent(OwnerManagement);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    component.selectSection('academic');
    component.editAcademic();
    fixture.detectChanges();

    const form = fixture.nativeElement.querySelector('form.owner-management__editor') as HTMLFormElement;
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    fixture.detectChanges();
    expect(component.academicError()).toBe('Indiquez le nom de l’année scolaire.');
    expect(saveAcademicYear).not.toHaveBeenCalled();

    component.academicForm.label = '2026-2027';
    component.academicForm.startDate = '2026-10-01';
    component.academicForm.endDate = '2026-09-30';
    fixture.detectChanges();
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    fixture.detectChanges();
    expect(component.academicError()).toBe('La date de fin doit être postérieure ou égale à la date de début.');
    expect(saveAcademicYear).not.toHaveBeenCalled();

    component.academicForm.endDate = '2027-07-31';
    fixture.detectChanges();
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    fixture.detectChanges();

    expect(saveAcademicYear).toHaveBeenCalledWith({
      schoolId: 11, label: '2026-2027', startDate: '2026-10-01',
      endDate: '2027-07-31', isCurrent: false,
    }, undefined);
    expect(component.academicError()).toBeNull();
    expect(component.editorOpen()).toBe(false);
  });
});
