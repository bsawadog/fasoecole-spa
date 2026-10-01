import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AuthService } from '../../../../core/auth';
import { OwnerManagementService } from '../../owner-management.service';
import { TeacherWorkService } from '../../teacher-work.service';
import { ConfirmationService } from '../../../../shared/confirmation/confirmation.service';
import { TeacherRoster } from './teacher-roster';

describe('TeacherRoster', () => {
  it('shows teachers only for the selected class and links to their detail', () => {
    const teachersByClass = vi.fn((classId: number) => of(classId === 1
      ? [{ id: 4, schoolId: 5, firstName: 'Awa', lastName: 'Traoré', email: 'awa@example.test',
        phone: null, specialty: 'Mathématiques', subjects: ['Mathématiques'], activeInClass: false, classCount: 0 }]
      : []));
    TestBed.configureTestingModule({
      imports: [TeacherRoster],
      providers: [
        provideRouter([]),
        { provide: ConfirmationService, useValue: { confirm: () => Promise.resolve(false) } },
        { provide: AuthService, useValue: {
          user: () => ({ id: 7 }),
          getOwnedSchools: () => of([{ id: 5, name: 'École', type: 'SECONDAIRE' }]),
        } },
        { provide: OwnerManagementService, useValue: {
          getClasses: () => of([
            { id: 1, schoolId: 5, name: '6e A', levelId: 8, academicYearId: 9, capacity: 30 },
            { id: 2, schoolId: 5, name: '5e B', levelId: 8, academicYearId: 9, capacity: 30 },
          ]),
          getLevels: () => of([{ id: 8, schoolId: 5, name: '6e', cycle: 'COLLEGE', orderIndex: 10 }]),
          getSubjects: () => of([{ id: 9, schoolId: 5, name: 'Mathématiques', code: 'MATH' }]),
        } },
        { provide: TeacherWorkService, useValue: {
          teachersByClass,
          candidatesByClass: () => of([]),
          teachersBySchool: () => of([]),
        } },
      ],
    });

    const fixture = TestBed.createComponent(TeacherRoster);
    fixture.detectChanges();
    expect(teachersByClass).toHaveBeenCalledWith(1);
    expect(fixture.nativeElement.textContent).toContain('Awa Traoré');
    const link = fixture.nativeElement.querySelector('a[href="/proprietaire/enseignants/4"]');
    expect(link).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Désactivé');
    expect(fixture.nativeElement.textContent).toContain('Réactiver');

    const select = fixture.nativeElement.querySelector('select') as HTMLSelectElement;
    select.value = '2';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(teachersByClass).toHaveBeenCalledWith(2);
    expect(fixture.nativeElement.textContent).not.toContain('Awa Traoré');
  });
});
