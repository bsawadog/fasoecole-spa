import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { SelectField } from '../../../../shared/ui/select-field';
import { provideRouter } from '@angular/router';
import { of, Subject } from 'rxjs';
import { SchoolDataSyncService } from '../../../../shared/school-data-sync.service';
import { AuthService } from '../../../../core/auth';
import { OwnerManagementService } from '../../owner-management.service';
import { TeacherWorkService } from '../../teacher-work.service';
import { ConfirmationService } from '../../../../shared/confirmation/confirmation.service';
import { TeacherRoster } from './teacher-roster';
import { PayrollService } from '../../payroll.service';

describe('TeacherRoster', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [{ provide: PayrollService, useValue: {
      overview: () => of({ employees: [{ contracts: [{ key: 'teacher:4', rate: 100000, due: 100000, net: 90000, paid: 20000, remaining: 70000 }] }] }),
    } }] });
  });
  it('finishes loading teachers when a live refresh arrives during the initial request', () => {
    const refresh = new Subject<void>();
    const pending = new Subject<never[]>();
    const teachersByClass = vi.fn(() => pending);
    TestBed.configureTestingModule({
      imports: [TeacherRoster],
      providers: [
        provideRouter([]),
        { provide: ConfirmationService, useValue: {} },
        { provide: SchoolDataSyncService, useValue: { watch: () => refresh } },
        { provide: AuthService, useValue: { user: () => ({ id: 7 }), selectedSchoolType: () => 'PRIMAIRE',
          getOwnedSchools: () => of([{ id: 5, name: 'École', type: 'PRIMAIRE' }]) } },
        { provide: OwnerManagementService, useValue: {
          getClasses: () => of([{ id: 1, name: 'CP1', levelId: 8, schoolId: 5 }]),
          getLevels: () => of([]), getSubjects: () => of([]),
        } },
        { provide: TeacherWorkService, useValue: { teachersByClass, candidatesByClass: () => of([]) } },
      ],
    });
    const fixture = TestBed.createComponent(TeacherRoster);
    fixture.detectChanges();
    expect(fixture.componentInstance.loadingTeachers()).toBe(true);
    refresh.next();
    expect(teachersByClass).toHaveBeenCalledTimes(1);
    pending.next([]);
    expect(fixture.componentInstance.loadingTeachers()).toBe(false);
  });
  it('shows teachers only for the selected class and links to their detail', () => {
    const resendUserInvitation = vi.fn(() => of({ emailSent: true }));
    const requestPasswordReset = vi.fn(() => of({ message: 'Demande prise en compte.' }));
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
          user: () => ({ id: 7 }), resendUserInvitation, requestPasswordReset,
          selectSchoolContext: vi.fn(), selectedSchoolType: () => 'PRIMAIRE', getOwnedSchools: () => of([{ id: 5, name: 'École', type: 'SECONDAIRE' }]),
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
    expect(fixture.nativeElement.textContent).toMatch(/90\s000 FCFA/);
    expect(fixture.nativeElement.textContent).toMatch(/20\s000 FCFA/);
    expect(fixture.nativeElement.textContent).toMatch(/70\s000 FCFA/);
    expect(fixture.nativeElement.textContent).toContain('Créer un employé');
    expect(Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>)
      .some(button => button.textContent?.includes('Ajouter un enseignant'))).toBe(false);
    expect(fixture.nativeElement.querySelector('form input[name="firstName"]')).toBeNull();
    const actions = fixture.componentInstance.teacherActions(fixture.componentInstance.teachers()[0], true);
    expect(actions.find(item => item.label === 'Voir la fiche')?.routerLink).toEqual(['/proprietaire/enseignants', 4]);
    expect(fixture.nativeElement.textContent).toContain('Désactivé');
    expect(actions.some(item => item.label === 'Réactiver dans cette classe')).toBe(true);
    expect(fixture.nativeElement.querySelector('button[aria-label="Actions : Awa Traoré"]')).not.toBeNull();
    expect(fixture.componentInstance.teacherActions(fixture.componentInstance.teachers()[0], false)
      .some(item => item.label === 'Supprimer de l’établissement')).toBe(false);

    const search = fixture.nativeElement.querySelector('#roster-teacher-search') as HTMLInputElement;
    search.value = 'traore';
    search.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(fixture.componentInstance.filteredTeachers()).toHaveLength(1);
    expect(search.parentElement?.querySelector('[role="status"]')?.textContent).toContain('1 / 1');
    search.value = 'introuvable';
    search.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(fixture.componentInstance.filteredTeachers()).toHaveLength(0);
    expect(fixture.nativeElement.textContent).toContain('Aucun enseignant ne correspond');
    fixture.componentInstance.teacherSearch.set('');
    fixture.detectChanges();

    const teacher = { ...fixture.componentInstance.teachers()[0], userId: 40, emailVerified: true, passwordSet: true };
    fixture.componentInstance.sendTeacherAccountLink(teacher);
    expect(requestPasswordReset).toHaveBeenCalledWith('awa@example.test');
    expect(resendUserInvitation).not.toHaveBeenCalled();
    fixture.componentInstance.sendTeacherAccountLink({ ...teacher, passwordSet: false });
    expect(resendUserInvitation).toHaveBeenCalledWith(40);
    fixture.componentInstance.sendTeacherAccountLink({ ...teacher, email: '' });
    expect(requestPasswordReset).toHaveBeenCalledTimes(1);

    const select = fixture.debugElement.query(By.directive(SelectField)).componentInstance as SelectField;
    select.update(2);
    fixture.detectChanges();
    expect(teachersByClass).toHaveBeenCalledWith(2);
    expect(fixture.nativeElement.textContent).not.toContain('Awa Traoré');
  });
});


describe('TeacherRoster deletion', () => {
  it('requires confirmation and refreshes the class after deletion', async () => {
    const confirm = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const deleteTeacher = vi.fn(() => of(undefined));
    const teachersByClass = vi.fn(() => of([]));
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: {} },
        { provide: OwnerManagementService, useValue: { deleteTeacher } },
        { provide: TeacherWorkService, useValue: { teachersByClass, candidatesByClass: () => of([]) } },
        { provide: SchoolDataSyncService, useValue: {} },
        { provide: ConfirmationService, useValue: { confirm } },
      ],
    });
    const page = TestBed.runInInjectionContext(() => new TeacherRoster());
    page.selectedClassId.set(1);
    const teacher = { id: 4, firstName: 'Awa', lastName: 'Diallo' } as never;
    await page.deleteTeacher(teacher);
    expect(deleteTeacher).not.toHaveBeenCalled();
    await page.deleteTeacher(teacher);
    expect(confirm).toHaveBeenLastCalledWith(expect.objectContaining({ destructive: true }));
    expect(deleteTeacher).toHaveBeenCalledWith(4);
    expect(teachersByClass).toHaveBeenCalledWith(1);
    expect(page.saving()).toBe(false);
    page.ngOnDestroy();
  });
});
