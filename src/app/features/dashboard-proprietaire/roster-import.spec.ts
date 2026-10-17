import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';
import { RosterImport } from './roster-import';
import { ClassRosterRow, OwnerManagementService } from './owner-management.service';
import { TeacherWorkService } from './teacher-work.service';
import { PayrollService } from './payroll.service';
import { ConfirmationService } from '../../shared/confirmation/confirmation.service';

describe('Roster accounting import', () => {
  let currentFixture: ComponentFixture<RosterImport>;
  const importStudent = vi.fn<(classId: number, payload: unknown) => ReturnType<OwnerManagementService['importRosterStudent']>>();
  const createTeacher = vi.fn();
  const assignTeacher = vi.fn(() => of({ id: 8 }));
  const importSalary = vi.fn(() => of(undefined));
  beforeEach(() => {
    vi.clearAllMocks();
    importStudent.mockReturnValue(of({ studentId: 4, parents: [] } as unknown as ClassRosterRow));
    TestBed.configureTestingModule({ imports: [RosterImport], providers: [
      { provide: OwnerManagementService, useValue: { importRosterStudent: importStudent } },
      { provide: TeacherWorkService, useValue: {
        teachersBySchool: () => of([{ id: 8, employeeNumber: 'E001', firstName: 'Awa', lastName: 'Traoré', email: 'awa@example.test' }]),
        assignTeacher, createTeacher,
      } },
      { provide: PayrollService, useValue: { importTeacherSalary: importSalary } },
      { provide: ConfirmationService, useValue: { confirm: () => Promise.resolve(true) } },
    ] });
  });
  function component(kind: 'students' | 'teachers' = 'students') {
    const fixture = TestBed.createComponent(RosterImport);
    currentFixture = fixture;
    const dialog = fixture.nativeElement.querySelector('dialog') as HTMLDialogElement;
    dialog.showModal = () => dialog.setAttribute('open', '');
    dialog.close = () => { dialog.removeAttribute('open'); dialog.dispatchEvent(new Event('close')); };
    fixture.componentRef.setInput('schoolId', 1);
    fixture.componentRef.setInput('kind', kind);
    fixture.componentRef.setInput('classes', [{ id: 3, name: 'CP1' }]);
    fixture.componentRef.setInput('subjects', [{ id: 6, name: 'Maths' }, { id: 7, name: 'Français' }]);
    fixture.detectChanges();
    return fixture.componentInstance;
  }
  async function load(component: RosterImport, csv: string) {
    await component.load({ target: { value: '', files: [{ name: 'import.csv', size: csv.length, text: async () => csv }] } } as unknown as Event);
  }
  it('passes cumulative payments and normalized decimal amounts to the atomic student import', async () => {
    const c = component();
    await load(c, 'prénom;nom;courriel;matricule;classe;type_frais;frais;échéance;paiement;date_paiement;mode_paiement\nAwa;Traoré;awa@example.test;M001;CP1;Scolarité;50 000,50;2026-10-01;20000;2026-09-01;CASH');
    expect(c.invalid()).toBe(0);
    await c.save();
    expect(importStudent).toHaveBeenCalledWith(3, expect.objectContaining({ fees: 50000.5, paid: 20000, dueDate: '2026-10-01', paymentMethod: 'CASH' }));
    expect(c.remaining()).toBe(0);
  });
  it('blocks overpayments and incomplete fee information before saving', async () => {
    const c = component();
    await load(c, 'prénom;nom;courriel;matricule;classe;frais;paiement\nAwa;Traoré;awa@example.test;M001;CP1;1000;2000');
    expect(c.invalid()).toBe(1);
    await c.save();
    expect(importStudent).not.toHaveBeenCalled();
  });
  it('keeps empty payment cells distinct from an explicit zero', async () => {
    const c = component();
    await load(c, 'prénom;nom;courriel;matricule;classe;type_frais;frais;échéance;paiement\nAwa;Traoré;awa@example.test;M001;CP1;Scolarité;50000;2026-10-01;');
    await c.save();
    expect(importStudent).toHaveBeenCalledWith(3, expect.objectContaining({ paid: null }));
  });
  it('finds existing teachers by employee number and imports salary through payroll', async () => {
    const c = component('teachers');
    await load(c, 'prénom;nom;courriel;numéro_employé;classe;matière;salaire;mois_salaire;paiement;date_paiement;mode_paiement\nAwa;Traoré;awa@example.test;E001;CP1;Maths;100000;2026-09;30000;2026-09-01;BANK_TRANSFER');
    expect(c.invalid()).toBe(0);
    await c.save();
    expect(createTeacher).not.toHaveBeenCalled();
    expect(assignTeacher).toHaveBeenCalledWith(3, 8, 6);
    expect(importSalary).toHaveBeenCalledWith(1, 8, expect.objectContaining({ salary: 100000, paid: 30000, month: '2026-09' }));
  });
  it('imports multiple students when the email column is absent', async () => {
    const c = component();
    await load(c, 'prénom;nom;matricule;classe\nAwa;Traoré;M001;CP1\nAli;Kaboré;M002;CP1');
    expect(c.invalid()).toBe(0);
    await c.save();
    expect(importStudent).toHaveBeenCalledTimes(2);
    expect(importStudent).toHaveBeenCalledWith(3, expect.objectContaining({ email: '', registrationNumber: 'M001' }));
    expect(c.remaining()).toBe(0);
  });
  it('accepts a blank email cell but rejects an invalid supplied email', async () => {
    const c = component();
    await load(c, 'prénom;nom;courriel;matricule;classe\nAwa;Traoré;;M001;CP1');
    expect(c.invalid()).toBe(0);
    await c.save();
    expect(importStudent).toHaveBeenCalledWith(3, expect.objectContaining({ email: '' }));
    c.acknowledgeOutcome();
    await load(c, 'prénom;nom;courriel;matricule;classe\nAwa;Traoré;invalide;M001;CP1');
    expect(c.invalid()).toBe(1);
  });
  it('reuses existing teachers without requiring their email in the file', async () => {
    const c = component('teachers');
    await load(c, 'prénom;nom;numéro_employé;classe;matière\nAwa;Traoré;E001;CP1;Maths');
    expect(c.invalid()).toBe(0);
    await c.save();
    expect(assignTeacher).toHaveBeenCalledWith(3, 8, 6);
    expect(createTeacher).not.toHaveBeenCalled();
    expect(c.remaining()).toBe(0);
  });
  it('keeps distinct teachers without email separate across repeated assignments', async () => {
    createTeacher.mockImplementation((classId, payload) => of({ id: payload.employeeNumber === 'E002' ? 20 : 30 }));
    const c = component('teachers');
    await load(c, 'prénom;nom;numéro_employé;classe;matière\nAli;Kaboré;E002;CP1;Maths\nSali;Ouédraogo;E003;CP1;Maths\nAli;Kaboré;E002;CP1;Français');
    expect(c.invalid()).toBe(0);
    await c.save();
    expect(createTeacher).toHaveBeenCalledTimes(2);
    expect(assignTeacher).toHaveBeenCalledWith(3, 20, 7);
    expect(c.remaining()).toBe(0);
  });
  it('rejects conflicting identities for the same employee number without email', async () => {
    const c = component('teachers');
    await load(c, 'prénom;nom;numéro_employé;classe;matière\nAli;Kaboré;E002;CP1;Maths\nSali;Ouédraogo;E002;CP1;Maths');
    expect(c.invalid()).toBe(1);
    await c.save();
    expect(createTeacher).not.toHaveBeenCalled();
  });
  it('imports student identity and parent contact together without requiring either email', async () => {
    const c = component();
    importStudent.mockReturnValue(of({ studentId: 4, parents: [{ firstName: 'Mamadou', lastName: 'Traoré', phone: '+22670000000', email: null }] } as unknown as ClassRosterRow));
    await load(c, 'prénom;nom;matricule;classe;téléphone;date_naissance;sexe;parent_prénom;parent_nom;parent_téléphone;lien_parenté\nAwa;Traoré;M001;CP1;+22671000000;2014-03-02;F;Mamadou;Traoré;+22670000000;Père');
    expect(c.invalid()).toBe(0);
    await c.save();
    expect(importStudent).toHaveBeenCalledWith(3, expect.objectContaining({
      phone: '+22671000000', birthDate: '2014-03-02', gender: 'F',
      parent: { firstName: 'Mamadou', lastName: 'Traoré', email: null, phone: '+22670000000', relationship: 'Père' },
    }));
    expect(c.remaining()).toBe(0);
  });
  it('includes a supplied parent email and rejects incomplete parent information', async () => {
    const c = component();
    importStudent.mockReturnValue(of({ studentId: 4, parents: [{ firstName: 'Mamadou', lastName: 'Traoré', email: 'parent@example.test' }] } as unknown as ClassRosterRow));
    await load(c, 'prénom;nom;matricule;classe;parent_prénom;parent_nom;parent_courriel\nAwa;Traoré;M001;CP1;Mamadou;Traoré;parent@example.test');
    await c.save();
    expect(importStudent).toHaveBeenCalledWith(3, expect.objectContaining({ parent: expect.objectContaining({ email: 'parent@example.test' }) }));
    c.acknowledgeOutcome();
    await load(c, 'prénom;nom;matricule;classe;parent_téléphone\nAwa;Traoré;M001;CP1;+22670000000');
    expect(c.invalid()).toBe(1);
    expect(c.rows()[0].errors.join(' ')).toContain('prénom et nom obligatoires');
  });
  it('keeps failed parent imports available for retry instead of marking them as registered', async () => {
    const c = component();
    importStudent.mockReturnValue(throwError(() => ({ error: { message: 'Parent inactif' } })));
    await load(c, 'prénom;nom;matricule;classe;parent_prénom;parent_nom\nAwa;Traoré;M001;CP1;Mamadou;Traoré');
    await c.save();
    expect(c.rows()[0].status).toBe('Parent inactif');
    expect(c.remaining()).toBe(1);
  });
  it('does not report success when the server response does not confirm the parent', async () => {
    const c = component();
    await load(c, 'prénom;nom;matricule;classe;parent_prénom;parent_nom\nAwa;Traoré;M001;CP1;Mamadou;Traoré');
    await c.save();
    expect(c.rows()[0].status).toContain('parent non confirmé');
    expect(c.remaining()).toBe(1);
  });
  it('shows green ready rows and a success modal, then refreshes only after OK', async () => {
    const c = component();
    const refresh = vi.fn(); c.completed.subscribe(refresh);
    await load(c, 'prénom;nom;matricule;classe\nAwa;Traoré;M001;CP1');
    currentFixture.detectChanges();
    expect(currentFixture.nativeElement.querySelector('.import__result--success').textContent).toContain('À importer');
    expect(currentFixture.nativeElement.querySelector('input[type="file"]').classList.contains('import__file')).toBe(true);
    await c.save();
    currentFixture.detectChanges(); await currentFixture.whenStable();
    const dialog = currentFixture.nativeElement.querySelector('dialog') as HTMLDialogElement;
    expect(dialog.open).toBe(true);
    expect(dialog.textContent).toContain('Import réussi');
    expect(c.messageSeverity()).toBe('success');
    expect(refresh).not.toHaveBeenCalled();
    (dialog.querySelector('button') as HTMLButtonElement).click();
    expect(dialog.open).toBe(false);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
  it('shows an error modal and red result when zero rows were saved', async () => {
    const c = component();
    importStudent.mockReturnValue(throwError(() => ({ error: { message: 'Matricule déjà utilisé' } })));
    await load(c, 'prénom;nom;matricule;classe\nAwa;Traoré;M001;CP1');
    await c.save();
    currentFixture.detectChanges(); await currentFixture.whenStable();
    const dialog = currentFixture.nativeElement.querySelector('dialog') as HTMLDialogElement;
    expect(dialog.open).toBe(true);
    expect(dialog.getAttribute('role')).toBe('alertdialog');
    expect(dialog.textContent).toContain('Import échoué');
    expect(dialog.textContent).toContain('0 ligne enregistrée');
    expect(dialog.textContent).toContain('Matricule déjà utilisé');
    expect(currentFixture.nativeElement.querySelector('.import__result--error').textContent).toContain('Matricule déjà utilisé');
    expect(c.messageSeverity()).toBe('error');
  });
  it('reports partial failure and keeps unsuccessful rows available after acknowledgment', async () => {
    const c = component();
    const refresh = vi.fn(); c.completed.subscribe(refresh);
    importStudent.mockReturnValueOnce(of({ studentId: 4, parents: [] } as unknown as ClassRosterRow))
      .mockReturnValueOnce(throwError(() => ({ error: { message: 'Classe complète' } })));
    await load(c, 'prénom;nom;matricule;classe\nAwa;Traoré;M001;CP1\nAli;Kaboré;M002;CP1');
    await c.save();
    expect(c.outcome()?.title).toBe('Import partiellement réalisé');
    expect(c.outcome()?.severity).toBe('error');
    expect(c.outcome()?.message).toContain('1 ligne enregistrée sur 2');
    c.acknowledgeOutcome();
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(c.remaining()).toBe(1);
    await c.save();
    expect(importStudent).toHaveBeenCalledTimes(3);
    expect(c.outcome()?.severity).toBe('success');
  });
  it('alerts for invalid files without refreshing the lists', async () => {
    const c = component();
    const refresh = vi.fn(); c.completed.subscribe(refresh);
    await load(c, 'prénom;nom;classe\nAwa;Traoré;CP1');
    expect(c.outcome()?.severity).toBe('error');
    expect(c.outcome()?.message).toContain('Colonne manquante');
    c.acknowledgeOutcome();
    expect(refresh).not.toHaveBeenCalled();
    await load(c, 'prénom;nom;matricule;classe\nAwa;Traoré;M001;Inconnue');
    expect(c.outcome()?.title).toBe('Fichier à corriger');
    expect(c.outcome()?.details.join(' ')).toContain('Classe introuvable');
  });
  it.each(['success', 'error'] as const)('shows the centered spinner during import and removes it after %s', async (result) => {
    const c = component();
    const response = new Subject<ClassRosterRow>();
    importStudent.mockReturnValue(response);
    await load(c, 'prénom;nom;matricule;classe\nAwa;Traoré;M001;CP1');
    const saving = c.save();
    await vi.waitFor(() => expect(importStudent).toHaveBeenCalled());
    currentFixture.detectChanges();
    expect(c.busy()).toBe(true);
    expect(currentFixture.nativeElement.querySelector('.import-progress__spinner')).not.toBeNull();
    expect(currentFixture.nativeElement.querySelector('.import-progress').getAttribute('role')).toBe('status');
    if (result === 'success') {
      response.next({ studentId: 4, parents: [] } as unknown as ClassRosterRow);
      response.complete();
    } else response.error({ error: { message: 'Import impossible' } });
    await saving;
    currentFixture.detectChanges(); await currentFixture.whenStable();
    expect(c.busy()).toBe(false);
    expect(currentFixture.nativeElement.querySelector('.import-progress')).toBeNull();
    expect(c.outcome()?.severity).toBe(result);
    expect((currentFixture.nativeElement.querySelector('dialog') as HTMLDialogElement).open).toBe(true);
  });
});
