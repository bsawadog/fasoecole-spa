import { HttpErrorResponse } from '@angular/common/http';
import { apiError } from './api-error';

describe('apiError', () => {
  const fallback = 'La mise à jour a échoué.';
  it('preserves the actionable explanation returned by the API', () => {
    const message = 'Ce compte possède plusieurs rôles. Son titulaire peut modifier son identité depuis Mon profil.';
    expect(apiError(new HttpErrorResponse({ status: 400, error: { message } }), fallback)).toBe(message);
  });
  it('explains a network failure instead of suggesting a form validation error', () => {
    expect(apiError(new HttpErrorResponse({ status: 0 }), fallback)).toContain('Vérifiez votre connexion');
  });
  it.each([null, undefined, new Error('Technical failure'), { error: {} },
    { error: { message: '' } }, { error: { message: '  ' } }, { error: { message: { code: 400 } } },
  ])('retains the contextual fallback when no readable API message is available: %j', error => {
    expect(apiError(error, fallback)).toBe(fallback);
  });
});
