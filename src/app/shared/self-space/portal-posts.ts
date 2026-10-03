import { DatePipe } from '@angular/common';
import { Component, DestroyRef, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ParentPortalService, PortalFile, PortalPost, POST_LABELS } from './parent-portal.service';

@Component({
  selector: 'app-portal-posts', standalone: true, imports: [DatePipe],
  template: `
    @if (!posts().length) { <p class="ss__state">Aucune publication disponible.</p> }
    @if (error()) { <p class="ss__alert ss__alert--error" role="alert">{{ error() }}</p> }
    @for (post of posts(); track post.id) {
      <article class="ss__card ss__body">
        <small class="ss__muted">{{ labels[post.kind] }} · {{ post.createdAt | date:'dd/MM/yyyy' }} · {{ post.className || 'Tout l’établissement' }}</small>
        @if (post.studentId) { <span class="ss__chip">Destiné aux parents de l’enfant uniquement</span> }
        <h2>{{ post.title }}</h2>
        <p class="portal-content">{{ post.content }}</p>
        @if (post.dueDate) { <p><strong>Échéance : {{ post.dueDate | date:'dd/MM/yyyy' }}</strong></p> }
        @for (file of post.files; track file.id) {
          <button type="button" class="ss__mini" [disabled]="downloading()" (click)="download(post.id, file)">Télécharger {{ file.filename }}</button>
        }
      </article>
    }
  `,
  styleUrl: './self-space.scss', styles: [`.portal-content { white-space: pre-wrap; overflow-wrap: anywhere; } :host { display: grid; gap: 1rem; }`],
})
export class PortalPosts {
  private readonly api = inject(ParentPortalService);
  private readonly destroyRef = inject(DestroyRef);
  readonly posts = input<PortalPost[]>([]);
  readonly scope = input<'student' | 'school' | 'teacher'>('student');
  readonly scopeId = input.required<number>();
  readonly labels = POST_LABELS;
  readonly downloading = signal(false);
  readonly error = signal<string | null>(null);
  download(postId: number, file: PortalFile): void {
    this.downloading.set(true); this.error.set(null);
    this.api.file(this.scope(), this.scopeId(), postId, file.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: blob => {
        const url = URL.createObjectURL(blob); const link = document.createElement('a');
        link.href = url; link.download = file.filename; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000); this.downloading.set(false);
      },
      error: () => { this.error.set('Impossible de télécharger ce document.'); this.downloading.set(false); },
    });
  }
}
