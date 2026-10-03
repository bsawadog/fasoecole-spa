import { Component, inject, input, output, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export interface MessageAttachment { id: number; filename: string; sizeBytes: number; }

export function conversationBody(payload: unknown, files: File[]): unknown | FormData {
  if (!files.length) return payload;
  const body = new FormData();
  const message = payload as { content?: string };
  body.append('request', new Blob([JSON.stringify({ ...message, content: message.content?.trim() || 'Pièces jointes' })], { type: 'application/json' }));
  files.forEach(file => body.append('files', file, file.name));
  return body;
}

@Component({
  selector: 'app-conversation-files',
  standalone: true,
  template: `
    <label>Pièces jointes
      <input type="file" multiple [disabled]="disabled()" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.odp,.txt,.csv,.jpg,.jpeg,.png" (change)="choose($event)" />
    </label>
    <small>PDF, Word, Excel, PowerPoint, textes et images. Maximum 3 fichiers de 10 Mo.</small>
    @if (error()) { <p role="alert">{{ error() }}</p> }
    @for (file of files(); track $index) {
      <div>{{ file.name }} <button type="button" [disabled]="disabled()" (click)="remove($index)" [attr.aria-label]="'Retirer ' + file.name">Retirer</button></div>
    }
  `,
  styles: [`:host { display: grid; gap: .4rem; font-size: .85rem; } label { display: grid; gap: .35rem; } small { color: #64748b; } p { color: #b91c1c; margin: 0; } button { margin-left: .5rem; cursor: pointer; }`],
})
export class ConversationFiles {
  readonly files = input<File[]>([]);
  readonly filesChange = output<File[]>();
  readonly disabled = input(false);
  readonly error = signal<string | null>(null);
  choose(event: Event): void {
    const element = event.target as HTMLInputElement;
    const files = [...this.files(), ...Array.from(element.files ?? [])];
    element.value = '';
    if (files.length > 3 || files.some(file => !file.size || file.size > 10 * 1024 * 1024)) {
      this.error.set('Choisissez au maximum 3 fichiers non vides de 10 Mo chacun.'); return;
    }
    const allowed = /\.(pdf|docx?|xlsx?|pptx?|odt|ods|odp|txt|csv|jpe?g|png)$/i;
    if (files.some(file => !allowed.test(file.name))) { this.error.set('Ce format de fichier n’est pas pris en charge.'); return; }
    this.error.set(null);
    this.filesChange.emit(files);
  }
  remove(index: number): void {
    this.error.set(null);
    this.filesChange.emit(this.files().filter((_, i) => i !== index));
  }
}

@Component({
  selector: 'app-message-attachments',
  standalone: true,
  template: `
    @for (file of attachments(); track file.id) {
      <button type="button" [disabled]="downloading()" (click)="download(file)">📎 {{ file.filename }} ({{ size(file.sizeBytes) }})</button>
    }
    @if (error()) { <p role="alert">{{ error() }}</p> }
  `,
  styles: [`:host { display: grid; gap: .3rem; margin-top: .5rem; white-space: normal; } button { background: #fff; border: 1px solid #cbd5e1; border-radius: .35rem; padding: .4rem; color: #166534; text-align: left; overflow-wrap: anywhere; cursor: pointer; } p { color: #b91c1c; }`],
})
export class MessageAttachments {
  private readonly http = inject(HttpClient);
  readonly attachments = input<MessageAttachment[]>([]);
  readonly downloading = signal(false);
  readonly error = signal<string | null>(null);
  size(bytes: number): string { return bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} Ko` : `${(bytes / 1024 / 1024).toFixed(1)} Mo`; }
  download(file: MessageAttachment): void {
    if (this.downloading()) return;
    this.downloading.set(true);
    this.error.set(null);
    this.http.get(`${environment.apiUrl}/conversations/attachments/${file.id}`, { responseType: 'blob' }).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url; link.download = file.filename; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        this.downloading.set(false);
      },
      error: () => { this.downloading.set(false); this.error.set('Impossible de télécharger cette pièce jointe.'); },
    });
  }
}
