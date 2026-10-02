import { DatePipe } from '@angular/common';
import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { catchError, EMPTY, exhaustMap, timer } from 'rxjs';
import {
  apiError, ConversationRecipient, ConversationSummary, ConversationThread, RosterStudent, SelfSpaceService, TeacherClass,
} from '../../../../shared/self-space/self-space.service';

@Component({
  selector: 'app-teacher-messages',
  standalone: true,
  imports: [DatePipe, FormsModule, RouterLink],
  templateUrl: './messages.html',
  styleUrl: '../../../../shared/self-space/self-space.scss',
})
export class TeacherMessages implements OnInit {
  private readonly api = inject(SelfSpaceService);
  private readonly destroyRef = inject(DestroyRef);

  readonly classes = signal<TeacherClass[]>([]);
  readonly students = signal<RosterStudent[]>([]);
  readonly recipients = signal<ConversationRecipient[]>([]);
  readonly conversations = signal<ConversationSummary[]>([]);
  readonly thread = signal<ConversationThread | null>(null);
  readonly selectedRecipientIds = signal<number[]>([]);
  readonly loading = signal(true);
  readonly composing = signal(false);
  readonly sending = signal(false);
  readonly recipientSchool = signal(false);
  readonly error = signal<string | null>(null);
  readonly success = signal<string | null>(null);

  classId: number | null = null;
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
    this.api.teacherClasses().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (classes) => this.classes.set(classes),
      error: (err) => this.error.set(apiError(err, 'Impossible de charger vos classes.')),
    });
    this.loadConversations();
  }

  selectClass(value: number | null): void {
    this.classId = value;
    this.studentId = null;
    this.students.set([]);
    this.recipients.set([]);
    this.selectedRecipientIds.set([]);
    if (value === null) return;
    this.api.classStudents(value).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (items) => this.students.set(items),
      error: (err) => this.error.set(apiError(err, 'Impossible de charger les élèves de cette classe.')),
    });
  }

  selectStudent(value: number | null): void {
    this.studentId = value;
    this.selectedRecipientIds.set([]);
    const schoolId = this.classes().find((item) => item.classId === this.classId)?.schoolId;
    if (schoolId && value) {
      this.api.conversationRecipients(schoolId, value).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: (items) => this.recipients.set(items),
        error: (err) => this.error.set(apiError(err, 'Impossible de charger les parents de cet élève.')),
      });
    }
  }

  toggleRecipient(userId: number, checked: boolean): void {
    this.selectedRecipientIds.update((ids) => checked ? [...new Set([...ids, userId])] : ids.filter((id) => id !== userId));
  }

  startConversation(): void {
    const selectedClass = this.classes().find((item) => item.classId === this.classId);
    if (!selectedClass || this.studentId === null || (!this.recipientSchool() && !this.selectedRecipientIds().length)
      || !this.subject.trim() || !this.message.trim()) return;
    this.sending.set(true);
    this.error.set(null);
    this.api.startConversation({ schoolId: selectedClass.schoolId, studentId: this.studentId, subject: this.subject.trim(),
      content: this.message.trim(), recipientUserIds: this.selectedRecipientIds(), recipientSchool: this.recipientSchool() })
      .pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: (thread) => {
          this.thread.set(thread);
          this.conversations.update((items) => [thread.conversation, ...items]);
          this.subject = '';
          this.message = '';
          this.selectedRecipientIds.set([]);
          this.composing.set(false);
          this.success.set('Votre message a été envoyé.');
          this.sending.set(false);
        },
        error: (err) => {
          this.error.set(apiError(err, 'Impossible de créer la conversation.'));
          this.sending.set(false);
        },
      });
  }

  open(item: ConversationSummary): void {
    this.api.conversation(item.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (thread) => {
        this.thread.set(thread);
        this.conversations.update((items) => items.map((entry) => entry.id === item.id ? { ...entry, unread: false } : entry));
      },
      error: (err) => this.error.set(apiError(err, 'Impossible d’ouvrir cette conversation.')),
    });
  }

  sendReply(): void {
    const current = this.thread();
    if (!current || !this.reply.trim()) return;
    this.sending.set(true);
    this.api.replyToConversation(current.conversation.id, this.reply.trim()).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (thread) => {
        this.thread.set(thread);
        this.reply = '';
        this.sending.set(false);
      },
      error: (err) => {
        this.error.set(apiError(err, 'Impossible d’envoyer votre réponse.'));
        this.sending.set(false);
      },
    });
  }

  private loadConversations(): void {
    this.api.conversations().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (items) => { this.conversations.set(items); this.loading.set(false); },
      error: (err) => { this.error.set(apiError(err, 'Impossible de charger vos messages.')); this.loading.set(false); },
    });
  }
}
