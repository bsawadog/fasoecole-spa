/** Prefer the API's user-facing explanation; never display a raw HTTP/JavaScript error. */
export function apiError(error: unknown, fallback: string): string {
  const response = error as { status?: number; error?: { message?: unknown; offline?: boolean } } | null;
  if (response?.status === 0) {
    if (response.error?.offline === true && typeof response.error.message === 'string' && response.error.message.trim()) return response.error.message.trim();
    return 'Connexion au serveur impossible. Vérifiez votre connexion puis réessayez.';
  }
  const message = response?.error?.message;
  return typeof message === 'string' && message.trim() ? message.trim() : fallback;
}
