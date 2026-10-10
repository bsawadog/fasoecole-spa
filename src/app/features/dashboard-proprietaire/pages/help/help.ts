import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../../core/auth';

interface HelpQuestion {
  id: string;
  category: string;
  question: string;
  steps: string[];
  note?: string;
  route: string;
  linkLabel: string;
}

const QUESTIONS: HelpQuestion[] = [
  { id: 'request', category: 'Établissement', question: 'Comment demander la création d’un établissement ?', steps: [
    'Ouvrez « Créer une école » dans le menu.',
    'Renseignez le nom, le type et l’adresse de l’établissement.',
    'Indiquez les nombres prévus d’élèves ou étudiants, de classes et d’enseignants. Ces nombres sont des estimations.',
    'Cliquez sur « Envoyer pour approbation », puis confirmez dans la fenêtre de confirmation.',
    'Attendez l’approbation du SUPER_ADMIN. Vous pouvez découvrir les modules pendant cette attente.',
  ], route: '/proprietaire/creer-ecole', linkLabel: 'Ouvrir la demande d’établissement' },
  { id: 'pending', category: 'Établissement', question: 'Pourquoi les informations des modules ne sont-elles pas encore visibles ?', steps: [
    'Vérifiez si la demande est en brouillon ou en attente d’approbation.',
    'Si elle est en brouillon, complétez les informations et envoyez la demande depuis « Créer une école ».',
    'Si elle est en attente, ouvrez la demande et cliquez sur « Vérifier l’approbation ».',
    'Après activation par le SUPER_ADMIN, commencez la configuration réelle depuis « Gestion de l’école ».',
  ], note: 'L’aperçu des modules présente les fonctionnalités sans vous demander de saisir les élèves ou les enseignants avant approbation.', route: '/proprietaire/creer-ecole', linkLabel: 'Consulter ma demande' },
  { id: 'setup', category: 'Établissement', question: 'Par où commencer après l’approbation de mon établissement ?', steps: [
    'Sélectionnez le bon établissement dans l’espace propriétaire.',
    'Ouvrez « Gestion de l’école » et créez l’année scolaire.',
    'Ajoutez les niveaux, puis les classes et les matières.',
    'Ajoutez les enseignants et leurs affectations, puis les élèves ou étudiants dans les classes.',
    'Configurez les frais scolaires et les accès des autres employés selon vos besoins.',
  ], route: '/proprietaire/gestion', linkLabel: 'Configurer mon établissement' },
  { id: 'year', category: 'Établissement', question: 'Comment consulter une autre école ou une année antérieure ?', steps: [
    'Choisissez l’établissement dans le sélecteur en haut de l’espace propriétaire.',
    'Choisissez ensuite l’année scolaire à consulter.',
    'Ouvrez le module souhaité pour consulter les informations de cette année.',
    'Pour reprendre le travail courant, sélectionnez de nouveau l’année indiquée « en cours ».',
  ], note: 'Une année clôturée est consultable comme archive ; ses données scolaires ne doivent plus être modifiées.', route: '/proprietaire', linkLabel: 'Retourner à l’accueil' },
  { id: 'classes', category: 'Établissement', question: 'Comment créer les classes et les matières ?', steps: [
    'Ouvrez « Gestion de l’école » pour l’établissement sélectionné.',
    'Créez l’année scolaire et les niveaux avant les classes.',
    'Ajoutez chaque classe avec son niveau, son année scolaire et sa capacité.',
    'Ajoutez les matières de l’établissement avant d’affecter les enseignants.',
  ], route: '/proprietaire/gestion', linkLabel: 'Gérer les classes et matières' },
  { id: 'student', category: 'Élèves et parents', question: 'Comment ajouter un élève ou un étudiant dans une classe ?', steps: [
    'Ouvrez « Élèves par classe » ou « Étudiants par classe » pour une université.',
    'Sélectionnez l’établissement et la classe.',
    'Cliquez sur le bouton d’ajout et renseignez le prénom, le nom et le courriel de la personne.',
    'Renseignez son matricule ou laissez-le vide pour une génération automatique, puis complétez les autres informations utiles.',
    'Enregistrez et vérifiez que la personne apparaît dans la classe.',
  ], note: 'Pour une inscription avec les responsables et les frais scolaires, utilisez le module « Inscriptions ». Le titulaire choisit son mot de passe depuis son invitation.', route: '/proprietaire/classes', linkLabel: 'Ouvrir les élèves / étudiants par classe' },
  { id: 'parent', category: 'Élèves et parents', question: 'Comment associer un parent à un élève ?', steps: [
    'Ouvrez la liste des élèves ou étudiants de la classe.',
    'Repérez la ligne de l’enfant sans parent associé.',
    'Cliquez sur le bouton d’ajout du parent sur cette ligne.',
    'Renseignez son identité, ses coordonnées et son lien avec l’enfant, puis enregistrez.',
    'Vérifiez que le parent figure maintenant sur la ligne de l’enfant.',
  ], note: 'Lorsqu’un parent demande lui-même un compte, il fournit les matricules de ses enfants. Vérifiez son identité et les correspondances avant d’approuver sa demande.', route: '/proprietaire/classes', linkLabel: 'Associer un parent' },
  { id: 'approval', category: 'Élèves et parents', question: 'Comment approuver une demande de compte ?', steps: [
    'Ouvrez « Demandes de compte ».',
    'Consultez le rôle demandé et l’établissement concerné.',
    'Pour un élève, vérifiez le matricule ; pour un enseignant, vérifiez le numéro d’employé ; pour un parent, vérifiez les enfants indiqués.',
    'Vérifiez que l’identité et les associations correspondent à vos dossiers.',
    'Approuvez la demande conforme ou refusez-la si les informations ne correspondent pas.',
  ], route: '/proprietaire/demandes', linkLabel: 'Consulter les demandes' },
  { id: 'teacher', category: 'Personnel', question: 'Comment créer un enseignant et l’affecter à une classe ?', steps: [
    'Ouvrez « Enseignants par classe » et choisissez la classe.',
    'Ajoutez un nouvel enseignant avec son identité, son courriel et son numéro d’employé.',
    'Sélectionnez une matière de cet établissement, puis enregistrez.',
    'Vérifiez l’enseignant dans la liste et consultez l’état de son invitation.',
    'Pour d’autres classes ou matières, utilisez l’affectation d’un enseignant existant.',
  ], route: '/proprietaire/enseignants', linkLabel: 'Gérer les enseignants' },
  { id: 'existing-teacher', category: 'Personnel', question: 'Comment affecter un enseignant déjà enregistré ?', steps: [
    'Ouvrez « Enseignants par classe » et choisissez la classe d’accueil.',
    'Cliquez sur « Affecter un enseignant existant ».',
    'Choisissez un enseignant disponible dans les établissements que vous possédez.',
    'Choisissez la matière, puis enregistrez l’affectation.',
  ], note: 'Le catalogue des enseignants d’un autre propriétaire ne doit pas être accessible depuis votre compte.', route: '/proprietaire/enseignants', linkLabel: 'Affecter un enseignant' },
  { id: 'employee', category: 'Personnel', question: 'Comment ajouter un comptable, une secrétaire ou un autre employé ?', steps: [
    'Ouvrez « Créer un employé ».',
    'Sélectionnez l’établissement et renseignez l’identité, les coordonnées et la fonction.',
    'Enregistrez l’employé.',
    'Depuis « Personnel & accès », attribuez uniquement les modules nécessaires à son travail et vérifiez que son accès est actif.',
  ], route: '/proprietaire/employes', linkLabel: 'Créer un employé' },
  { id: 'import', category: 'Import et export', question: 'Comment importer les enseignants ou les élèves depuis Excel ?', steps: [
    'Ouvrez « Enseignants par classe » ou « Élèves / Étudiants par classe ».',
    'Sélectionnez l’établissement et l’année scolaire. Les classes et les matières doivent déjà être créées.',
    'Ouvrez « Importer depuis un fichier » et téléchargez le modèle CSV.',
    'Conservez les noms des colonnes. Utilisez les noms exacts des classes et matières, des dates AAAA-MM-JJ et des identifiants au format texte.',
    'Enregistrez en CSV UTF-8 ou en Excel .xlsx, puis sélectionnez le fichier.',
    'Consultez la prévisualisation et corrigez les erreurs avant de confirmer l’import.',
    'Vérifiez le résultat de chaque ligne et l’état des invitations dans les listes.',
  ], note: 'Maximum : 500 lignes et 2 Mo. Seule la première feuille Excel est lue. Remplacez les formules par leurs valeurs. Répétez un enseignant avec le même courriel pour ses différentes affectations.', route: '/proprietaire/classes', linkLabel: 'Ouvrir la rubrique d’import des élèves' },
  { id: 'import-error', category: 'Import et export', question: 'Que faire si certaines lignes d’un import échouent ?', steps: [
    'Consultez la colonne « Résultat » pour identifier les lignes enregistrées et les erreurs.',
    'Gardez la page ouverte : les lignes réussies restent enregistrées.',
    'Si le problème peut être résolu sans changer le fichier, corrigez sa cause puis utilisez « Confirmer / reprendre l’import ».',
    'Si le fichier doit être corrigé, préparez un nouveau fichier avec uniquement les lignes restant à ajouter.',
    'Si l’élève a été créé mais pas son parent, ajoutez le parent depuis la liste des élèves ou reprenez cette étape sur la page d’import encore ouverte.',
  ], note: 'Ne réimportez pas les lignes réussies après avoir rechargé la page : la progression conservée en mémoire est alors perdue.', route: '/proprietaire/classes', linkLabel: 'Consulter les élèves enregistrés' },
  { id: 'export', category: 'Import et export', question: 'Comment récupérer toutes les données de mon établissement ?', steps: [
    'Ouvrez « Exporter mes données ».',
    'Sélectionnez l’établissement concerné.',
    'Téléchargez le fichier Excel pour conserver les informations de l’établissement.',
    'Téléchargez également les documents proposés si vous souhaitez conserver les pièces jointes.',
    'Conservez les fichiers dans un emplacement sécurisé et accessible uniquement aux personnes autorisées.',
  ], route: '/proprietaire/export', linkLabel: 'Exporter mes données' },
  { id: 'invitation', category: 'Personnel', question: 'Que faire si une invitation de compte n’arrive pas ?', steps: [
    'Vérifiez l’adresse de courriel saisie pour la personne.',
    'Consultez l’état de l’invitation dans la liste concernée.',
    'Demandez au destinataire de vérifier ses courriels indésirables.',
    'Utilisez « Renvoyer le lien » lorsque cette action est proposée.',
    'Si l’envoi échoue à nouveau, contactez l’administrateur de la plateforme pour vérifier le service de messagerie.',
  ], route: '/proprietaire/enseignants', linkLabel: 'Consulter les invitations des enseignants' },
  { id: 'attendance', category: 'Suivi scolaire', question: 'Comment traiter un retard ou une absence signalés par un parent ?', steps: [
    'Ouvrez l’accueil et consultez les signalements en attente.',
    'Vérifiez l’enfant, la date et le motif du signalement.',
    'Utilisez l’action d’enregistrement si vous êtes autorisé à traiter ce signalement.',
    'Vérifiez la mise à jour des présences du jour pour la date concernée.',
    'Pour retrouver un signalement déjà enregistré, ouvrez l’historique.',
  ], route: '/proprietaire', linkLabel: 'Consulter les présences et signalements' },
  { id: 'grades', category: 'Suivi scolaire', question: 'Comment consulter les notes et les bulletins ?', steps: [
    'Sélectionnez l’établissement et l’année scolaire.',
    'Ouvrez « Notes & bulletins ».',
    'Choisissez la classe et la période ou l’évaluation à consulter.',
    'Vérifiez les notes saisies et les résultats avant de préparer ou consulter les bulletins.',
  ], route: '/proprietaire/notes', linkLabel: 'Ouvrir les notes et bulletins' },
  { id: 'fees', category: 'Finances', question: 'Comment préparer les frais scolaires et suivre les paiements ?', steps: [
    'Configurez les types de frais et les tarifs depuis « Gestion de l’école ».',
    'Lors d’une inscription, sélectionnez les frais applicables à l’élève ou étudiant.',
    'Ouvrez « Recouvrement » pour consulter les factures et les soldes.',
    'Enregistrez les paiements avec leur date, leur montant et leur mode de règlement.',
    'Vérifiez le solde après chaque enregistrement.',
  ], route: '/proprietaire/frais', linkLabel: 'Consulter le recouvrement' },
  { id: 'message', category: 'Communication', question: 'Comment envoyer un message à plusieurs destinataires ?', steps: [
    'Ouvrez la messagerie depuis l’icône près de votre profil.',
    'Créez un nouveau message pour l’établissement concerné.',
    'Recherchez les destinataires ou sélectionnez les groupes proposés : enseignants, élèves / étudiants ou parents.',
    'Vérifiez le nombre de destinataires sélectionnés et rédigez votre message.',
    'Ajoutez les documents souhaités, puis envoyez le message.',
  ], route: '/proprietaire/messages', linkLabel: 'Ouvrir la messagerie' },
  { id: 'closure', category: 'Suivi scolaire', question: 'Comment clôturer une année et préparer la suivante ?', steps: [
    'Ouvrez « Clôturer année » pour l’établissement et l’année concernés.',
    'Vérifiez les inscriptions, les résultats et les soldes avant de continuer.',
    'Préparez la nouvelle année et renseignez les passages ou redoublements avec les classes d’accueil.',
    'Vérifiez les informations et les soldes à transférer.',
    'Confirmez la clôture uniquement lorsque les décisions et les transferts sont corrects.',
    'Sélectionnez ensuite la nouvelle année pour poursuivre les activités.',
  ], note: 'Les notes ne sont pas recopiées dans la nouvelle année. L’ancienne année reste consultable comme archive.', route: '/proprietaire/cloture', linkLabel: 'Ouvrir la clôture annuelle' },
];

@Component({
  selector: 'app-owner-help', standalone: true, imports: [RouterLink],
  templateUrl: './help.html', styleUrl: './help.scss',
})
export class OwnerHelp {
  private readonly auth = inject(AuthService);
  readonly search = signal('');
  readonly category = signal('Toutes');
  readonly selected = signal<string | null>(null);
  readonly categories = ['Toutes', ...new Set(QUESTIONS.map(item => item.category))];
  readonly waitingApproval = computed(() => {
    const schools = this.auth.ownerAccess() ?? [];
    const school = schools.find(item => item.schoolId === this.auth.schoolContextId()) ?? schools[0];
    return school && ['DRAFT', 'PENDING_APPROVAL'].includes(school.status ?? '');
  });
  readonly questions = computed(() => {
    const normalize = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
    const words = normalize(this.search()).trim().split(/\s+/).filter(Boolean);
    return QUESTIONS.filter(item => (this.category() === 'Toutes' || item.category === this.category())
      && words.every(word => normalize([item.question, item.category, ...item.steps, item.note ?? ''].join(' ')).includes(word)));
  });
  choose(id: string): void { this.selected.update(value => value === id ? null : id); }
  reset(): void { this.search.set(''); this.category.set('Toutes'); this.selected.set(null); }
}
