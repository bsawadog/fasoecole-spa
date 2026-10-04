import { FormValidationDirective } from '../../../../shared/form-validation.directive';
import { DecimalPipe } from '@angular/common';
import { Component, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Observable, Subscription } from 'rxjs';
import { ConfirmationService } from '../../../../shared/confirmation/confirmation.service';
import { ClassRecord, LevelRecord, OwnerManagementService } from '../../owner-management.service';
import { TeacherDetail, TeacherSession, TeacherWorkService } from '../../teacher-work.service';

@Component({
  selector: 'app-teacher-detail',
  standalone: true,
  imports: [FormValidationDirective, FormsModule, DecimalPipe, RouterLink],
  templateUrl: './teacher-detail.html',
  styleUrl: './teacher-detail.scss',
})
export class TeacherDetailPage implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(TeacherWorkService);
  private readonly management = inject(OwnerManagementService);
  private readonly confirmation = inject(ConfirmationService);
  private request?: Subscription;
  private classesRequest?: Subscription;
  private levelsRequest?: Subscription;
  private readonly teacherId = Number(this.route.snapshot.paramMap.get('teacherId'));

  readonly detail = signal<TeacherDetail | null>(null);
  readonly classes = signal<ClassRecord[]>([]);
  readonly levels = signal<LevelRecord[]>([]);
  readonly month = signal(this.localDate().slice(0, 7));
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly sending = signal(false);
  readonly error = signal<string | null>(null);
  readonly success = signal<string | null>(null);
  readonly weekdays = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

  rateForm = { type: 'HOURLY' as 'HOURLY' | 'MONTHLY', amount: 0, effectiveFrom: this.localDate().slice(0, 7) + '-01' };
  slotForm = { classId: 0, dayOfWeek: 1, startTime: '08:00', endTime: '09:00', effectiveFrom: this.localDate() };
  extraForm = { classId: 0, date: this.localDate(), hours: 1, description: '' };
  paymentForm = { date: this.localDate(), amount: 0, reference: '' };

  ngOnInit(): void {
    if (!Number.isInteger(this.teacherId) || this.teacherId <= 0) {
      this.error.set('Enseignant introuvable.');
      this.loading.set(false);
      return;
    }
    this.load();
  }

  ngOnDestroy(): void {
    this.request?.unsubscribe();
    this.classesRequest?.unsubscribe();
    this.levelsRequest?.unsubscribe();
  }

  changeMonth(event: Event): void {
    const month = (event.target as HTMLInputElement).value;
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      this.error.set('Sélectionnez un mois valide.');
      return;
    }
    this.month.set(month);
    this.rateForm.effectiveFrom = `${month}-01`;
    this.extraForm.date = `${month}-01`;
    this.paymentForm.date = this.localDate();
    this.load();
  }

  setRate(): void {
    if (!Number.isFinite(this.rateForm.amount) || this.rateForm.amount <= 0 || !this.rateForm.effectiveFrom) {
      this.error.set('Indiquez un taux positif et une date d’effet.');
      return;
    }
    this.mutate(this.api.setRate(this.teacherId, this.rateForm), 'Rémunération enregistrée.');
  }

  addSlot(): void {
    if (!this.classes().some(item => item.id === this.slotForm.classId) ||
        !this.slotForm.effectiveFrom || !this.slotForm.startTime || !this.slotForm.endTime ||
        this.slotForm.endTime <= this.slotForm.startTime) {
      this.error.set('Sélectionnez une classe, une date et un horaire de fin après le début.');
      return;
    }
    this.mutate(this.api.addSlot(this.teacherId, this.slotForm), 'Créneau ajouté au planning.');
  }

  async removeSlot(slotId: number): Promise<void> {
    if (await this.confirmation.confirm({
      title: 'Terminer ce créneau ?',
      message: 'Les séances passées restent conservées ; les prochaines séances ne seront plus prévues.',
      confirmLabel: 'Terminer',
      destructive: true,
    })) this.mutate(this.api.removeSlot(this.teacherId, slotId), 'Créneau terminé.');
  }

  point(session: TeacherSession, status: 'PRESENT' | 'ABSENT'): void {
    this.mutate(this.api.pointSession(this.teacherId, {
      slotId: session.slotId, date: session.date, status,
    }), 'Pointage enregistré.');
  }

  addExtra(): void {
    if (!this.classes().some(item => item.id === this.extraForm.classId) ||
        !this.extraForm.date.startsWith(this.month()) ||
        !this.isPast(this.extraForm.date) ||
        !Number.isFinite(this.extraForm.hours) || this.extraForm.hours <= 0) {
      this.error.set('Choisissez une classe, une date passée du mois et un nombre d’heures positif.');
      return;
    }
    this.mutate(this.api.addExtra(this.teacherId, this.extraForm), 'Heures supplémentaires enregistrées.');
  }

  async removeExtra(id: number): Promise<void> {
    if (await this.confirmation.confirm({
      title: 'Supprimer ces heures ?',
      message: 'Le montant dû pour ce mois sera recalculé.',
      confirmLabel: 'Supprimer',
      destructive: true,
    })) this.mutate(this.api.removeExtra(this.teacherId, id), 'Heures supprimées.');
  }

  addPayment(): void {
    const remaining = this.detail()?.month.remaining ?? 0;
    if (!this.paymentForm.date ||
        !Number.isFinite(this.paymentForm.amount) || this.paymentForm.amount <= 0 ||
        this.paymentForm.amount > remaining) {
      this.error.set('Indiquez la date du versement et un montant positif inférieur ou égal au solde.');
      return;
    }
    this.mutate(this.api.addPayment(this.teacherId, { ...this.paymentForm, month: this.month() }),
      'Versement enregistré.');
  }

  async removePayment(id: number): Promise<void> {
    if (await this.confirmation.confirm({
      title: 'Supprimer ce versement ?',
      message: 'Le solde à payer sera recalculé.',
      confirmLabel: 'Supprimer',
      destructive: true,
    })) this.mutate(this.api.removePayment(this.teacherId, id), 'Versement supprimé.');
  }

  printPage(): void {
    window.print();
  }

  async sendToTeacher(): Promise<void> {
    const teacher = this.detail()?.teacher;
    if (!teacher || this.sending()) return;
    if (!await this.confirmation.confirm({
      title: 'Envoyer la fiche à l’enseignant ?',
      message: `Le récapitulatif du mois ${this.month()} (planning, séances, heures, montant dû et versements) sera envoyé à ${teacher.email}.`,
      confirmLabel: 'Envoyer',
    })) return;
    this.sending.set(true);
    this.error.set(null);
    this.success.set(null);
    this.api.sendSummary(this.teacherId, this.month()).subscribe({
      next: () => {
        this.sending.set(false);
        this.success.set(`Fiche envoyée à ${teacher.email}.`);
      },
      error: err => {
        this.sending.set(false);
        this.error.set(err?.error?.message ?? 'Impossible d’envoyer la fiche par courriel.');
      },
    });
  }

  classLabel(schoolClass: ClassRecord): string {
    const level = this.levels().find(item => item.id === schoolClass.levelId);
    return level ? `${level.name} · ${schoolClass.name}` : schoolClass.name;
  }

  isPast(date: string): boolean {
    return date <= this.localDate();
  }

  private load(): void {
    this.request?.unsubscribe();
    this.loading.set(true);
    this.error.set(null);
    this.request = this.api.detail(this.teacherId, this.month()).subscribe({
      next: detail => {
        this.detail.set(detail);
        this.loading.set(false);
        if (detail.rateType && detail.rate != null) {
          this.rateForm.type = detail.rateType;
          this.rateForm.amount = detail.rate;
        }
        this.loadClasses(detail.teacher.schoolId);
      },
      error: err => {
        this.loading.set(false);
        this.error.set(err?.error?.message ?? 'Impossible de charger la fiche de cet enseignant.');
      },
    });
  }

  private loadClasses(schoolId: number): void {
    this.classesRequest?.unsubscribe();
    this.classesRequest = this.management.getClasses(schoolId).subscribe({
      next: classes => {
        this.classes.set(classes);
        if (!classes.some(item => item.id === this.slotForm.classId)) this.slotForm.classId = classes[0]?.id ?? 0;
        if (!classes.some(item => item.id === this.extraForm.classId)) this.extraForm.classId = classes[0]?.id ?? 0;
      },
      error: () => this.error.set('Impossible de charger les classes pour le planning.'),
    });
    this.levelsRequest?.unsubscribe();
    this.levelsRequest = this.management.getLevels(schoolId).subscribe({
      next: levels => this.levels.set(levels),
      error: () => this.error.set('Impossible de charger les niveaux des classes.'),
    });
  }

  private mutate(request: Observable<unknown>, message: string): void {
    if (this.saving()) return;
    this.saving.set(true);
    this.error.set(null);
    this.success.set(null);
    request.subscribe({
      next: () => {
        this.saving.set(false);
        this.success.set(message);
        this.load();
      },
      error: err => {
        this.saving.set(false);
        this.error.set(err?.error?.message ?? 'Opération impossible. Vérifiez les informations et réessayez.');
      },
    });
  }

  private localDate(): string {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
