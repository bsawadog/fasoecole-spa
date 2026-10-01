import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { ConfirmationService } from '../../../../shared/confirmation/confirmation.service';
import { SelfSpaceService } from '../../../../shared/self-space/self-space.service';
import { EnseignantNotes } from './notes';

describe('EnseignantNotes', () => {
  const sheet = {
    evaluation: { id: 7, title: 'Devoir 1', maxValue: 20 },
    rows: [
      { studentId: 1, fullName: 'Awa Ouédraogo', value: 12 },
      { studentId: 2, fullName: 'Ali Sawadogo', value: null },
    ],
  };
  let api: Record<string, ReturnType<typeof vi.fn>>;
  let component: EnseignantNotes;

  beforeEach(() => {
    api = {
      teacherClasses: vi.fn(() => of([{ classId: 3, className: '6e A', subjects: [{ classSubjectTeacherId: 9 }] }])),
      classPeriods: vi.fn(() => of([{ id: 4, status: 'OPEN', startDate: '2026-09-01', endDate: '2026-12-20' }])),
      evaluations: vi.fn(() => of([])),
      createEvaluation: vi.fn(() => of({ id: 7, title: 'Devoir 1' })),
      gradeSheet: vi.fn(() => of(sheet)),
      saveGrades: vi.fn(() => of({ created: 1, updated: 0, deleted: 0 })),
      deleteEvaluation: vi.fn(() => of(undefined)),
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: SelfSpaceService, useValue: api },
        { provide: ConfirmationService, useValue: { confirm: vi.fn(() => Promise.resolve(true)) } },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({}) } } },
      ],
    });
    component = TestBed.runInInjectionContext(() => new EnseignantNotes());
    component.ngOnInit();
  });

  it('sélectionne la première classe et la période ouverte', () => {
    expect(component.classId()).toBe(3);
    expect(component.periodId()).toBe(4);
    expect(api['evaluations']).toHaveBeenCalledWith(3, 4);
  });

  it('crée une évaluation puis ouvre sa feuille de notes', () => {
    component.openForm();
    expect(component.form.classSubjectTeacherId).toBe(9);
    component.form.title = 'Devoir 1';
    component.createEvaluation();
    expect(api['createEvaluation']).toHaveBeenCalledWith(3, expect.objectContaining({ periodId: 4, title: 'Devoir 1' }));
    expect(component.sheet()?.evaluation.id).toBe(7);
  });

  it('exige un motif quand une note existante est modifiée', () => {
    component.openSheet(7);
    component.values[1] = '15';
    component.saveSheet();
    expect(api['saveGrades']).not.toHaveBeenCalled();
    expect(component.error()).toContain('motif');

    component.reason = 'Erreur de saisie';
    component.saveSheet();
    expect(api['saveGrades']).toHaveBeenCalledWith(7, [
      { studentId: 1, value: 15 },
      { studentId: 2, value: null },
    ], 'Erreur de saisie');
  });

  it('refuse une note hors barème', () => {
    component.openSheet(7);
    component.values[2] = '25';
    component.saveSheet();
    expect(api['saveGrades']).not.toHaveBeenCalled();
    expect(component.error()).toContain('entre 0 et 20');
  });
});