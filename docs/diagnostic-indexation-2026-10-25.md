# Diagnostic de l’indexation — 25 octobre 2026

Site contrôlé : https://app.dev.fasoecole.com/

## Résultat

Aucun blocage technique d’indexation identifié dans les vérifications ci-dessous.
Ce constat ne garantit pas l’indexation et ne permet pas de connaître les décisions
internes de Google ou Bing.

## Vérifications effectuées sur le site déployé

- Les huit URL du sitemap répondent HTTP 200, avec un contenu HTML pré-rendu,
  un titre, un seul H1 et une URL canonique correspondant exactement à l’URL soumise.
- 24 requêtes comparées : les huit pages avec un identifiant de navigateur,
  un User-Agent Googlebot mobile et un User-Agent Bingbot. Les trois réponses
  HTML de chaque page sont identiques (comparaison SHA-256).
- Aucune balise `noindex` ou en-tête `X-Robots-Tag` bloquant sur ces pages.
- `robots.txt` est accessible et ne bloque aucune des huit URL publiques.
- Le sitemap répond HTTP 200, au format XML, avec huit URL du même domaine.
- Les huit ressources CSS, JavaScript et images directement référencées par
  l’accueil sont accessibles en HTTP 200.
- HTTP redirige vers HTTPS en 301. Une URL avec un paramètre de suivi conserve
  l’URL canonique sans paramètre. `/contact/` pointe canoniquement vers `/contact`.
- Après exécution de JavaScript dans Chromium, l’accueil, Contact et Suivi scolaire
  conservent leur contenu visible, leur URL canonique et `index,follow`.
  Aucune erreur JavaScript de page n’a été détectée pendant ces navigations.
- `index.csr.html` porte `noindex,follow` : c’est le document de repli des routes
  applicatives, absent du sitemap. Les pages publiques servent leurs propres HTML
  avec `index,follow`.

## Configuration AWS consultée en lecture seule

- Distribution du domaine activée, statut `Deployed`.
- Aucune restriction géographique, aucun Web ACL associé à la distribution.
- Redirection HTTP vers HTTPS et document racine `index.html`.
- Aucune politique d’en-têtes de réponse associée au comportement par défaut.
- Journaux d’accès standard CloudFront désactivés.

Le client AWS CLI local ne prend pas en charge `cloudfront get-function` : le code
LIVE de la fonction n’a pas pu être relu avec ce client. Les réponses réellement
servies aux URL publiques ont été contrôlées indépendamment.

## Limites et suite

Changer le User-Agent ne reproduit pas l’adresse IP d’un robot réel. Sans journaux
d’accès historiques et sans accès aux comptes Search Console/Bing Webmaster Tools,
il n’est pas possible de confirmer les visites réelles ni d’expliquer une décision
d’exclusion propre au moteur.

Le statut Google « Détectée, actuellement non indexée » signifie que l’URL est
connue mais n’a pas encore été explorée dans le rapport d’indexation. Le message
général de Bing ne démontre pas à lui seul la même cause.

Après une demande d’indexation et un test en direct réussi, surveiller la dernière
exploration et le motif d’exclusion dans chaque outil. Si Bing maintient son refus
sans détail après réévaluation, transmettre au support Bing l’URL, le résultat du
test en direct et ces contrôles. Aucun changement supplémentaire du sitemap ou de
CloudFront n’est justifié par les résultats actuels.

Références :
- https://support.google.com/webmasters/answer/7440203?hl=fr
- https://www.bing.com/webmasters/help/URL-Inspection-55a30305
