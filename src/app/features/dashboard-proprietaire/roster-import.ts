import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { Component, computed, DestroyRef, effect, ElementRef, inject, Injector, input, output, signal, viewChild } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ClassRecord, OwnerManagementService, SubjectRecord } from './owner-management.service';
import { TeacherWorkService } from './teacher-work.service';
import { PayrollService } from './payroll.service';
import { ConfirmationService } from '../../shared/confirmation/confirmation.service';

interface ImportRow { line: number; data: Record<string, string>; classId: number; subjectId: number; errors: string[]; status: string; studentId?: number; }
interface ImportOutcome { severity: 'success' | 'error'; title: string; message: string; details: string[]; refresh: boolean; }

/** CSV parsing preserves quoted separators, escaped quotes and multiline values. */
function parseCsv(text: string): string[][] {
  text = text.replace(/^\uFEFF/, '');
  const first = text.split(/\r?\n/)[0];
  const delimiter = first.includes(';') ? ';' : first.includes('\t') ? '\t' : ',';
  const rows: string[][] = []; let row: string[] = [], value = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') { value += '"'; i++; }
      else if (quoted || !value) quoted = !quoted;
      else throw new Error('Guillemet inattendu dans le fichier CSV.');
    } else if (!quoted && c === delimiter) { row.push(value.trim()); value = ''; }
    else if (!quoted && (c === '\n' || c === '\r')) {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(value.trim()); if (row.some(Boolean)) rows.push(row); row = []; value = '';
    } else value += c;
  }
  if (quoted) throw new Error('Une cellule entre guillemets est incomplète.');
  row.push(value.trim()); if (row.some(Boolean)) rows.push(row);
  return rows;
}
const normalize = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim().replace(/[ ’'-]+/g, '_');

/** Read the first XLSX worksheet without evaluating formulas or extracting files. */
async function readWorkbook(file: File): Promise<string[][]> {
  const bytes = new Uint8Array(await file.arrayBuffer()), view = new DataView(bytes.buffer);
  let end = bytes.length - 22;
  while (end >= Math.max(0, bytes.length - 65557) && view.getUint32(end, true) !== 0x06054b50) end--;
  if (end < 0 || view.getUint32(end, true) !== 0x06054b50) throw new Error('Classeur Excel illisible.');
  const count = view.getUint16(end + 10, true), entries = new Map<string, { offset: number; size: number; unpacked: number; method: number }>();
  if (count > 500) throw new Error('Classeur trop complexe.');
  let offset = view.getUint32(end + 16, true), total = 0;
  for (let i = 0; i < count; i++) {
    if (view.getUint32(offset, true) !== 0x02014b50) throw new Error('Classeur Excel invalide.');
    const nameLength = view.getUint16(offset + 28, true), extra = view.getUint16(offset + 30, true), comment = view.getUint16(offset + 32, true);
    const name = new TextDecoder().decode(bytes.slice(offset + 46, offset + 46 + nameLength));
    const unpacked = view.getUint32(offset + 24, true); total += unpacked;
    if (total > 20 * 1024 * 1024 || unpacked > 8 * 1024 * 1024) throw new Error('Classeur décompressé trop volumineux.');
    if (view.getUint16(offset + 8, true) & 1) throw new Error('Les classeurs chiffrés ne sont pas pris en charge.');
    entries.set(name, { offset: view.getUint32(offset + 42, true), size: view.getUint32(offset + 20, true), unpacked, method: view.getUint16(offset + 10, true) });
    offset += 46 + nameLength + extra + comment;
  }
  async function xml(name: string): Promise<Document> {
    const entry = entries.get(name); if (!entry) throw new Error(`Contenu Excel manquant : ${name}.`);
    const start = entry.offset + 30 + view.getUint16(entry.offset + 26, true) + view.getUint16(entry.offset + 28, true);
    const compressed = bytes.slice(start, start + entry.size);
    let decoded: Uint8Array = compressed;
    if (entry.method === 8) {
      const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      const reader = stream.getReader(); const chunks: Uint8Array[] = []; let size = 0;
      try { for (;;) { const item = await reader.read(); if (item.done) break; size += item.value.length; if (size > entry.unpacked || size > 8 * 1024 * 1024) throw new Error('Contenu Excel trop volumineux.'); chunks.push(item.value); } }
      finally { await reader.cancel(); }
      decoded = new Uint8Array(size); let cursor = 0; for (const chunk of chunks) { decoded.set(chunk, cursor); cursor += chunk.length; }
    } else if (entry.method !== 0) throw new Error('Compression Excel non prise en charge.');
    const text = new TextDecoder().decode(decoded);
    if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error('Contenu XML non autorisé.');
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    if (doc.querySelector('parsererror')) throw new Error('Contenu Excel invalide.'); return doc;
  }
  const workbook = await xml('xl/workbook.xml'), sheet = workbook.getElementsByTagName('sheet')[0];
  const id = sheet?.getAttribute('r:id');
  const relationships = await xml('xl/_rels/workbook.xml.rels');
  const relation = Array.from(relationships.getElementsByTagName('Relationship')).find(r => r.getAttribute('Id') === id);
  const target = relation?.getAttribute('Target');
  if (!target || relation?.getAttribute('TargetMode') === 'External' || target.includes('..')) throw new Error('Feuille Excel introuvable.');
  const strings: string[] = [];
  if (entries.has('xl/sharedStrings.xml')) {
    const doc = await xml('xl/sharedStrings.xml');
    for (const si of Array.from(doc.getElementsByTagName('si'))) strings.push(Array.from(si.getElementsByTagName('t')).map(t => t.textContent ?? '').join(''));
  }
  const doc = await xml(target.startsWith('/') ? target.slice(1) : 'xl/' + target);
  const rows: string[][] = [];
  for (const element of Array.from(doc.getElementsByTagName('row'))) {
    const row: string[] = [];
    for (const cell of Array.from(element.getElementsByTagName('c'))) {
      if (cell.getElementsByTagName('f').length) throw new Error('Remplacez les formules Excel par leurs valeurs avant l’import.');
      const ref = cell.getAttribute('r')?.match(/^([A-Z]+)/)?.[1]; if (!ref) throw new Error('Référence de cellule Excel invalide.');
      let column = 0; for (const letter of ref) column = column * 26 + letter.charCodeAt(0) - 64;
      if (column > 50) throw new Error('Maximum : 50 colonnes.');
      const value = cell.getElementsByTagName('v')[0]?.textContent ?? '';
      row[column - 1] = cell.getAttribute('t') === 's' ? strings[Number(value)] ?? '' : cell.getAttribute('t') === 'inlineStr' ? Array.from(cell.getElementsByTagName('t')).map(t => t.textContent ?? '').join('') : value;
    }
    if (row.some(Boolean)) rows.push(Array.from({ length: row.length }, (_, i) => row[i] ?? ''));
    if (rows.length > 501) throw new Error('Maximum : 500 lignes de données.');
  }
  const headers = rows[0]?.map(normalize) ?? [];
  const epoch = workbook.getElementsByTagName('workbookPr')[0]?.getAttribute('date1904') === '1' ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
  for (const row of rows.slice(1)) {
    while (row.length < headers.length) row.push('');
    headers.forEach((h, i) => { if (['date_naissance', 'date_embauche', 'echeance', 'date_paiement'].includes(h) && /^\d+(\.\d+)?$/.test(row[i])) { const date = new Date(epoch + Number(row[i]) * 86400000); if (!Number.isNaN(date.getTime())) row[i] = date.toISOString().slice(0, 10); } });
  }
  return rows;
}

@Component({
  imports: [ButtonModule, MessageModule],
  selector: 'app-roster-import', standalone: true,
  styleUrl: './roster-import.scss',
  template: `
    <details class="import" [attr.aria-busy]="busy()"><summary>Importer {{ kind() === 'teachers' ? 'des enseignants' : 'des élèves / étudiants' }} depuis un fichier</summary>
      <p>Formats acceptés : <strong>Excel .xlsx ou CSV UTF-8</strong>. Seule la première feuille Excel est utilisée. Maximum : 500 lignes et 2 Mo. Les formules doivent être remplacées par leurs valeurs.</p>
      <button pButton type="button" (click)="download()">Télécharger le modèle CSV</button>
      <p>Colonnes obligatoires : <strong>{{ required().join(', ') }}</strong>.</p>
      <p>Colonnes facultatives : {{ optional().join(', ') }}. Dates : AAAA-MM-JJ. Matricules et numéros d’employé : cellules au format texte pour conserver les zéros.</p>
      <p>Utilisez le nom exact d’une classe de l’année sélectionnée{{ kind() === 'teachers' ? ' et d’une matière de cet établissement. Répétez un enseignant avec le même numéro d’employé pour plusieurs affectations' : '. Une ligne représente un élève. Pour ajouter un parent ou tuteur, renseignez parent_prénom et parent_nom ; son courriel et son téléphone sont facultatifs. lien_parenté indique Père, Mère, Tuteur…' }}.</p>
      <p>Le courriel de l’élève ou de l’enseignant est facultatif : la colonne peut être absente ou vide. Le matricule ou le numéro d’employé identifie chaque personne. Aucun mot de passe à fournir ; une invitation est envoyée uniquement lorsqu’un courriel est disponible. Un courriel omis ne supprime pas celui d’un dossier existant.</p>
      <p>Classes disponibles : {{ classNames() }}.</p>
      <p>Les montants sont en FCFA, avec deux décimales maximum. Laissez une cellule vide pour conserver les paiements existants ; 0 signifie aucun paiement.</p>
      @if (kind() === 'students') {
        <p>Un parent ou tuteur peut être renseigné par ligne. Son nom, son téléphone et son lien de parenté apparaissent dans l’aperçu. Une ligne sans ces informations importe seulement l’élève. Pour ajouter d’autres parents, utilisez sa fiche. L’élève, ses frais et son parent sont enregistrés ensemble : une erreur annule toute la ligne.</p>
        <p>Pour reprendre les frais : renseignez <strong>type_frais, frais, échéance</strong>. Le type doit déjà exister dans Frais et paiements. Une même combinaison élève, année, type et échéance retrouve le frais existant. Le matricule retrouve aussi les élèves déjà importés, sans modifier leur identité.</p>
      } @else {
        <p>Pour reprendre un salaire mensuel fixe : renseignez <strong>salaire, mois_salaire (AAAA-MM)</strong>. Le numéro d’employé retrouve les enseignants existants. Les taux horaires et les salaires selon présence se gèrent dans leur fiche. Répétez les mêmes montants sur les lignes d’affectation d’un même enseignant.</p>
      }
      <p><strong>paiement est le total déjà versé</strong> pour ce frais ou ce mois, et non un versement supplémentaire. Si ce total augmente, renseignez date_paiement et mode_paiement : CASH (espèces), MOBILE_MONEY, BANK_TRANSFER ou CARD. Les paiements enregistrés ne sont jamais effacés par l’import.</p>
      @if (kind() === 'teachers') { <p>Matières disponibles : {{ subjectNames() }}.</p> }
      <input class="import__file" type="file" accept=".csv,.xlsx" aria-label="Fichier Excel ou CSV à importer" [disabled]="busy() || outcome() !== null" (change)="load($event)">
      @if (message()) { <p-message [severity]="messageSeverity()" role="status">{{ message() }}</p-message> }
      @if (rows().length) {
        <p>{{ rows().length }} lignes — {{ invalid() }} avec erreur. Les contrôles de doublons et d’autorisation du serveur sont appliqués lors de l’enregistrement.</p>
        <div class="scroll"><table><thead><tr><th>Ligne</th><th>Nom</th><th>Courriel</th><th>Classe</th>@if (kind() === 'students') { <th>Parent / tuteur</th> }<th>{{ kind() === 'students' ? 'Frais' : 'Salaire' }}</th><th>Paiement cumulé</th><th>Résultat</th></tr></thead><tbody>
          @for (row of rows(); track row.line) { <tr><td>{{ row.line }}</td><td>{{ row.data['prenom'] }} {{ row.data['nom'] }}</td><td>{{ row.data['courriel'] || '—' }}</td><td>{{ row.data['classe'] }}</td>@if (kind() === 'students') { <td>@if (row.data['parent_prenom'] || row.data['parent_nom']) { <strong>{{ row.data['parent_prenom'] }} {{ row.data['parent_nom'] }}</strong><div>{{ row.data['parent_telephone'] || 'Téléphone non renseigné' }}</div><div>{{ row.data['parent_courriel'] || 'Sans courriel' }}</div><div>{{ row.data['lien_parente'] || 'Lien non renseigné' }}</div> } @else { Non renseigné }</td> }<td>{{ row.data[kind() === 'students' ? 'frais' : 'salaire'] || '—' }}</td><td>{{ row.data['paiement'] || '—' }}</td><td class="import__result" [class.import__result--error]="rowHasError(row)" [class.import__result--success]="!rowHasError(row)">{{ row.errors.join(' ; ') || row.status }}</td></tr> }
        </tbody></table></div>
        <button pButton severity="success" class="import__confirm" type="button" [disabled]="busy() || outcome() !== null || invalid() > 0 || remaining() === 0" (click)="save()">{{ busy() ? 'Import en cours…' : 'Confirmer / reprendre l’import' }}</button>
        <p>L’import s’effectue ligne par ligne. Les lignes enregistrées sont conservées si une autre ligne échoue. Gardez cette page ouverte pendant l’import.</p>
      }
    </details>
    @if (busy()) {
      <div class="import-progress" role="status" aria-live="polite">
        <div class="import-progress__content">
          <span class="import-progress__spinner" aria-hidden="true"></span>
          <p>Import en cours…</p>
          <small>Veuillez patienter et garder cette page ouverte.</small>
        </div>
      </div>
    }
    <dialog #resultDialog class="import-dialog" [class.import-dialog--error]="outcome()?.severity === 'error'"
      [attr.role]="outcome()?.severity === 'error' ? 'alertdialog' : 'dialog'" aria-modal="true"
      [attr.aria-label]="outcome()?.title" (cancel)="onOutcomeCancel($event)" (close)="acknowledgeOutcome()">
      @if (outcome(); as result) {
        <div class="import-dialog__icon" aria-hidden="true">{{ result.severity === 'error' ? '!' : '✓' }}</div>
        <h2>{{ result.title }}</h2>
        <p>{{ result.message }}</p>
        @if (result.details.length) { <ul>@for (detail of result.details; track $index) { <li>{{ detail }}</li> }</ul> }
        <div class="import-dialog__actions"><button pButton type="button" [severity]="result.severity === 'error' ? 'danger' : 'success'" (click)="acknowledgeOutcome()" autofocus>OK</button></div>
      }
    </dialog>`,
  styles: [`@layer legacy { .import{margin:1rem 0;padding:1rem;border:1px solid var(--theme-control-border, #cbd5e1);border-radius:12px;background:var(--theme-surface, #f8fafc)}summary{cursor:pointer;font-weight:600}p{font-size:.9rem}button{padding:.6rem;margin:.4rem;border-radius:8px;border:1px solid var(--theme-control-border, #94a3b8);cursor:pointer}button:disabled{opacity:.5;cursor:default}.scroll{max-height:340px;overflow:auto}table{width:100%;border-collapse:collapse;font-size:.85rem}th,td{padding:.6rem;text-align:left;border-bottom:1px solid var(--theme-control-border, #cbd5e1)} }`],
})
export class RosterImport {
  readonly schoolId = input.required<number>();
  readonly kind = input.required<'teachers' | 'students'>();
  readonly classes = input.required<ClassRecord[]>();
  readonly subjects = input<SubjectRecord[]>([]);
  readonly completed = output<void>();
  private readonly api = inject(OwnerManagementService);
  private readonly teachers = inject(TeacherWorkService);
  private readonly injector = inject(Injector);
  private readonly confirmation = inject(ConfirmationService);
  readonly rows = signal<ImportRow[]>([]);
  readonly busy = signal(false);
  readonly message = signal('');
  readonly messageSeverity = signal<'success' | 'error'>('success');
  readonly outcome = signal<ImportOutcome | null>(null);
  private readonly resultDialog = viewChild.required<ElementRef<HTMLDialogElement>>('resultDialog');
  private teacherIds = new Map<string, number>();
  private generation = 0;
  private destroyed = false;
  readonly required = computed(() => ['prénom', 'nom', this.kind() === 'teachers' ? 'numéro_employé' : 'matricule', 'classe', ...(this.kind() === 'teachers' ? ['matière'] : [])]);
  readonly optional = computed(() => [
    'courriel',
    ...(this.kind() === 'teachers' ? ['téléphone', 'spécialité', 'date_embauche', 'salaire', 'mois_salaire'] : ['téléphone', 'date_naissance', 'sexe', 'parent_prénom', 'parent_nom', 'parent_courriel', 'parent_téléphone', 'lien_parenté', 'type_frais', 'frais', 'échéance']),
    'paiement', 'date_paiement', 'mode_paiement',
  ]);
  readonly invalid = computed(() => this.rows().filter(r => r.errors.length).length);
  readonly remaining = computed(() => this.rows().filter(r => r.status !== 'Enregistré').length);
  readonly classNames = computed(() => this.classes().map(c => c.name).join(', ') || 'Créez une classe avant l’import');
  readonly subjectNames = computed(() => this.subjects().map(s => s.name).join(', '));
  constructor() {
    inject(DestroyRef).onDestroy(() => { this.destroyed = true; this.generation++; });
    effect(() => { this.schoolId(); this.classes(); this.generation++; this.rows.set([]); this.teacherIds.clear(); this.message.set(''); this.outcome.set(null); });
    effect(() => {
      const result = this.outcome(), dialog = this.resultDialog().nativeElement;
      if (result && !dialog.open) dialog.showModal();
      if (!result && dialog.open) dialog.close();
    });
  }
  rowHasError(row: ImportRow): boolean {
    return row.errors.length > 0 || (row.status !== 'À importer' && row.status !== 'Enregistré');
  }
  private showOutcome(result: ImportOutcome): void {
    this.message.set(result.message); this.messageSeverity.set(result.severity); this.outcome.set(result);
  }
  private errorDetails(rows: ImportRow[]): string[] {
    const failed = rows.filter(row => this.rowHasError(row));
    const details = failed.slice(0, 10).map(row => `Ligne ${row.line} — ${row.data['prenom']} ${row.data['nom']} : ${row.errors.join(' ; ') || row.status}`);
    if (failed.length > 10) details.push(`${failed.length - 10} autres lignes en erreur : consultez la colonne Résultat.`);
    return details;
  }
  acknowledgeOutcome(): void {
    const result = this.outcome();
    if (!result) return;
    this.outcome.set(null);
    if (this.resultDialog().nativeElement.open) this.resultDialog().nativeElement.close();
    if (result.refresh && !this.destroyed) this.completed.emit();
  }
  onOutcomeCancel(event: Event): void { event.preventDefault(); this.acknowledgeOutcome(); }
  download(): void {
    const blob = new Blob(['\uFEFF' + [...this.required(), ...this.optional()].join(';') + '\r\n'], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = `modele_${this.kind() === 'teachers' ? 'enseignants' : 'eleves'}.csv`; a.click(); URL.revokeObjectURL(url);
  }
  async load(event: Event): Promise<void> {
    if (this.busy() || this.outcome()) return;
    const input = event.target as HTMLInputElement, file = input.files?.[0]; input.value = '';
    this.rows.set([]); this.teacherIds.clear(); this.message.set(''); if (!file) return;
    const school = this.schoolId(), generation = ++this.generation;
    try {
      if (!/\.(csv|xlsx)$/i.test(file.name) || file.size > 2 * 1024 * 1024) throw new Error('Choisissez un fichier .xlsx ou CSV UTF-8 de moins de 2 Mo.');
      const table = /\.xlsx$/i.test(file.name) ? await readWorkbook(file) : parseCsv(await file.text()); if (school !== this.schoolId() || generation !== this.generation || this.destroyed) return;
      if (table.length < 2 || table.length > 501) throw new Error('Le fichier doit contenir de 1 à 500 lignes de données.');
      const headers = table.shift()!.map(normalize);
      if (new Set(headers).size !== headers.length) throw new Error('Deux colonnes portent le même nom.');
      for (const h of this.required().map(normalize)) if (!headers.includes(h)) throw new Error(`Colonne manquante : ${h}.`);
      const allowed = [...this.required(), ...this.optional()].map(normalize);
      for (const h of headers) if (!allowed.includes(h)) throw new Error(`Colonne inconnue : ${h || '(sans nom)'}. Utilisez les noms du modèle.`);
      const seen = new Set<string>(), identities = new Map<string, string>(), identifiers = new Map<string, string>(), emailIdentifiers = new Map<string, string>();
      this.rows.set(table.map((cells, index) => {
        const data = Object.fromEntries(headers.map((h, i) => [h, cells[i] ?? ''])); const errors: string[] = [];
        if (cells.length !== headers.length) errors.push('Nombre de cellules incorrect');
        for (const h of this.required().map(normalize)) if (!data[h]) errors.push(`${h} obligatoire`);
        for (const [h, limit] of Object.entries({ prenom: 100, nom: 100, courriel: 150, matricule: 50, numero_employe: 50, telephone: 30, specialite: 150, sexe: 10, parent_prenom: 100, parent_nom: 100, parent_courriel: 150, parent_telephone: 30, lien_parente: 50 })) if ((data[h]?.length ?? 0) > limit) errors.push(`${h} : maximum ${limit} caractères`);
        for (const h of ['courriel', 'parent_courriel']) if (data[h] && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data[h])) errors.push(`${h} invalide`);
        for (const h of ['date_naissance', 'date_embauche', 'echeance', 'date_paiement']) if (data[h] && (!/^\d{4}-\d{2}-\d{2}$/.test(data[h]) || Number.isNaN(Date.parse(data[h])) || new Date(data[h]).toISOString().slice(0, 10) !== data[h])) errors.push(`${h} : date invalide`);
        for (const h of ['frais', 'salaire', 'paiement']) {
          if (data[h]) {
            const value = data[h].replace(/[\s\u00a0\u202f]/g, '').replace(',', '.');
            if (!/^\d{1,10}(\.\d{1,2})?$/.test(value)) errors.push(`${h} : montant positif, deux décimales maximum`);
            else data[h] = value;
          }
        }
        const financial = this.kind() === 'students' ? ['frais', 'type_frais', 'echeance'] : ['salaire', 'mois_salaire'];
        if ([...financial, 'paiement', 'date_paiement', 'mode_paiement'].some(h => data[h]) && financial.some(h => !data[h])) errors.push(`Renseignez ${financial.join(', ')} ensemble`);
        if (data['mois_salaire'] && !/^\d{4}-(0[1-9]|1[0-2])$/.test(data['mois_salaire'])) errors.push('mois_salaire : AAAA-MM');
        if (data['salaire'] && Number(data['salaire']) <= 0) errors.push('salaire doit être supérieur à zéro');
        if (Number(data['paiement']) > Number(data[this.kind() === 'students' ? 'frais' : 'salaire'])) errors.push('Le paiement dépasse le montant dû');
        if (Number(data['paiement']) > 0 && (!data['date_paiement'] || !data['mode_paiement'])) errors.push('Date et mode de paiement obligatoires');
        if (data['mode_paiement'] && !['CASH', 'MOBILE_MONEY', 'BANK_TRANSFER', 'CARD'].includes(data['mode_paiement'])) errors.push('Mode de paiement invalide');
        if (data['date_paiement'] && data['date_paiement'] > new Date().toLocaleDateString('en-CA')) errors.push('La date de paiement ne peut pas être future');
        for (const h of ['telephone', 'parent_telephone']) if (data[h] && (!/^[+\d\s().-]+$/.test(data[h]) || !/^\d{6,15}$/.test(data[h].replace(/\D/g, '')))) errors.push(`${h} invalide`);
        const matches = this.classes().filter(c => normalize(c.name) === normalize(data['classe']));
        if (matches.length !== 1) errors.push('Classe introuvable ou nom ambigu dans cette année');
        const subject = this.subjects().filter(s => normalize(s.name) === normalize(data['matiere'] ?? ''));
        if (this.kind() === 'teachers' && subject.length !== 1) errors.push('Matière introuvable ou ambiguë');
        if (this.kind() === 'students' && ['parent_prenom', 'parent_nom', 'parent_courriel', 'parent_telephone', 'lien_parente'].some(h => data[h]) && ['parent_prenom', 'parent_nom'].some(h => !data[h])) errors.push('Parent : prénom et nom obligatoires ; courriel facultatif');
        const email = (data['courriel'] ?? '').toLowerCase();
        if (email && data['parent_courriel']?.toLowerCase() === email) errors.push('Le parent doit avoir un courriel différent de celui de l’élève');
        const identifier = data[this.kind() === 'teachers' ? 'numero_employe' : 'matricule'];
        if (identifiers.has(identifier) && (this.kind() === 'students' || identifiers.get(identifier) !== email)) errors.push('Matricule ou numéro d’employé en double'); identifiers.set(identifier, email);
        if (email && emailIdentifiers.has(email) && emailIdentifiers.get(email) !== identifier) errors.push('Le même courriel est utilisé pour plusieurs personnes');
        if (email) emailIdentifiers.set(email, identifier);
        const key = this.kind() === 'teachers' ? `${identifier}/${matches[0]?.id}/${subject[0]?.id}` : identifier;
        if (seen.has(key)) errors.push('Ligne en double'); seen.add(key);
        const identity = [data['prenom'], data['nom'], email, data['telephone'], data['specialite'], data['date_embauche'], data['salaire'], data['mois_salaire'], data['paiement'], data['date_paiement'], data['mode_paiement']].join('|');
        if (this.kind() === 'teachers' && identities.has(identifier) && identities.get(identifier) !== identity) errors.push('Informations différentes pour le même enseignant'); identities.set(identifier, identity);
        return { line: index + 2, data, classId: matches[0]?.id ?? 0, subjectId: subject[0]?.id ?? 0, errors, status: 'À importer' };
      }));
      if (this.invalid()) this.showOutcome({ severity: 'error', title: 'Fichier à corriger',
        message: `${this.invalid()} ligne(s) contiennent des erreurs. Aucun enregistrement effectué.`, details: this.errorDetails(this.rows()), refresh: false });
    } catch (e) {
      if (generation === this.generation && !this.destroyed) this.showOutcome({ severity: 'error', title: 'Fichier non importé',
        message: e instanceof Error ? e.message : 'Fichier illisible.', details: [], refresh: false });
    }
  }
  async save(): Promise<void> {
    if (this.busy() || this.outcome() || this.invalid() || !this.remaining()) return;
    const school = this.schoolId(), rows = this.rows(), generation = this.generation;
    if (!await this.confirmation.confirm({ title: 'Confirmer l’import ?', message: `${this.remaining()} lignes seront enregistrées dans cet établissement. Les invitations seront envoyées selon la configuration de messagerie.`, confirmLabel: 'Importer' })) return;
    if (school !== this.schoolId() || rows !== this.rows() || this.destroyed) return;
    this.busy.set(true);
    try {
      const existingTeachers = this.kind() === 'teachers' ? await firstValueFrom(this.teachers.teachersBySchool(school)) : [];
      for (const row of rows) {
        if (school !== this.schoolId() || generation !== this.generation || this.destroyed) break;
        if (row.status === 'Enregistré') continue;
        const d = row.data, email = (d['courriel'] ?? '').toLowerCase(), employeeNumber = d['numero_employe'];
        try {
          const common = { firstName: d['prenom'], lastName: d['nom'], email, phone: d['telephone'] || null };
          if (this.kind() === 'teachers') {
            const existing = existingTeachers.find(t => t.employeeNumber === d['numero_employe']);
            if (existing && (email && existing.email?.toLowerCase() !== email || existing.firstName.toLowerCase() !== d['prenom'].toLowerCase() || existing.lastName.toLowerCase() !== d['nom'].toLowerCase())) throw new Error('Le numéro d’employé correspond à une autre identité.');
            const id = this.teacherIds.get(employeeNumber) ?? existing?.id;
            if (id) await firstValueFrom(this.teachers.assignTeacher(row.classId, id, row.subjectId));
            else { const teacher = await firstValueFrom(this.teachers.createTeacher(row.classId, { ...common, employeeNumber, specialty: d['specialite'] || null, hireDate: d['date_embauche'] || null, subjectId: row.subjectId })); this.teacherIds.set(employeeNumber, teacher.id); }
            if (school !== this.schoolId() || generation !== this.generation || this.destroyed) break;
            if (d['salaire']) await firstValueFrom(this.injector.get(PayrollService).importTeacherSalary(school, id ?? this.teacherIds.get(employeeNumber)!, {
              month: d['mois_salaire'], salary: Number(d['salaire']), paid: d['paiement'] ? Number(d['paiement']) : null,
              paymentDate: d['date_paiement'] || null, paymentMethod: d['mode_paiement'] || null,
            }));
          } else {
            const student = await firstValueFrom(this.api.importRosterStudent(row.classId, {
              ...common, registrationNumber: d['matricule'], birthDate: d['date_naissance'] || null, gender: d['sexe'] || null,
              feeTypeName: d['type_frais'] || null, fees: d['frais'] ? Number(d['frais']) : null,
              paid: d['paiement'] ? Number(d['paiement']) : null, dueDate: d['echeance'] || null,
              paymentDate: d['date_paiement'] || null, paymentMethod: d['mode_paiement'] || null,
              parent: d['parent_prenom'] ? {
                firstName: d['parent_prenom'], lastName: d['parent_nom'], email: d['parent_courriel'] || null,
                phone: d['parent_telephone'] || null, relationship: d['lien_parente'] || null,
              } : null,
            }));
            row.studentId = student.studentId;
            if (d['parent_prenom'] && !student.parents.some(parent => d['parent_courriel']
              ? parent.email?.toLowerCase() === d['parent_courriel'].toLowerCase()
              : parent.firstName.toLowerCase() === d['parent_prenom'].toLowerCase() && parent.lastName.toLowerCase() === d['parent_nom'].toLowerCase())) {
              throw new Error('Élève enregistré mais parent non confirmé. Vérifiez la fiche et redémarrez le backend mis à jour avant de reprendre l’import.');
            }
          }
          row.status = 'Enregistré';
        } catch (e: unknown) { row.status = (e as { error?: { message?: string } })?.error?.message ?? (e instanceof Error ? e.message : 'Échec : réessayez cette ligne'); }
        if (school === this.schoolId() && generation === this.generation && !this.destroyed) this.rows.set([...rows]);
      }
      if (generation === this.generation && !this.destroyed) {
        const saved = rows.filter(r => r.status === 'Enregistré').length, failed = rows.length - saved;
        this.showOutcome({ severity: failed ? 'error' : 'success',
          title: failed ? (saved ? 'Import partiellement réalisé' : 'Import échoué') : 'Import réussi',
          message: `${saved} ${saved > 1 ? 'lignes enregistrées' : 'ligne enregistrée'} sur ${rows.length}. ${failed ? `${failed} ${failed > 1 ? 'lignes en erreur' : 'ligne en erreur'}. Consultez les détails et reprenez les lignes en échec.` : 'Les informations seront actualisées après votre clic sur OK.'}`,
          details: this.errorDetails(rows), refresh: true });
      }
    } catch (e: unknown) {
      if (generation === this.generation && !this.destroyed) this.showOutcome({ severity: 'error', title: 'Import échoué',
        message: (e as { error?: { message?: string } })?.error?.message ?? 'Impossible de préparer l’import. Réessayez.', details: this.errorDetails(rows), refresh: true });
    } finally { this.busy.set(false); }
  }
}
