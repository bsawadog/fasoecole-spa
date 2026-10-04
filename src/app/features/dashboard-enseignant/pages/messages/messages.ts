import { FormValidationDirective } from '../../../../shared/form-validation.directive';
import { DatePipe } from '@angular/common';
import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ConversationFiles, MessageAttachments } from '../../../../shared/self-space/message-attachments';
import { catchError, exhaustMap, forkJoin, of, timer } from 'rxjs';
import {
  apiError, ConversationRecipient, ConversationSummary, ConversationThread, RosterStudent, SelfSpaceService, TeacherClass,
} from '../../../../shared/self-space/self-space.service';

@Component({
  selector: 'app-teacher-messages',
  standalone: true,
  imports: [FormValidationDirective, DatePipe, FormsModule, RouterLink, ConversationFiles, MessageAttachments],
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
  readonly emojis = ['😀', '😊', '😂', '👍', '❤️', '🙏', '🎉'];

  classId: number | null = null;
  studentId: number | null = null;
  subject = '';
  message = '';
  reply = '';
  messageFiles: File[] = [];
  replyFiles: File[] = [];

  ngOnInit(): void {
    timer(20_000, 20_000).pipe(
      exhaustMap(() => {
        const id = this.thread()?.conversation.id;
        return forkJoin({
          conversations: this.api.conversations().pipe(catchError(() => of(null))),
          thread: id ? this.api.conversation(id).pipe(catchError(() => of(null))) : of(null),
        });
      }),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(({ conversations, thread }) => {
      if (conversations) this.conversations.set(conversations);
      if (thread && thread.conversation.id === this.thread()?.conversation.id) {
        this.thread.set(thread);
        this.conversations.update(items => items.map(item => item.id === thread.conversation.id ? thread.conversation : item));
      }
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
    if (this.sending()) return;
    const selectedClass = this.classes().find((item) => item.classId === this.classId);
    if (!selectedClass || this.studentId === null || (!this.recipientSchool() && !this.selectedRecipientIds().length)
      || !this.subject.trim() || (!this.message.trim() && !this.messageFiles.length)) return;
    this.sending.set(true);
    this.error.set(null);
    this.api.startConversation({ schoolId: selectedClass.schoolId, studentId: this.studentId, subject: this.subject.trim(),
      content: this.message.trim(), recipientUserIds: this.selectedRecipientIds(), recipientSchool: this.recipientSchool() }, this.messageFiles)
      .pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: (thread) => {
          this.thread.set(thread);
          this.conversations.update((items) => [thread.conversation, ...items]);
          this.subject = '';
          this.message = '';
          this.messageFiles = [];
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
    this.replyFiles = [];
    this.composing.set(false);
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
    if (this.sending() || !current || (!this.reply.trim() && !this.replyFiles.length)) return;
    this.sending.set(true);
    this.api.replyToConversation(current.conversation.id, this.reply.trim(), this.replyFiles).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (thread) => {
        this.thread.set(thread);
        this.reply = '';
        this.replyFiles = [];
        this.sending.set(false);
      },
      error: (err) => {
        this.error.set(apiError(err, 'Impossible d’envoyer votre réponse.'));
        this.sending.set(false);
      },
    });
  }

  addEmoji(emoji: string, field: 'message' | 'reply'): void {
    if (this[field].length + emoji.length > 4000) return;
    if (field === 'message') this.message += emoji;
    else this.reply += emoji;
  }

  private loadConversations(): void {
    this.api.conversations().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (items) => { this.conversations.set(items); this.loading.set(false); },
      error: (err) => { this.error.set(apiError(err, 'Impossible de charger vos messages.')); this.loading.set(false); },
    });
  }
}
