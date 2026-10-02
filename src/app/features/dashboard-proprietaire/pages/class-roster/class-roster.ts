import { Component, inject, input, OnDestroy, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { catchError, forkJoin, of, Subscription } from 'rxjs';
import { AuthService, RegistrationSchool } from '../../../../core/auth';
import { ConfirmationService } from '../../../../shared/confirmation/confirmation.service';
import {
  AcademicYearRecord,
  ClassRecord,
  ClassRosterRow,
  CreateRosterStudentPayload,
  LevelRecord,
  OwnerManagementService,
  RosterParent,
} from '../../owner-management.service';

interface StudentEditForm {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  registrationNumber: string;
  birthDate: string;
  gender: string;
}

interface ParentEditForm {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

interface NewStudentForm {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  phone: string;
  registrationNumber: string;
  birthDate: string;
  gender: string;
}

@Component({
  selector: 'app-class-roster',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './class-roster.html',
  styleUrl: './class-roster.scss',
})
export class ClassRoster implements OnInit, OnDestroy {
  readonly scopeSchoolId = input<number | null>(null);
  private readonly auth = inject(AuthService);
  private readonly api = inject(OwnerManagementService);
  private readonly confirmation = inject(ConfirmationService);
  private request?: Subscription;
  private classRequest?: Subscription;

  readonly schools = signal<RegistrationSchool[]>([]);
  readonly selectedSchoolId = signal<number | null>(null);
  readonly classes = signal<ClassRecord[]>([]);
  readonly levels = signal<LevelRecord[]>([]);
  readonly years = signal<AcademicYearRecord[]>([]);
  readonly selectedClassId = signal<number | null>(null);
  readonly rows = signal<ClassRosterRow[]>([]);
  readonly loading = signal(true);
  readonly loadingRoster = signal(false);
  readonly saving = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);

  readonly editingStudentId = signal<number | null>(null);
  readonly editingParentId = signal<number | null>(null);
  readonly addingStudent = signal(false);
  readonly transferringStudentId = signal<number | null>(null);
  transferTargetId: number | null = null;
  studentForm: StudentEditForm = this.emptyStudentForm();
  parentForm: ParentEditForm = this.emptyParentForm();
  newStudentForm: NewStudentForm = this.emptyNewStudentForm();

  ngOnInit(): void {
    const ownerId = this.auth.user()?.id;
    if (!ownerId) {
      this.loading.set(false);
      this.errorMessage.set('Impossible d’identifier votre compte propriétaire.');
      return;
    }

    this.auth.getOwnedSchools(ownerId, 'STUDENTS').subscribe({
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
    this.request?.unsubscribe();
    this.classRequest?.unsubscribe();
  }

  onSchoolChange(event: Event): void {
    const id = Number((event.target as HTMLSelectElement).value);
    if (this.schools().some((item) => item.id === id)) this.selectSchool(id);
  }

  onClassChange(event: Event): void {
    const id = Number((event.target as HTMLSelectElement).value);
    if (this.classes().some((item) => item.id === id)) this.selectClass(id);
  }

  className(schoolClass: ClassRecord): string {
    const level = this.levels().find((item) => item.id === schoolClass.levelId);
    return level ? `${level.name} · ${schoolClass.name}` : schoolClass.name;
  }

  currentSchoolName(): string {
    return this.schools().find((s) => s.id === this.selectedSchoolId())?.name ?? '';
  }

  currentClassLabel(): string {
    const schoolClass = this.classes().find((c) => c.id === this.selectedClassId());
    return schoolClass ? this.className(schoolClass) : '';
  }

  printRoster(): void {
    window.print();
  }

  startEditStudent(row: ClassRosterRow): void {
    this.editingParentId.set(null);
    this.transferringStudentId.set(null);
    this.editingStudentId.set(row.studentId);
    this.studentForm = {
      firstName: row.firstName,
      lastName: row.lastName,
      email: row.email,
      phone: row.phone ?? '',
      registrationNumber: row.registrationNumber,
      birthDate: row.birthDate ?? '',
      gender: row.gender ?? '',
    };
    this.errorMessage.set(null);
  }

  startEditParent(parent: RosterParent): void {
    this.editingStudentId.set(null);
    this.transferringStudentId.set(null);
    this.editingParentId.set(parent.parentId);
    this.parentForm = {
      firstName: parent.firstName,
      lastName: parent.lastName,
      email: parent.email ?? '',
      phone: parent.phone ?? '',
    };
    this.errorMessage.set(null);
  }

  cancelEdit(): void {
    this.editingStudentId.set(null);
    this.editingParentId.set(null);
    this.transferringStudentId.set(null);
  }

  transferTargets(): ClassRecord[] {
    const currentId = this.selectedClassId();
    if (currentId === null) return [];
    return this.classes().filter((c) => c.id !== currentId);
  }

  transferTargetGroups(): { label: string; classes: ClassRecord[] }[] {
    const current = this.classes().find((c) => c.id === this.selectedClassId());
    const groups = new Map<number, ClassRecord[]>();
    for (const target of this.transferTargets()) {
      groups.set(target.academicYearId, [...(groups.get(target.academicYearId) ?? []), target]);
    }
    return [...groups.entries()]
      .sort(([a], [b]) => (a === current?.academicYearId ? -1 : b === current?.academicYearId ? 1 : a - b))
      .map(([yearId, items]) => ({
        label: this.years().find((y) => y.id === yearId)?.label ?? 'Année scolaire',
        classes: [...items].sort((x, y) => this.className(x).localeCompare(this.className(y))),
      }));
  }

  private transferLabel(target: ClassRecord): string {
    const year = this.years().find((y) => y.id === target.academicYearId)?.label;
    return year ? `${this.className(target)} (${year})` : this.className(target);
  }

  startTransfer(row: ClassRosterRow): void {
    this.cancelEdit();
    this.transferringStudentId.set(row.studentId);
    this.transferTargetId = this.transferTargetGroups()[0]?.classes[0]?.id ?? null;
    this.errorMessage.set(null);
    this.successMessage.set(null);
  }

  async confirmTransfer(row: ClassRosterRow): Promise<void> {
    const classId = this.selectedClassId();
    const target = this.transferTargets().find((c) => c.id === Number(this.transferTargetId));
    if (!classId || !target) {
      this.errorMessage.set('Veuillez choisir la classe de destination.');
      return;
    }
    const targetLabel = this.transferLabel(target);
    if (!await this.confirmation.confirm({
      title: 'Transférer cet élève ?',
      message: `${row.firstName} ${row.lastName} sera transféré(e) en ${targetLabel}. Sa fiche, ses notes, ses présences, ses paiements et ses parents sont conservés.`,
      confirmLabel: 'Transférer',
    })) return;
    this.saving.set(true);
    this.api.transferRosterStudent(classId, row.studentId, target.id).subscribe({
      next: () => {
        this.rows.update((rows) => rows.filter((r) => r.studentId !== row.studentId));
        this.saving.set(false);
        this.transferringStudentId.set(null);
        this.successMessage.set(`${row.firstName} ${row.lastName} a été transféré(e) en ${targetLabel}. Sa fiche est conservée.`);
      },
      error: (err) => this.fail(err?.error?.message ?? 'Le transfert de l’élève a échoué.'),
    });
  }

  openAddStudent(): void {
    this.cancelEdit();
    this.newStudentForm = this.emptyNewStudentForm();
    this.addingStudent.set(true);
    this.errorMessage.set(null);
  }

  cancelAddStudent(): void {
    this.addingStudent.set(false);
  }

  submitNewStudent(): void {
    const classId = this.selectedClassId();
    if (!classId || !this.newStudentForm.firstName.trim() || !this.newStudentForm.lastName.trim() ||
      !this.newStudentForm.email.trim() || !this.newStudentForm.password.trim() ||
      this.newStudentForm.password.trim().length < 8) {
      this.errorMessage.set('Veuillez remplir tous les champs obligatoires (mot de passe : 8 caractères minimum).');
      return;
    }
    this.saving.set(true);
    const payload: CreateRosterStudentPayload = {
      firstName: this.newStudentForm.firstName.trim(),
      lastName: this.newStudentForm.lastName.trim(),
      email: this.newStudentForm.email.trim(),
      password: this.newStudentForm.password.trim(),
      phone: this.newStudentForm.phone.trim() || null,
      registrationNumber: this.newStudentForm.registrationNumber.trim() || null,
      birthDate: this.newStudentForm.birthDate || null,
      gender: this.newStudentForm.gender || null,
    };
    this.api.createRosterStudent(classId, payload).subscribe({
      next: (created) => {
        this.rows.update((rows) => [...rows, created]);
        this.saving.set(false);
        this.addingStudent.set(false);
        this.successMessage.set('L’élève a été ajouté à la classe.');
      },
      error: (err) => this.fail(err?.error?.message ?? 'L’ajout de l’élève a échoué.'),
    });
  }

  saveStudent(studentId: number): void {
    const classId = this.selectedClassId();
    if (!classId || !this.studentForm.firstName.trim() || !this.studentForm.lastName.trim() ||
      !this.studentForm.email.trim() || !this.studentForm.registrationNumber.trim()) {
      return;
    }
    this.saving.set(true);
    this.api.updateRosterStudent(classId, studentId, {
      firstName: this.studentForm.firstName.trim(),
      lastName: this.studentForm.lastName.trim(),
      email: this.studentForm.email.trim(),
      phone: this.studentForm.phone.trim() || null,
      registrationNumber: this.studentForm.registrationNumber.trim(),
      birthDate: this.studentForm.birthDate || null,
      gender: this.studentForm.gender || null,
    }).subscribe({
      next: (updated) => {
        this.rows.update((rows) => rows.map((row) => (row.studentId === studentId ? updated : row)));
        this.saving.set(false);
        this.editingStudentId.set(null);
        this.successMessage.set('Les informations de l’élève ont été mises à jour.');
      },
      error: () => this.fail('La mise à jour de l’élève a échoué.'),
    });
  }

  async removeStudent(row: ClassRosterRow): Promise<void> {
    const classId = this.selectedClassId();
    if (!classId) return;
    if (!await this.confirmation.confirm({
      title: 'Supprimer cet élève définitivement ?',
      message: `Supprimer ${row.firstName} ${row.lastName} ainsi que son compte, ses notes, ses présences et ses paiements ?`,
      confirmLabel: 'Supprimer définitivement',
      destructive: true,
    })) return;
    this.saving.set(true);
    this.api.removeRosterStudent(classId, row.studentId).subscribe({
      next: () => {
        this.rows.update((rows) => rows.filter((r) => r.studentId !== row.studentId));
        this.saving.set(false);
        this.successMessage.set('L’élève a été supprimé de l’établissement.');
      },
      error: () => this.fail('La suppression de l’élève a échoué.'),
    });
  }

  saveParent(parentId: number, studentId: number): void {
    const classId = this.selectedClassId();
    if (!classId || !this.parentForm.firstName.trim() || !this.parentForm.lastName.trim()) {
      return;
    }
    this.saving.set(true);
    this.api.updateRosterParent(classId, parentId, {
      firstName: this.parentForm.firstName.trim(),
      lastName: this.parentForm.lastName.trim(),
      email: this.parentForm.email.trim() || null,
      phone: this.parentForm.phone.trim() || null,
    }).subscribe({
      next: (updated) => {
        this.rows.update((rows) => rows.map((row) => (row.studentId === studentId ? updated : row)));
        this.saving.set(false);
        this.editingParentId.set(null);
        this.successMessage.set('Les informations du parent ont été mises à jour.');
      },
      error: (err) => this.fail(err?.error?.message ?? 'La mise à jour du parent a échoué.'),
    });
  }

  private selectSchool(schoolId: number): void {
    this.request?.unsubscribe();
    this.selectedSchoolId.set(schoolId);
    localStorage.setItem('fasoecole_owner_school', String(schoolId));
    this.loading.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);
    this.rows.set([]);
    this.selectedClassId.set(null);

    this.request = forkJoin({
      classes: this.api.getClasses(schoolId),
      levels: this.api.getLevels(schoolId),
      years: this.api.getAcademicYears(schoolId).pipe(catchError(() => of([] as AcademicYearRecord[]))),
    }).subscribe({
      next: (data) => {
        this.classes.set(data.classes);
        this.levels.set(data.levels);
        this.years.set(data.years);
        this.loading.set(false);
        if (data.classes.length > 0) this.selectClass(data.classes[0].id);
      },
      error: () => {
        this.loading.set(false);
        this.errorMessage.set('Impossible de charger les classes de cet établissement.');
      },
    });
  }

  private selectClass(classId: number): void {
    this.classRequest?.unsubscribe();
    this.selectedClassId.set(classId);
    this.loadingRoster.set(true);
    this.errorMessage.set(null);
    this.cancelEdit();
    this.addingStudent.set(false);

    this.classRequest = this.api.getClassRoster(classId).subscribe({
      next: (rows) => {
        this.rows.set(rows);
        this.loadingRoster.set(false);
      },
      error: () => {
        this.loadingRoster.set(false);
        this.errorMessage.set('Impossible de charger les élèves de cette classe.');
      },
    });
  }

  private emptyStudentForm(): StudentEditForm {
    return { firstName: '', lastName: '', email: '', phone: '', registrationNumber: '', birthDate: '', gender: '' };
  }

  private emptyParentForm(): ParentEditForm {
    return { firstName: '', lastName: '', email: '', phone: '' };
  }

  private emptyNewStudentForm(): NewStudentForm {
    return {
      firstName: '', lastName: '', email: '', password: '', phone: '',
      registrationNumber: '', birthDate: '', gender: '',
    };
  }

  private fail(message: string): void {
    this.saving.set(false);
    this.errorMessage.set(message);
  }
}
