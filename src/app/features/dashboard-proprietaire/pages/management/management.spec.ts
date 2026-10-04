import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AuthService } from '../../../../core/auth';
import { ConfirmationService } from '../../../../shared/confirmation/confirmation.service';
import { OwnerManagementService } from '../../owner-management.service';
import { OwnerManagement } from './management';

describe('OwnerManagement academic years', () => {
  it('saves an academic year for a university when the form is submitted', async () => {
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
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
    const component = fixture.componentInstance;
    component.selectSection('academic');
    component.editAcademic();
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();

    const form = fixture.nativeElement.querySelector('form.owner-management__editor') as HTMLFormElement;
    async function submit(values: Record<string, string> = {}) {
      await fixture.whenStable();
      for (const [name, value] of Object.entries(values)) {
        const input = form.querySelector<HTMLInputElement>('input[name="' + name + '"]')!;
        input.value = value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
      fixture.detectChanges();
      await fixture.whenStable();
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      fixture.detectChanges();
    }
    await submit();
    expect(form.querySelector('.form-validation-error')?.textContent).toContain('obligatoire');
    expect(form.querySelector('[aria-invalid="true"]')).not.toBeNull();
    expect(saveAcademicYear).not.toHaveBeenCalled();

    await submit({ yearLabel: '2026-2027', yearStart: '2026-10-01', yearEnd: '2026-09-30' });
    expect(component.academicError()).toBe('La date de fin doit être postérieure ou égale à la date de début.');
    expect(saveAcademicYear).not.toHaveBeenCalled();

    await submit({ yearEnd: '2027-07-31' });

    expect(saveAcademicYear).toHaveBeenCalledWith({
      schoolId: 11, label: '2026-2027', startDate: '2026-10-01',
      endDate: '2027-07-31', isCurrent: false,
    }, undefined);
    expect(component.academicError()).toBeNull();
    expect(component.editorOpen()).toBe(false);
  });
});
