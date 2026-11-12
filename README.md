# FasoecoleFront

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 22.2.0.

## Environment URLs

Le workflow GitHub Actions **Deploy frontend** propose `dev` ou `prod` au
lancement manuel. Sélectionner `develop` pour dev et `main` pour prod
(modifiable avec la variable `DEPLOY_BRANCH` de l'environnement GitHub).
Les pushes sur `develop` déploient automatiquement dev.
Chaque environnement doit définir `AWS_ROLE_ARN` pour son rôle frontend
et disposer de sa stack `fasoecole-dev-platform` ou `fasoecole-prod-platform`.
Le workflow lance respectivement `build:dev` ou `build:prod`.

| Build | Frontend URL | API URL |
|---|---|---|
| Local (`npm start`) | `http://localhost:4200` | `http://localhost:8080/api` |
| Dev (`npm run build:dev`) | `https://app.dev.fasoecole.com` | `https://api.dev.fasoecole.com/api` |
| Production (`npm run build:prod`) | `https://app.fasoecole.com` | `https://api.fasoecole.com/api` |

`fasoecole.com` is a proposed domain, not yet registered or deployed. Replace the dev and production API URLs before publishing if a different domain is acquired. Angular embeds the API URL at build time; rebuilding is required after changing it.

## Cycles et niveaux

Dans « Gestion de l'établissement » > « Académique » > « Cycles et niveaux », le propriétaire peut activer individuellement les niveaux proposés pour le préscolaire (PS à GS), le primaire (CP1 à CM2), le collège (6e à 3e) et le lycée (2nde à Terminale). Un établissement mixte voit ces quatre cycles ; un établissement secondaire voit collège et lycée. Les universités voient Licence 1 à 3, Master 1 et 2 et Doctorat (LMD) ; les centres de formation voient CAP, BEP, BT et BTS. Ces suggestions ne créent pas automatiquement de filières ou de diplômes et les niveaux existants sont conservés. La création manuelle permet toujours les cycles personnalisés. Créez ensuite une année scolaire et associez chaque classe à un niveau de cet établissement.

## Enseignants par classe

Dans l'espace propriétaire, « Enseignants par classe » liste les enseignants affectés à la classe sélectionnée. La fiche d'un enseignant regroupe ses coordonnées, son planning hebdomadaire par classe, le pointage de ses séances (présence/absence), les heures supplémentaires et les versements mensuels. La rémunération est globale pour l'enseignant avec un détail des heures par classe. Un taux horaire paie les heures pointées présentes et supplémentaires ; un salaire mensuel est proratisé par rapport aux heures prévues du mois. Les séances non pointées ne sont pas rémunérées. Les versements enregistrés sont déduits du montant dû pour afficher le reste à payer.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Tester le mode hors ligne en local

Depuis le dossier `fasoecole-spa`, compiler l'application avec le service worker,
puis servir les fichiers générés :

```powershell
npm run build:offline:local
npx http-server dist/fasoecole-front/browser -p 4200 -c-1
```

1. Ouvrir `http://localhost:4200` avec une connexion active et le backend local
   disponible à `http://localhost:8080/api` pour charger les données.
2. Se connecter avec un compte approuvé, au courriel vérifié et au mot de passe
   définitif. Le mode hors connexion s'active automatiquement sur un navigateur
   compatible et prépare les données dès que la connexion est disponible.
   Une désactivation explicite dans **Mon profil → Mode hors connexion Internet**
   reste mémorisée pour ce compte sur cet appareil ; réactiver le mode dans le
   profil pour annuler ce choix. Attendre la fin de la préparation et
   le message **Données prêtes hors connexion pour cet établissement** dans
   l'espace connecté. Si la préparation est incomplète, réessayer en ligne.
3. Attendre le message **Application prête pour le hors connexion** en haut de
   la page. Le statut « activé » dans **F12 → Application → Service Workers**
   ne suffit pas : les fichiers peuvent encore être en cours de téléchargement.
   Si un rechargement est nécessaire, le faire
   avec la connexion active, attendre le déverrouillage des données locales,
   puis visiter les pages et les classes à tester pour charger leurs données.
4. Dans **Network**, sélectionner **Offline**, puis naviguer entre les modules
   avec les liens de l'application, sans recharger la page ni fermer l'onglet.
   Tester les fonctionnalités hors ligne avec les données déjà chargées.
5. Revenir à **No throttling** pour rétablir la connexion.

Pour **Élèves par classe** et **Enseignants par classe**, la préparation charge
automatiquement les listes des classes de l'établissement sélectionné, selon
les droits du compte. Il n'est plus nécessaire d'ouvrir ces modules en ligne
avant de les consulter hors connexion. Attendre le message de fin de préparation
des données, puis couper le réseau et ouvrir les modules avec le menu.
Le message **Application prête pour le hors connexion** concerne les fichiers
de l'application ; il ne remplace pas la confirmation de préparation des données.
Les autres modules restent disponibles à partir de leurs données déjà chargées.
Si les données sont verrouillées après un rechargement ou une fermeture,
rétablir la connexion pour les déverrouiller avant de refaire le test.

L'accueil public et ses images sont conservés par le service worker et restent
accessibles lors d'un rechargement hors ligne. Les navigations utilisent la
copie de l'application déjà installée. Les appels API contournent le service
worker (`ngsw-bypass`) : leurs données privées restent gérées par le cache
chiffré de l'application, sans mise en cache HTTP des données personnelles.
Après un nouveau build, laisser l'application ouverte en ligne pour télécharger
la mise à jour, puis fermer les onglets de l'application et la rouvrir en ligne
avant de refaire les essais hors connexion.

Une coupure pendant la première installation peut laisser le service worker en
état dégradé et provoquer des 504, même sur l'accueil. La préparation vérifie
maintenant que le worker contrôle la page et a terminé l'installation de ses
fichiers avant d'annoncer que l'application est prête. Si le message indique une
préparation incomplète, garder la connexion et utiliser **Réessayer**.

Pour investiguer une erreur persistante, revenir à **Mon profil → Diagnostic
hors connexion** sans recharger la page, puis utiliser **Préparer le diagnostic**
et **Copier le diagnostic**. Le rapport indique l'origine, le déverrouillage du
cache, le contexte établissement/année, les chemins des copies locales et les
dernières erreurs ou lectures du cache. Il ne contient ni mots de passe, ni
jetons, ni contenu des dossiers. Les événements restent en mémoire et ne sont
pas envoyés automatiquement.

Utiliser ce build pour le test : `npm start` / `ng serve` utilise la configuration
de développement sans service worker. Les données disponibles hors ligne
dépendent des caches et des fonctionnalités prises en charge par l'application.
Pour repartir de zéro, supprimer le service worker et les données du site dans
**Application → Storage → Clear site data**, puis refaire les étapes en ligne.

### Modules admin utilisables hors ligne

Les modules autorisés pour le compte permettent de consulter leurs dernières
données chargées sur cet appareil, dans la limite du cache local (conservation
maximale de sept jours, taille limitée). Les ajouts suivants peuvent aussi être
conservés chiffrés puis envoyés au retour de la connexion :

| Module | Saisies prises en charge hors ligne |
|---|---|
| Messages | Nouveau message et réponse |
| Calendrier | Création d'un événement |
| Discipline | Création d'une observation |
| Bibliothèque | Ajout d'une fiche au catalogue |
| Patrimoine | Création d'une fiche de bien |
| Stocks | Création d'un article, entrée ou sortie sur un article existant |
| Dépenses | Création d'une catégorie, d'une dépense réglée, d'une dépense à payer ou d'une charge fixe ; versement sur une dépense existante |
| Impôts et taxes | Création d'une obligation fiscale ; versement sur une obligation existante |
| Caisse et banque | Ajout d'un mouvement manuel dans un livre déjà ouvert |
| Frais scolaires | Création d'un type de frais ; paiement d'une facture existante |
| Notes | Création d'une évaluation dans une classe et une période existantes |
| Inscriptions | Inscription d'un nouvel élève dans une classe existante, avec ses responsables et les frais sélectionnés |
| Créer un employé | Création d'un enseignant avec rémunération (matières et créneaux initiaux facultatifs), ou d'un autre employé avec fonction, salaire et accès aux modules |

Une saisie en attente n'est pas encore confirmée : les listes et les soldes ne
sont mis à jour qu'après son acceptation par le serveur. Aucun reçu de paiement
ou d'inscription n'est émis avant cette confirmation. Les droits, places
disponibles, périodes ouvertes et montants restants sont vérifiés à l'envoi ;
une opération peut être refusée si la situation a changé.
Après la synchronisation, rouvrir le module ou utiliser **Actualiser** pour
consulter les données confirmées.

Les éléments créés hors ligne ne sont pas utilisables comme références pour
une autre saisie avant leur synchronisation (par exemple, créer un article,
puis attendre sa confirmation avant d'enregistrer son premier mouvement).
La file d'attente permet de consulter les ajouts, de corriger ou d'annuler ceux
qui n'ont pas été tentés, et de relancer les envois refusés. Une réponse perdue
est rejouée avec le même identifiant pour éviter de créer un doublon.

La préparation inclut les années ouvertes, classes d'accueil, frais d'inscription
et liste des employés du périmètre autorisé. On peut ouvrir **Inscriptions** ou
**Créer un employé** pour la première fois après la coupure, une fois les données
préparées. Pour inscrire un élève hors ligne, saisir ses nouveaux responsables
ou utiliser une recherche de parent déjà chargée sur cet appareil ; une nouvelle
recherche de parent nécessite Internet. Les comptes, numéros attribués par le
serveur, accès et invitations ne sont confirmés qu'à la synchronisation.

Les modifications et suppressions de données existantes, la saisie des notes,
les recomptages de stock, les ouvertures et clôtures de livres, les promotions
et clôtures d'années, ainsi que les imports nécessitent une connexion.
Les modules de personnel et de gestion de l'établissement restent consultables
à partir de leur copie locale ; leurs modifications nécessitent une connexion.

La synchronisation reprend automatiquement avec l'application ouverte.
Après fermeture ou rechargement, une connexion est nécessaire pour déverrouiller
les données chiffrées. Utiliser `localhost` pour les essais sur le PC ou HTTPS
pour un accès depuis un autre appareil : une adresse IP en HTTP ne permet pas
d'activer le stockage sécurisé et le service worker.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Vitest](https://vitest.dev/) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
# fasoecole-spa

## Sitemap Google

Les builds `npm run build:dev` et `npm run build:prod` pré-rendent les huit
pages publiques en HTML avec Angular SSG. Les espaces authentifiés restent
rendus dans le navigateur. L’annuaire pré-rend son introduction et ses liens ;
sa liste d’établissements est chargée dans le navigateur pour ne pas dépendre
du backend pendant le build. Aucun dossier ou renseignement privé n’est exporté.

`src/app/core/seo/public-pages.ts` définit les titres et descriptions. La stratégie
SEO applique une seule URL canonique par page publique, sans paramètres, et
`noindex` aux autres routes. Les origines sont définies dans `environment*.ts`.
`tools/finalize-seo.cjs` adapte sitemap et robots au domaine dev ou production et
vérifie le contenu et les URL canoniques des HTML générés. Ne pas partager le
sitemap dev avec le domaine de production.

CloudFront doit appliquer la règle de réécriture mise à jour dans
`fasoecole-bff/infra/dev/platform.json` : les pages publiques pointent vers leur
propre `/index.html` et les espaces connectés vers `/index.csr.html`. Déployer
le frontend d’abord, puis la modification d’infrastructure ; sinon les liens
publics profonds afficheront encore le HTML de l’accueil.

Après déploiement, valider la propriété du domaine dans Google Search Console
(par enregistrement DNS), soumettre `/sitemap.xml`, puis inspecter l’accueil et
les pages de services et demander leur indexation. Contrôler le rendu et les
motifs de non-indexation. Ces opérations nécessitent l’accès au compte Google
et au DNS ; le sitemap ne garantit pas un classement dans les résultats.

Le fichier `public/sitemap.xml` recense les pages publiques stables sur
`https://app.dev.fasoecole.com`. `public/robots.txt` déclare son adresse et
demande aux robots de ne pas explorer les espaces connectés et les formulaires
de compte. Ces directives ne remplacent pas les contrôles d’accès du backend.

Angular copie ces deux fichiers à la racine du build. Le déploiement existant
sur S3/CloudFront les publie à `/sitemap.xml` et `/robots.txt`. Après déploiement,
soumettre `https://app.dev.fasoecole.com/sitemap.xml` dans la rubrique Sitemaps
de Google Search Console. Vérifier que cette URL renvoie le XML plutôt que la
page HTML de l’application. Adapter les URL absolues si le domaine change et
ajouter les nouvelles pages publiques lors de leur création.
