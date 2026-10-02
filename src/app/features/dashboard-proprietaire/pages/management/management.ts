import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, inject, input, OnDestroy, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { forkJoin, Observable, Subscription } from 'rxjs';
import { AuthService, RegistrationSchool } from '../../../../core/auth';
import { ConfirmationService } from '../../../../shared/confirmation/confirmation.service';
import { LEVEL_CATALOG, SuggestedLevel } from './level-catalog';
import {
  AcademicYearRecord,
  ClassRecord,
  FeeTypeRecord,
  LevelRecord,
  OwnerManagementService,
  SchoolRecord,
  StudentRecord,
  SubjectRecord,
  TeacherRecord,
} from '../../owner-management.service';

type Section = 'school' | 'academic' | 'fees' | 'people';
type AcademicKind = 'years' | 'levels' | 'classes' | 'subjects';
type AcademicRow = AcademicYearRecord | LevelRecord | ClassRecord | SubjectRecord;

interface AcademicForm {
  id: number | null;
  label: string;
  name: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  cycle: string;
  orderIndex: number;
  academicYearId: number | null;
  levelId: number | null;
  capacity: number;
  code: string;
  coefficient: number;
}

@Component({
  selector: 'app-owner-management',
  standalone: true,
  imports: [FormsModule, RouterLink, DatePipe, DecimalPipe],
  templateUrl: './management.html',
  styleUrl: './management.scss',
})
export class OwnerManagement implements OnDestroy, OnInit {
  readonly initialSection = input<Section>('school');
  readonly scopeSchoolId = input<number | null>(null);
  private readonly auth = inject(AuthService);
  private readonly api = inject(OwnerManagementService);
  private readonly confirmation = inject(ConfirmationService);
  private dataRequest?: Subscription;

  readonly sections: { id: Section; label: string }[] = [
    { id: 'school', label: 'Établissement' },
    { id: 'academic', label: 'Académique' },
    { id: 'fees', label: 'Frais scolaires' },
    { id: 'people', label: 'Effectifs' },
  ];
  readonly schools = signal<RegistrationSchool[]>([]);
  readonly selectedSchoolId = signal<number | null>(null);
  readonly section = signal<Section>('school');
  readonly school = signal<SchoolRecord | null>(null);
  readonly years = signal<AcademicYearRecord[]>([]);
  readonly levels = signal<LevelRecord[]>([]);
  readonly classes = signal<ClassRecord[]>([]);
  readonly subjects = signal<SubjectRecord[]>([]);
  readonly fees = signal<FeeTypeRecord[]>([]);
  readonly students = signal<StudentRecord[]>([]);
  readonly teachers = signal<TeacherRecord[]>([]);
  readonly academicKind = signal<AcademicKind>('years');
  readonly levelCatalog = LEVEL_CATALOG;
  readonly activatingLevel = signal(false);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly editorOpen = signal(false);
  readonly academicError = signal<string | null>(null);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);

  schoolForm = { name: '', type: '', address: '', phone: '', email: '' };
  academicForm: AcademicForm = this.emptyAcademicForm();
  feeForm: { id: number | null; name: string; amount: number; frequency: FeeTypeRecord['frequency'];
    levelId?: number | null; description?: string | null } = {
    id: null,
    name: '',
    amount: 0,
    frequency: 'YEARLY',
  };

  ngOnInit(): void {
    this.section.set(this.initialSection());
    const ownerId = this.auth.user()?.id;
    if (!ownerId) {
      this.loading.set(false);
      this.errorMessage.set('Impossible d’identifier votre compte propriétaire.');
      return;
    }

    this.auth.getOwnedSchools(ownerId, 'MANAGEMENT').subscribe({
      next: (schools) => {
        if (this.scopeSchoolId() !== null) schools = schools.filter(school => school.id === this.scopeSchoolId());
        this.schools.set(schools);
        if (schools.length === 0) {
          this.loading.set(false);
          return;
        }
        const storedId = Number(localStorage.getItem('fasoecole_owner_school'));
        const selected = schools.find((item) => item.id === storedId) ?? schools[0];
        this.selectSchool(selected.id);
      },
      error: () => {
        this.loading.set(false);
        this.errorMessage.set('Impossible de charger vos établissements.');
      },
    });
  }

  ngOnDestroy(): void {
    this.dataRequest?.unsubscribe();
  }

  onSchoolChange(event: Event): void {
    const id = Number((event.target as HTMLSelectElement).value);
    if (this.schools().some((item) => item.id === id)) this.selectSchool(id);
  }

  selectSection(section: Section): void {
    this.section.set(section);
    this.cancelEdit();
  }

  setAcademicKind(kind: AcademicKind): void {
    this.academicKind.set(kind);
    this.cancelEdit();
  }

  get academicRows(): AcademicRow[] {
    switch (this.academicKind()) {
      case 'years': return this.years();
      case 'levels': return this.levels();
      case 'classes': return this.classes();
      case 'subjects': return this.subjects();
    }
  }

  academicTitle(): string {
    const labels: Record<AcademicKind, string> = {
      years: 'Années scolaires',
      levels: 'Niveaux et cycles',
      classes: 'Classes',
      subjects: 'Matières',
    };
    return labels[this.academicKind()];
  }

  academicDescription(row: AcademicRow): string {
    switch (this.academicKind()) {
      case 'years': {
        const year = row as AcademicYearRecord;
        return `${year.startDate} – ${year.endDate}${year.isCurrent ? ' · Année en cours' : ''}`;
      }
      case 'levels': {
        const level = row as LevelRecord;
        return `${level.cycle || 'Cycle non défini'} · Ordre ${level.orderIndex}`;
      }
      case 'classes': {
        const schoolClass = row as ClassRecord;
        return `${this.levelName(schoolClass.levelId)} · ${this.yearName(schoolClass.academicYearId)} · ${schoolClass.capacity} places`;
      }
      case 'subjects': {
        const subject = row as SubjectRecord;
        return `${subject.code || 'Aucun code'} · Coefficient ${subject.coefficient ?? 1}`;
      }
    }
  }

  academicName(row: AcademicRow): string {
    switch (this.academicKind()) {
      case 'years': return (row as AcademicYearRecord).label;
      case 'levels': return (row as LevelRecord).name;
      case 'classes': return (row as ClassRecord).name;
      case 'subjects': return (row as SubjectRecord).name;
    }
  }

  suggestedCycles(): typeof LEVEL_CATALOG {
    return this.levelCatalog.filter(group => group.schoolTypes.includes(this.school()?.type ?? ''));
  }

  isSuggestedCycle(cycle: string): boolean {
    return this.suggestedCycles().some(group => group.cycle === cycle);
  }

  levelExists(suggestion: SuggestedLevel): boolean {
    return this.levels().some(level =>
      level.cycle.trim().toLocaleLowerCase() === suggestion.cycle.toLocaleLowerCase() &&
      level.name.trim().toLocaleLowerCase() === suggestion.name.toLocaleLowerCase());
  }

  activateLevel(suggestion: SuggestedLevel): void {
    const schoolId = this.selectedSchoolId();
    if (!schoolId || this.activatingLevel() || this.levelExists(suggestion)) return;
    this.activatingLevel.set(true);
    this.api.saveLevel({ schoolId, ...suggestion }).subscribe({
      next: level => {
        if (this.selectedSchoolId() === schoolId) {
          this.levels.update(levels => [...levels, level].sort((a, b) => a.orderIndex - b.orderIndex));
          this.successMessage.set(`Niveau « ${level.name} » ajouté.`);
        }
        this.activatingLevel.set(false);
      },
      error: err => {
        this.activatingLevel.set(false);
        this.errorMessage.set(err?.error?.message ?? 'Impossible d’ajouter ce niveau.');
      },
    });
  }

  selectSuggestedCycle(cycle: string): void {
    this.academicForm.cycle = cycle === 'PERSONNALISE' ? '' : cycle;
  }

  editAcademic(row?: AcademicRow): void {
    const schoolId = this.selectedSchoolId();
    if (!schoolId) {
      this.errorMessage.set('Sélectionnez un établissement avant de créer une donnée académique.');
      return;
    }
    this.academicForm = this.emptyAcademicForm();
    if (row) {
      this.academicForm.id = row.id;
      switch (this.academicKind()) {
        case 'years': {
          const year = row as AcademicYearRecord;
          Object.assign(this.academicForm, { label: year.label, startDate: year.startDate, endDate: year.endDate, isCurrent: year.isCurrent });
          break;
        }
        case 'levels': {
          const level = row as LevelRecord;
          Object.assign(this.academicForm, { name: level.name, cycle: level.cycle, orderIndex: level.orderIndex });
          break;
        }
        case 'classes': {
          const schoolClass = row as ClassRecord;
          Object.assign(this.academicForm, { name: schoolClass.name, academicYearId: schoolClass.academicYearId, levelId: schoolClass.levelId, capacity: schoolClass.capacity });
          break;
        }
        case 'subjects': {
          const subject = row as SubjectRecord;
          Object.assign(this.academicForm, { name: subject.name, code: subject.code, coefficient: subject.coefficient ?? 1 });
          break;
        }
      }
    }
    this.editorOpen.set(true);
    this.academicError.set(null);
    this.errorMessage.set(null);
  }

  saveAcademic(): void {
    const schoolId = this.selectedSchoolId();
    if (!schoolId) {
      this.academicError.set('Sélectionnez un établissement avant d’enregistrer.');
      return;
    }
    const validationError = this.academicFormError();
    if (validationError) {
      this.academicError.set(validationError);
      return;
    }
    this.academicError.set(null);
    const { id } = this.academicForm;
    this.saving.set(true);
    let request: Observable<AcademicYearRecord | LevelRecord | ClassRecord | SubjectRecord>;
    switch (this.academicKind()) {
      case 'years':
        request = this.api.saveAcademicYear({
          schoolId,
          label: this.academicForm.label.trim(),
          startDate: this.academicForm.startDate,
          endDate: this.academicForm.endDate,
          isCurrent: this.academicForm.isCurrent,
        }, id ?? undefined);
        break;
      case 'levels':
        request = this.api.saveLevel({
          schoolId,
          name: this.academicForm.name.trim(),
          cycle: this.academicForm.cycle.trim(),
          orderIndex: Number(this.academicForm.orderIndex),
        }, id ?? undefined);
        break;
      case 'classes':
        request = this.api.saveClass({
          schoolId,
          academicYearId: Number(this.academicForm.academicYearId),
          levelId: Number(this.academicForm.levelId),
          name: this.academicForm.name.trim(),
          capacity: Number(this.academicForm.capacity),
        }, id ?? undefined);
        break;
      case 'subjects':
        request = this.api.saveSubject({
          schoolId,
          name: this.academicForm.name.trim(),
          code: this.academicForm.code.trim(),
          coefficient: Number(this.academicForm.coefficient),
        }, id ?? undefined);
        break;
    }
    request.subscribe({
      next: () => {
        this.saving.set(false);
        this.editorOpen.set(false);
        this.academicError.set(null);
        this.successMessage.set('Les informations académiques ont été enregistrées.');
        if (this.selectedSchoolId() === schoolId) this.loadData(schoolId);
      },
      error: () => {
        this.saving.set(false);
        this.academicError.set('Enregistrement impossible. Vérifiez les informations et réessayez.');
      },
    });
  }

  async deleteAcademic(row: AcademicRow): Promise<void> {
    const kind = this.academicKind();
    if (!await this.confirmation.confirm({
      title: 'Supprimer cet élément ?',
      message: `Supprimer « ${this.academicName(row)} » ?`,
      confirmLabel: 'Supprimer',
      destructive: true,
    })) return;
    let request: Observable<void>;
    switch (kind) {
      case 'years': request = this.api.deleteAcademicYear(row.id); break;
      case 'levels': request = this.api.deleteLevel(row.id); break;
      case 'classes': request = this.api.deleteClass(row.id); break;
      case 'subjects': request = this.api.deleteSubject(row.id); break;
    }
    request.subscribe({
      next: () => {
        this.successMessage.set('Élément supprimé.');
        const schoolId = this.selectedSchoolId();
        if (schoolId) this.loadData(schoolId);
      },
      error: () => this.fail('Suppression impossible. Cet élément est peut-être déjà utilisé.'),
    });
  }

  editFee(fee?: FeeTypeRecord): void {
    this.feeForm = fee
      ? { id: fee.id, name: fee.name, amount: fee.amount, frequency: fee.frequency,
        levelId: fee.levelId, description: fee.description }
      : { id: null, name: '', amount: 0, frequency: 'YEARLY' };
    this.editorOpen.set(true);
    this.errorMessage.set(null);
  }

  saveFee(): void {
    const schoolId = this.selectedSchoolId();
    if (!schoolId || !this.feeForm.name.trim() || this.feeForm.amount <= 0) return;
    this.saving.set(true);
    this.api.saveFeeType({
      schoolId,
      name: this.feeForm.name.trim(),
      amount: Number(this.feeForm.amount),
      frequency: this.feeForm.frequency,
      levelId: this.feeForm.levelId,
      description: this.feeForm.description,
    }, this.feeForm.id ?? undefined).subscribe({
      next: () => {
        this.saving.set(false);
        this.editorOpen.set(false);
        this.successMessage.set('Le tarif a été enregistré.');
        if (this.selectedSchoolId() === schoolId) this.loadData(schoolId);
      },
      error: () => this.fail('Enregistrement du tarif impossible.'),
    });
  }

  saveSchool(): void {
    const current = this.school();
    if (!current || !this.schoolForm.name.trim()) return;
    this.saving.set(true);
    this.api.updateSchool({
      ...current,
      name: this.schoolForm.name.trim(),
      type: this.schoolForm.type,
      address: this.schoolForm.address.trim() || null,
      phone: this.schoolForm.phone.trim() || null,
      email: this.schoolForm.email.trim() || null,
    }).subscribe({
      next: (school) => {
        this.school.set(school);
        this.saving.set(false);
        this.successMessage.set('Les coordonnées de l’établissement ont été mises à jour.');
      },
      error: () => this.fail('La mise à jour de l’établissement a échoué.'),
    });
  }

  async deleteFee(fee: FeeTypeRecord): Promise<void> {
    if (!await this.confirmation.confirm({
      title: 'Supprimer ce type de frais ?',
      message: `Supprimer le frais « ${fee.name} » ?`,
      confirmLabel: 'Supprimer',
      destructive: true,
    })) return;
    this.api.deleteFeeType(fee.id).subscribe({
      next: (res) => {
        this.successMessage.set(res.deleted ? 'Frais supprimé.' : 'Frais archivé : il a déjà été facturé.');
        const schoolId = this.selectedSchoolId();
        if (schoolId) this.loadData(schoolId);
      },
      error: () => this.fail('Suppression impossible. Ce frais est peut-être déjà facturé.'),
    });
  }

  cancelEdit(): void {
    this.editorOpen.set(false);
    this.academicError.set(null);
  }

  levelName(id: number): string {
    return this.levels().find((level) => level.id === id)?.name ?? 'Niveau';
  }

  yearName(id: number): string {
    return this.years().find((year) => year.id === id)?.label ?? 'Année';
  }

  frequencyLabel(frequency: FeeTypeRecord['frequency']): string {
    const labels: Record<FeeTypeRecord['frequency'], string> = {
      ONE_TIME: 'Unique',
      MONTHLY: 'Mensuel',
      TERM: 'Trimestriel',
      YEARLY: 'Annuel',
    };
    return labels[frequency];
  }

  typeLabel(type: string): string {
    const labels: Record<string, string> = {
      PRIMAIRE: 'École primaire',
      PRESCOLAIRE: 'Établissement préscolaire',
      SECONDAIRE: 'Établissement secondaire',
      MIXTE: 'Établissement mixte',
      UNIVERSITE: 'Université',
      FORMATION: 'Centre de formation',
    };
    return labels[type] ?? type;
  }

  private selectSchool(schoolId: number): void {
    this.dataRequest?.unsubscribe();
    this.selectedSchoolId.set(schoolId);
    localStorage.setItem('fasoecole_owner_school', String(schoolId));
    this.loading.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);
    this.loadData(schoolId);
  }

  private loadData(schoolId: number): void {
    this.dataRequest?.unsubscribe();
    this.dataRequest = forkJoin({
      school: this.api.getSchool(schoolId),
      years: this.api.getAcademicYears(schoolId),
      levels: this.api.getLevels(schoolId),
      classes: this.api.getClasses(schoolId),
      subjects: this.api.getSubjects(schoolId),
      fees: this.api.getFeeTypes(schoolId),
      students: this.api.getStudents(schoolId),
      teachers: this.api.getTeachers(schoolId),
    }).subscribe({
      next: (data) => {
        this.school.set(data.school);
        this.schoolForm = {
          name: data.school.name,
          type: data.school.type,
          address: data.school.address ?? '',
          phone: data.school.phone ?? '',
          email: data.school.email ?? '',
        };
        this.years.set(data.years);
        this.levels.set(data.levels);
        this.classes.set(data.classes);
        this.subjects.set(data.subjects);
        this.fees.set(data.fees);
        this.students.set(data.students);
        this.teachers.set(data.teachers);
        this.loading.set(false);
      },
      error: () => this.fail('Certaines données de cet établissement n’ont pas pu être chargées.'),
    });
  }

  private academicFormError(): string | null {
    switch (this.academicKind()) {
      case 'years':
        if (!this.academicForm.label.trim()) return 'Indiquez le nom de l’année scolaire.';
        if (!this.academicForm.startDate || !this.academicForm.endDate) {
          return 'Indiquez les dates de début et de fin de l’année scolaire.';
        }
        return this.academicForm.startDate <= this.academicForm.endDate
          ? null : 'La date de fin doit être postérieure ou égale à la date de début.';
      case 'levels':
        return this.academicForm.name.trim() && this.academicForm.cycle.trim()
          ? null : 'Indiquez le nom et le cycle du niveau.';
      case 'classes':
        return this.academicForm.name.trim() && this.academicForm.academicYearId &&
          this.academicForm.levelId && this.academicForm.capacity > 0
          ? null : 'Indiquez le nom, l’année scolaire, le niveau et une capacité positive.';
      case 'subjects': {
        if (!this.academicForm.name.trim()) return 'Indiquez le nom de la matière.';
        const coefficient = Number(this.academicForm.coefficient);
        return coefficient >= 0.25 && coefficient <= 20 ? null : 'Le coefficient doit être compris entre 0,25 et 20.';
      }
    }
  }

  private emptyAcademicForm(): AcademicForm {
    return {
      id: null,
      label: '',
      name: '',
      startDate: '',
      endDate: '',
      isCurrent: false,
      cycle: '',
      orderIndex: 1,
      academicYearId: null,
      levelId: null,
      capacity: 30,
      code: '',
      coefficient: 1,
    };
  }

  private fail(message: string): void {
    this.loading.set(false);
    this.saving.set(false);
    this.errorMessage.set(message);
  }
}
