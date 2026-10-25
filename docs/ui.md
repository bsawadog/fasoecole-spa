# Interface et PrimeNG

L’interface utilise PrimeNG 22 et un thème Aura personnalisé pour Angular 22.
La palette, les espacements des contrôles et les couleurs sont définis dans
`src/app/shared/ui/theme.ts`. Seuls les thèmes des composants utilisés sont importés.

Les styles sont ordonnés en trois couches : `legacy`, `primeng`, `application`.
Les styles de page existants conservent les mises en page ; la couche `application`
dans `src/app/shared/ui/_application.scss` harmonise les espaces des différents rôles.
Les règles d’impression des états financiers et des fiches sont conservées.

Les tableaux de collections simples utilisent `p-table`, avec pagination au-delà de
15 lignes. Les tableaux regroupés, les grilles de notes et les états imprimables
gardent leur structure HTML. Ajouter `[appTableRow]="collection"` sur les templates
`#body` conserve le typage strict des lignes.

Les formulaires utilisent `DateField`, `SelectField` et `NumberField`, basés sur
DatePicker, Select et InputNumber. Les dates s’affichent en français et continuent
à transmettre les chaînes ISO attendues par le serveur (date, mois, heure ou date
et heure locale), sans conversion UTC. Les choix gardent leurs identifiants
numériques, groupes et états désactivés. Les limites, champs obligatoires et
messages d’erreur sont intégrés aux formulaires Angular.

`SelectOption` déclare un choix avec `[value]`, `[label]`, `[disabled]` et `[group]`.
Les événements `change` des champs partagés conservent `event.target.value` pour
les gestionnaires de page existants. La directive de validation délègue les champs
composites à leurs validateurs Angular pour éviter de valider les champs internes
de recherche ou d’affichage comme des champs métier.

## Licence PrimeUI

PrimeNG 22 et les thèmes PrimeUI 3 nécessitent une clé valide. Une licence Community
ou commerciale peut être utilisée, selon les conditions du fournisseur :
https://primeui.dev/licenses

Renseigner `primeUiLicense` dans les fichiers d’environnement concernés, ou injecter
sa valeur lors de la préparation du build. `providePrimeNG` lit cette configuration.
Sans clé, PrimeUI affiche un avertissement et un bandeau de licence. Aucun mécanisme
de licence n’est désactivé. Une clé incluse dans une application navigateur est
accessible au navigateur ; elle n’est pas un secret serveur.

## Vérification

La navigation entre modules réutilise la liste des accès déjà chargée dans la
session. Les requêtes ordinaires simultanées partagent la même requête HTTP.
Le shell continue de rafraîchir les accès toutes les 20 secondes ; les appels
explicites `loadOwnerAccess(true)` demandent toujours une réponse fraîche, même
si une requête plus ancienne est en cours. Les réponses dépassées ne remplacent
pas les accès d'une nouvelle session. Les données métier des pages sont toujours
chargées pour l'établissement et l'année sélectionnés.

Une barre discrète apparaît après 150 ms de navigation et disparaît également en
cas d'annulation ou d'erreur. Les cartes de chargement réservent leur hauteur et
leur apparition est différée pour éviter un clignotement lors des réponses rapides.
Les préférences de réduction des animations sont respectées.

- `npm test -- --watch=false` : tests Angular existants.
- `npm run build:dev` : compilation optimisée avec budgets existants.
- `npx playwright install chromium` : installer le navigateur de test une fois.
- Après compilation, `npm run test:ui` : parcours des espaces sur ordinateur et mobile,
  calculs de l’inscription et pagination du recouvrement.

Les tests UI démarrent un serveur local sur `127.0.0.1:4202` et interceptent toutes les
requêtes API. Ils utilisent des données fictives et des états d’indisponibilité pour
les services non alimentés par les fixtures. Ils ne remplacent pas une recette métier
avec un serveur et des données réelles. Les captures et traces sont dans `test-results/`.
