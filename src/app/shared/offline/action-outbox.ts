export const ACTION_ID = 'X-Offline-Action-Id';
export const ACTION_REPLAY = 'X-Offline-Action-Replay';
export interface PendingAction {
  operationId: string; userId: number; role: string; path: string; payload: unknown;
  label: string; createdAt: string; school: string | null; year: string | null;
  attempted?: boolean; issue?: string; paused?: boolean;
}
/** Only independent creations whose server endpoints support delivery receipts. */
export function queuedActionLabel(method: string, path: string, role: string, payload?: unknown): string | null {
  if (method !== 'POST') return null;
  // A physical recount replaces the balance and cannot be replayed over concurrent movements.
  if (/\/stock\/\d+\/movements$/.test(path) && (payload as { kind?: string })?.kind === 'COUNT') return null;
  const staff = role === 'proprietaire' || role === 'admin';
  if (staff) {
    const creations: [RegExp, string][] = [
      [/^\/owner\/staff\/schools\/\d+$/, 'Création d’un employé'],
      [/^\/teacher-work\/schools\/\d+\/teachers$/, 'Création d’un enseignant'],
      [/^\/owner\/resources\/schools\/\d+\/assets$/, 'Fiche du patrimoine'],
      [/^\/owner\/resources\/schools\/\d+\/stock$/, 'Article de stock'],
      [/^\/owner\/resources\/schools\/\d+\/stock\/\d+\/movements$/, 'Mouvement de stock'],
      [/^\/owner\/expenses\/schools\/\d+\/categories$/, 'Catégorie de dépenses'],
      [/^\/owner\/expenses\/schools\/\d+\/expenses$/, 'Dépense réglée'],
      [/^\/owner\/payables\/schools\/\d+$/, 'Dépense à payer'],
      [/^\/owner\/payables\/schools\/\d+\/fixed$/, 'Charge fixe'],
      [/^\/owner\/payables\/schools\/\d+\/\d+\/payments$/, 'Versement sur une dépense'],
      [/^\/owner\/taxes\/schools\/\d+$/, 'Obligation fiscale'],
      [/^\/owner\/taxes\/schools\/\d+\/\d+\/payments$/, 'Versement fiscal'],
      [/^\/owner\/cash-book\/schools\/\d+\/entries$/, 'Mouvement de caisse'],
      [/^\/owner\/bank-book\/schools\/\d+\/entries$/, 'Mouvement de banque'],
      [/^\/owner\/finance\/schools\/\d+\/fee-types$/, 'Type de frais scolaires'],
      [/^\/owner\/finance\/invoices\/\d+\/payments$/, 'Paiement de frais scolaires'],
      [/^\/owner\/grades\/classes\/\d+\/evaluations$/, 'Évaluation'],
      [/^\/owner\/enrollment\/schools\/\d+\/students$/, 'Inscription d’un élève'],
    ];
    const match = creations.find(([pattern]) => pattern.test(path));
    if (match) return match[1];
  }
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
