import { ErrorAlert } from '../../../../shared/error-alert';
import { ModuleHelpButton } from '../../../../shared/help/module-help-button';
import { LoadingState } from '../../../../shared/ui/loading-state';
import { TextareaModule } from 'primeng/textarea';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { InputTextModule } from 'primeng/inputtext';
import { SelectField, SelectOption } from '../../../../shared/ui/select-field';
import { StudentDashboardService, StudyProfile } from '../../../../shared/self-space/student-dashboard.service';
import { FormValidationDirective } from '../../../../shared/form-validation.directive';
import { DatePipe } from '@angular/common';
import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { catchError, exhaustMap, forkJoin, of, timer } from 'rxjs';
import { apiError, ConversationSummary, ConversationThread, SelfSpaceService } from '../../../../shared/self-space/self-space.service';
import { ConversationFiles, MessageAttachments } from '../../../../shared/self-space/message-attachments';

@Component({
  selector: 'app-student-messages',
  standalone: true,
  imports: [ErrorAlert, ModuleHelpButton, LoadingState, InputTextModule, SelectField, SelectOption, TextareaModule, ButtonModule, MessageModule, FormValidationDirective, FormsModule, DatePipe, ConversationFiles, MessageAttachments],
  templateUrl: './messages.html',
  styleUrl: '../../../../shared/self-space/self-space.scss',
})
export class StudentMessages implements OnInit {
  private readonly api = inject(SelfSpaceService);
  private readonly dashboard = inject(StudentDashboardService);
  private readonly destroyRef = inject(DestroyRef);
  readonly conversations = signal<ConversationSummary[]>([]);
  readonly thread = signal<ConversationThread | null>(null);
  readonly error = signal<string | null>(null);
  readonly loading = signal(true);
  readonly sending = signal(false);
  readonly profiles = signal<StudyProfile[]>([]);
  readonly showComposer = signal(false);
  studentId: number | null = null;
  subject = '';
  message = '';
  messageFiles: File[] = [];
  reply = '';
  files: File[] = [];
  ngOnInit(): void {
    this.dashboard.profiles().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (profiles) => { this.profiles.set(profiles); this.studentId = profiles[0]?.studentId ?? null; },
      error: (err) => this.error.set(apiError(err, 'Impossible de charger vos établissements.')),
    });
    this.api.conversations().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (items) => { this.conversations.set(items); this.loading.set(false); },
      error: (err) => { this.error.set(apiError(err, 'Impossible de charger les messages.')); this.loading.set(false); },
    });
    timer(20_000, 20_000).pipe(exhaustMap(() => {
      const id = this.thread()?.conversation.id;
      return forkJoin({
        items: this.api.conversations().pipe(catchError(() => of(null))),
        thread: id ? this.api.conversation(id).pipe(catchError(() => of(null))) : of(null),
      });
    }), takeUntilDestroyed(this.destroyRef)).subscribe(({ items, thread }) => {
      if (items) this.conversations.set(items);
      if (thread && thread.conversation.id === this.thread()?.conversation.id) this.thread.set(thread);
    });
  }
  open(item: ConversationSummary): void {
    if (this.sending()) return;
    this.showComposer.set(false);
    this.error.set(null);
    this.api.conversation(item.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (thread) => {
        this.thread.set(thread); this.reply = ''; this.files = [];
        this.conversations.update(items => items.map(entry => entry.id === item.id ? thread.conversation : entry));
      },
      error: (err) => this.error.set(apiError(err, 'Impossible d’ouvrir cette conversation.')),
    });
  }
  newConversation(): void {
    if (this.sending()) return;
    this.error.set(null);
    this.showComposer.set(true);
  }
  startConversation(): void {
    if (this.sending()) return;
    const profile = this.profiles().find(item => item.studentId === this.studentId);
    if (!profile || !this.subject.trim() || (!this.message.trim() && !this.messageFiles.length)) return;
    this.error.set(null);
    this.sending.set(true);
    this.api.startConversation({
      schoolId: profile.schoolId, studentId: profile.studentId,
      subject: this.subject.trim(), content: this.message.trim(),
      recipientSchool: true, recipientUserIds: [],
    }, this.messageFiles).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (thread) => {
        this.thread.set(thread);
        this.conversations.update(items => [thread.conversation, ...items.filter(item => item.id !== thread.conversation.id)]);
        this.subject = ''; this.message = ''; this.messageFiles = [];
        this.reply = ''; this.files = [];
        this.showComposer.set(false); this.sending.set(false);
      },
      error: (err) => { this.error.set(apiError(err, 'Impossible de démarrer cette conversation.')); this.sending.set(false); },
    });
  }
  send(): void {
    const id = this.thread()?.conversation.id;
    if (!id || this.sending() || (!this.reply.trim() && !this.files.length)) return;
    this.sending.set(true);
    this.error.set(null);
    this.api.replyToConversation(id, this.reply.trim(), this.files).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (thread) => { this.thread.set(thread); this.reply = ''; this.files = []; this.sending.set(false); },
      error: (err) => { this.error.set(apiError(err, 'Impossible d’envoyer la réponse.')); this.sending.set(false); },
    });
  }
}
