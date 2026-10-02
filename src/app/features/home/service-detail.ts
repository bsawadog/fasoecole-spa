import { Component, computed, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { LucideArrowLeft, LucideArrowRight, LucideCheck } from '@lucide/angular';

interface ServiceInfo {
  title: string;
  intro: string;
  audience: string;
  benefits: string[];
}

const SERVICES: Record<string, ServiceInfo> = {
  'portail-parent': {
    title: 'Portail parent multi-enfants',
    intro: 'Un espace unique pour suivre la scolarité de chacun de vos enfants, même s’ils fréquentent des établissements différents.',
    audience: 'Parents et tuteurs',
    benefits: ['Consulter les informations de chaque enfant depuis un seul compte', 'Suivre les présences et les retards signalés', 'Échanger directement avec les enseignants et l’établissement'],
  },
  'suivi-scolaire': {
    title: 'Notes, bulletins et suivi scolaire',
    intro: 'Retrouvez les résultats et les informations utiles pour comprendre les progrès et accompagner le parcours de l’élève.',
    audience: 'Élèves, parents et enseignants',
    benefits: ['Consulter les notes et appréciations', 'Accéder aux bulletins publiés', 'Suivre les absences et retards'],
  },
  'frais-scolaires': {
    title: 'Gestion des frais',
    intro: 'Les établissements peuvent organiser les frais scolaires et suivre les paiements depuis leur espace de gestion.',
    audience: 'Établissements et propriétaires',
    benefits: ['Consulter les frais dus et les paiements enregistrés', 'Suivre les reçus et les soldes restants', 'Garder une vue à jour sur la situation financière'],
  },
  communication: {
    title: 'Communications et notifications',
    intro: 'Les familles, les enseignants et l’établissement disposent d’un espace commun pour échanger et suivre les messages.',
    audience: 'Parents, enseignants et établissements',
    benefits: ['Créer des conversations avec les bons destinataires', 'Recevoir des notifications de nouveaux messages', 'Savoir quand un message a été lu'],
  },
  'tableaux-de-bord': {
    title: 'Tableaux de bord propriétaire',
    intro: 'Une vue d’ensemble pour piloter les activités de l’établissement et accéder rapidement aux principaux modules.',
    audience: 'Propriétaires et gestionnaires',
    benefits: ['Suivre les effectifs et les classes', 'Consulter les indicateurs financiers et scolaires', 'Accéder aux modules de gestion de l’établissement'],
  },
};

@Component({
  selector: 'app-service-detail',
  standalone: true,
  imports: [RouterLink, LucideArrowLeft, LucideArrowRight, LucideCheck],
  templateUrl: './service-detail.html',
  styleUrl: './service-detail.scss',
})
export class ServiceDetail {
  private readonly route = inject(ActivatedRoute);
  readonly service = computed(() => SERVICES[this.route.snapshot.paramMap.get('slug') ?? ''] ?? null);
}
