# Audit du mode hors connexion — profil enseignant

Date : 1 novembre 2026.

## Conclusion

Les 16 modules distincts des routes enseignant ne disposent pas tous d’un fonctionnement complet hors connexion. La consultation générique repose sur les réponses exactes conservées dans le coffre. Le préchargement prépare seulement une partie des lectures nécessaires. Une file d’attente d’écriture ne garantit pas, à elle seule, que les listes nécessaires au formulaire sont disponibles.

Ce bilan résulte d’une revue des routes, composants, services HTTP, mécanismes de stockage et préchargement, complétée par les tests automatisés ci-dessous. Il ne constitue pas un parcours navigateur exhaustif des 16 modules ni une validation sur l’appareil de l’utilisateur. Aucun comportement applicatif n’a été modifié dans le cadre de cet audit.

## Conditions communes

- Mode hors connexion activé, avec coffre déverrouillé avant la coupure.
- Même compte, même profil et mêmes paramètres de consultation : classe, établissement, année, date, période et autres filtres font partie de l’identité de la copie.
- Une réponse jamais préparée, expirée, trop volumineuse ou évincée ne peut pas être reconstruite hors connexion.
- Copies de consultation : sept jours, 2 Mio par réponse sérialisée et 8 Mio au total. Un préchargement terminé sans erreur HTTP ne prouve pas que toutes les copies tiennent encore dans le coffre.
- Les pièces jointes reçues doivent avoir été téléchargées en ligne et conservées dans les limites du cache.
- La fermeture ou le rafraîchissement verrouille le coffre. Les envois sont conservés mais Internet est nécessaire pour rouvrir le coffre ; la consultation hors connexion immédiatement après réouverture n’est donc pas garantie.
- La reprise des envois nécessite l’application ouverte avec Internet. Les droits et données sont revérifiés côté serveur.

## Matrice des modules

« Préparé » décrit les lectures explicitement prévues par le préchargement, sous réserve de son succès et des limites de stockage. « Après consultation » signifie que la réponse exacte doit avoir été chargée auparavant ; cela ne garantit pas les autres classes, filtres ou périodes.

| Module | Consultation hors connexion | Actions possibles hors connexion | Limites constatées |
|---|---|---|---|
| Tableau de bord | Après consultation | Aucune écriture propre au tableau de bord | La journée, les graphiques et les rendez-vous reçus ne sont pas préchargés. Un nouveau filtre peut manquer. |
| Calendrier scolaire | Après consultation de la classe | Consultation dans le profil enseignant | L’aperçu `CALENDAR` de chaque classe n’est pas préchargé. |
| Discipline et vie scolaire | Après consultation de la classe | Nouvelle observation ou incident dans la file d’actions | L’aperçu `DISCIPLINE`, qui fournit aussi les élèves du formulaire, n’est pas préchargé. Sans lui, la file ne suffit pas à rendre la saisie utilisable. |
| Bibliothèque | Après consultation de la classe | Consultation dans le profil enseignant | L’aperçu `LIBRARY` n’est pas préchargé. Les prêts et retours ne disposent pas d’une file d’attente. |
| Mes classes | Listes et emplois du temps préparés ; autres panneaux selon les copies | Consultation des listes et recherche locale | Les conversations détaillées et l’accompagnement nécessitent leurs propres copies. Les mises à jour d’accompagnement restent en ligne. |
| Présences et retards | Présences du jour préparées ; autres dates selon les copies | Saisie locale, file dédiée et synchronisation avec contrôle des conflits | Toutes les dates et tous les élèves ne sont pas garantis après éviction du cache. |
| Ma fiche employé | Après consultation de la fiche et du mois exacts | Consultation seulement | Liste des fiches et détails mensuels non préchargés. La demande depuis cette fiche utilise un endpoint distinct des messages, sans file. |
| Messages | Après consultation des listes et fils nécessaires | Nouveaux messages et réponses, avec pièces jointes conservées | Le préchargement vise des conversations par classe, alors que la page principale utilise `/conversations`. Destinataires et fils détaillés non préchargés. |
| Évaluations et notes | Périodes préparées ; évaluations et feuilles après consultation | Consultation seulement | Les évaluations par période et leurs feuilles ne sont pas préparées systématiquement. Création d’évaluation et enregistrement des notes nécessitent Internet. |
| Mon emploi du temps | Planning préparé | Consultation du planning | Les disponibilités/absences de l’enseignant et la liste des fiches employé du sous-panneau ne sont pas préchargées. Leur envoi reste en ligne. |
| Signalements des parents | Signalements du jour préparés ; autres dates après consultation | Consultation seulement | La prise en compte d’un signalement est une modification serveur et reste en ligne. |
| Devoirs de maison | Publications et suivi préparés par classe | Brouillons et nouvelles publications dans la file | La remise/correction d’un devoir existant reste en ligne. Les fichiers reçus doivent avoir été téléchargés. Les lectures manquantes s’affichent maintenant sans fenêtre bloquante. |
| Cours et ressources | Publications préparées ; fichiers et cahier de textes selon les copies | Brouillons, nouvelles ressources et nouvelles séances du cahier de textes | Le GET des séances n’est pas préchargé. Modification/suppression de contenu existant en ligne. |
| Annonces de classe | Publications préparées par classe | Brouillons et nouvelles annonces dans la file | Modification/suppression d’une annonce existante en ligne. |
| Rendez-vous parents | Demandes historiques par classe préparées ; liste commune après consultation | Consultation seulement | Le composant charge aussi `/me/appointments`, non préchargé. Acceptation/refus/annulation nécessitent Internet. |
| Mon carnet personnel | Après consultation du carnet | Nouvelles notes personnelles dans la file | Le GET des notes n’est pas préchargé. Modification, suppression et passage d’une note existante à « terminée » restent en ligne. |

`/enseignant/suivi-devoirs` redirige vers les devoirs et n’ajoute pas un dix-septième module.

## Points qui empêchent de valider « tous les modules hors connexion »

1. **Préparation incomplète des lectures.** Il manque notamment les aperçus calendrier/discipline/bibliothèque, la journée, les graphiques, les notes personnelles, les séances, les fiches employé, les destinataires et fils de messagerie, les évaluations et feuilles de notes, et les rendez-vous reçus. Les lectures récentes peuvent combler certains manques, mais uniquement si elles existent déjà pour le même contexte.
2. **Navigation encore potentiellement bloquante.** Plusieurs composants utilisent toujours `ErrorAlert`, qui ouvre un dialogue modal, pour une lecture impossible hors connexion. C’est notamment le cas de `SchoolLifePage`, des évaluations/notes, de la messagerie, des rendez-vous, de la fiche employé, de la journée et des graphiques. La correction récente des devoirs n’a pas généralisé la présentation non bloquante à toutes les pages.
3. **Actions volontairement en ligne.** La présence d’une file commune n’autorise pas les écritures arbitraires. Les notes scolaires, décisions de rendez-vous, traitements des signalements, modifications et suppressions d’enregistrements existants restent en ligne.
4. **Disponibilité après fermeture.** Les données chiffrées persistent, mais la clé reste en mémoire et le coffre doit être rouvert avec Internet. Cette limite concerne tous les modules.
5. **Pas de preuve de disponibilité globale.** Le spinner suit la fin des requêtes du préchargement ; il n’existe pas de manifeste attestant que toutes les lectures nécessaires à chaque module/classe sont encore présentes et valides après application des quotas.

## Vérification exécutée

Commande :

```text
npx ng test --watch=false --include=src/app/shared/offline/*.spec.ts --include=src/app/features/dashboard-enseignant/**/*.spec.ts --include=src/app/shared/school-life/school-life.spec.ts --include=src/app/shared/appointments/appointments.spec.ts
```

Résultat : **18 fichiers et 127 tests réussis**.

Cette sélection couvre notamment le cache et son isolation, les files et leurs reprises, le préchargement, les classes, les présences, les devoirs avec copies manquantes et changement de classe, la messagerie, les notes scolaires et les rendez-vous. Elle ne démontre pas un fonctionnement intégral de chaque écran hors connexion : les tests des notes et rendez-vous comprennent aussi des comportements en ligne.

## Sources principales du diagnostic

- Routes : `src/app/features/dashboard-enseignant/enseignant.routes.ts`.
- Préchargement : `src/app/shared/offline/module-preload.service.ts`.
- Cache, exclusions et quotas : `src/app/shared/offline/offline-read.interceptor.ts`, `offline-read-cache.ts`.
- Conservation et verrouillage : `src/app/shared/offline/offline-attendance.service.ts`.
- Liste des créations compatibles : `src/app/shared/offline/action-outbox.ts`, `publication-outbox.ts`, `message-outbox.ts`.
- Lectures des espaces : composants de `src/app/features/dashboard-enseignant/pages`, `src/app/shared/self-space`, `src/app/shared/school-life`, `src/app/shared/appointments`.
- Dialogue bloquant : `src/app/shared/error-alert.ts`.
- Chargement des fichiers de l’application : `ngsw-config.json`, `src/app/app.config.ts`. La disponibilité des fichiers applicatifs via service worker ne remplace pas celle des données API dans le coffre.
