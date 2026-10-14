import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AuthService } from '../../../../core/auth';
import { ConfirmationService } from '../../../../shared/confirmation/confirmation.service';
import { OwnerManagementService } from '../../owner-management.service';
import { OwnerManagement } from './management';

describe('OwnerManagement step navigation', () => {
  function setup() {
    const school = { id: 2, name: 'École B', type: 'PRIMAIRE', status: 'ACTIVE' };
    TestBed.configureTestingModule({ imports: [OwnerManagement], providers: [provideRouter([]),
      { provide: AuthService, useValue: { user: () => ({ id: 7 }), getOwnedSchools: () => of([school]), selectedSchoolType: () => 'PRIMAIRE' } },
      { provide: ConfirmationService, useValue: {} },
      { provide: OwnerManagementService, useValue: {
        getSchool: () => of(school), getAcademicYears: () => of([]), getLevels: () => of([]),
        getClasses: () => of([]), getSubjects: () => of([]), getFeeTypes: () => of([]),
        getStudents: () => of([]), getTeachers: () => of([]),
      } },
    ] });
    const fixture = TestBed.createComponent(OwnerManagement);
    fixture.detectChanges();
    return fixture;
  }

  it('walks through all seven steps and returns from the last step', () => {
    const fixture = setup();
    const expected = ['Informations de l’établissement', 'Années scolaires', 'Niveaux et cycles', 'Classes', 'Matières', 'Frais scolaires', 'Effectifs de l’établissement'];
    for (let index = 0; index < expected.length; index++) {
      expect(fixture.nativeElement.querySelector('.owner-management__panel').textContent).toContain(expected[index]);
      expect(fixture.nativeElement.querySelector('.owner-management__step-navigation').textContent).toContain(`Étape ${index + 1} sur 7`);
      const next = fixture.nativeElement.querySelector('.owner-management__next') as HTMLButtonElement | null;
      if (index < expected.length - 1) {
        expect(next?.disabled).toBe(false);
        next!.click(); fixture.detectChanges();
      } else expect(next).toBeNull();
    }
    (fixture.nativeElement.querySelector('.owner-management__previous') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.owner-management__panel').textContent).toContain('Frais scolaires');
  });

  it('preserves an academic draft until it is saved or cancelled', () => {
    const fixture = setup();
    (fixture.nativeElement.querySelector('.owner-management__next') as HTMLButtonElement).click();
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('.owner-management__panel-heading button') as HTMLButtonElement).click();
    fixture.detectChanges();
    fixture.componentInstance.academicForm.label = '2026-2027';
    const next = fixture.nativeElement.querySelector('.owner-management__next') as HTMLButtonElement;
    expect(next.disabled).toBe(true);
    next.click(); fixture.detectChanges();
    expect(fixture.componentInstance.academicKind()).toBe('years');
    expect(fixture.componentInstance.academicForm.label).toBe('2026-2027');
    (fixture.nativeElement.querySelector('.owner-management__editor-heading button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(next.disabled).toBe(false);
    next.click(); fixture.detectChanges();
    expect(fixture.componentInstance.academicKind()).toBe('levels');
  });
});
