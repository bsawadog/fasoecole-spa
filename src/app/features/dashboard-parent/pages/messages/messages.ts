import { DatePipe } from '@angular/common';
import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { catchError, EMPTY, exhaustMap, timer } from 'rxjs';
import {
  apiError,
  ConversationSummary,
  ConversationThread,
  ConversationRecipient,
  SchoolContact,
  SelfSpaceService,
  StudentOverview,
} from '../../../../shared/self-space/self-space.service';

@Component({
  selector: 'app-parent-messages',
  standalone: true,
  imports: [DatePipe, FormsModule, RouterLink],
  templateUrl: './messages.html',
  styleUrl: '../../../../shared/self-space/self-space.scss',
})
export class ParentMessages implements OnInit {
  private readonly api = inject(SelfSpaceService);
  private readonly destroyRef = inject(DestroyRef);

  readonly schools = signal<SchoolContact[]>([]);
  readonly students = signal<StudentOverview[]>([]);
  readonly conversations = signal<ConversationSummary[]>([]);
  readonly recipients = signal<ConversationRecipient[]>([]);
  readonly selectedRecipientIds = signal<number[]>([]);
  readonly recipientSchool = signal(true);
  readonly thread = signal<ConversationThread | null>(null);
  readonly loading = signal(true);
  readonly sending = signal(false);
  readonly showComposer = signal(false);
  readonly error = signal<string | null>(null);
  readonly success = signal<string | null>(null);

  schoolId: number | null = null;
  studentId: number | null = null;
  subject = '';
  message = '';
  reply = '';

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
    this.api.contactSchools().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (schools) => {
        this.schools.set(schools);
        if (schools.length && this.schoolId === null) this.schoolId = schools[0].schoolId;
        this.loadRecipients();
      },
      error: (err) => this.error.set(apiError(err, 'Impossible de charger les établissements.')),
    });
    this.api.myStudents().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (students) => this.students.set(students),
      error: (err) => this.error.set(apiError(err, 'Impossible de charger la liste des enfants.')),
    });
    this.api.conversations().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (items) => {
        this.conversations.set(items);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(apiError(err, 'Impossible de charger les conversations.'));
        this.loading.set(false);
      },
    });
  }

  studentsForSchool(): StudentOverview[] {
    return this.students().filter((student) => student.schoolId === this.schoolId);
  }

  selectSchool(value: number | null): void {
    this.schoolId = value;
    this.studentId = null;
    this.selectedRecipientIds.set([]);
    this.loadRecipients();
  }

  selectStudent(value: number | null): void {
    this.studentId = value;
    this.selectedRecipientIds.set([]);
    this.loadRecipients();
  }

  toggleRecipient(userId: number, checked: boolean): void {
    this.selectedRecipientIds.update((ids) => checked ? [...new Set([...ids, userId])] : ids.filter((id) => id !== userId));
  }

  private loadRecipients(): void {
    if (this.schoolId === null) return;
    this.api.conversationRecipients(this.schoolId, this.studentId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (items) => this.recipients.set(items),
      error: (err) => this.error.set(apiError(err, 'Impossible de charger les destinataires.')),
    });
  }

  openConversation(item: ConversationSummary): void {
    this.error.set(null);
    this.success.set(null);
    this.api.conversation(item.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (thread) => {
        this.thread.set(thread);
        this.conversations.update((items) => items.map((conversation) =>
          conversation.id === item.id ? { ...conversation, unread: false } : conversation));
      },
      error: (err) => this.error.set(apiError(err, 'Impossible d’ouvrir cette conversation.')),
    });
  }

  startConversation(): void {
    this.error.set(null);
    this.success.set(null);
    if (this.schoolId === null || (!this.recipientSchool() && !this.selectedRecipientIds().length)
      || !this.subject.trim() || !this.message.trim()) {
      this.error.set('Choisissez un destinataire, un objet et rédigez votre message.');
      return;
    }
    this.sending.set(true);
    this.api.startConversation({
      schoolId: this.schoolId,
      studentId: this.studentId,
      subject: this.subject.trim(),
      content: this.message.trim(),
      recipientUserIds: this.selectedRecipientIds(),
      recipientSchool: this.recipientSchool(),
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (thread) => {
        this.thread.set(thread);
        this.conversations.update((items) => [thread.conversation, ...items]);
        this.subject = '';
        this.message = '';
        this.showComposer.set(false);
        this.success.set('Votre message a été envoyé à l’établissement.');
        this.sending.set(false);
      },
      error: (err) => {
        this.error.set(apiError(err, 'Impossible d’envoyer votre message. Réessayez.'));
        this.sending.set(false);
      },
    });
  }

  sendReply(): void {
    const current = this.thread();
    if (!current || !this.reply.trim()) return;
    this.error.set(null);
    this.success.set(null);
    this.sending.set(true);
    this.api.replyToConversation(current.conversation.id, this.reply.trim())
      .pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: (thread) => {
          this.thread.set(thread);
          this.conversations.update((items) => items.map((item) =>
            item.id === thread.conversation.id ? thread.conversation : item));
          this.reply = '';
          this.sending.set(false);
        },
        error: (err) => {
          this.error.set(apiError(err, 'Impossible d’envoyer votre réponse. Réessayez.'));
          this.sending.set(false);
        },
      });
  }
}
