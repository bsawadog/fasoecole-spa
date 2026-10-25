import { ErrorAlert } from '../error-alert';
import { DialogModule } from 'primeng/dialog';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { DatePipe } from '@angular/common';
import { Component, DestroyRef, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ParentPortalService, PortalFile, PortalPost, POST_LABELS } from './parent-portal.service';

@Component({
  selector: 'app-portal-posts', standalone: true, imports: [ErrorAlert, DialogModule, ButtonModule, MessageModule, DatePipe],
  template: `
    @if (!posts().length) { <p class="ss__state">Aucune publication disponible.</p> }
    @if (error()) { <app-error-alert [message]="error()" (dismissed)="error.set(null)">{{ error() }}</app-error-alert> }
    @for (post of posts(); track post.id) {
      <article class="ss__card ss__body">
        <small class="ss__muted">{{ labels[post.kind] }} · {{ post.createdAt | date:'dd/MM/yyyy' }} · {{ post.className || 'Tout l’établissement' }}</small>
        @if (post.studentId) { <span class="ss__chip">Destiné à cet élève et à ses parents uniquement</span> }
        <h2>{{ post.title }}</h2>
        <p class="portal-content">{{ post.content }}</p>
        @if (post.dueDate) { <p><strong>Échéance : {{ post.dueDate | date:'dd/MM/yyyy' }}</strong></p> }
        @for (file of post.files; track file.id) {
          @if (isPdf(file)) { <button pButton type="button" class="ss__mini" [disabled]="downloading()" (click)="openPdf(post.id, file)">Ouvrir {{ file.filename }}</button> }
          <button pButton severity="secondary" variant="outlined" type="button" class="ss__mini" [disabled]="downloading()" (click)="download(post.id, file)">Télécharger {{ file.filename }}</button>
        }
      </article>
    }
    <p-dialog [visible]="previewVisible()" (visibleChange)="closePreview()" [modal]="true" [header]="previewName()" styleClass="portal-pdf-dialog" [style]="{width: 'min(960px, 96vw)'}" [maximizable]="true" appendTo="body">
      @if (previewUrl(); as url) { <iframe [src]="url" [title]="previewName()" class="portal-pdf-frame"></iframe><p class="portal-pdf-hint">Si l’aperçu n’est pas disponible sur votre appareil, utilisez le bouton Télécharger de la publication.</p> }
    </p-dialog>
  `,
  styleUrl: './self-space.scss', styles: [`@layer legacy { .portal-content { white-space: pre-wrap; overflow-wrap: anywhere; } :host { display: grid; gap: 1rem; } }`],
})
export class PortalPosts {
  private readonly api = inject(ParentPortalService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly sanitizer = inject(DomSanitizer);
  readonly previewVisible = signal(false);
  readonly previewUrl = signal<SafeResourceUrl | null>(null);
  readonly previewName = signal('');
  private objectUrl: string | null = null;
  constructor() { this.destroyRef.onDestroy(() => this.closePreview()); }
  isPdf(file: PortalFile): boolean { return /\.pdf$/i.test(file.filename); }
  closePreview(): void {
    this.previewVisible.set(false); this.previewUrl.set(null);
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    this.objectUrl = null;
  }
  openPdf(postId: number, file: PortalFile): void {
    if (this.downloading() || !this.isPdf(file)) return;
    this.downloading.set(true); this.error.set(null);
    this.api.file(this.scope(), this.scopeId(), postId, file.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: async blob => {
        try {
          const signature = await blob.slice(0, 5).text();
          if (this.destroyRef.destroyed) return;
          if (signature !== '%PDF-') throw new Error('PDF invalide');
          this.closePreview();
          this.objectUrl = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
          this.previewUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(this.objectUrl));
          this.previewName.set(file.filename); this.previewVisible.set(true);
        } catch { this.error.set('Ce fichier ne peut pas être ouvert comme PDF. Vous pouvez le télécharger.'); }
        finally { this.downloading.set(false); }
      },
      error: () => { this.error.set('Impossible d’ouvrir ce document.'); this.downloading.set(false); },
    });
  }
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
