# Hub Vasilías Studio — Documentation technique
Version : 2.0 · Octobre 2026 · Déploiement : GitHub Pages

## 1. Vue d'ensemble
Le Hub est un centre d'administration **local-first** accessible à **https://vasilias-studio.github.io/hub.html**.
Il fonctionne sans backend : les données réelles du site vivent dans `hub-data.json` (dépôt), vos modifications
dans le navigateur (localStorage). Rien n'est simulé : ce qui est mesuré est réel, ce qui est impossible sans
serveur est explicitement signalé.

## 2. Accès
- Code d'accès (par défaut) : **2026**
- Le code n'est **jamais stocké**. Le hub compare l'empreinte **SHA-256** de votre saisie à une empreinte publique.
- Après 5 tentatives échouées : blocage de 60 secondes (persistant).
- La session expire à la fermeture de l'onglet (sessionStorage).

**⚠️ Transparence sécurité** : il s'agit d'un verrou de confort côté navigateur. Une personne qui ouvrirait le code
source pourrait contourner le verrou et lire les données (qui sont publiques : elles figurent déjà sur le site).
Le hub ne contient **aucun secret** — c'est ce qui rend ce niveau de protection acceptable.

## 3. Changer le code d'accès
```bash
# Terminal : calculer la nouvelle empreinte
echo -n "NOUVEAU_CODE" | sha256sum        # Linux/macOS
```
Copier le résultat dans `hub.html`, constante `ACCESS_SHA256`, puis commit + push.

## 4. Modules et ce qu'ils font réellement
| Module | Réel (✅) | Limite assumée |
|---|---|---|
| Tableau de bord | Statistiques calculées depuis hub-data.json ; alertes réelles | — |
| Projets | CRUD, duplication, archivage, validation, slug unique, règle « concept ≠ client » | La page publique n'est pas régénérée par le hub (voir §5) |
| Contenu des pages | Textes principaux, compétences, outils éditables | Application au site via export + commit |
| Bibliothèque média | Inventaire réel (28 fichiers), aperçu, alt, recherche d'usages par scan des pages | Pas d'upload : validation locale + dépôt manuel du fichier |
| SEO | Audit réel : title, meta description, H1, alt, liens cassés — mesurés | Pas de « score » inventé |
| Surveillance | Statut HTTP réel, temps, distinction panne réseau/HTTP/délai | Contrôle manuel ; la surveillance 24/7 exige un service externe (ex. UptimeRobot, gratuit) |
| Checklist | CRUD, progression, dates de validation | — |
| Historique | Journal local réel + commits GitHub réels (API publique) | Limite API anonyme : 60 req/h |
| Profils & liens | CRUD + validation d'URL | Test réseau en `no-cors` = indicatif |
| Paramètres | Export / import validé / réinitialisation | — |

## 5. Publier les modifications faites dans le Hub
1. **Paramètres → Télécharger hub-data.json**
2. Remplacer `hub-data.json` à la racine du dépôt.
3. Appliquer aux pages HTML les changements de contenu/statut correspondants
   (le hub ne réécrit pas les pages : GitHub Pages n'offre pas d'écriture côté client).
   → Astuce : envoyez l'export dans le chat, l'assistant applique et publie pour vous.
4. `git add -A && git commit -m "…" && git push` → GitHub Pages redéploie en ~1 min.

## 6. Sauvegarde et restauration
- **Sauvegarde** : Paramètres → Télécharger hub-data.json (données) ; Historique → Exporter le journal.
- **Restauration** : Paramètres → Importer → valider l'aperçu → confirmer.
- **Réinitialisation complète** : Paramètres → Zone de danger (efface uniquement ce navigateur).

## 7. Retour arrière (rollback) en cas de déploiement raté
```bash
git log --oneline                 # repérer le commit sain, ex. 7870019
git revert HEAD                   # ou : git reset --hard <sha> && git push --force (à éviter)
git push
```
Le site revient à l'état du commit précédent en ~1 minute.

## 8. Évolution vers une authentification et une publication réelles (option backend)
Quand le besoin le justifiera, la continuité recommandée, gratuite et simple :
1. **Decap CMS** (ex-Netlify CMS) : admin visuel qui committe dans le dépôt.
   - Prérequis : GitHub OAuth App (gratuit) + proxy OAuth léger (Cloudflare Workers gratuit).
   - Étapes détaillées : https://decapcms.org/docs/github-backend/
2. Ou **backend serverless** (Cloudflare Workers + GitHub App à permissions minimales
   `contents:read/write` ; secrets en variables d'environnement, jamais dans le code).
Ces options demandent ~30–60 min de configuration. Le Hub actuel reste compatible.

## 9. Maintenance
- Après ajout d'image au dépôt : régénérer la liste médias (l'assistant peut le faire) ou
  accepter que `hub-data.json` soit rafraîchi à la prochaine mise à jour.
- Après ajout d'une page : l'ajouter dans Surveillance et dans hub-data.json (pages).
- Vérifier trimestriellement : formulaire contact actif (envoi test), liens sociaux, Search Console.
