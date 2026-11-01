import { Component, computed, inject, input, output, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { AuthService } from '../../core/auth';
import { ConversationSummary } from './self-space.service';
import { conversationDate, groupConversations } from './conversation-groups';

@Component({
  selector: 'app-conversation-browser', standalone: true, imports: [DatePipe],
  template: `
    <label class="search">Rechercher une conversation
      <input type="search" placeholder="Nom, destinataire, objet ou élève" [value]="search()" (input)="search.set($any($event.target).value)" />
    </label>
    <div class="groups" aria-label="Conversations par mois et destinataire">
    @for (month of groups(); track month.key; let firstMonth = $first) {
      <details [open]="!!search().trim() || (opened()[month.key] ?? firstMonth)" (toggle)="remember(month.key, $event)">
        <summary class="month"><strong>{{ month.label }}</strong><span>{{ month.count }}</span>@if (month.unread) { <small>{{ month.unread }} non lu(s)</small> }</summary>
        @for (contact of month.contacts; track contact.key; let firstContact = $first) {
          <details class="contact" [open]="!!search().trim() || (opened()[month.key + contact.key] ?? (firstMonth && firstContact))" (toggle)="remember(month.key + contact.key, $event)">
            <summary><span class="contact-name" [title]="contact.name">{{ contact.name }}</span><span>{{ contact.items.length }}</span>@if (contact.unread) { <small>{{ contact.unread }} non lu(s)</small> }</summary>
            <small class="school">{{ contact.school }}</small>
            @for (item of contact.items.slice(0, limits()[month.key + contact.key] ?? 10); track item.id; let first = $first; let index = $index) {
              @if (first || day(item) !== day(contact.items[index - 1])) { <p class="date">{{ dayLabel(item) }}</p> }
              <button type="button" class="ss__conv" [class.selected]="selectedId() === item.id" [class.unread]="item.unread"
                [attr.aria-current]="selectedId() === item.id ? 'true' : null" [disabled]="disabled()" (click)="selected.emit(item)">
                <strong>{{ item.subject }}</strong>
                @if (item.studentName) { <span>{{ item.studentName }}</span> }
                <small>{{ item.lastMessageAt || item.createdAt | date:'dd/MM/yyyy HH:mm' }} @if (item.unread) { · Non lu }</small>
              </button>
            }
            @if (contact.items.length > (limits()[month.key + contact.key] ?? 10)) {
              <button class="more" type="button" (click)="more(month.key + contact.key)">Afficher davantage de conversations</button>
            }
          </details>
        }
      </details>
    } @empty { <p class="empty">Aucune conversation ne correspond à votre recherche.</p> }
    </div>
  `,
  styles: [`:host{display:block;min-width:0}.search{display:grid;gap:.4rem;padding:.75rem;font-size:.8rem}input{min-width:0;width:100%;box-sizing:border-box;padding:.6rem .7rem;border:1px solid var(--theme-control-border,#cbd5e1);border-radius:.45rem;background:var(--theme-field,#fff);color:var(--theme-ink,#1e293b)}.groups{max-height:65vh;overflow:auto}summary{padding:.7rem .8rem;cursor:pointer;overflow-wrap:anywhere;line-height:1.5}summary span,summary small{margin-left:.4rem}summary small,.school{color:var(--theme-muted,#64748b)}.month{background:var(--theme-inset,#f1f5f9);text-transform:capitalize;border-top:1px solid var(--theme-border,#ddd)}.contact{margin:.3rem .5rem;border:1px solid var(--theme-border,#ddd);border-radius:.5rem;overflow:hidden}.contact-name{font-weight:600;display:inline-block;vertical-align:middle;max-width:calc(100% - 4rem);overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.school{display:block;padding:0 .8rem .4rem}.date{margin:0;padding:.4rem .8rem;font-size:.75rem;background:var(--theme-inset,#f1f5f9);color:var(--theme-muted,#64748b)}.ss__conv{display:grid;gap:.25rem;width:100%;padding:.65rem .8rem;border:0;border-top:1px solid var(--theme-border,#ddd);background:var(--theme-surface,#fff);color:var(--theme-ink,#1e293b);text-align:left;font:inherit;overflow-wrap:anywhere;cursor:pointer}.ss__conv small{color:var(--theme-muted,#64748b);font-size:.75rem}.ss__conv:hover,.selected{background:var(--theme-success-soft,#ecfdf5)}.unread strong{color:var(--theme-success,#15803d)}button:disabled{opacity:.55;cursor:not-allowed}.more{padding:.6rem .8rem;width:100%;background:var(--theme-soft,#e0f2fe);color:var(--theme-ink,#1e293b);border:0;cursor:pointer}summary:focus-visible,button:focus-visible,input:focus-visible{outline:3px solid var(--theme-focus,#7dd3fc);outline-offset:-3px}.empty{padding:.75rem}@media(max-width:860px){.groups{max-height:24rem}}`],
})
export class ConversationBrowser {
  private readonly auth = inject(AuthService);
  readonly items = input.required<ConversationSummary[]>();
  readonly selectedId = input<number | null>(null);
  readonly disabled = input(false);
  readonly selected = output<ConversationSummary>();
  readonly search = signal('');
  readonly opened = signal<Record<string, boolean>>({});
  readonly limits = signal<Record<string, number>>({});
  readonly groups = computed(() => {
    const user = this.auth.user();
    return groupConversations(this.items(), this.search(), [user?.firstName, user?.lastName].filter(Boolean).join(' '), user?.role === 'proprietaire' || user?.role === 'admin');
  });
  day(item: ConversationSummary): string { return conversationDate(item.lastMessageAt || item.createdAt).day; }
  dayLabel(item: ConversationSummary): string { return conversationDate(item.lastMessageAt || item.createdAt).dayLabel; }
  remember(key: string, event: Event): void { this.opened.update(state => ({ ...state, [key]: (event.target as HTMLDetailsElement).open })); }
  more(key: string): void { this.limits.update(state => ({ ...state, [key]: (state[key] ?? 10) + 10 })); }
}
