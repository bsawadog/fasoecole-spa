# Déploiement dev sur AWS Paris

La configuration complète se trouve dans le dépôt fasoecole-bff :
infra/dev/README.md et infra/dev/*.json.

Le workflow .github/workflows/deploy-dev.yml teste et construit Angular avec
build:dev, puis publie dans S3 et invalide CloudFront. Il utilise l'environnement
GitHub dev, la variable AWS_ROLE_ARN et la branche develop.

Le build dev hébergé est optimisé, avec fichiers hachés et sans source maps.
L'API utilise /api, transmise par CloudFront au backend HTTPS. Le profil local
reste disponible avec npm run build:local et npm start.
La configuration serve dev nécessite également une origine /api ; pour le
développement local habituel utiliser npm start.

La stack fasoecole-dev-platform doit déjà exister dans eu-west-3.
Les sorties Bucket, Distribution et FrontendUrl sont lues automatiquement.
Les assets sont publiés avant index.html et les anciens assets hachés sont
conservés pour les sessions déjà ouvertes. Prévoir un nettoyage après les tests.
