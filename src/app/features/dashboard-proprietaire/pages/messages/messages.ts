import { DatePipe } from '@angular/common';
import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { catchError, EMPTY, exhaustMap, timer } from 'rxjs';
import { AuthService, RegistrationSchool } from '../../../../core/auth';
import { ClassRecord, ClassRosterRow, OwnerManagementService } from '../../owner-management.service';
import { apiError, ConversationRecipient, ConversationSummary, ConversationThread } from '../../../../shared/self-space/self-space.service';
import { OwnerFamilyMessagesService } from '../../family-messages.service';

@Component({
  selector: 'app-owner-messages',
  standalone: true,
  imports: [DatePipe, FormsModule],
  templateUrl: './messages.html',
  styleUrl: '../../../../shared/self-space/self-space.scss',
})
export class OwnerMessages implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly api = inject(OwnerFamilyMessagesService);
  private readonly rosterApi = inject(OwnerManagementService);
  private readonly destroyRef = inject(DestroyRef);

  readonly schools = signal<RegistrationSchool[]>([]);
  readonly schoolId = signal<number | null>(null);
  readonly conversations = signal<ConversationSummary[]>([]);
  readonly recipients = signal<ConversationRecipient[]>([]);
  readonly classes = signal<ClassRecord[]>([]);
  readonly selectedClassId = signal<number | null>(null);
  readonly students = signal<ClassRosterRow[]>([]);
  readonly selectedStudentId = signal<number | null>(null);
  readonly selectedRecipientIds = signal<number[]>([]);
  readonly thread = signal<ConversationThread | null>(null);
  readonly loading = signal(true);
  readonly sending = signal(false);
  readonly error = signal<string | null>(null);
  readonly success = signal<string | null>(null);
  readonly composing = signal(false);
  reply = '';
  subject = '';
  message = '';

  ngOnInit(): void {
    timer(20_000, 20_000).pipe(
      exhaustMap(() => {
        const id = this.thread()?.conversation.id;
        return id ? this.api.conversation(id).pipe(catchError(() => EMPTY)) : EMPTY;
      }),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe((thread) => {
      this.thread.set(thread);
      this.conversations.update((items) => items.map((item) => item.id === thread.conversation.id ? thread.conversation : item));
    });
    const ownerId = this.auth.user()?.id;
    if (!ownerId) {
      this.loading.set(false);
      this.error.set('Impossible d’identifier votre compte propriétaire.');
      return;
    }
    if (!this.auth.isSchoolOwner()) {
      this.auth.loadOwnerAccess().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: (access) => this.initializeSchools(access.filter((school) => school.modules.includes('STUDENTS')).map((school) => ({
          id: school.schoolId, name: school.schoolName, type: school.schoolType,
        }))),
        error: () => {
          this.loading.set(false);
          this.error.set('Impossible de charger les établissements accessibles.');
        },
      });
      return;
    }
    this.auth.getOwnedSchools(ownerId, 'DASHBOARD').pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (schools) => this.initializeSchools(schools),
      error: () => {
        this.loading.set(false);
        this.error.set('Impossible de charger vos établissements.');
      },
    });
  }

  changeSchool(value: string): void {
    const id = Number(value);
    if (this.schools().some((school) => school.id === id)) this.selectSchool(id);
  }

  toggleRecipient(userId: number, checked: boolean): void {
    this.selectedRecipientIds.update((ids) => checked ? [...new Set([...ids, userId])] : ids.filter((id) => id !== userId));
  }

  selectAllRecipients(role: 'PARENT' | 'ENSEIGNANT'): void {
    const ids = this.recipients().filter((recipient) => recipient.role === role).map((recipient) => recipient.userId);
    this.selectedRecipientIds.update((selected) => [...new Set([...selected, ...ids])]);
  }

  changeClass(value: string): void {
    const id = Number(value);
    if (!this.classes().some((item) => item.id === id)) return;
    this.selectedClassId.set(id);
    this.students.set([]);
    this.selectedStudentId.set(null);
    this.recipients.set([]);
    this.selectedRecipientIds.set([]);
    this.rosterApi.getClassRoster(id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (rows) => this.students.set(rows),
      error: (err) => this.error.set(apiError(err, 'Impossible de charger les élèves de cette classe.')),
    });
  }

  changeStudent(value: string): void {
    const id = Number(value);
    const student = this.students().find((item) => item.studentId === id);
    this.selectedStudentId.set(student?.studentId ?? null);
    this.recipients.set([]);
    this.selectedRecipientIds.set([]);
    const schoolId = this.schoolId();
    if (!student || schoolId === null) return;
    this.api.recipients(schoolId, student.studentId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (items) => this.recipients.set(items.filter((recipient) => recipient.role === 'PARENT')),
      error: (err) => this.error.set(apiError(err, 'Impossible de charger les parents de cet élève.')),
    });
  }

  startConversation(): void {
    const schoolId = this.schoolId();
    const recipientUserIds = this.selectedRecipientIds();
    const studentId = this.selectedStudentId();
    if (schoolId === null || studentId === null || !recipientUserIds.length || !this.subject.trim() || !this.message.trim()) return;
    this.error.set(null);
    this.success.set(null);
    this.sending.set(true);
    this.api.start({ schoolId, studentId, subject: this.subject.trim(), content: this.message.trim(),
      recipientUserIds, recipientSchool: false }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (thread) => {
        this.thread.set(thread);
        this.conversations.update((items) => [thread.conversation, ...items]);
        this.subject = '';
        this.message = '';
        this.selectedRecipientIds.set([]);
        this.selectedStudentId.set(null);
        this.composing.set(false);
        this.success.set('Le message a été envoyé aux destinataires sélectionnés.');
        this.sending.set(false);
      },
      error: (err) => {
        this.error.set(apiError(err, 'Impossible de créer cette conversation.'));
        this.sending.set(false);
      },
    });
  }

  openConversation(item: ConversationSummary): void {
    this.error.set(null);
    this.success.set(null);
    this.api.conversation(item.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (thread) => {
        this.thread.set(thread);
        this.reply = '';
        this.conversations.update((items) => items.map((conversation) => conversation.id === item.id
          ? { ...conversation, unread: false } : conversation));
        this.api.refreshUnreadCount(this.schools().map((school) => school.id))
          .pipe(takeUntilDestroyed(this.destroyRef)).subscribe();
      },
      error: (err) => this.error.set(apiError(err, 'Impossible d’ouvrir cette conversation.')),
    });
  }

  sendReply(): void {
    const current = this.thread();
    if (!current || !this.reply.trim()) return;
    this.error.set(null);
    this.success.set(null);
    this.sending.set(true);
    this.api.reply(current.conversation.id, this.reply.trim()).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (thread) => {
        this.thread.set(thread);
        this.reply = '';
        this.success.set('Votre réponse a été envoyée au parent.');
        this.sending.set(false);
      },
      error: (err) => {
        this.error.set(apiError(err, 'Impossible d’envoyer la réponse.'));
        this.sending.set(false);
      },
    });
  }

  private selectSchool(schoolId: number): void {
    this.schoolId.set(schoolId);
    localStorage.setItem('fasoecole_owner_school', String(schoolId));
    this.loading.set(true);
    this.error.set(null);
    this.thread.set(null);
    this.api.conversations(schoolId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (items) => {
        this.conversations.set(items);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(apiError(err, 'Impossible de charger les messages des parents.'));
      },
    });
    this.rosterApi.getClasses(schoolId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (classes) => {
        this.classes.set(classes);
        this.selectedClassId.set(null);
        this.students.set([]);
        this.selectedStudentId.set(null);
      },
      error: (err) => this.error.set(apiError(err, 'Impossible de charger les classes de cet établissement.')),
    });
    this.selectedRecipientIds.set([]);
    this.recipients.set([]);
  }

  private initializeSchools(schools: RegistrationSchool[]): void {
    this.schools.set(schools);
    if (!schools.length) {
      this.loading.set(false);
      return;
    }
    const storedId = Number(localStorage.getItem('fasoecole_owner_school'));
    const active = schools.find((school) => school.id === storedId) ?? schools[0];
    this.selectSchool(active.id);
  }
}
