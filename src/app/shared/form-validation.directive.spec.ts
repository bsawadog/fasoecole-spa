import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { FormValidationDirective } from './form-validation.directive';

@Component({
  standalone: true,
  imports: [FormsModule, FormValidationDirective],
  template: `<form (ngSubmit)="submitted = submitted + 1">
    <label>Nom<input name="name" [(ngModel)]="name" required /></label>
    <label>Courriel<input name="email" type="email" email [(ngModel)]="email" required /></label>
    <label>Téléphone<input name="phone" type="tel" [(ngModel)]="phone" /></label>
    <label>Note<input name="grade" type="number" min="0" max="20" step="0.5" [(ngModel)]="grade" /></label>
    <button type="submit">Enregistrer</button>
  </form>`,
})
class TestForm {
  name = 'Awa';
  email = 'awa@example.com';
  phone = '';
  grade = 12;
  submitted = 0;
}

describe('FormValidationDirective', () => {
  async function setup() {
    TestBed.configureTestingModule({ imports: [TestForm] });
    const fixture = TestBed.createComponent(TestForm);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const form = fixture.nativeElement.querySelector('form') as HTMLFormElement;
    const submit = () => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    async function fill(name: string, value: string) {
      const input = form.querySelector(`[name="${name}"]`) as HTMLInputElement;
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
      return input;
    }
    return { fixture, form, submit, fill };
  }

  it('shows an invalid email, focuses it and blocks the submit handler', async () => {
    const { fixture, form, submit, fill } = await setup();
    const email = await fill('email', 'awa@');
    submit();
    expect(fixture.componentInstance.submitted).toBe(0);
    expect(form.querySelector('.form-validation-error')?.textContent).toContain('courriel valide');
    expect(email.getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(email);
    expect(form.querySelector('[role="alert"]')?.textContent).toContain('Corrigez');
  });

  it('allows submission after correcting the email and removes its error', async () => {
    const { fixture, form, submit, fill } = await setup();
    await fill('email', 'awa@');
    submit();
    const email = await fill('email', 'awa@example.com');
    submit();
    expect(fixture.componentInstance.submitted).toBe(1);
    expect(email.hasAttribute('aria-invalid')).toBe(false);
    expect(form.querySelector('.form-validation-error')).toBeNull();
    expect(form.querySelector('[role="alert"]')).toBeNull();
  });

  it('rejects a required name containing only spaces', async () => {
    const { fixture, form, submit, fill } = await setup();
    await fill('name', '   ');
    submit();
    expect(fixture.componentInstance.submitted).toBe(0);
    expect(form.querySelector('.form-validation-error')?.textContent).toContain('obligatoire');
  });

  it('validates phone format and numeric bounds while allowing an optional empty phone', async () => {
    const { fixture, form, submit, fill } = await setup();
    await fill('phone', 'abc123');
    await fill('grade', '21');
    submit();
    expect(fixture.componentInstance.submitted).toBe(0);
    expect(form.textContent).toContain('téléphone valide');
    expect(form.textContent).toContain('maximale est 20');
    await fill('phone', '');
    await fill('grade', '12.5');
    submit();
    expect(fixture.componentInstance.submitted).toBe(1);
  });
});
