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
  imports: [FormValidationDirective, FormsModule, DatePipe, ConversationFiles, MessageAttachments],
  templateUrl: './messages.html',
  styleUrl: '../../../../shared/self-space/self-space.scss',
})
export class StudentMessages implements OnInit {
  private readonly api = inject(SelfSpaceService);
  private readonly destroyRef = inject(DestroyRef);
  readonly conversations = signal<ConversationSummary[]>([]);
  readonly thread = signal<ConversationThread | null>(null);
  readonly error = signal<string | null>(null);
  readonly loading = signal(true);
  readonly sending = signal(false);
  reply = '';
  files: File[] = [];
  ngOnInit(): void {
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
    this.error.set(null);
    this.api.conversation(item.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (thread) => {
        this.thread.set(thread); this.reply = ''; this.files = [];
        this.conversations.update(items => items.map(entry => entry.id === item.id ? thread.conversation : entry));
      },
      error: (err) => this.error.set(apiError(err, 'Impossible d’ouvrir cette conversation.')),
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
