import { Component, computed, effect, input, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { MessageAttachments } from './message-attachments';
import { ConversationMessage } from './self-space.service';
import { groupMessageDays } from './conversation-groups';

@Component({
  selector: 'app-conversation-thread', standalone: true, imports: [DatePipe, MessageAttachments],
  template: `
    @if (messages().length > limit()) { <button class="older" type="button" (click)="limit.update(increase)">Afficher les messages précédents ({{ messages().length - limit() }})</button> }
    <div class="thread" aria-label="Messages par date" aria-live="polite">
      @for (day of days(); track day.key; let latest = $last) {
        <details [open]="opened()[day.key] ?? latest" (toggle)="remember(day.key, $event)">
          <summary>{{ day.label }} · {{ day.messages.length }} message(s)</summary>
          <div class="messages">
          @for (message of day.messages; track message.id) {
            <article class="ss__msg" [class.mine]="message.mine">
              <small>{{ message.senderName || (message.fromSchool ? 'Établissement' : 'Vous') }} · {{ message.sentAt | date:'HH:mm' }}</small>
              <div class="content">{{ message.content }}</div>
              <app-message-attachments [attachments]="message.attachments ?? []" />
              @if (message.mine) { <small>{{ message.readBy?.length ? 'Lu par ' + message.readBy!.length + ' personne(s)' : 'Non lu' }}</small> }
            </article>
          }
          </div>
        </details>
      }
    </div>
  `,
  styles: [`:host{display:block;min-width:0}.thread{max-height:28rem;overflow:auto}summary{position:sticky;top:0;padding:.6rem .8rem;background:var(--theme-inset,#f1f5f9);color:var(--theme-ink,#1e293b);font-size:.8rem;font-weight:600;border-bottom:1px solid var(--theme-border,#ddd);cursor:pointer}.messages{display:flex;flex-direction:column;gap:.6rem;padding:.6rem .25rem}.ss__msg{max-width:85%;align-self:flex-start;padding:.6rem .8rem;border-radius:.6rem;background:var(--theme-inset,#f1f5f9);color:var(--theme-ink,#1e293b);overflow-wrap:anywhere}.mine{align-self:flex-end;background:var(--theme-success-soft,#dcfce7)}.content{white-space:pre-wrap;font-size:.9rem}small{display:block;color:var(--theme-muted,#64748b);font-size:.72rem;margin:.2rem 0}.older{width:100%;padding:.6rem .8rem;border:1px solid var(--theme-control-border,#cbd5e1);border-radius:.4rem;background:var(--theme-soft,#e0f2fe);color:var(--theme-ink,#1e293b);cursor:pointer}button:focus-visible,summary:focus-visible{outline:3px solid var(--theme-focus,#7dd3fc);outline-offset:-3px}`],
})
export class ConversationThreadView {
  readonly conversationId = input.required<number>();
  readonly messages = input.required<ConversationMessage[]>();
  readonly limit = signal(30);
  readonly opened = signal<Record<string, boolean>>({});
  readonly increase = (value: number) => value + 30;
  readonly visibleMessages = computed(() => groupMessageDays(this.messages()).flatMap(day => day.messages)
    .slice(-this.limit()));
  // Group only the most recent window; older messages remain available through the button.
  readonly days = computed(() => groupMessageDays(this.visibleMessages()));
  constructor() {
    effect(() => { this.conversationId(); this.limit.set(30); this.opened.set({}); });
  }
  remember(key: string, event: Event): void { this.opened.update(state => ({ ...state, [key]: (event.target as HTMLDetailsElement).open })); }
}
