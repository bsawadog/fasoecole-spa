import { DestroyRef, Directive, ElementRef, inject } from '@angular/core';
import { FormGroupDirective, NgForm } from '@angular/forms';

type Field = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
let nextErrorId = 0;

/** Visible validation for template and reactive forms, before their submit handlers run. */
@Directive({ selector: 'form', standalone: true })
export class FormValidationDirective {
  private readonly form = inject<ElementRef<HTMLFormElement>>(ElementRef).nativeElement;
  private readonly template = inject(NgForm, { optional: true, self: true });
  private readonly reactive = inject(FormGroupDirective, { optional: true, self: true });
  private readonly messages = new Map<Field, HTMLElement>();
  private submitted = false;
  private destroyed = false;
  private summary?: HTMLElement;

  constructor() {
    const submit = (event: Event) => {
      this.submitted = true;
      const control = this.reactive?.control ?? this.template?.control;
      control?.markAllAsTouched();
      const invalid = this.fields().filter(field => this.render(field));
      if (invalid.length || control?.invalid || control?.pending) {
        event.preventDefault();
        event.stopImmediatePropagation();
        this.showSummary(control?.pending ? 'Validation en cours. Réessayez dans un instant.' : 'Corrigez les champs indiqués avant d’enregistrer.');
        invalid[0]?.focus();
      } else this.summary?.remove();
    };
    const update = (event: Event) => {
      const field = event.target as Field;
      if (!this.fields().includes(field)) return;
      if (event.type === 'blur' || this.submitted || this.messages.has(field)) {
        // Let Angular update ngModel/FormControl before reading validation errors.
        queueMicrotask(() => {
          if (this.destroyed || !this.form.contains(field)) return;
          this.render(field);
          const control = this.reactive?.control ?? this.template?.control;
          if (this.submitted && !control?.invalid && !control?.pending && this.fields().every(item => !this.error(item))) this.summary?.remove();
        });
      }
    };
    this.form.addEventListener('submit', submit, true);
    for (const type of ['blur', 'input', 'change']) this.form.addEventListener(type, update, true);
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.form.removeEventListener('submit', submit, true);
      for (const type of ['blur', 'input', 'change']) this.form.removeEventListener(type, update, true);
    });
  }

  private fields(): Field[] {
    return Array.from(this.form.querySelectorAll<Field>('input, select, textarea'))
      .filter(field => !field.disabled && !['submit', 'button', 'hidden', 'reset'].includes(field.type));
  }

  private error(field: Field): string | null {
    const control = (this.reactive?.control ?? this.template?.control)?.get(field.getAttribute('formControlName') ?? field.name);
    const errors = control?.errors ?? {};
    const validity = field.validity;
    const value = field.value.trim();
    if (validity.badInput) return field.type === 'number' ? 'Saisissez un nombre valide.' : 'La valeur saisie est invalide.';
    if (validity.valueMissing || errors['required'] || (field.required && !value)) return 'Ce champ est obligatoire.';
    if (!value) return null;
    if (field.type === 'email' && (validity.typeMismatch || errors['email'] || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))) return 'Saisissez un courriel valide, par exemple nom@exemple.com.';
    if (field.type === 'tel' && (!/^\+?[\d\s().-]+$/.test(value) || value.replace(/\D/g, '').length < 6 || value.replace(/\D/g, '').length > 15)) return 'Saisissez un numéro de téléphone valide (6 à 15 chiffres, avec un + éventuel).';
    if (validity.rangeUnderflow || errors['min']) return `La valeur minimale est ${(field as HTMLInputElement).min || errors['min']?.min}.`;
    if (validity.rangeOverflow || errors['max']) return `La valeur maximale est ${(field as HTMLInputElement).max || errors['max']?.max}.`;
    if (validity.tooShort || errors['minlength']) return `Saisissez au moins ${errors['minlength']?.requiredLength ?? (field as HTMLInputElement).minLength} caractères.`;
    if (validity.tooLong || errors['maxlength']) return `Saisissez au maximum ${errors['maxlength']?.requiredLength ?? (field as HTMLInputElement).maxLength} caractères.`;
    if (validity.patternMismatch || errors['pattern']) return field.title || 'Le format saisi est invalide.';
    if (validity.stepMismatch) return `Saisissez une valeur par incréments de ${(field as HTMLInputElement).step || '1'}.`;
    if (!validity.valid || control?.invalid) return 'La valeur saisie est invalide.';
    return null;
  }

  private render(field: Field): boolean {
    const error = this.error(field);
    const existing = this.messages.get(field);
    if (!error) {
      if (existing) {
        const described = (field.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(id => id !== existing.id).join(' ');
        if (described) field.setAttribute('aria-describedby', described); else field.removeAttribute('aria-describedby');
        existing.remove(); this.messages.delete(field);
        field.removeAttribute('aria-invalid');
      }
      return false;
    }
    field.setAttribute('aria-invalid', 'true');
    if (existing) existing.textContent = error;
    else {
      const message = this.form.ownerDocument.createElement('small');
      message.id = `form-validation-${++nextErrorId}`;
      message.className = 'form-validation-error';
      message.setAttribute('aria-live', 'polite');
      message.style.cssText = 'display:block;color:#b42318;font-size:12px;line-height:1.5;margin-top:5px;';
      message.textContent = error;
      field.insertAdjacentElement('afterend', message);
      field.setAttribute('aria-describedby', `${field.getAttribute('aria-describedby') ?? ''} ${message.id}`.trim());
      this.messages.set(field, message);
    }
    return true;
  }

  private showSummary(text: string): void {
    if (!this.summary) {
      this.summary = this.form.ownerDocument.createElement('p');
      this.summary.className = 'form-validation-summary';
      this.summary.setAttribute('role', 'alert');
      this.summary.style.cssText = 'color:#b42318;grid-column:1/-1;';
    }
    this.summary.textContent = text;
    this.form.prepend(this.summary);
  }
}
