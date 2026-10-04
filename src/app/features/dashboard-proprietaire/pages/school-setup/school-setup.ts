import { FormValidationDirective } from '../../../../shared/form-validation.directive';
import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { switchMap } from 'rxjs';
import { AuthService } from '../../../../core/auth';
import { ConfirmationService } from '../../../../shared/confirmation/confirmation.service';
import { OwnerManagementService, SchoolRecord } from '../../owner-management.service';
import { apiError } from '../../../../shared/self-space/self-space.service';

@Component({
  selector: 'app-school-setup', standalone: true,
  imports: [FormValidationDirective, FormsModule, RouterLink],
  templateUrl: './school-setup.html', styleUrl: './school-setup.scss',
})
export class SchoolSetup implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(OwnerManagementService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly confirmation = inject(ConfirmationService);
  readonly schoolName = signal('');
  readonly schoolId = signal<number | null>(null);
  readonly finalized = signal(false);
  readonly active = signal(false);
  readonly saving = signal(false);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly success = signal<string | null>(null);
  readonly module = signal('Organisation scolaire');
  readonly modules = [
    { name: 'Organisation scolaire', description: 'Années scolaires, niveaux, classes et matières.' },
    { name: 'Élèves / étudiants', description: 'Inscriptions, listes par classe, matricules, parents et import Excel / CSV.' },
    { name: 'Enseignants', description: 'Fiches, affectations par classe et matière, emplois du temps et import des enseignants.' },
    { name: 'Employés et accès', description: 'Enseignants, comptables, secrétaires et autres employés, avec leurs droits d’accès.' },
    { name: 'Présences et signalements', description: 'Absences, retards, signalements des parents et suivi quotidien.' },
    { name: 'Notes et bulletins', description: 'Évaluations, résultats, moyennes et bulletins.' },
    { name: 'Frais et paiements', description: 'Tarifs, factures, paiements et soldes des élèves.' },
    { name: 'Dépenses et budget', description: 'Dépenses, comptes et suivi financier.' },
    { name: 'Communication', description: 'Messages individuels ou groupés, documents et échanges avec les familles.' },
    { name: 'Clôture annuelle', description: 'Passages, redoublements et report des soldes vers la nouvelle année, sans recopier les notes.' },
    { name: 'Export des données', description: 'Export Excel et documents pour conserver les informations de votre établissement.' },
  ];
  form = this.emptyForm();
  private emptyForm() { return { name: '', type: 'PRIMAIRE', address: '', phone: '', email: '', expectedStudentCount: null as number | null, expectedClassCount: null as number | null, expectedTeacherCount: null as number | null }; }
  private get draftKey() { return `fasoecole_school_draft_${this.auth.user()?.id}`; }
  ngOnInit(): void {
    const id = Number(this.route.snapshot.queryParamMap.get('schoolId') ?? localStorage.getItem(this.draftKey));
    if (!id) { this.loading.set(false); return; }
    this.api.getSchool(id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: school => { this.loading.set(false); this.showSchool(school); },
      error: err => { this.loading.set(false); if (err.status === 403 || err.status === 404) localStorage.removeItem(this.draftKey); this.error.set(apiError(err, 'Impossible de charger votre demande.')); },
    });
  }
  private showSchool(school: SchoolRecord): void {
    this.schoolId.set(school.id); this.schoolName.set(school.name);
    this.form = { name: school.name, type: school.type, address: school.address ?? '', phone: school.phone ?? '', email: school.email ?? '', expectedStudentCount: school.expectedStudentCount ?? null, expectedClassCount: school.expectedClassCount ?? null, expectedTeacherCount: school.expectedTeacherCount ?? null };
    this.active.set(school.status === 'ACTIVE');
    this.finalized.set(school.status !== 'DRAFT');
    this.auth.selectSchoolContext(school.id);
    if (school.status === 'ACTIVE') {
      localStorage.removeItem(this.draftKey);
      this.success.set('Établissement approuvé. Vous pouvez maintenant configurer votre année scolaire et ajouter vos classes, enseignants et élèves.');
    } else if (school.status === 'PENDING_APPROVAL') {
      localStorage.setItem(this.draftKey, String(school.id));
      this.success.set('Demande envoyée. La saisie des données sera disponible après approbation du SUPER_ADMIN.');
    } else if (school.status === 'DRAFT') localStorage.setItem(this.draftKey, String(school.id));
    else this.error.set('Cet établissement est désactivé. Contactez l’administrateur de la plateforme.');
  }
  startAnother(): void {
    localStorage.removeItem(this.draftKey); this.schoolId.set(null); this.schoolName.set('');
    this.finalized.set(false); this.active.set(false); this.success.set(null); this.error.set(null); this.form = this.emptyForm();
  }
  async create(): Promise<void> {
    const ownerId = this.auth.user()?.id;
    if (!ownerId || this.saving() || this.finalized()) return;
    if (!this.form.name.trim() || !this.form.address.trim() || [this.form.expectedStudentCount, this.form.expectedClassCount, this.form.expectedTeacherCount].some(n => n === null || !Number.isSafeInteger(n)) || this.form.expectedStudentCount! < 0 || this.form.expectedClassCount! < 1 || this.form.expectedTeacherCount! < 0) {
      this.error.set('Renseignez le nom, l’adresse et les trois effectifs entiers, avec au moins une classe.'); return;
    }
    this.saving.set(true);
    const payload = { ...this.form, name: this.form.name.trim(), address: this.form.address.trim(), ownerId, status: 'DRAFT' };
    const confirmed = await this.confirmation.confirm({ title: 'Envoyer la demande d’établissement ?', message: `Soumettre « ${payload.name} » avec ${payload.expectedStudentCount} élèves / étudiants, ${payload.expectedClassCount} classes et ${payload.expectedTeacherCount} enseignants prévus ? La configuration réelle commencera après approbation.`, confirmLabel: 'Envoyer la demande' });
    if (this.destroyRef.destroyed) return;
    if (!confirmed) { this.saving.set(false); return; }
    this.error.set(null);
    const id = this.schoolId();
    const request = id ? this.api.updateSchool({ ...payload, id }).pipe(switchMap(() => this.api.finalizeSchool(id))) : this.api.requestSchool(payload);
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: school => { this.showSchool(school); this.saving.set(false); this.auth.loadOwnerAccess(true).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ error: () => {} }); },
      error: err => { this.saving.set(false); this.error.set(apiError(err, 'Impossible d’envoyer la demande.')); },
    });
  }
  refresh(): void {
    const id = this.schoolId(); if (!id || this.saving()) return;
    this.saving.set(true);
    this.api.getSchool(id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: school => { this.showSchool(school); this.saving.set(false); this.auth.loadOwnerAccess(true).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ error: () => {} }); },
      error: err => { this.saving.set(false); this.error.set(apiError(err, 'Impossible d’actualiser la demande.')); },
    });
  }
}