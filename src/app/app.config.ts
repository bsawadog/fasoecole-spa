import { ApplicationConfig, LOCALE_ID, provideBrowserGlobalErrorListeners } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localeFr from '@angular/common/locales/fr';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import { routes } from './app.routes';
import { academicContextInterceptor } from './shared/academic-context';
import { authInterceptor } from './core/auth';
import { providePrimeNG } from 'primeng/config';
import { schoolTheme } from './shared/ui/theme';
import { environment } from '../environments/environment';

registerLocaleData(localeFr);

export const appConfig: ApplicationConfig = {
  providers: [
    { provide: LOCALE_ID, useValue: 'fr-FR' },
    providePrimeNG({
      license: environment.primeUiLicense || undefined,
      theme: {
        preset: schoolTheme,
        options: { darkModeSelector: false, cssLayer: { name: 'primeng', order: 'legacy, primeng, application' } },
      },
      translation: {
        accept: 'Confirmer', reject: 'Annuler', emptyMessage: 'Aucun résultat',
        emptyFilterMessage: 'Aucun résultat pour cette recherche',
        emptySearchMessage: 'Aucun résultat pour cette recherche',
        searchMessage: '{0} résultats disponibles', selectionMessage: '{0} éléments sélectionnés',
        emptySelectionMessage: 'Aucun élément sélectionné',
        firstDayOfWeek: 1,
        dayNames: ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'],
        dayNamesShort: ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'],
        dayNamesMin: ['D', 'L', 'M', 'M', 'J', 'V', 'S'],
        monthNames: ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'],
        monthNamesShort: ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'],
        today: 'Aujourd’hui', clear: 'Effacer', dateFormat: 'dd/mm/yy',
        chooseDate: 'Choisir une date', chooseMonth: 'Choisir un mois', chooseYear: 'Choisir une année',
        prevMonth: 'Mois précédent', nextMonth: 'Mois suivant', prevYear: 'Année précédente', nextYear: 'Année suivante',
        prevDecade: 'Décennie précédente', nextDecade: 'Décennie suivante',
        prevHour: 'Heure précédente', nextHour: 'Heure suivante', prevMinute: 'Minute précédente', nextMinute: 'Minute suivante',
        aria: {
          firstPageLabel: 'Première page', previousPageLabel: 'Page précédente',
          nextPageLabel: 'Page suivante', lastPageLabel: 'Dernière page',
          pageLabel: 'Page {page}', rowsPerPageLabel: 'Lignes par page',
          selectRow: 'Sélectionner la ligne', unselectRow: 'Désélectionner la ligne',
          selectAll: 'Tout sélectionner', unselectAll: 'Tout désélectionner',
          close: 'Fermer',
        },
      },
    }),
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withInMemoryScrolling({ anchorScrolling: 'enabled' })),
    provideHttpClient(withInterceptors([authInterceptor, academicContextInterceptor])),
  ]
};
