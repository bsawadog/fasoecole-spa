# Consultation hors connexion Internet

Le réglage **Mon profil → Mode hors connexion Internet** s’applique aux modules de tous les profils : enseignant, apprenant, parent, propriétaire et administrateur. Il reste volontaire, par compte et appareil personnel.

## Utilisation

Activer le réglage avec Internet. À l’ouverture de la session déverrouillée, un écran avec spinner reste affiché pendant la préparation. Le chargement prépare toutes les classes de l’enseignant (listes, présences et signalements du jour, périodes, conversations, rendez-vous et publications) et tous les enfants ou dossiers élèves liés au compte (emploi du temps, notes, présences, factures, profil, signalements et portail). Les consultations récentes du même contexte sont également reprises, sans la précédente limite de cinq. Deux requêtes au maximum sont lancées simultanément. En cas d’échec, un avertissement et un bouton « Réessayer » sont affichés ; une perte de connexion arrête la préparation et laisse accéder aux copies disponibles.

Les profils propriétaire et administrateur préparent le contexte scolaire et leurs consultations récentes. Cette préparation ne garantit pas tous les modules, filtres, historiques ou pièces jointes hors ligne : les fichiers doivent être téléchargés avec Internet, et les limites du coffre décrites ci-dessous continuent de s’appliquer.

## Cache et actualisation en ligne

Les consultations JSON disposent d’un cache en mémoire pendant la session, même lorsque le mode hors connexion est désactivé. Une copie récente est affichée immédiatement : sa durée de fraîcheur est de 60 secondes. Dès 15 secondes, sa réutilisation déclenche une vérification en arrière-plan. Les requêtes identiques simultanées partagent un seul appel serveur.

Une modification réussie invalide les lectures du domaine concerné et les tableaux de bord. Une modification de structure ou un changement signalé par le serveur invalide les lectures de l’établissement. Les données d’un autre établissement restent séparées. Une réponse commencée avant une modification ne peut pas réintroduire une ancienne copie dans le cache.

L’actualisation remplace la copie en mémoire et signale sa disponibilité. Les vues abonnées aux changements peuvent se rafraîchir en conservant leurs protections pour les saisies en cours ; les autres retrouvent la copie actualisée à leur prochaine ouverture. Une requête de consultation ne produit pas deux réponses successives qui pourraient réinitialiser un formulaire.

Le cache en mémoire est vidé à la fin de la session. Seule l’activation volontaire du mode hors connexion autorise la conservation chiffrée sur l’appareil.

Pendant une coupure, les requêtes de consultation utilisent leur dernière copie disponible. Le bandeau commun indique le mode consultation et la date de la dernière copie utilisée. Une page ou un filtre non préparé affiche une indisponibilité explicite. Les données peuvent avoir changé sur le serveur.

Les présences, messages, publications et créations compatibles décrits ci-dessous disposent d’une file d’attente. Les autres écritures nécessitent Internet et sont refusées explicitement pendant une coupure. Les présences conservent leur mécanisme spécifique de conservation chiffrée, synchronisation automatique et vérification des conflits.

## Messages en attente

Dans les quatre espaces de messagerie, les conversations sont classées par mois de dernière activité, puis par destinataire ou groupe de participants et par date décroissante. Les anciens mois et contacts sont repliables ; les badges non lus restent visibles dans leurs résumés. La recherche porte sur les noms, objets, écoles et élèves, sans tenir compte des accents. Les groupes ne fusionnent jamais le contenu de conversations privées et restent séparés par établissement.

Un échange affiche initialement ses trente derniers messages, regroupés par jour. Le dernier jour est ouvert et les autres restent repliables. Le bouton « Afficher les messages précédents » donne accès au reste de l’historique par tranches de trente. Cette présentation conserve les messages, leurs pièces jointes et les états de lecture ; elle fonctionne également sur les copies disponibles hors connexion.

Les nouvelles conversations et réponses des profils enseignant, parent, apprenant et propriétaire sont mises en attente lorsque le navigateur est hors connexion ou qu’un envoi échoue sans réponse réseau ou avec une erreur serveur temporaire. Le mode hors connexion doit avoir été activé et le coffre déverrouillé. Les fichiers sont conservés avec le message, dans les limites habituelles de trois fichiers de 10 Mo ; la file complète est limitée à 100 envois et 50 Mio sérialisés.

La confirmation de mise en attente intervient après l’écriture dans le coffre chiffré. Le formulaire est alors vidé et le compteur commun indique « message(s) en attente de connexion Internet ». Ses détails sont repliés par défaut. Dans Messages, l’encart « File d’attente des messages » reste visible dans la zone de contenu même si la file est vide, verrouillée ou désactivée ; il explique alors cet état. Dans les autres modules, il apparaît seulement si un envoi attend ou vient d’être confirmé. Un refus de stockage conserve le formulaire et n’annonce aucune mise en attente. Aucun faux fil de conversation n’est créé localement.

L’envoi reprend dans l’ordre au retour d’Internet, après déverrouillage et au plus tard lors de la vérification périodique de 30 secondes, tant que l’application est ouverte avec le même compte et profil. Le bouton de synchronisation permet également de relancer. Un refus métier conserve le message et sa raison dans les détails, avec une possibilité de réessayer. Les messages ne sont jamais évincés avec les copies de consultation et empêchent la désactivation du mode hors connexion tant qu’ils sont en attente. Après fermeture ou rafraîchissement complet, une connexion est nécessaire pour rouvrir le coffre ; les messages restent conservés.

Chaque envoi utilise un identifiant stable `X-Offline-Message-Id`, également utilisé avant la première tentative en ligne. Le backend conserve un reçu par utilisateur et identifiant dans la même transaction que le message. Une réponse perdue puis rejouée ne renvoie donc pas une deuxième fois le message, y compris lors d’envois simultanés depuis deux onglets. Le contenu et les pièces jointes sont vérifiés par empreinte ; les permissions sont vérifiées par les services habituels lors d’une première livraison. Aucun jeton de connexion n’est conservé dans la file. Le contexte école/année initial est préservé à la reprise.

Cette fonctionnalité requiert le backend mis à jour et la migration `V65__offline_message_receipts.sql`. Redémarrer le backend avec son profil habituel pour appliquer la migration Flyway, puis reconstruire le front. Le réglage du profil autorise le fonctionnement hors connexion ; il ne simule pas une coupure. En local, utiliser le mode Offline de Network pour couper aussi l’accès à localhost.

## Brouillons et publications des enseignants

Dans **Devoirs de maison** et **Cours et ressources**, les nouveaux contenus sont conservés automatiquement après une courte pause dans la saisie, avec leurs pièces jointes, lorsque le mode hors connexion est activé et déverrouillé. Le statut « Brouillon conservé sur cet appareil · non publié » confirme l’écriture dans le coffre chiffré. Les brouillons restent dans la section « Brouillons et publications en attente » de la classe ; « Modifier » les recharge dans le formulaire. Ils ne sont jamais envoyés automatiquement sans clic sur « Publier ».

« Publier » conserve d’abord la publication dans la file. Avec Internet, l’envoi est tenté immédiatement ; sinon il reprend au retour d’Internet ou à la vérification périodique, tant que l’application reste ouverte. La file distingue les brouillons, les envois en attente de confirmation et les refus du serveur. Le formulaire n’est vidé qu’après la conservation locale ; aucune publication fictive n’est ajoutée à la liste des contenus visibles des élèves. Les brouillons et envois jamais tentés peuvent être modifiés ou supprimés. Après une tentative dont la réponse a pu être perdue, la modification et l’annulation sont suspendues jusqu’à confirmation ou refus explicite, pour éviter de modifier un contenu potentiellement déjà publié.

Le serveur vérifie les droits, la classe, les fichiers et la date de remise au moment de la publication. Un refus explicite conserve le contenu pour correction. Un identifiant stable `X-Offline-Publication-Id` évite les doubles publications, y compris après une réponse perdue et entre deux onglets. La publication et son reçu sont enregistrés dans une même transaction, avec vérification de l’empreinte du contenu et des fichiers. Ce mécanisme utilise la table de reçus de la migration V65 ; le backend doit être redémarré avec le code mis à jour avant utilisation.

La file des publications est limitée à 100 éléments et 50 Mio sérialisés, avec trois fichiers de 10 Mo au maximum par contenu. Les brouillons et envois ne sont pas évincés avec les copies de consultation et empêchent la désactivation du mode hors connexion jusqu’à leur publication ou suppression. La fermeture ou le rafraîchissement verrouille le coffre ; Internet est nécessaire pour le rouvrir. Les modifications et suppressions de publications existantes conservent leur fonctionnement en ligne. Les nouvelles annonces et séances du cahier de textes disposent des files décrites ci-dessous.

## Autres actions en attente

Les **Annonces de classe** de l’enseignant utilisent les mêmes brouillons, pièces jointes et reçus de publication que les devoirs et cours.

Une file commune prend également en charge les créations suivantes :

- **Discipline et vie scolaire** : observations et incidents saisis par l’enseignant ou le personnel autorisé.
- **Calendrier scolaire** : événements ajoutés par le personnel autorisé.
- **Demandes administratives** : nouvelles demandes de documents des familles et élèves.
- **Bibliothèque** : nouvelles fiches du catalogue.
- **Cahier de textes** : nouvelles séances de l’enseignant.
- **Carnet personnel** : nouvelles notes de l’enseignant.
- **Mon organisation** : nouveaux rappels personnels de l’élève.

Le mode hors connexion doit être activé et le coffre déverrouillé. Une création est mise en attente lorsque le navigateur est hors connexion ou qu’un envoi échoue sur une erreur réseau, un échec serveur temporaire, un délai dépassé ou une limitation temporaire des requêtes. Le formulaire n’est vidé qu’après confirmation de l’écriture dans le coffre. Le message orange indique « en attente d’envoi » ; aucune réussite d’enregistrement en base ni ligne serveur fictive n’est affichée. Un échec de stockage laisse le formulaire intact.

La section **File d’attente des actions**, commune aux modules, affiche le contenu, les refus du serveur et la dernière confirmation. Elle permet de corriger ou d’annuler un ajout jamais tenté, et de réessayer un envoi. L’ouverture de l’éditeur suspend l’envoi de cet ajout, y compris après la fermeture de l’application. « Conserver les corrections », « Fermer sans modifier » ou « Reprendre l’envoi » lèvent cette suspension. Une réponse réseau perdue conserve le même identifiant : modification et annulation restent bloquées jusqu’à un refus explicite ou une confirmation serveur.

La reprise est automatique au retour d’Internet et lors de la vérification périodique, avec le même compte et profil et tant que l’application reste ouverte. Une fermeture conserve les ajouts confirmés localement ; la réouverture avec Internet permet de déverrouiller et reprendre la file. La base de données est mise à jour uniquement après les vérifications du serveur : droits actuels, inscriptions, année scolaire, dates et contenu. Chaque action utilise `X-Offline-Action-Id` et un reçu enregistré dans la même transaction que la création. Le reçu distingue le compte, le chemin et l’empreinte du contenu pour éviter les doublons après une réponse perdue ou un envoi depuis deux onglets.

La file est limitée à 100 actions et 50 Mio sérialisés. Ses éléments ne sont pas évincés avec les copies de consultation et empêchent la désactivation du mode hors connexion tant qu’ils restent conservés. Les paiements, mouvements de stock, prêts de bibliothèque, inscriptions, notes scolaires, réservations ainsi que les modifications, décisions et suppressions d’enregistrements serveur restent en ligne : ces opérations nécessitent des données actuelles ou une gestion des conflits spécifique. Les signalements d’absence des familles et les publications du portail propriétaire conservent également leur fonctionnement existant. La disponibilité des formulaires hors ligne dépend des copies de consultation disponibles pour le contexte.

Redémarrer le backend avec le code mis à jour et reconstruire le front avant utilisation. Les actions utilisent les reçus de la migration V65 existante ; aucune nouvelle migration n’est nécessaire.

## Stockage et isolation

- Les réponses JSON, texte et fichiers reçus sous forme de Blob par l’API sont enregistrés dans le coffre AES-GCM existant, jamais dans un cache HTTP ou le service worker.
- La clé reste en mémoire. Un rafraîchissement complet, la fermeture ou le changement de compte verrouille les copies ; un retour en ligne est nécessaire pour les déverrouiller. La navigation interne conserve la session déverrouillée.
- Le coffre est propre au compte et à l’appareil. Les clés de lecture distinguent le profil actif, l’URL et ses paramètres, l’école, l’année scolaire, la langue, le type de réponse et les en-têtes de négociation pertinents.
- Authentification, identité courante, clés de chiffrement, vérification des permissions et flux de changements ne sont pas remplacés par des copies.
- Un refus serveur 401 ou 403 n’est jamais masqué. Les copies génériques sont effacées. Une erreur HTTP lors d’un chargement au premier plan est propagée. Une vérification en arrière-plan échouée conserve l’affichage déjà présent et indique l’échec d’actualisation ; un refus d’accès en arrière-plan ferme la session.
- Une erreur réseau sans réponse peut utiliser la copie chiffrée disponible si le mode hors connexion est activé, même si le navigateur indique encore une connexion.

Les copies de consultation expirent après sept jours. Elles sont limitées à 2 Mio par réponse sérialisée (les fichiers binaires occupent environ un tiers de plus après encodage) et 8 Mio au total. Les plus anciennes sont évincées. Une réponse trop volumineuse ou un échec de stockage produit une indication visible et ne transforme jamais une réponse serveur réussie en échec. Les envois de présences en attente ne sont jamais supprimés par cette éviction.

Les médias externes, flux en direct, réponses ArrayBuffer et calculs serveur effectués par POST ne sont pas préparés par ce cache. Une pièce jointe doit avoir été téléchargée avec Internet et respecter les limites de taille. Les métadonnées de classes et les listes conservées pour la navigation restent également disponibles dans la mémoire de la session déverrouillée.

## Vérification

- Tests `offline-read-cache.spec.ts` : séparation des requêtes, exclusions, expiration, limites et restitution des corps.
- Tests `offline-read.interceptor.spec.ts` : cinq profils, cloisonnement école/année/paramètres, session verrouillée, refus des écritures, erreurs serveur et réseau, réponses tardives d’une autre session.
- Tests `offline-attendance.service.spec.ts` : conservation des copies avec les présences en attente et isolation du compte.
- Playwright `offline-modules.spec.ts` : parcours parent, apprenant et propriétaire, navigation interne, données et fichiers hors connexion, refus d’une écriture, absence de données en clair dans IndexedDB.
- Playwright `offline-attendance.spec.ts` : navigation de l’enseignant et synchronisation ordonnée des présences après une coupure.

Compilation locale : `npm run build:offline:local`. Les tests navigateur utilisent `http://127.0.0.1:4202` avec des API simulées et aucun compte réel. Aucun déploiement cloud n’est exécuté automatiquement.
