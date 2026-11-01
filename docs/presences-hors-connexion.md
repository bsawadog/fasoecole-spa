# Présences hors connexion — première version

La consultation a été étendue aux autres modules et profils : voir [Consultation hors connexion Internet](mode-hors-connexion.md). Les limites indiquées ci-dessous concernant les modules en ligne décrivent le périmètre initial ; les règles de synchronisation des présences et de verrouillage restent applicables.

Périmètre : appels de l’enseignant, pour les classes et dates chargées pendant une session en ligne, et consultation de « Mes classes » (classes, listes d’élèves consultées et emploi du temps déjà chargé). Activation volontaire sur un appareil personnel. Les messages, signalements des parents et outils d’accompagnement continuent à nécessiter le serveur.

Le réglage se trouve dans **Mon profil → Mode hors connexion Internet**, pour chaque compte et appareil. La désactivation est possible une fois les envois synchronisés. Le module Présences n’affiche pas de bouton d’activation ; les détails des envois sont repliés par défaut et s’ouvrent au clic.

Pendant une session déverrouillée, la navigation entre modules permet de revenir aux présences déjà téléchargées, avec la classe et la date précédemment choisies. Le catalogue des classes, les listes d’élèves consultées, l’emploi du temps et ces sélections restent uniquement en mémoire ; ils sont effacés au verrouillage, à la fermeture, à la désactivation ou au changement de compte. « Mes classes » conserve la recherche et le choix d’une classe consultée hors connexion ; une liste non chargée est signalée explicitement. Ses données sont actualisées automatiquement au retour d’Internet. Les présences et envois sauvegardés restent chiffrés dans IndexedDB. Un rechargement complet hors connexion exige toujours un retour en ligne pour déverrouiller les données. Les autres modules de l’espace enseignant affichent leur besoin de connexion Internet.

Il est possible d’enregistrer plusieurs élèves ou de corriger plusieurs fois le même élève pendant une coupure. Chaque envoi garde son identifiant et son contenu après une tentative réseau. Les envois d’une même classe/date sont synchronisés dans l’ordre ; les versions attendues des changements suivants avancent uniquement après confirmation de nos propres écritures. Un conflit bloque cette chaîne jusqu’à vérification, sans empêcher les nouvelles saisies locales ni les envois d’une autre classe.

- IndexedDB contient uniquement un coffre AES-256-GCM, avec IV aléatoire par écriture et contexte compte/appareil authentifié. Aucun nom, statut ni clé en clair dans ce coffre.
- La clé est récupérée après une requête authentifiée au serveur (`POST /api/me/offline-devices/{uuid}/key`, réponse `no-store`). Elle reste uniquement en mémoire côté navigateur. L’UUID local identifie un appareil, ce n’est pas un secret.
- Après fermeture/rechargement hors connexion, aucune clé n’est disponible. Le navigateur peut ouvrir les fichiers de l’application, mais l’utilisateur doit retrouver Internet pour retrouver ses saisies. Un changement de compte ou une déconnexion verrouille le coffre ; les appels non synchronisés restent chiffrés pour permettre leur récupération par le même compte.
- Enregistrer un appel le conserve d’abord localement. La synchronisation a lieu au retour du réseau, toutes les 30 secondes pendant l’utilisation, ou via « Synchroniser ». L’application doit être ouverte ; aucune promesse d’envoi en arrière-plan après fermeture.
- Chaque appel possède un UUID stable. Le serveur enregistre les présences et le reçu d’idempotence dans la même transaction. Les nouvelles tentatives utilisent le même UUID.
- Le serveur revérifie les affectations et inscriptions, l’année scolaire, la date, le statut, le motif et la version de chaque présence. Les conflits restent en attente et doivent être comparés explicitement avant un nouvel envoi. Une suppression locale demande confirmation.
- Les appels en attente n’expirent pas automatiquement. Les copies sans attente expirent après sept jours, lors du prochain accès au coffre. Effacer le stockage du navigateur ou perdre l’appareil peut perdre des saisies non synchronisées.
- Le service worker met uniquement les fichiers de l’application en cache, jamais les réponses API, clés ou dossiers scolaires. Il n’installe pas automatiquement une nouvelle version dans une page en cours de saisie.

## Déploiement

1. Sauvegarde habituelle et déploiement backend : migrations V63 (clés par utilisateur/appareil, reçus, versions des présences) et V64 (confirmation originale des envois pour les nouvelles tentatives).
2. `npm run build:dev` ou `npm run build:prod`, puis déployer **tout** le dossier `dist/fasoecole-front/browser`, y compris `ngsw.json`, `ngsw-worker.js`, `index.csr.html` et `manifest.webmanifest`.
3. HTTPS obligatoire hors localhost. CloudFront doit servir ces fichiers sans les réécrire vers index.html et sans cache long pour `ngsw.json`, `ngsw-worker.js` et les documents HTML. Les bundles nommés par empreinte peuvent garder leur cache long.
   Le modèle `fasoecole-bff/infra/dev/platform.json` contient les comportements sans cache pour `/ngsw*`, `/manifest.webmanifest` et `/index.csr.html`. Déployer aussi cette mise à jour d’infrastructure et effectuer l’invalidation habituelle après publication. Aucun changement AWS n’est appliqué automatiquement par ces modifications.
4. Tester sur un appareil personnel : activer, couper le réseau, enregistrer, fermer, rouvrir, reconnecter et vérifier la confirmation serveur.

## Limites de sécurité

Le serveur conserve les clés dans une table privée : sauvegardes et accès à la base doivent être protégés comme les autres données scolaires. Ce mécanisme protège les fichiers locaux au repos, pas un appareil compromis ou un script malveillant exécuté dans une session déverrouillée. Aucune révocation distante immédiate n’est possible pendant une coupure. Les caches ne constituent pas une sauvegarde.

## Vérification

### Test manuel local

Backend : `mvn spring-boot:run "-Dspring-boot.run.profiles=local"`. Le profil local autorise les ports 4200 et 4202 sur localhost et 127.0.0.1. Si la variable `CORS_ALLOWED_ORIGINS` est déjà définie dans le terminal, elle remplace ces valeurs : inclure alors `http://127.0.0.1:4202` et redémarrer le backend.

Frontend : `npm run build:offline:local`, puis `node tools/serve-ui.cjs`. Ouvrir `http://127.0.0.1:4202`. Cette compilation locale appelle `http://localhost:8080/api` ; un build dev ou production appelle un autre environnement. Les comptes sont ceux de la base du backend local. Activer le réglage dans Mon profil, puis ouvrir Présences avant de couper le réseau.

Une connexion refusée par CORS ne signifie pas que le mot de passe est incorrect. Ne pas effacer le stockage du navigateur pour corriger CORS, car cela pourrait supprimer des appels non synchronisés.

- Frontend : tests `attendance-vault.spec.ts`, `modules.spec.ts` et Playwright `e2e/offline-attendance.spec.ts` (ordinateur et mobile).
- Backend : `scripts/test-offline-attendance.ps1` crée sa propre base PostgreSQL Docker temporaire, vérifie les clés et les envois HTTP, puis supprime uniquement son conteneur.
