import { FormValidationDirective } from '../../../../shared/form-validation.directive';
import { DatePipe } from '@angular/common';
import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { catchError, exhaustMap, forkJoin, of, timer } from 'rxjs';
import { AuthService, RegistrationSchool } from '../../../../core/auth';
import { apiError, ConversationRecipient, ConversationSummary, ConversationThread } from '../../../../shared/self-space/self-space.service';
import { OwnerFamilyMessagesService } from '../../family-messages.service';
import { ConversationFiles, MessageAttachments } from '../../../../shared/self-space/message-attachments';

@Component({
  selector: 'app-owner-messages',
  standalone: true,
  imports: [FormValidationDirective, DatePipe, FormsModule, ConversationFiles, MessageAttachments],
  templateUrl: './messages.html',
  styleUrl: '../../../../shared/self-space/self-space.scss',
})
export class OwnerMessages implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly api = inject(OwnerFamilyMessagesService);
  private readonly destroyRef = inject(DestroyRef);

  readonly schools = signal<RegistrationSchool[]>([]);
  readonly schoolId = signal<number | null>(null);
  readonly conversations = signal<ConversationSummary[]>([]);
  readonly recipients = signal<ConversationRecipient[]>([]);
  readonly loadingRecipients = signal(false);
  readonly selectedRecipientIds = signal<number[]>([]);
  readonly thread = signal<ConversationThread | null>(null);
  readonly loading = signal(true);
  readonly sending = signal(false);
  readonly error = signal<string | null>(null);
  readonly success = signal<string | null>(null);
  readonly emojis = ['😀', '😊', '😂', '👍', '❤️', '🙏', '🎉'];
  readonly composing = signal(false);
  reply = '';
  subject = '';
  message = '';
  messageFiles: File[] = [];
  replyFiles: File[] = [];
  readonly recipientSearch = signal('');
  readonly recipientRoleFilter = signal<ConversationRecipient['role'] | ''>('');
  readonly selectedOnly = signal(false);
  readonly showRecipients = signal(false);
  readonly recipientLimit = signal(30);
  readonly selectedRecipientSet = computed(() => new Set(this.selectedRecipientIds()));
  private readonly recipientIndex = computed(() => this.recipients().map(recipient => ({
    recipient, search: this.normalizeSearch(`${recipient.fullName} ${recipient.email ?? ''} ${this.recipientRole(recipient.role)}`),
  })));
  readonly filteredRecipients = computed(() => {
    const terms = this.normalizeSearch(this.recipientSearch()).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
    const role = this.recipientRoleFilter();
    const selectedOnly = this.selectedOnly();
    const selected = this.selectedRecipientSet();
    return this.recipientIndex().filter(({ recipient, search }) =>
      (!role || recipient.role === role) && (!selectedOnly || selected.has(recipient.userId))
      && terms.every(term => search.includes(term))).map(item => item.recipient);
  });
  readonly visibleRecipients = computed(() => this.filteredRecipients().slice(0, this.recipientLimit()));
  private readonly recipientStats = computed(() => {
    const counts = { ENSEIGNANT: { total: 0, selected: 0 }, ELEVE: { total: 0, selected: 0 }, PARENT: { total: 0, selected: 0 } };
    const selected = this.selectedRecipientSet();
    for (const recipient of this.recipients()) {
      counts[recipient.role].total++;
      if (selected.has(recipient.userId)) counts[recipient.role].selected++;
    }
    return counts;
  });

  ngOnInit(): void {
    timer(20_000, 20_000).pipe(
      exhaustMap(() => {
        const id = this.thread()?.conversation.id;
        const schoolId = this.schoolId();
        return forkJoin({
          schoolId: of(schoolId),
          conversations: schoolId ? this.api.conversations(schoolId).pipe(catchError(() => of(null))) : of(null),
          thread: id ? this.api.conversation(id).pipe(catchError(() => of(null))) : of(null),
        });
      }),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(({ conversations, thread, schoolId }) => {
      if (schoolId !== this.schoolId()) return;
      if (conversations) this.conversations.set(conversations);
      if (thread && thread.conversation.id === this.thread()?.conversation.id) {
        this.thread.set(thread);
        this.conversations.update(items => items.map(item => item.id === thread.conversation.id ? thread.conversation : item));
      }
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

  selectAllRecipients(role?: ConversationRecipient['role']): void {
    if (this.loadingRecipients()) return;
    const ids = this.recipients().filter((recipient) => !role || recipient.role === role).map((recipient) => recipient.userId);
    if (!ids.length) {
      this.error.set('Aucun destinataire actif et approuvé dans ce groupe pour cet établissement.');
      return;
    }
    this.error.set(null);
    this.selectedRecipientIds.update((selected) => [...new Set([...selected, ...ids])]);
    this.recipientSearch.set('');
    this.recipientRoleFilter.set('');
    this.selectedOnly.set(false);
    this.showRecipients.set(false);
  }

  groupCount(role: ConversationRecipient['role'], selected = false): number {
    return this.recipientStats()[role][selected ? 'selected' : 'total'];
  }

  toggleComposer(): void {
    this.composing.set(!this.composing());
    if (this.composing()) this.reloadRecipients();
  }

  reloadRecipients(): void {
    const schoolId = this.schoolId();
    if (schoolId === null || this.loadingRecipients()) return;
    this.loadingRecipients.set(true);
    this.api.recipients(schoolId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (recipients) => {
        if (this.schoolId() !== schoolId) return;
        this.recipients.set(recipients);
        const available = new Set(recipients.map(recipient => recipient.userId));
        this.selectedRecipientIds.update(ids => ids.filter(id => available.has(id)));
        this.loadingRecipients.set(false);
      },
      error: (err) => {
        if (this.schoolId() !== schoolId) return;
        this.loadingRecipients.set(false);
        this.error.set(apiError(err, 'Impossible de charger les destinataires. Cliquez sur Actualiser les destinataires pour réessayer.'));
      },
    });
  }

  groupSelected(role: ConversationRecipient['role']): boolean {
    return this.groupCount(role) > 0 && this.groupCount(role, true) === this.groupCount(role);
  }

  searchRecipients(query: string): void {
    this.recipientSearch.set(query);
    this.recipientLimit.set(30);
  }

  filterRole(role: ConversationRecipient['role'] | ''): void {
    this.recipientRoleFilter.set(role);
    this.recipientLimit.set(30);
    this.showRecipients.set(true);
  }

  private normalizeSearch(value: string): string {
    return value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase();
  }

  recipientRole(role: ConversationRecipient['role']): string {
    return { PARENT: 'Parent', ENSEIGNANT: 'Enseignant', ELEVE: 'Élève' }[role];
  }

  startConversation(): void {
    const schoolId = this.schoolId();
    const recipientUserIds = this.selectedRecipientIds();
    const studentId = null;
    if (this.sending() || schoolId === null || !recipientUserIds.length || !this.subject.trim() || (!this.message.trim() && !this.messageFiles.length)) return;
    this.error.set(null);
    this.success.set(null);
    this.sending.set(true);
    this.api.start({ schoolId, studentId, subject: this.subject.trim(), content: this.message.trim(),
      recipientUserIds, recipientSchool: false }, this.messageFiles).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (thread) => {
        this.thread.set(thread);
        this.conversations.update((items) => [thread.conversation, ...items]);
        this.subject = '';
        this.message = '';
        this.messageFiles = [];
        this.selectedRecipientIds.set([]);
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
    this.composing.set(false);
    this.error.set(null);
    this.success.set(null);
    this.api.conversation(item.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (thread) => {
        this.thread.set(thread);
        this.reply = '';
        this.replyFiles = [];
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
    if (this.sending() || !current || (!this.reply.trim() && !this.replyFiles.length)) return;
    this.error.set(null);
    this.success.set(null);
    this.sending.set(true);
    this.api.reply(current.conversation.id, this.reply.trim(), this.replyFiles).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (thread) => {
        this.thread.set(thread);
        this.reply = '';
        this.replyFiles = [];
        this.success.set('Votre réponse a été envoyée aux participants.');
        this.sending.set(false);
      },
      error: (err) => {
        this.error.set(apiError(err, 'Impossible d’envoyer la réponse.'));
        this.sending.set(false);
      },
    });
  }

  addEmoji(emoji: string, field: 'message' | 'reply'): void {
    if (this[field].length + emoji.length > 4000) return;
    if (field === 'message') this.message += emoji;
    else this.reply += emoji;
  }

  private selectSchool(schoolId: number): void {
    this.schoolId.set(schoolId);
    this.auth.selectSchoolContext(schoolId);
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
    this.selectedRecipientIds.set([]);
    this.recipients.set([]);
    this.recipientSearch.set('');
    this.recipientRoleFilter.set('');
    this.selectedOnly.set(false);
    this.showRecipients.set(false);
    this.recipientLimit.set(30);
    this.messageFiles = [];
    this.replyFiles = [];
    this.loadingRecipients.set(false);
    this.reloadRecipients();
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
