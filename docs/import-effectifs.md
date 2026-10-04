# Importer les enseignants et les élèves

Dans **Enseignants par classe** ou **Élèves / Étudiants par classe**, sélectionnez
l’établissement et l’année scolaire, puis ouvrez **Importer depuis un fichier**.
Cette rubrique apparaît aussi pendant la préparation d’un nouvel établissement.
Créez les classes et les matières avant l’import.

Téléchargez le modèle CSV et ouvrez-le dans Excel ou LibreOffice. Conservez les
en-têtes. Vous pouvez ensuite enregistrer en **CSV UTF-8** ou en **Excel .xlsx**.
L’import lit uniquement la première feuille. Maximum : 500 lignes et 2 Mo.
Les fichiers `.xls`, les macros et les cellules contenant des formules ne sont
pas pris en charge. Copiez les résultats des formules comme valeurs si nécessaire.

## Enseignants

Obligatoires : `prénom`, `nom`, `courriel`, `numéro_employé`, `classe`, `matière`.

Facultatives : `téléphone`, `spécialité`, `date_embauche`.

Une ligne correspond à une affectation classe / matière. Pour plusieurs
affectations, répétez le même courriel et les mêmes renseignements personnels.
L’enseignant est créé une seule fois. L’import ne réutilise pas automatiquement
un compte existant : utilisez **Affecter un enseignant existant** pour ce cas.

## Élèves / étudiants

Obligatoires : `prénom`, `nom`, `courriel`, `matricule`, `classe`.

Facultatives : `téléphone`, `date_naissance`, `sexe`, `parent_prénom`, `parent_nom`,
`parent_courriel`, `parent_téléphone`, `lien_parenté`.

Une ligne correspond à un élève. Pour ajouter son parent, fournissez au minimum
le prénom, le nom et le courriel du parent. Son courriel doit être différent
de celui de l’élève. Les liens de parenté passent par les règles habituelles
d’ajout d’un parent ; les parents existants peuvent être associés à leurs enfants.

## Formats et confirmation

- Dates : `AAAA-MM-JJ`, par exemple `2026-09-01`.
- Identifiants : configurez les cellules comme **texte** avant la saisie pour
  conserver les zéros initiaux, par exemple `000123`.
- Classes et matières : utilisez les noms affichés dans la rubrique d’import.
  Les noms de classes doivent être uniques parmi les classes de l’année affichée.
- Aucun mot de passe dans le fichier. Les invitations suivent la configuration
  habituelle de l’application, y compris la redirection des courriels en local.

Choisissez le fichier et consultez la prévisualisation. Corrigez les erreurs
de format et les doublons avant de confirmer. Les contrôles d’autorisation,
les doublons déjà présents en base et les capacités des classes sont contrôlés
par le serveur lors de chaque enregistrement.

L’import n’est pas une transaction globale : il enregistre les lignes une à une.
Une erreur ne supprime pas les lignes déjà enregistrées. Gardez la page ouverte
et consultez chaque résultat. **Confirmer / reprendre l’import** ignore les lignes
réussies ; si l’élève a été créé mais l’ajout du parent a échoué, seule cette
dernière étape est reprise. En rechargeant la page, cette progression en mémoire
est perdue : préparez alors un nouveau fichier contenant seulement les lignes
qui restent à ajouter.
