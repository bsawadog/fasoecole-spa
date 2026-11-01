export const ACTION_ID = 'X-Offline-Action-Id';
export const ACTION_REPLAY = 'X-Offline-Action-Replay';
export interface PendingAction {
  operationId: string; userId: number; role: string; path: string; payload: unknown;
  label: string; createdAt: string; school: string | null; year: string | null;
  attempted?: boolean; issue?: string; paused?: boolean;
}
/** Only independent creations whose server endpoints support delivery receipts. */
export function queuedActionLabel(method: string, path: string, role: string): string | null {
  if (method !== 'POST') return null;
  const staff = role === 'proprietaire' || role === 'admin';
  if (staff && /^\/school-life\/schools\/\d+\/events$/.test(path)) return 'Événement du calendrier';
  if (staff && /^\/school-life\/schools\/\d+\/observations$/.test(path)
      || role === 'enseignant' && /^\/school-life\/classes\/\d+\/observations$/.test(path)) return 'Observation de discipline';
  if ((role === 'parent' || role === 'etudiant') && /^\/school-life\/students\/\d+\/requests$/.test(path)) return 'Demande administrative';
  if (staff && /^\/school-life\/schools\/\d+\/books$/.test(path)) return 'Fiche du catalogue de bibliothèque';
  if (role === 'enseignant' && /^\/me\/teacher\/classes\/\d+\/lessons$/.test(path)) return 'Séance du cahier de textes';
  if (role === 'enseignant' && path === '/me/teacher/daily/notes') return 'Note personnelle';
  if (role === 'etudiant' && /^\/me\/student\/profiles\/\d+\/tasks$/.test(path)) return 'Rappel de mon organisation';
  return null;
}
export function actionQueued(error: unknown): boolean {
  return (error as { error?: { actionQueued?: boolean } })?.error?.actionQueued === true;
}
