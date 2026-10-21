/** Prefer the API's user-facing explanation; never display a raw HTTP/JavaScript error. */
export function apiError(error: unknown, fallback: string): string {
  const response = error as { status?: number; error?: { message?: unknown } } | null;
  if (response?.status === 0) {
    return 'Connexion au serveur impossible. Vérifiez votre connexion puis réessayez.';
  }
  const message = response?.error?.message;
  return typeof message === 'string' && message.trim() ? message.trim() : fallback;
}
