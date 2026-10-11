import { RosterImport } from '../../roster-import';
import { FormValidationDirective } from '../../../../shared/form-validation.directive';
import { NgTemplateOutlet } from '@angular/common';
import { Component, inject, input, OnDestroy, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { forkJoin, Subscription } from 'rxjs';
import { AuthService, RegistrationSchool } from '../../../../core/auth';
import { ClassRecord, LevelRecord, OwnerManagementService, SubjectRecord } from '../../owner-management.service';
import { TeacherCard, TeacherWorkService } from '../../teacher-work.service';
import { SchoolDataSyncService } from '../../../../shared/school-data-sync.service';
import { ConfirmationService } from '../../../../shared/confirmation/confirmation.service';

@Component({
  selector: 'app-teacher-roster',
  standalone: true,
  imports: [RosterImport, FormValidationDirective, FormsModule, RouterLink, NgTemplateOutlet],
  templateUrl: './teacher-roster.html',
  styleUrl: './teacher-roster.scss',
})
export class TeacherRoster implements OnInit, OnDestroy {
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
  readonly addingTeacher = signal(false);
  readonly assigningTeacher = signal(false);
  readonly error = signal<string | null>(null);
  readonly success = signal<string | null>(null);

  newTeacher = { firstName: '', lastName: '', email: '', phone: '',
    employeeNumber: '', specialty: '', hireDate: '', monthlySalary: null as number | null, subjectId: 0 };
  assignment = { teacherId: 0, subjectId: 0 };

  ngOnInit(): void {
    const ownerId = this.auth.user()?.id;
    if (!ownerId) {
      this.loading.set(false);
      this.error.set('Impossible d’identifier votre compte propriétaire.');
      return;
    }
    this.auth.getOwnedSchools(ownerId, 'TEACHERS').subscribe({
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
    const id = this.selectedClassId();
    if (id) this.selectClass(id);
  }

  ngOnDestroy(): void {
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

  openAddTeacher(): void {
    this.assigningTeacher.set(false);
    this.addingTeacher.set(true);
    this.newTeacher = { firstName: '', lastName: '', email: '', phone: '',
      employeeNumber: '', specialty: '', hireDate: '', monthlySalary: null as number | null, subjectId: this.subjects()[0]?.id ?? 0 };
    this.error.set(null);
  }

  openAssignment(): void {
    this.addingTeacher.set(false);
    this.assigningTeacher.set(true);
    this.assignment = { teacherId: this.candidates()[0]?.id ?? 0, subjectId: this.subjects()[0]?.id ?? 0 };
    this.error.set(null);
  }

  cancelForms(): void {
    this.addingTeacher.set(false);
    this.assigningTeacher.set(false);
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

  saveTeacher(): void {
    if (this.saving()) return;
    const classId = this.selectedClassId();
    const form = this.newTeacher;
    if (!classId || !form.firstName.trim() || !form.lastName.trim() ||
        !form.email.trim() ||
        !this.subjects().some(subject => subject.id === form.subjectId)) {
      this.error.set('Renseignez le prénom, le nom, un courriel et une matière.');
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    this.teacherWork.createTeacher(classId, {
      firstName: form.firstName.trim(), lastName: form.lastName.trim(),
      email: form.email.trim(),
      employeeNumber: form.employeeNumber.trim() || null,
      phone: form.phone.trim() || null, specialty: form.specialty.trim() || null,
      hireDate: form.hireDate || null, monthlySalary: form.monthlySalary, subjectId: form.subjectId,
    }).subscribe({
      next: teacher => {
        this.saving.set(false);
        this.cancelForms();
        const identifier = teacher.employeeNumber ? ` Numéro d’employé : ${teacher.employeeNumber}.` : '';
        const delivery = teacher.emailVerified === true
          ? ' Le compte utilise son mot de passe existant.'
          : teacher.invitationDeliveryStatus === 'SENT'
            ? ' Invitation envoyée : l’enseignant choisira son mot de passe depuis le lien reçu.'
            : teacher.invitationDeliveryStatus === 'FAILED'
              ? ' L’envoi de l’invitation a échoué. Utilisez « Renvoyer le lien » dans la liste.'
              : ' Vérifiez l’état de l’invitation dans la liste et renvoyez le lien si nécessaire.';
        this.success.set(`Enseignant créé et affecté à la classe.${identifier}${delivery}`);
        this.selectClass(classId);
        this.refreshAllTeachers();
      },
      error: err => {
        this.saving.set(false);
        this.error.set(err?.error?.message ?? 'Impossible de créer et d’affecter cet enseignant.');
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
    const classId = this.selectedClassId();
    if (!classId || !this.candidates().some(teacher => teacher.id === this.assignment.teacherId) ||
        !this.subjects().some(subject => subject.id === this.assignment.subjectId)) {
      this.error.set('Sélectionnez un enseignant disponible et une matière de cet établissement.');
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    this.teacherWork.assignTeacher(classId, this.assignment.teacherId, this.assignment.subjectId).subscribe({
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
      const id = this.selectedClassId();
      if (this.loading() || !id) return;
      this.classRequest?.unsubscribe();
      this.classRequest = this.teacherWork.teachersByClass(id).subscribe({next: rows => this.teachers.set(rows)});
      if (this.showAllTeachers()) this.refreshAllTeachers();
    });
    this.schoolRequest?.unsubscribe();
    this.classRequest?.unsubscribe();
    this.candidatesRequest?.unsubscribe();
    this.selectedSchoolId.set(schoolId);
    this.auth.selectSchoolContext(schoolId);
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
