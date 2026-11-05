# Hub v3 — Documentation · Vasilías Studio

*Espace privé de gestion du portfolio. Hébergé sur GitHub Pages (`hub.html`, `noindex`).*
*URL : `https://vasilias-studio.github.io/hub.html` — Version 3.0 · 2026-10-28*

---

## 1. Accès

| Élément | Fonctionnement réel |
|---|---|
| Code d'accès | Vérifié par **empreinte SHA-256** côté navigateur (constante `ACCESS_SHA256`) — le code n'apparaît nulle part en clair |
| Champ | Label, bouton **afficher/masquer**, état de chargement (spinner), message d'erreur exploitable |
| Anti-force brute | 5 tentatives → blocage 60 s (persistant `localStorage hub2_attempts`) |
| Session | 12 h, conservée en `sessionStorage` (onglet uniquement) ; expiration affichée dans la barre latérale ; bouton **Se déconnecter** |
| Limite assumée | Verrou de **confort**, pas une sécurité serveur : tout visiteur technique peut lire les assets. Évolution : Netlify Identity / backend / Decap CMS |

**Changer le code** : `printf 'NOUVEAU_CODE' | sha256sum` (ou générateur en ligne) → remplacer la valeur de `ACCESS_SHA256` en tête du `<script>` de `hub.html` → commit + push.

---

## 2. Plan de navigation (10 sections)

| # | Section | Rôle | Source de vérité |
|---|---|---|---|
| 1 | **Vue d'ensemble** | 5 cartes réelles (projets, publiés, prêts, médias, pages), bloc **À traiter** (projets incomplets avec manques listés), activité récente (journal réel), dernier contrôle réel, notifications | `hub-data.json` + journal local |
| 2 | **Projets** | Grille/liste avec miniatures, recherche, filtres statut/catégorie, 5 statuts (Brouillon / À compléter / Prêt à publier / Publié / Archivé), création/édition/archivage | `projects[]` |
| 3 | **Contenus** | Accroche + intro, services (CRUD), récap pages avec état SEO | `pitch`, `services[]`, `pages[]` |
| 4 | **Médiathèque** | Grille de miniatures réelles, poids, usage, édition du **texte alternatif**, recherche | `media[]` + `hub2_alts` |
| 5 | **Compétences & outils** | CRUD listes textuelles (aucune note/%, conforme profil) | `skills[]`, `tools[]` |
| 6 | **SEO & partage** | Édition title/description/OG/canonical **par page**, compteurs de caractères AA, **prévisualisation Google + carte sociale réelle**, relecture live de la page en ligne | `hub2_seo` |
| 7 | **Surveillance** | Contrôles **réels** (fetch : HTTP, temps ms, état accessible/redirection/erreur/injoignable), horodatés, journal local (50/URL), notifications d'échec | `hub2_watchhist` |
| 8 | **Publication** | Workflow export→commit documenté, checklist à progression **réelle**, état (prêts, alts manquants, non exporté), export `hub-data.json` complet | `hub2_checklist` |
| 9 | **Historique & sauvegardes** | Journal (400 événements), **sauvegardes instantanées** (12 max, téléchargeables), **restauration guidée** (sauvegarde préalable proposée, jamais d'écrasement silencieux), import de fichier | `hub2_journal`, `hub2_snaps` |
| 10 | **Paramètres** | Accès, session, données locales (taille mesurée, réinitialisation confirmée), architecture réelle, liens | — |

Aucune page n'est vide : tout élément non disponible techniquement (édition WYSIWYG, base serveur, surveillance continue) est **signalé « à connecter »** avec la solution cible.

---

## 3. Design system (contrôlé WCAG 2.2 AA)

| Token | Valeur | Usage | Contraste |
|---|---|---|---|
| `--bg` | `#F7F8FA` | fond | — |
| `--surface` | `#FFFFFF` | cartes, sidebar | — |
| `--ink` | `#17191C` | texte principal | **16,5–17,6 : 1** ✓ |
| `--sub` | `#646C76` | texte secondaire | **5,0–5,3 : 1** ✓ *(cahier : `#747B85` = 4,02–4,27 → échoue AA ; ajusté et justifié ici)* |
| `--line` | `#E8EAED` | bordures | (décoratif) |
| `--accent` | `#1C2E1F` | boutons primaires (texte blanc) | **14,4 : 1** ✓ |
| succès | `#16A36A` → badges `#0E6B45`/`#E8F5EE` | états | 5,84 : 1 ✓ |
| avertissement | `#A97600` (pastille) → badges `#7A5800`/`#FBF3DD` | états | 3,44 : 1 graphique ✓ / 5,88 : 1 texte ✓ *(cahier : `#E5A000` = 2,24 sur blanc → jamais en texte)* |
| erreur | `#DC4545` → badges `#9B2C2C`/`#FBEAEA` | états | 6,47 : 1 ✓ |

Typographie **Inter**, logo/titres éventuels Josefin Sans (clin d'œil marque). Grille 4/8 px, coins 8 px, ombres discrètes, **aucun glassmorphism**. Icônes : **Material Symbols (Google Fonts Icons)** — 26 SVG inline officiels (`viewBox="0 -960 960 960"`, héritage `currentColor`), aucune police externe à charger : rendu garanti hors-ligne et dans tout aperçu sandboxé.
Accessibilité : `:focus-visible` visible partout, `prefers-reduced-motion` respecté, info jamais portée par la couleur seule (points + libellés), contrastes AA vérifiés au calcul (valeurs ci-dessus), navigation clavier (Escape ferme les modales, ordre de tabulation naturel).

---

## 4. Données & persistance

| Clé | Contenu |
|---|---|
| `hub2_data` | Copie locale de hub-data.json (créée à la 1re modification) |
| `hub2_journal` / `hub2_watchhist` / `hub2_alerts` | Journal / mesures surveillance / notifications |
| `hub2_checklist` / `hub2_seo` / `hub2_alts` / `hub2_snaps` / `hub2_viewmode` | Checklist, SEO par page, textes alt, sauvegardes, mode d'affichage |

**Workflow de publication** (réel, journalisé) : modifier dans le hub → *Publication → Exporter* → remplacer `hub-data.json` dans le dépôt → adapter les pages concernées → `git commit && git push` → GitHub Pages redéploie → Surveillance pour contrôler.

## 5. Sauvegarde & restauration

- Sauvegarde instantanée : *Historique → Créer une sauvegarde* (max 12, horodatées, téléchargeables en JSON).
- Restauration : confirmation explicite + **sauvegarde automatique de l'état actuel** proposée (cochée par défaut) + événement journalisé.
- Import : fichier `hub-data.json` externe, structure validée (`projects[]` requis) avant application.
- **Rollback complet du site** : `git revert <commit> && git push` (historique GitHub intact).

## 6. Fonctions testées vs à connecter

**Testées (51/51 automatisés + syntaxe `node --check` + service HTTP 200)** : empreinte SHA-256 du code actuel, 5 statuts + migration `review→incomplete`, export v3 (meta/seo/checklist), les 10 vues et leurs rendus, session 12 h, afficher/masquer, zéro code en clair, zéro stat fictive.
**À connecter (hors périmètre site statique, documenté)** : comptes serveur/SSO, édition WYSIWYG répercutée dans le HTML sans commit, surveillance continue (cron externe), base de données.

## 7. Maintenance

- Dépendances : aucune (HTML/CSS/JS vanilla, Google Fonts en survitesse).
- Ne jamais écrire de secret dans `hub.html` (empreinte uniquement).
- Si le hub régresse : restaurer la dernière sauvegarde, sinon `git revert`.
