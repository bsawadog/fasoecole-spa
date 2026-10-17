import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { ConfirmationService } from '../../../../shared/confirmation/confirmation.service';
import { OwnerManagementService } from '../../owner-management.service';
import { TeacherDetail, TeacherWorkService } from '../../teacher-work.service';
import { TeacherDetailPage } from './teacher-detail';
import { By } from '@angular/platform-browser';
import { DateField } from '../../../../shared/ui/date-field';

describe('TeacherDetailPage', () => {
  const month = {
    plannedHours: 10, workedHours: 2, absenceHours: 1, extraHours: 0,
    amountDue: 2000, paid: 0, remaining: 2000, perClass: [],
    sessions: [{ slotId: 4, date: '2026-09-15', classId: 1, className: 'L1',
      startTime: '08:00', endTime: '10:00', status: 'PENDING' as const, hours: 2 }],
    extras: [], payments: [],
  };
  const data: TeacherDetail = {
    teacher: { id: 3, schoolId: 2, firstName: 'Awa', lastName: 'Traoré',
      email: 'awa@example.test', phone: null, specialty: null, subjects: ['Mathématiques'], activeInClass: null, classCount: 1 },
    rateType: 'HOURLY', rate: 1000, schedule: [], month,
  };

  function setupErrorPage(overrides: Record<string, unknown> = {}, teacherId = '3') {
    localStorage.removeItem('fasoecole_owner_school');
    const api = { detail: vi.fn(() => of(data)), setRate: vi.fn(() => of(undefined)), sendSummary: vi.fn(() => of(undefined)), ...overrides };
    TestBed.configureTestingModule({ imports: [TeacherDetailPage], providers: [
      provideRouter([]),
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => teacherId } } } },
      { provide: TeacherWorkService, useValue: api },
      { provide: OwnerManagementService, useValue: { getClasses: () => of([]), getLevels: () => of([]) } },
      { provide: ConfirmationService, useValue: { confirm: () => Promise.resolve(true) } },
    ] });
    const fixture = TestBed.createComponent(TeacherDetailPage);
    const dialog = fixture.nativeElement.querySelector('dialog') as HTMLDialogElement;
    dialog.showModal = () => dialog.setAttribute('open', '');
    dialog.close = () => { dialog.removeAttribute('open'); dialog.dispatchEvent(new Event('close')); };
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance, dialog, api };
  }

  it('opens an error modal when loading fails and closes it after OK', async () => {
    const { fixture, dialog, component } = setupErrorPage({ detail: () => throwError(() => ({ error: { message: 'Accès à cet enseignant refusé.' } })) });
    await fixture.whenStable();
    expect(dialog.open).toBe(true);
    expect(dialog.getAttribute('role')).toBe('alertdialog');
    expect(dialog.textContent).toContain('Accès à cet enseignant refusé.');
    (dialog.querySelector('button') as HTMLButtonElement).click();
    expect(dialog.open).toBe(false);
    expect(component.error()).toBe('Accès à cet enseignant refusé.');
  });

  it('displays validation errors without submitting invalid remuneration', async () => {
    const { fixture, component, dialog, api } = setupErrorPage();
    component.rateForm.amount = -1;
    component.setRate(); fixture.detectChanges(); await fixture.whenStable();
    expect(dialog.open).toBe(true);
    expect(dialog.textContent).toContain('taux positif');
    expect(api.setRate).not.toHaveBeenCalled();
  });

  it('shows the backend error on a failed mutation and allows another attempt', async () => {
    const { fixture, component, dialog } = setupErrorPage({ setRate: () => throwError(() => ({ error: { message: 'Des paiements sont déjà enregistrés pour ce mois.' } })) });
    component.setRate(); fixture.detectChanges(); await fixture.whenStable();
    expect(dialog.open).toBe(true);
    expect(dialog.textContent).toContain('Des paiements sont déjà enregistrés pour ce mois.');
    expect(component.saving()).toBe(false);
    component.dismissError();
    component.setRate(); fixture.detectChanges(); await fixture.whenStable();
    expect(dialog.open).toBe(true);
  });

  it('shows an error if sending the summary fails', async () => {
    const { fixture, component, dialog } = setupErrorPage({ sendSummary: () => throwError(() => ({ error: { message: 'Envoi de courriel indisponible.' } })) });
    await component.sendToTeacher(); fixture.detectChanges(); await fixture.whenStable();
    expect(dialog.open).toBe(true);
    expect(dialog.textContent).toContain('Envoi de courriel indisponible.');
    expect(component.sending()).toBe(false);
  });

  it('reports an invalid teacher identifier in a modal', async () => {
    const { fixture, dialog, api } = setupErrorPage({}, 'invalide');
    await fixture.whenStable();
    expect(dialog.open).toBe(true);
    expect(dialog.textContent).toContain('Enseignant introuvable.');
    expect(api.detail).not.toHaveBeenCalled();
  });

  it('loads the teacher and records a dated presence against the selected month', () => {
    const detail = vi.fn(() => of(data));
    const pointSession = vi.fn(() => of(undefined));
    TestBed.configureTestingModule({
      imports: [TeacherDetailPage],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => '3' } } } },
        { provide: TeacherWorkService, useValue: { detail, pointSession } },
        { provide: OwnerManagementService, useValue: { getClasses: () => of([]), getLevels: () => of([]) } },
        { provide: ConfirmationService, useValue: {} },
      ],
    });

    const fixture = TestBed.createComponent(TeacherDetailPage);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    const monthInput = fixture.debugElement.query(By.directive(DateField)).componentInstance as DateField;
    monthInput.selectDate(new Date(2026, 8, 1));
    fixture.detectChanges();

    expect(detail).toHaveBeenCalledWith(3, '2026-09');
    expect(component.detail()?.teacher.firstName).toBe('Awa');
    expect(fixture.nativeElement.textContent).toContain('Calendrier et pointage');
    component.point(month.sessions[0], 'PRESENT');
    expect(pointSession).toHaveBeenCalledWith(3, {
      slotId: 4, date: '2026-09-15', status: 'PRESENT',
    });
    expect(detail).toHaveBeenCalledTimes(3);
  });
});
