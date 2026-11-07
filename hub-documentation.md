# Hub v4 — Documentation · Vasilías Studio

*Administration privée du portfolio, hébergée sur GitHub Pages (`hub.html`, `noindex`).*
*URL : `https://vasilias-studio.github.io/hub.html#content` · Version 4.0 · 2026-11-06*

## Publication automatique

Le Hub écrit directement dans le dépôt `vasilias-studio/vasilias-studio.github.io`, branche `main`, via l’API Git Data de GitHub. Une fois le token configuré dans le navigateur, les enregistrements sont regroupés après une courte temporisation et publiés dans un commit atomique. Aucune opération manuelle de dépôt, d’export ou d’upload n’est nécessaire pour le flux normal.

À chaque publication, le Hub met à jour `hub-data.json`, le sitemap et les pages HTML publiques connues. Les pages de projet nouvellement publiées sont générées depuis les données du Hub. Les fichiers importés dans la médiathèque sont envoyés dans `assets/hub-uploads/`; les suppressions sont incluses dans le même commit. GitHub Pages lance ensuite son déploiement statique sur `https://vasilias-studio.github.io/`.

### Connexion GitHub (à faire une fois par navigateur)

1. Ouvrir le Hub et, avant ou après déverrouillage, développer **Connexion à GitHub pour publier automatiquement** ou aller dans **Paramètres → Publication automatique**.
2. Coller un token personnel GitHub autorisé sur ce dépôt avec accès en écriture au contenu (`Contents: Read and write`; un fine-grained token limité à ce seul dépôt est préférable).
3. Cliquer **Enregistrer**. Le secret est conservé dans `localStorage` sous `hub2_gh_token` sur cet appareil seulement.

Le token n’est ni inclus dans les fichiers du site, ni envoyé au visiteur public, ni commité dans Git. Les appels authentifiés sont faits directement depuis le navigateur vers `api.github.com`. Toute personne ayant accès à ce navigateur peut toutefois utiliser le token : supprimer-le dans Paramètres quand l’appareil n’est plus de confiance. Pour un environnement multi-administrateur, remplacer ce modèle par un backend avec secrets serveur.

Un token présent dans le fragment d’URL (`#gh=...`) est transféré dans le stockage local puis le fragment est immédiatement retiré de l’historique. Ne pas partager une telle URL. En cas d’échec API (token invalide/expiré, droits insuffisants, conflit de branche ou réseau), les données restent dans le cache local et l’interface affiche l’erreur; **elles ne sont alors pas encore publiées**. Réessayer via **Synchroniser maintenant** dans Paramètres. L’export JSON demeure une copie de secours, pas une étape du workflow normal.

## Écrans du Hub

| Section | Fonction |
|---|---|
| Vue d’ensemble | État du portfolio, activité, tâches et notifications locales. |
| Projets | Création et modification du statut, année, nature, catégories, client, rôle, accroche, présentation, images de couverture et galerie. Import multiple en une seule fois des images de couverture (ou glisser-déposer / sélection multiple dans la médiathèque), choix de la vignette principale et réorganisation de l’ordre : dès que plusieurs couvertures sont définies, un carrousel s’affiche automatiquement sur la page du projet. Création de pages pour les nouveaux projets publiés. |
| Contenus | Accroche, présentation, services, processus, champs d’intervention, textes À propos et Contact, supports et profils sociaux; les champs structurés avancés sont éditables en JSON. Le processus de la page À propos (`about.workProcess`) comprend ses trois étapes et la citation de conclusion. |
| Médiathèque | Import multiple vers `assets/hub-uploads/`, suppression de fichiers, recherche et texte alternatif. L’import est téléversé automatiquement lors du commit. Les sélecteurs de couverture, galerie, image Open Graph et portrait réutilisent cette bibliothèque. |
| Compétences | Listes de compétences et outils. Sur la page À propos, les six expertises sont présentées avec leurs descriptions éditoriales et les six logiciels avec leurs logos officiels déjà présents dans le dépôt. |
| SEO & partage | Title, description, image OG et URL canonique par page. |
| Publication | État de synchronisation, checklist et export JSON de secours. |
| Surveillance | Vérifications manuelles lancées depuis le navigateur, avec état/progression visibles et délai maximal par page; ce n’est pas une surveillance serveur continue. |
| Historique & sauvegardes | Journal et instantanés locaux; ceux-ci sont propres au navigateur et ne remplacent pas l’historique Git. |
| Paramètres | Token GitHub, synchronisation manuelle, session et données locales. |

### Devis (onglet « Devis »)
- Chaque demande envoyée depuis le formulaire du site crée un devis en brouillon, lu en direct depuis le Google Sheet privé (rien n’est écrit dans le dépôt public).
- Liste filtrable (statut, recherche), pastille « à chiffrer » dans le menu, édition des lignes, remise, TVA, statut, validité, remarques, conditions.
- « Aperçu / PDF » ouvre un devis prêt à imprimer (Imprimer → Enregistrer en PDF). « E-mail au client » et « WhatsApp » préparent le message.
- Configuration : Paramètres → Devis (clé d’accès + mentions légales du pied de page). Installation complète : `backend/apps-script/README.md`.
- Le module est dans `js/hub-quotes.js` ; la clé est conservée uniquement dans ce navigateur.

## Architecture de synchronisation

- `hub-data.json` v4 est la source de contenu commune.
- `js/hub-sync.js` expose `window.VasiliasSync` (et `module.exports` pour les tests Node). Il hydrate le DOM public depuis le cache local/les données publiées, met à jour le head SEO, les sections éditoriales, le pied de page, les médias et les cartes de projets. Il fournit aussi la sérialisation HTML, la génération des pages projet et du sitemap.
- Les pages publiques chargent `js/hub-sync.js?v=12` avant `js/main.js?v=15`. L’événement `vasilias:hydrated` relance les observateurs Reveal, filtres, espacements et carrousels après les modifications DOM.
- Les sauvegardes locales du Hub sont partagées avec le site public du même navigateur via `BroadcastChannel('vasilias_hub')` et `localStorage`. Les autres appareils reçoivent le changement après le déploiement GitHub Pages.
- Le client de publication lit la branche et les blobs GitHub, compare les contenus, crée uniquement les blobs modifiés, puis crée un arbre/commit et avance `refs/heads/main` sans force-push. `hub2_pending_sync` est posé pendant les modifications non publiées et retiré après succès.

## Données et confidentialité

Les brouillons restent dans `localStorage` tant qu’ils ne sont pas publiés. Le token est un secret privilégié stocké uniquement dans le navigateur et ne doit jamais être écrit dans le code source, `hub-data.json`, une capture d’écran ou un dépôt public. Révoquer tout token perdu ou exposé depuis les paramètres de sécurité GitHub, puis en créer un nouveau à portée minimale.

Le verrou par code du Hub est un contrôle de confort exécuté côté navigateur, pas une authentification serveur. GitHub Pages sert les fichiers statiques publiquement; le verrou ne protège donc pas les données ou scripts de leurs visiteurs techniques.

## Dépannage et restauration

- **Token manquant** : enregistrer un token dans Paramètres; les changements locaux se publieront ensuite avec **Synchroniser maintenant**.
- **401/403** : token invalide/expiré ou sans accès Contents en écriture au dépôt. Remplacer le token.
- **409 / référence modifiée** : recharger le Hub pour lire la dernière version, puis réappliquer les modifications locales si nécessaire; ne pas forcer l’avancement de la branche.
- **Pages temporairement anciennes** : le commit Git est immédiat, mais la construction GitHub Pages peut prendre un court délai. Vérifier l’état Pages puis recharger sans cache.
- **Rollback** : utiliser `git revert <sha>` dans GitHub ou un environnement Git autorisé et pousser le revert. Les snapshots du navigateur ne rétablissent pas les fichiers distants.

## Dépendances et publication

La publication du contenu n’utilise aucun backend ni service d’upload distinct : le déploiement statique existant GitHub Pages publie la branche `main`. Seuls les formulaires Contact et Devis passent par le Google Apps Script décrit dans `backend/apps-script/README.md`. Le navigateur doit être connecté à Internet, autoriser `api.github.com` et utiliser un navigateur compatible `fetch`, `DOMParser`, `localStorage` et `WebCrypto`.
