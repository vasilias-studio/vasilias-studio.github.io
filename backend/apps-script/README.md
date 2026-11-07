# Formulaires Google Apps Script — configuration active

## État

Les formulaires **Contact** et **Devis** utilisent l’application Web Google Apps Script configurée dans `js/forms-config.js`. Le Web App s’exécute sous le compte propriétaire du script et accepte les soumissions publiques anonymes. Son URL `/exec` est publique et ne doit pas être considérée comme un secret.

Le script envoie une notification à `ericotlauranto34@gmail.com`, inscrit les demandes dans les onglets `Contact` et `Devis` d’un Google Sheet privé, et place les pièces jointes de devis dans un dossier Drive privé. Les données ne sont pas écrites dans le Hub. La feuille, le dossier parent et le dossier de fichiers restent privés au compte propriétaire, sauf si ce compte partage ultérieurement ces ressources.

La durée configurée est de trois mois. Le déclencheur quotidien supprime les lignes anciennes du Sheet, déplace les fichiers du dossier de pièces jointes et les fils d’e-mails `[SITE-FORM]` vers la corbeille. Gmail/Drive peuvent conserver les éléments dans la corbeille jusqu’à 30 jours supplémentaires avant leur suppression définitive.

## Installation et stockage

1. Ouvrir le projet Apps Script avec le compte Google qui doit posséder les données.
2. Copier `Code.gs` depuis ce dossier dans le projet Apps Script.
3. Exécuter `setupStorage()` une fois et autoriser Google Sheets, Drive, Gmail, l’envoi d’e-mail et les déclencheurs. La fonction crée ou réutilise le dossier privé, son sous-dossier de pièces jointes, le classeur et le déclencheur de purge. Elle inscrit les identifiants dans les propriétés du projet, pas dans le code public.
4. Le classeur contient les onglets `Devis` et `Contact`. Les demandes ajoutées au fil du temps y sont stockées; les pièces jointes sont enregistrées dans le sous-dossier privé et restent également attachées à la notification par e-mail.
5. Déployer comme **Application Web**, exécution en tant que propriétaire, accès **Tout le monde**. Le consentement Gmail autorise le nettoyage des seuls fils dont l’objet contient `[SITE-FORM]`; l’autorisation Apps Script Gmail est techniquement plus large que cette requête.

## Mise à jour d’un script déjà déployé

1. Remplacer le contenu du fichier Apps Script `Code.gs` par cette version et enregistrer.
2. Exécuter `setupStorage()` de nouveau si les en-têtes ou les ressources doivent être initialisés; les propriétés existantes évitent de recréer le dossier, le classeur ou le déclencheur.
3. Dans **Déployer → Gérer les déploiements**, modifier le Web App existant, choisir **Nouvelle version** et déployer. Modifier le déploiement existant conserve normalement son URL `/exec`.
4. Garder le point de terminaison public dans `js/forms-config.js`; n’ajouter aucun mot de passe, jeton API ou clé privée au code client.

## Données et limites

- Le devis exige le consentement, conserve le résumé complet de la demande, et accepte jusqu’à cinq fichiers JPG/JPEG, PNG, WebP, PDF, PPT ou PPTX, de 3 Mo par fichier et 8 Mo au total.
- Les fichiers sont transportés du navigateur à Apps Script en Base64 puis recréés comme blobs en mémoire; aucune étape ne les rend publics. La taille réelle maximale doit être vérifiée lors d’un test navigateur sur le site.
- Les formulaires se soumettent dans une iframe invisible. Pendant l’attente, la page affiche un écran de chargement. Apps Script renvoie un statut minimal par `postMessage` vers la fenêtre supérieure (`*`, sans donnée de formulaire, accepté seulement si l’origine et le nonce correspondent), puis redirige aussi l’iframe vers `form-response.html`; cette page de même origine renvoie également le statut. Le site vérifie l’origine, le type de formulaire et le nonce. `XFrameOptionsMode.ALLOWALL` est appliqué uniquement à la page de statut Apps Script. Si aucun retour ne revient, un délai maximal affiche un avertissement sans ouvrir la page Apps Script.
- Les e-mails Devis et Contact sont envoyés en HTML lisible avec une version texte de secours. Le devis est décomposé en coordonnées, projet, budget/délais, univers visuel et pièces jointes (liens Drive privés), au lieu d’afficher le résumé JSON brut.
- Une limite de fréquence de cinq soumissions par heure et par adresse e-mail, plus un honeypot, est en place. Apps Script ne reçoit pas ici de limitation robuste par IP; en cas de spam persistant, ajouter une protection anti-robot validée côté serveur.
- Les soumissions de test peuvent créer une ligne, un e-mail et, pour le devis, un fichier Drive. Identifier clairement les tests et supprimer leurs traces après validation.
- Le code ne stocke pas de valeurs de formulaire dans les journaux. Ne jamais journaliser le corps d’une demande ni ses pièces jointes.

## Tests à effectuer après mise à jour

1. Vérifier en navigation privée que `/exec` ne redirige plus vers une connexion Google. Un GET peut afficher un message indiquant que `doGet` n’est pas défini; le formulaire utilise `doPost`.
2. Envoyer un test Contact avec consentement, puis contrôler la ligne `Contact` et l’e-mail de notification.
3. Envoyer un test Devis avec un petit fichier, puis contrôler la ligne `Devis`, la présence du fichier dans Drive et l’e-mail avec pièce jointe.
4. Après mise à jour du site, tester les deux formulaires depuis le navigateur, puis tester les limites de fichiers jusqu’à la taille maximale affichée.
5. Confirmer dans Drive que le dossier, le classeur et les pièces jointes ne sont pas partagés publiquement.

## Devis automatiques

Chaque demande de devis du site crée automatiquement un devis en brouillon (numéro `DEV-AAAA-NNN`) dans la feuille privée **Devis générés**. Le devis apparaît dans l’onglet **Devis** du Hub.

**Mise en place (une seule fois)**
1. Dans l’éditeur Apps Script, ajoutez un fichier `Quotes.gs` (contenu de ce dossier) et remplacez `Code.gs`.
2. Exécutez `setupQuotes()` : crée les feuilles « Devis générés » et « Tarifs » (préremplie avec les 31 prestations du formulaire).
3. Exécutez `setupAdminKey()` et copiez la clé affichée dans le journal d’exécution.
4. Déployez une **nouvelle version** du Web App (l’URL `/exec` ne change pas).
5. Dans le Hub : Paramètres → Devis, collez la clé et cliquez sur « Enregistrer la clé et tester ».

**Les prix** se saisissent dans la feuille **Tarifs** (colonne « Prix unitaire (Ar) »). Une prestation sans prix reste « à chiffrer » : aucun montant n’est inventé. Les devis déjà créés ne sont pas recalculés quand vous modifiez les tarifs.

**Statuts** : À chiffrer → Brouillon (automatique quand toutes les lignes ont un prix) → Envoyé → Accepté / Refusé / Expiré.

**Sécurité**
- Les devis ne quittent jamais votre Google Sheet : le Hub les lit via l’API protégée par la clé (`VAS_ADMIN_KEY`, propriété de script). Aucune donnée client n’est écrite dans le dépôt public.
- 8 essais avec une mauvaise clé verrouillent l’API pendant 15 minutes (protège contre la force brute, mais quelqu’un pourrait aussi vous verrouiller brièvement).
- Pour changer la clé : relancez `setupAdminKey()` (l’ancienne devient invalide) et collez la nouvelle dans le Hub.
- Modifiez les devis **dans le Hub**, pas dans la feuille : la colonne « Données (JSON) » fait foi.
- Deux appareils qui modifient le même devis ne s’écrasent pas : le Hub signale le conflit.

**Rétention** : comme les demandes, les devis sont supprimés après `FORM_CONFIG.retentionMonths` mois (promesse de la page confidentialité). Pour garder certains statuts plus longtemps, ajoutez-les à `QUOTE_CONFIG.keepStatuses` dans `Quotes.gs` **et** adaptez la page confidentialité. Enregistrez en PDF les devis que vous devez conserver.

