# Option de secours — Apps Script (non utilisée pour le formulaire actuel)

## État actuel

Le parcours de devis est en cours de migration vers FormSubmit, comme le formulaire Contact. Le flux prévu est une transmission par e-mail à `ericotlauranto34@gmail.com`; les demandes ne sont pas enregistrées dans le Hub, Sheets ou Drive. La configuration publique du devis et la notice restent désactivées/en attente de validation. L’adresse FormSubmit doit également être confirmée à la première utilisation. Aucun envoi réel n’a été testé.

Les sections ci-dessous décrivent une ancienne option Apps Script + Sheets/Drive préparée auparavant. Ne pas suivre ces étapes pour activer le flux FormSubmit. Ne reprendre Apps Script que si Vasilías Studio choisit ultérieurement de revenir à l’enregistrement privé dans le Hub.

## État de l’option Apps Script

Le code de stockage Sheets/Drive est conservé comme option de secours. Il n’est pas utilisé par le formulaire actuel.

Le dépôt GitHub Pages est statique. Le script Apps Script doit être créé et autorisé depuis le compte Google de Vasilías Studio; le connecteur Drive ne peut pas accorder ces autorisations ni publier le Web App.

## Mise en place

1. Ouvrir [script.google.com](https://script.google.com/) avec le compte Google qui doit posséder les demandes, puis créer un projet Apps Script autonome.
2. Remplacer le contenu de `Code.gs` par `backend/apps-script/Code.gs`.
3. Dans **Paramètres du projet**, activer l’affichage du fichier manifeste et remplacer son contenu par `backend/apps-script/appsscript.json`.
4. Dans l’éditeur, exécuter `setup()` et approuver les autorisations Google Sheets, Drive et e-mail. Le script crée une feuille et un dossier privés, puis affiche leurs URL dans le journal d’exécution. L’adresse de notification initiale est `ericotlauranto34@gmail.com`; la propriété de script `ADMIN_EMAIL` permet de la remplacer.
5. Contrôler les propriétés de script `QUOTE_SPREADSHEET_ID`, `QUOTE_ROOT_FOLDER_ID`, `ADMIN_EMAIL` et laisser `PRIVACY_POLICY_APPROVED` à `false` pour le moment.
6. Déployer comme **Application Web**, exécution en tant que propriétaire du déploiement, accès public anonyme afin que les clients puissent envoyer le formulaire. Si les règles du compte Google interdisent cet accès, ne pas tenter de contourner la politique de l’organisation : le déploiement doit rester en attente.
7. Copier l’URL `/exec` du déploiement et l’URL de la feuille privée dans `js/quote-config.js` :

   ```js
   window.VAS_QUOTE_CONFIG = Object.freeze({
     endpoint: 'https://script.google.com/macros/s/ID_DU_DEPLOIEMENT/exec',
     adminSheetUrl: 'https://docs.google.com/spreadsheets/d/ID_DE_LA_FEUILLE/edit',
     privacyApproved: false
   });
   ```

   Ces URL ne sont pas des secrets; **ne jamais placer de mot de passe, jeton API ou clé privée dans ce fichier public**. Le lien de la feuille peut être visible dans le code source, mais Drive continue d’en imposer les permissions.

## Notice de confidentialité et activation

`privacy.html` est volontairement marquée comme brouillon. La durée de conservation des demandes n’a pas été définie. Avant d’activer l’envoi :

1. valider l’identité du responsable et le texte de la notice;
2. choisir et publier la durée de conservation;
3. mettre à jour `privacy.html` et faire relire le texte;
4. seulement ensuite, passer `PRIVACY_POLICY_APPROVED` à `true` dans les propriétés Apps Script et `privacyApproved` à `true` dans `js/quote-config.js`;
5. redéployer l’application Web si le code serveur a changé, puis republier le site.

Le formulaire et le serveur vérifient chacun le consentement/état d’approbation; la configuration actuelle laisse le bouton final désactivé.

## Données et gestion des demandes

- La feuille privée comprend les coordonnées, les détails du projet, le budget, le délai, le statut, les notes internes et l’état des notifications. Les filtres Google Sheets servent à rechercher, filtrer et trier.
- Les statuts sont : Nouvelle demande, En cours d’analyse, Devis envoyé, En attente de réponse, Projet accepté et Projet refusé. Une liste déroulante est créée par `setup()`.
- Les fichiers vont dans un dossier Drive privé séparé par demande. Le classeur contient un lien nécessitant une connexion autorisée; le script ne rend pas ces fichiers publics.
- Le client reçoit un e-mail de confirmation; l’administrateur reçoit les détails et les pièces jointes. Les quotas et règles anti-spam de Google peuvent retarder ou bloquer les e-mails.
- Pour supprimer proprement une demande et son dossier, confirmer d’abord l’identifiant, puis appeler depuis l’éditeur Apps Script `deleteRequestAndFiles('ID', 'SUPPRIMER ID')`. Le dossier est déplacé dans la corbeille Drive et la ligne supprimée; ne partagez pas le classeur ou le dossier « avec toute personne disposant du lien ». Les statuts et notes ordinaires restent gérables directement dans la feuille.
- Dans le Hub, le lien de gestion apparaît dans **Paramètres → Demandes de devis** après renseignement de `adminSheetUrl`.

## Limites de sécurité à connaître

Le serveur revérifie les champs, les choix autorisés, les formats MIME/signatures, les tailles, les noms de fichiers, le consentement et l’identifiant idempotent. La zone anti-robot utilise un honeypot, un délai minimum et une limite de fréquence par adresse e-mail. Apps Script ne fournit pas ici de limitation par IP ni de CAPTCHA : ce n’est pas une protection contre une attaque volumétrique. Si le formulaire reçoit du spam, il faudra ajouter un CAPTCHA côté serveur ou déplacer l’API vers un service disposant d’une protection adaptée.

Les formats autorisés sont JPG/JPEG, PNG, WebP, PDF, PPT et PPTX; maximum 5 fichiers, 3 Mo par fichier et 8 Mo au total. Les fichiers sont contrôlés côté navigateur et serveur, puis restent privés dans Drive. La feuille et les e-mails contiennent des données personnelles : limitez l’accès au compte administrateur et définissez la durée de conservation.

## Tests à effectuer après déploiement

1. Laisser la politique non approuvée : vérifier que le bouton final demeure désactivé.
2. Après validation, envoyer une demande de test avec un fichier valide; vérifier la ligne Sheet, le dossier Drive, l’e-mail admin, l’e-mail client et l’écran de confirmation.
3. Tester les fichiers refusés, la taille maximale, le champ piège, les champs invalides et un second envoi avec le même identifiant.
4. Confirmer que le dossier Drive et la feuille ne sont pas accessibles à un compte Google non autorisé.
5. Parcourir les étapes sur 1440, 1280, 768, 390 et 360 px et vérifier les pièces jointes sur iOS et Android.

Les tests de réception réels ne peuvent pas être déclarés réussis avant les autorisations, le déploiement Apps Script et un envoi de bout en bout depuis le site publié.
