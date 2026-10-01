# FasoecoleFront

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 22.2.0.

## Environment URLs

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
