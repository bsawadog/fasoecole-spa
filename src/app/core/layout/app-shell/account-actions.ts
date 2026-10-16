import { Component, computed, DestroyRef, ElementRef, HostListener, inject, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, EMPTY, exhaustMap, filter, timer } from 'rxjs';
import { LucideBell, LucideUserRound, LucideLogOut } from '@lucide/angular';
import { TooltipModule } from 'primeng/tooltip';
import { AuthService } from '../../auth';
import { Role, ROLE_LABEL, resolveRoles } from '../../models';
import { environment } from '../../../../environments/environment';

export interface AccountNotification {
  id: number;
  title: string;
  content: string;
  isRead: boolean;
  createdAt: string;
}

@Component({
  selector: 'app-account-actions',
  standalone: true,
  imports: [RouterLink, DatePipe, LucideBell, LucideUserRound, LucideLogOut, TooltipModule],
  templateUrl: './account-actions.html',
  styleUrl: './account-actions.scss',
})
export class AccountActions implements OnInit {
  readonly auth = inject(AuthService);
  private readonly http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);
  private readonly element: ElementRef<HTMLElement> = inject(ElementRef);
  private readonly router = inject(Router);
  readonly opened = signal<'profile' | 'notifications' | null>(null);
  readonly notifications = signal<AccountNotification[]>([]);
  readonly unread = computed(() => this.notifications().filter(item => !item.isRead).length);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly marking = signal<number[]>([]);
  readonly spaces = computed(() => resolveRoles(this.auth.user()?.rawRoles ?? []));
  readonly activeSpace = computed(() => this.auth.user()?.role);
  readonly switching = signal(false);
  readonly switchError = signal('');
  readonly refreshingSpaces = signal(false);

  spaceLabel(role: Role): string {
    return role === 'proprietaire' && !this.auth.user()?.rawRoles.includes('SCHOOL_ADMIN')
      ? 'Personnel administratif' : ROLE_LABEL[role];
  }

  async changeSpace(role: Role): Promise<void> {
    if (this.switching() || this.refreshingSpaces() || role === this.activeSpace()) return;
    this.switching.set(true);
    this.switchError.set('');
    if (await this.auth.switchRole(role)) this.opened.set(null);
    else this.switchError.set('Impossible de changer d’espace. Veuillez réessayer.');
    this.switching.set(false);
  }

  ngOnInit(): void {
    this.router.events.pipe(filter(event => event instanceof NavigationEnd), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.opened.set(null));
    timer(0, 30_000).pipe(
      filter(() => this.auth.user()?.approved === true && this.auth.user()?.emailVerified === true && !this.auth.user()?.mustChangePassword),
      exhaustMap(() => this.http.get<AccountNotification[]>(`${environment.apiUrl}/notifications/by-user/${this.auth.user()!.id}`).pipe(
        catchError(() => {
          this.loading.set(false);
          this.error.set('Impossible de charger les notifications.');
          return EMPTY;
        }),
      )),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(items => {
      this.notifications.set([...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      this.loading.set(false);
      this.error.set('');
    });
  }

  toggle(panel: 'profile' | 'notifications'): void {
    this.opened.update(current => current === panel ? null : panel);
    if (panel === 'profile' && this.opened() === 'profile' && !this.refreshingSpaces()) {
      this.refreshingSpaces.set(true);
      this.auth.refreshCurrentUser().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: () => { this.refreshingSpaces.set(false); this.switchError.set(''); },
        error: () => { this.refreshingSpaces.set(false); this.switchError.set('Impossible d’actualiser vos espaces. Réessayez en ouvrant ce menu.'); },
      });
    }
  }

  markRead(item: AccountNotification): void {
    if (item.isRead || this.marking().includes(item.id)) return;
    this.marking.update(ids => [...ids, item.id]);
    this.http.patch<AccountNotification>(`${environment.apiUrl}/notifications/${item.id}/read`, {}).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: updated => {
        this.notifications.update(items => items.map(entry => entry.id === updated.id ? updated : entry));
        this.marking.update(ids => ids.filter(id => id !== item.id));
        this.error.set('');
      },
      error: () => {
        this.marking.update(ids => ids.filter(id => id !== item.id));
        this.error.set('Impossible de marquer cette notification comme lue.');
      },
    });
  }

  @HostListener('document:click', ['$event'])
  closeOutside(event: Event): void {
    if (!this.element.nativeElement.contains(event.target as Node)) this.opened.set(null);
  }

  @HostListener('document:keydown.escape')
  closeWithKeyboard(): void {
    const panel = this.opened();
    if (!panel) return;
    this.opened.set(null);
    this.element.nativeElement.querySelector<HTMLButtonElement>(`[aria-controls="account-${panel}"]`)?.focus();
  }
}
