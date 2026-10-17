import { ModuleHelpButton } from '../../../../shared/help/module-help-button';
import { TooltipModule } from 'primeng/tooltip';
import { DateField } from '../../../../shared/ui/date-field';
import { LucideEye, LucidePencil, LucidePower, LucideRotateCcw, LucideTrash2 } from '@lucide/angular';
import { SelectField } from '../../../../shared/ui/select-field';
import { SelectOption } from '../../../../shared/ui/select-field';
import { LoadingState } from '../../../../shared/ui/loading-state';
import { InputTextModule } from 'primeng/inputtext';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { RosterImport } from '../../roster-import';
import { FormValidationDirective } from '../../../../shared/form-validation.directive';
import { NgTemplateOutlet } from '@angular/common';
import { Component, effect, inject, input, OnDestroy, OnInit, signal } from '@angular/core';
import { PayrollOverview, PayrollService, SalaryContract } from '../../payroll.service';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { forkJoin, Subscription } from 'rxjs';
import { AuthService, RegistrationSchool } from '../../../../core/auth';
import { ClassRecord, LevelRecord, OwnerManagementService, SubjectRecord, TeacherRecord } from '../../owner-management.service';
import { TeacherCard, TeacherWorkService } from '../../teacher-work.service';
import { SchoolDataSyncService } from '../../../../shared/school-data-sync.service';
import { ConfirmationService } from '../../../../shared/confirmation/confirmation.service';

@Component({
  selector: 'app-teacher-roster',
  standalone: true,
  imports: [ModuleHelpButton, TooltipModule, LucideEye, LucidePencil, LucidePower, LucideRotateCcw, LucideTrash2, DateField, SelectField, SelectOption, LoadingState, InputTextModule, ButtonModule, MessageModule, RosterImport, FormValidationDirective, FormsModule, RouterLink, NgTemplateOutlet],
  templateUrl: './teacher-roster.html',
  styleUrl: './teacher-roster.scss',
})
export class TeacherRoster implements OnInit, OnDestroy {
  private readonly payroll = inject(PayrollService);
  private payrollRequest?: Subscription;
  readonly salaryMonth = signal(new Date().toLocaleDateString('en-CA').slice(0, 7));
  readonly payrollOverview = signal<PayrollOverview | null>(null);
  readonly payrollError = signal('');
  constructor() { effect(() => this.refreshPayroll()); }
  refreshPayroll(): void {
    const school = this.selectedSchoolId(), month = this.salaryMonth();
    this.payrollRequest?.unsubscribe(); this.payrollOverview.set(null); this.payrollError.set('');
    if (!school || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return;
    this.payrollRequest = this.payroll.overview(school, month).subscribe({
      next: result => this.payrollOverview.set(result),
      error: () => this.payrollError.set('Salaires indisponibles. Vérifiez votre accès au module Salaires ou réessayez.'),
    });
  }
  salary(teacherId: number): SalaryContract | undefined {
    return this.payrollOverview()?.employees.flatMap(employee => employee.contracts).find(contract => contract.key === `teacher:${teacherId}`);
  }
  money(value: number): string { return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(value) + ' FCFA'; }
  readonly scopeSchoolId = input<number | null>(null);
  private readonly sync = inject(SchoolDataSyncService);
  private syncSubscription?: Subscription;
  private readonly auth = inject(AuthService);
  private readonly management = inject(OwnerManagementService);
  private readonly teacherWork = inject(TeacherWorkService);
  private readonly confirmation = inject(ConfirmationService);
  private schoolRequest?: Subscription;
  private classRequest?: Subscription;
  private candidatesRequest?: Subscription;
  private allTeachersRequest?: Subscription;
  private editRequest?: Subscription;
  private editSaveRequest?: Subscription;
  private candidateSchoolIds = new Set<number>();

  readonly schools = signal<RegistrationSchool[]>([]);
  readonly selectedSchoolId = signal<number | null>(null);
  readonly classes = signal<ClassRecord[]>([]);
  readonly levels = signal<LevelRecord[]>([]);
  readonly subjects = signal<SubjectRecord[]>([]);
  readonly selectedClassId = signal<number | null>(null);
  readonly teachers = signal<TeacherCard[]>([]);
  readonly candidates = signal<TeacherCard[]>([]);
  readonly allTeachers = signal<TeacherCard[]>([]);
  readonly showAllTeachers = signal(false);
  readonly loadingAllTeachers = signal(false);
  readonly loading = signal(true);
  readonly loadingTeachers = signal(false);
  readonly saving = signal(false);
  readonly assigningTeacher = signal(false);
  readonly editingTeacher = signal<TeacherRecord | null>(null);
  readonly loadingEditor = signal(false);
  editingTeacherName = '';
  teacherEditForm = { specialty: '', hireDate: '' };
  readonly error = signal<string | null>(null);
  readonly success = signal<string | null>(null);

  assignment = { teacherId: 0, subjectId: 0 };
  assignmentSubjectIds: number[] = [];

  teachingSubjectsLabel(teacher: TeacherCard): string {
    return teacher.teachingSubjects?.map(subject => subject.name).join(', ') || teacher.subjects.join(', ');
  }

  toggleSubject(id: number, checked: boolean): void {
    this.assignmentSubjectIds = checked ? [...new Set([...this.assignmentSubjectIds, id])]
      : this.assignmentSubjectIds.filter(value => value !== id);
  }

  chooseAssignmentTeacher(id: number): void {
    this.assignment.teacherId = id;
    const teacher = this.candidates().find(item => item.id === id);
    this.assignmentSubjectIds = this.subjects().filter(subject => teacher?.teachingSubjects?.some(item =>
      (teacher.schoolId === this.selectedSchoolId() && item.id === subject.id) || item.name.localeCompare(subject.name, 'fr', { sensitivity: 'base' }) === 0))
      .map(subject => subject.id);
  }

  ngOnInit(): void {
    const ownerId = this.auth.user()?.id;
    if (!ownerId) {
      this.loading.set(false);
      this.error.set('Impossible d’identifier votre compte propriétaire.');
      return;
    }
    this.auth.getOwnedSchools(ownerId, 'TEACHERS', this.scopeSchoolId()).subscribe({
      next: schools => {
        // Preserve the owner's other schools when this wizard is scoped to a new school.
        this.candidateSchoolIds = new Set(schools.map(school => school.id));
        if (this.scopeSchoolId() !== null) schools = schools.filter(school => school.id === this.scopeSchoolId());
        this.schools.set(schools);
        if (!schools.length) {
          this.loading.set(false);
          return;
        }
        const stored = Number(localStorage.getItem('fasoecole_owner_school'));
        this.selectSchool(schools.find(school => school.id === stored)?.id ?? schools[0].id);
      },
      error: () => {
        this.loading.set(false);
        this.error.set('Impossible de charger vos établissements.');
      },
    });
  }

  importCompleted(): void {
    this.refreshPayroll();
    if (this.showAllTeachers()) this.refreshAllTeachers();
    const id = this.selectedClassId();
    if (id) this.selectClass(id);
  }

  ngOnDestroy(): void {
    this.payrollRequest?.unsubscribe();
    this.editRequest?.unsubscribe();
    this.editSaveRequest?.unsubscribe();
    this.syncSubscription?.unsubscribe();
    this.schoolRequest?.unsubscribe();
    this.classRequest?.unsubscribe();
    this.candidatesRequest?.unsubscribe();
    this.allTeachersRequest?.unsubscribe();
  }

  changeSchool(event: Event): void {
    const id = Number((event.target as HTMLSelectElement).value);
    if (this.schools().some(school => school.id === id)) this.selectSchool(id);
  }

  changeClass(event: Event): void {
    const id = Number((event.target as HTMLSelectElement).value);
    if (this.classes().some(schoolClass => schoolClass.id === id)) this.selectClass(id);
  }

  classLabel(schoolClass: ClassRecord): string {
    const level = this.levels().find(item => item.id === schoolClass.levelId);
    return level ? `${level.name} · ${schoolClass.name}` : schoolClass.name;
  }

  openAssignment(): void {
    this.cancelForms();
    this.assigningTeacher.set(true);
    this.assignment = { teacherId: this.candidates()[0]?.id ?? 0, subjectId: 0 };
    this.chooseAssignmentTeacher(this.assignment.teacherId);
    this.error.set(null);
  }

  cancelForms(): void {
    this.editRequest?.unsubscribe();
    this.loadingEditor.set(false);
    this.editingTeacher.set(null);
    this.assigningTeacher.set(false);
  }

  startEditTeacher(teacher: TeacherCard): void {
    if (this.saving()) return;
    this.cancelForms();
    this.error.set(null);
    this.success.set(null);
    this.editingTeacherName = `${teacher.firstName} ${teacher.lastName}`;
    this.loadingEditor.set(true);
    this.editRequest = this.management.getTeacher(teacher.id).subscribe({
      next: record => {
        this.teacherEditForm = { specialty: record.specialty ?? '', hireDate: record.hireDate ?? '' };
        this.editingTeacher.set(record);
        this.loadingEditor.set(false);
      },
      error: () => {
        this.loadingEditor.set(false);
        this.error.set('Impossible de charger les informations de cet enseignant.');
      },
    });
  }

  saveTeacherEdit(): void {
    const record = this.editingTeacher();
    if (!record || this.saving()) return;
    this.saving.set(true);
    this.error.set(null);
    this.editSaveRequest = this.management.updateTeacher(record.id, {
      specialty: this.teacherEditForm.specialty.trim() || null,
      hireDate: this.teacherEditForm.hireDate || null,
    }).subscribe({
      next: updated => {
        const replace = (rows: TeacherCard[]) => rows.map(teacher => teacher.id === updated.id
          ? { ...teacher, specialty: updated.specialty } : teacher);
        this.teachers.update(replace);
        this.allTeachers.update(replace);
        this.candidates.update(replace);
        this.saving.set(false);
        this.cancelForms();
        this.success.set('Les informations de l’enseignant ont été mises à jour.');
      },
      error: err => {
        this.saving.set(false);
        this.error.set(err?.error?.message ?? 'Impossible de modifier cet enseignant.');
      },
    });
  }

  async setTeacherActive(teacher: TeacherCard, active: boolean): Promise<void> {
    const classId = this.selectedClassId();
    if (!classId || this.saving()) return;
    const name = `${teacher.firstName} ${teacher.lastName}`;
    const confirmed = await this.confirmation.confirm(active ? {
      title: 'Réactiver cet enseignant ?',
      message: `${name} sera de nouveau actif dans cette classe. Ajoutez ensuite ses créneaux depuis sa fiche.`,
      confirmLabel: 'Réactiver',
    } : {
      title: 'Désactiver cet enseignant dans cette classe ?',
      message: `${name} restera visible avec le statut « Désactivé » et sa fiche est conservée. Ses créneaux en cours dans cette classe seront terminés.`,
      confirmLabel: 'Désactiver',
      destructive: true,
    });
    if (!confirmed) return;
    this.saving.set(true);
    this.error.set(null);
    this.success.set(null);
    this.teacherWork.setClassTeacherActive(classId, teacher.id, active).subscribe({
      next: () => {
        this.saving.set(false);
        this.success.set(active ? `${name} est réactivé dans cette classe.` : `${name} est désactivé dans cette classe.`);
        this.selectClass(classId);
        this.refreshAllTeachers();
      },
      error: err => {
        this.saving.set(false);
        this.error.set(err?.error?.message ?? 'Impossible de modifier le statut de cet enseignant.');
      },
    });
  }

  async deleteTeacher(teacher: TeacherCard): Promise<void> {
    const classId = this.selectedClassId();
    if (!classId || this.saving()) return;
    const name = `${teacher.firstName} ${teacher.lastName}`;
    if (!await this.confirmation.confirm({
      title: 'Supprimer cet enseignant ?',
      message: `${name} sera définitivement supprimé de l’établissement, avec ses affectations dans toutes les classes et ses données associées. Cette action ne retire pas uniquement son affectation à cette classe.`,
      confirmLabel: 'Supprimer définitivement',
      destructive: true,
    })) return;
    if (this.saving() || this.selectedClassId() !== classId) return;
    this.saving.set(true);
    this.error.set(null);
    this.success.set(null);
    this.management.deleteTeacher(teacher.id).subscribe({
      next: () => {
        this.saving.set(false);
        if (this.selectedClassId() === classId) {
          this.success.set(`${name} a été supprimé.`);
          this.selectClass(classId);
        }
        this.refreshAllTeachers();
      },
      error: err => {
        this.saving.set(false);
        this.error.set(err?.error?.message ?? 'Impossible de supprimer cet enseignant.');
      },
    });
  }

  toggleAllTeachers(): void {
    const schoolId = this.selectedSchoolId();
    if (this.showAllTeachers() || !schoolId) {
      this.showAllTeachers.set(false);
      return;
    }
    this.showAllTeachers.set(true);
    this.loadAllTeachers(schoolId);
  }

  private refreshAllTeachers(): void {
    const schoolId = this.selectedSchoolId();
    if (this.showAllTeachers() && schoolId) this.loadAllTeachers(schoolId);
  }

  private loadAllTeachers(schoolId: number): void {
    this.allTeachersRequest?.unsubscribe();
    this.loadingAllTeachers.set(true);
    this.allTeachersRequest = this.teacherWork.teachersBySchool(schoolId).subscribe({
      next: teachers => {
        this.allTeachers.set(teachers);
        this.loadingAllTeachers.set(false);
      },
      error: () => {
        this.loadingAllTeachers.set(false);
        this.error.set('Impossible de charger les enseignants de l’établissement.');
      },
    });
  }

  resendInvitation(userId: number): void {
    if (this.saving()) return;
    this.saving.set(true);
    this.error.set(null);
    this.success.set(null);
    this.auth.resendUserInvitation(userId).subscribe({
      next: result => {
        this.saving.set(false);
        this.success.set(result.emailSent ? 'Lien envoyé au titulaire du compte.' : null);
        this.error.set(result.emailSent ? null : 'L’envoi du courriel a échoué. Réessayez ultérieurement.');
        this.refreshAllTeachers();
        const classId = this.selectedClassId();
        if (classId) this.selectClass(classId);
      },
      error: err => { this.saving.set(false); this.error.set(err?.error?.message ?? 'Impossible de renvoyer le lien.'); },
    });
  }

  saveAssignment(): void {
    if (this.saving()) return;
    const classId = this.selectedClassId();
    const subjectIds = this.assignmentSubjectIds.length ? this.assignmentSubjectIds : (this.assignment.subjectId ? [this.assignment.subjectId] : []);
    if (!classId || !this.candidates().some(teacher => teacher.id === this.assignment.teacherId) ||
        !subjectIds.length || subjectIds.some(id => !this.subjects().some(subject => subject.id === id))) {
      this.error.set('Sélectionnez un enseignant disponible et au moins une matière de cet établissement.');
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    this.teacherWork.assignTeacher(classId, this.assignment.teacherId, subjectIds).subscribe({
      next: () => {
        this.saving.set(false);
        this.cancelForms();
        this.success.set('Enseignant affecté à la classe.');
        this.selectClass(classId);
        this.refreshAllTeachers();
      },
      error: err => {
        this.saving.set(false);
        this.error.set(err?.error?.message ?? 'Impossible d’affecter cet enseignant.');
      },
    });
  }

  private selectSchool(schoolId: number): void {
    this.syncSubscription?.unsubscribe();
    this.syncSubscription = this.sync.watch(schoolId).subscribe(() => {
      this.refreshPayroll();
      const id = this.selectedClassId();
      if (this.loading() || this.loadingTeachers() || !id) return;
      this.classRequest?.unsubscribe();
      this.classRequest = this.teacherWork.teachersByClass(id).subscribe({next: rows => this.teachers.set(rows)});
      if (this.showAllTeachers()) this.refreshAllTeachers();
    });
    this.schoolRequest?.unsubscribe();
    this.classRequest?.unsubscribe();
    this.candidatesRequest?.unsubscribe();
    this.selectedSchoolId.set(schoolId);

    this.classes.set([]);
    this.subjects.set([]);
    this.teachers.set([]);
    this.candidates.set([]);
    this.allTeachers.set([]);
    this.showAllTeachers.set(false);
    this.allTeachersRequest?.unsubscribe();
    this.selectedClassId.set(null);
    this.cancelForms();
    this.error.set(null);
    this.loading.set(true);
    this.schoolRequest = forkJoin({
      classes: this.management.getClasses(schoolId),
      levels: this.management.getLevels(schoolId),
      subjects: this.management.getSubjects(schoolId),
    }).subscribe({
      next: ({ classes, levels, subjects }) => {
        if (this.selectedSchoolId() !== schoolId) return;
        this.classes.set(classes);
        this.levels.set(levels);
        this.subjects.set(subjects);
        this.loading.set(false);
        if (classes.length) this.selectClass(classes[0].id);
      },
      error: () => {
        this.loading.set(false);
        this.error.set('Impossible de charger les classes de cet établissement.');
      },
    });
  }

  private selectClass(classId: number): void {
    this.classRequest?.unsubscribe();
    this.candidatesRequest?.unsubscribe();
    this.selectedClassId.set(classId);
    this.teachers.set([]);
    this.candidates.set([]);
    this.cancelForms();
    this.loadingTeachers.set(true);
    this.error.set(null);
    this.classRequest = this.teacherWork.teachersByClass(classId).subscribe({
      next: teachers => {
        this.teachers.set(teachers);
        this.loadingTeachers.set(false);
      },
      error: () => {
        this.loadingTeachers.set(false);
        this.error.set('Impossible de charger les enseignants de cette classe.');
      },
    });
    this.candidatesRequest = this.teacherWork.candidatesByClass(classId).subscribe({
      next: teachers => this.candidates.set(teachers.filter(teacher => this.candidateSchoolIds.has(teacher.schoolId))),
      error: () => this.error.set('Impossible de charger les enseignants disponibles pour cette classe.'),
    });
  }
}
