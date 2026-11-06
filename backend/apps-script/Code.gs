/**
 * Vasilías Studio — devis personnalisés (Google Apps Script).
 * Le déploiement est volontairement manuel : le script doit être autorisé
 * par le propriétaire du compte Google qui recevra les demandes.
 */
var DEFAULT_ADMIN_EMAIL = 'ericotlauranto34@gmail.com';
var SHEET_TITLE = 'Demandes de devis — Vasilías Studio';
var ROOT_FOLDER_TITLE = 'Demandes de devis — pièces jointes privées';
var SHEET_TAB = 'Demandes';
var MAX_FILES = 5;
var MAX_FILE_BYTES = 3 * 1024 * 1024;
var MAX_TOTAL_BYTES = 8 * 1024 * 1024;
var RATE_LIMIT_SECONDS = 60;
var STATUSES = ['Nouvelle demande', 'En cours d’analyse', 'Devis envoyé', 'En attente de réponse', 'Projet accepté', 'Projet refusé'];
var HEADERS = ['Identifiant', 'Reçue le', 'Statut', 'Notes internes', 'Nom', 'E-mail', 'WhatsApp', 'Entreprise / marque', 'Site / réseau', 'Catégories', 'Prestations sélectionnées', 'Autre projet', 'Livrables souhaités', 'Budget estimé', 'Délai souhaité', 'Date souhaitée', 'Description du projet', 'Objectifs', 'Public cible', 'Style graphique', 'Dossier privé (lien)', 'ID du dossier privé', 'Fichiers', 'État des notifications'];
var CATEGORIES = { identity: 'Identité visuelle', graphic: 'Design graphique', packaging: 'Packaging', social: 'Réseaux sociaux', other: 'Autres prestations' };
var OPTIONS = {
  identity: ['Logo principal', 'Déclinaisons du logo', 'Icône de marque', 'Palette de couleurs', 'Sélection typographique', 'Brandboard', 'Mini-charte graphique', 'Charte graphique complète'],
  graphic: ['Affiche publicitaire', 'Flyer', 'Brochure', 'Carte de visite', 'Catalogue', 'Supports imprimés'],
  packaging: ['Design de boîte', 'Design d’étiquette', 'Design de bouteille ou contenant', 'Déclinaisons de packaging', 'Mockups de présentation'],
  social: ['Templates de publications', 'Templates de stories', 'Couverture Facebook', 'Couverture et bannière', 'Visuels publicitaires', 'Templates promotionnels', 'Identité visuelle pour les réseaux sociaux'],
  other: ['Direction artistique', 'Présentation professionnelle', 'Supports de communication spécifiques', 'Projet graphique complexe ou multidisciplinaire', 'Autre prestation']
};
var BUDGETS = ['Moins de 200 000 Ar', '200 000 à 450 000 Ar', '450 000 à 800 000 Ar', '800 000 à 1 500 000 Ar', 'Plus de 1 500 000 Ar', 'Je souhaite recevoir une recommandation'];
var DEADLINES = ['Dès que possible', 'Dans une semaine', 'Dans deux semaines', 'Dans un mois', 'Date flexible'];
var STYLES = ['Minimaliste', 'Moderne', 'Élégant', 'Premium / Luxe', 'Créatif', 'Audacieux', 'Corporate', 'Autre'];

function setup() {
  var props = PropertiesService.getScriptProperties();
  var folderId = props.getProperty('QUOTE_ROOT_FOLDER_ID');
  var rootFolder = folderId ? DriveApp.getFolderById(folderId) : DriveApp.createFolder(ROOT_FOLDER_TITLE);
  if (!folderId) props.setProperty('QUOTE_ROOT_FOLDER_ID', rootFolder.getId());

  var spreadsheetId = props.getProperty('QUOTE_SPREADSHEET_ID');
  var spreadsheet = spreadsheetId ? SpreadsheetApp.openById(spreadsheetId) : SpreadsheetApp.create(SHEET_TITLE);
  if (!spreadsheetId) props.setProperty('QUOTE_SPREADSHEET_ID', spreadsheet.getId());
  var sheet = spreadsheet.getSheetByName(SHEET_TAB) || spreadsheet.insertSheet(SHEET_TAB);
  if (sheet.getLastRow() === 0) sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, HEADERS.length).setBackground('#161513').setFontColor('#FFFFFF').setFontWeight('bold').setWrap(true);
  sheet.setRowHeight(1, 42);
  sheet.setColumnWidth(1, 210); sheet.setColumnWidth(2, 155); sheet.setColumnWidth(3, 190); sheet.setColumnWidth(4, 260);
  sheet.setColumnWidth(5, 180); sheet.setColumnWidth(6, 230); sheet.setColumnWidth(7, 170); sheet.setColumnWidth(8, 200);
  sheet.setColumnWidth(21, 300); sheet.setColumnWidth(23, 260); sheet.setColumnWidth(24, 190);
  if (!sheet.getFilter()) sheet.getRange(1, 1, Math.max(sheet.getMaxRows(), 2), HEADERS.length).createFilter();
  var statusRule = SpreadsheetApp.newDataValidation().requireValueInList(STATUSES, true).setAllowInvalid(false).build();
  sheet.getRange(2, 3, Math.max(sheet.getMaxRows() - 1, 1), 1).setDataValidation(statusRule);
  sheet.getRange(2, 2, Math.max(sheet.getMaxRows() - 1, 1), 1).setNumberFormat('yyyy-mm-dd hh:mm');
  if (!props.getProperty('ADMIN_EMAIL')) props.setProperty('ADMIN_EMAIL', DEFAULT_ADMIN_EMAIL);
  if (!props.getProperty('PRIVACY_POLICY_APPROVED')) props.setProperty('PRIVACY_POLICY_APPROVED', 'false');
  Logger.log('Feuille privée : ' + spreadsheet.getUrl());
  Logger.log('Dossier privé : ' + rootFolder.getUrl());
  Logger.log('Notifications : ' + props.getProperty('ADMIN_EMAIL'));
  Logger.log('Le formulaire reste fermé jusqu’à validation de la notice et configuration du client.');
  return { spreadsheetUrl: spreadsheet.getUrl(), folderUrl: rootFolder.getUrl() };
}

function doGet() {
  return HtmlService.createHtmlOutput('<!doctype html><html lang="fr"><meta charset="utf-8"><title>Vasilías Studio</title><body style="font:16px sans-serif;padding:2rem"><h1>Service de devis Vasilías Studio</h1><p>Ce point d’accès reçoit les formulaires de devis. Il n’affiche aucune demande.</p></body></html>');
}

function doPost(e) {
  var requestId = '';
  try {
    if (!e || !e.parameter || !e.parameter.payload) throw new Error('Données de formulaire absentes.');
    if (e.parameter.payload.length > 15000000) throw new Error('La demande dépasse la taille maximale autorisée.');
    var payload = JSON.parse(e.parameter.payload);
    requestId = String(payload.requestId || '');
    if (PropertiesService.getScriptProperties().getProperty('PRIVACY_POLICY_APPROVED') !== 'true') throw new Error('Le formulaire est temporairement indisponible : la notice de confidentialité doit être validée.');
    var parsed = validatePayload_(payload);
    var props = PropertiesService.getScriptProperties();
    var sheetId = props.getProperty('QUOTE_SPREADSHEET_ID');
    var rootId = props.getProperty('QUOTE_ROOT_FOLDER_ID');
    if (!sheetId || !rootId) throw new Error('Le service n’a pas terminé son installation. Contactez Vasilías Studio.');
    var sheet = SpreadsheetApp.openById(sheetId).getSheetByName(SHEET_TAB);
    if (!sheet) throw new Error('La feuille de réception est introuvable.');

    var lock = LockService.getScriptLock();
    if (!lock.tryLock(10000)) throw new Error('Le service est occupé. Réessayez dans quelques instants.');
    var rowNumber, folderId, notificationState, isNew = false;
    try {
      rowNumber = findRequestRow_(sheet, requestId);
      if (rowNumber) {
        var existing = sheet.getRange(rowNumber, 1, 1, HEADERS.length).getValues()[0];
        notificationState = String(existing[23] || '');
        if (notificationState.indexOf('admin=sent') !== -1 && notificationState.indexOf('client=sent') !== -1) {
          lock.releaseLock();
          return reply_(requestId, true, 'Votre demande a déjà été reçue.');
        }
        lock.releaseLock();
        return reply_(requestId, false, 'Cette demande est déjà enregistrée. Si vous n’avez pas reçu de confirmation, contactez Vasilías Studio à ' + (PropertiesService.getScriptProperties().getProperty('ADMIN_EMAIL') || DEFAULT_ADMIN_EMAIL) + '.');
      } else {
        var rateKey = 'quote-rate-' + digest_(parsed.client.email.toLowerCase());
        var cache = CacheService.getScriptCache();
        if (cache.get(rateKey)) throw new Error('Une demande vient déjà d’être envoyée avec cette adresse. Attendez une minute avant de réessayer.');
        var root = DriveApp.getFolderById(rootId);
        var folderName = requestId + ' — ' + safeFilePart_(parsed.client.company || parsed.client.name);
        var requestFolder = root.createFolder(folderName);
        folderId = requestFolder.getId();
        parsed.attachments.forEach(function (file) { requestFolder.createFile(file.blob); });
        var row = makeRow_(parsed, requestFolder);
        sheet.appendRow(row);
        rowNumber = sheet.getLastRow();
        notificationState = 'admin=pending;client=pending';
        sheet.getRange(rowNumber, 24).setValue(notificationState);
        cache.put(rateKey, '1', RATE_LIMIT_SECONDS);
        isNew = true;
      }
    } finally {
      if (lock.hasLock()) lock.releaseLock();
    }

    var existingFolder = DriveApp.getFolderById(folderId);
    var storedAttachments = isNew ? parsed.attachments : readStoredAttachments_(existingFolder);
    var adminAlready = notificationState.indexOf('admin=sent') !== -1;
    var clientAlready = notificationState.indexOf('client=sent') !== -1;
    var sendResult = sendNotifications_(parsed, existingFolder, storedAttachments, !adminAlready, !clientAlready);
    var state = 'admin=' + (sendResult.adminSent || adminAlready ? 'sent' : 'pending') + ';client=' + (sendResult.clientSent || clientAlready ? 'sent' : 'pending');
    sheet.getRange(rowNumber, 24).setValue(state + (sendResult.errors.length ? ';error=' + sendResult.errors.join(' | ') : ''));
    if (sendResult.adminSent || adminAlready) {
      var note = (sendResult.clientSent || clientAlready) ? 'Votre demande est reçue.' : 'Votre demande est enregistrée et transmise au studio, mais l’e-mail de confirmation n’a pas pu être envoyé.';
      return reply_(requestId, true, note);
    }
    return reply_(requestId, false, 'Votre demande a été enregistrée, mais la notification au studio a échoué. Elle est conservée; réessayez ou écrivez à ' + (props.getProperty('ADMIN_EMAIL') || DEFAULT_ADMIN_EMAIL) + '.');
  } catch (err) {
    return reply_(requestId, false, safeText_(err && err.message ? err.message : 'Une erreur inattendue est survenue.', 500));
  }
}

function validatePayload_(p) {
  if (!p || typeof p !== 'object') throw new Error('Demande invalide.');
  var id = String(p.requestId || '');
  if (!/^[A-Za-z0-9-]{10,80}$/.test(id)) throw new Error('Identifiant de demande invalide. Rechargez le formulaire.');
  if (String(p.honeypot || '').trim()) throw new Error('La demande n’a pas pu être validée.');
  var started = Number(p.startedAt || 0);
  if (!started || Date.now() - started < 2500 || Date.now() - started > 43200000) throw new Error('Le formulaire a expiré ou a été envoyé trop rapidement. Réouvrez-le et réessayez.');
  if (p.privacyAccepted !== true) throw new Error('Le consentement au traitement de la demande est requis.');
  var client = p.client || {};
  var name = safeText_(client.name, 120), email = safeText_(client.email, 254).toLowerCase();
  var phone = safeText_(client.whatsapp, 24), company = safeText_(client.company, 120), website = safeText_(client.website, 500);
  if (!name || !company) throw new Error('Le nom et le nom de l’entreprise sont obligatoires.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('L’adresse e-mail n’est pas valide.');
  if (!/^\+?[0-9() .-]{7,24}$/.test(phone) || phone.replace(/\D/g, '').length < 7) throw new Error('Le numéro WhatsApp n’est pas valide.');
  if (website && !/^https?:\/\//i.test(website)) throw new Error('Le site ou profil doit commencer par http:// ou https://.');

  var categories = uniqueStrings_(p.categories, 5);
  if (!categories.length || categories.some(function (c) { return !CATEGORIES[c]; })) throw new Error('Choisissez au moins une catégorie valide.');
  var otherProject = safeText_(p.otherProject, 1000);
  if (categories.indexOf('other') !== -1 && !otherProject) throw new Error('Précisez la catégorie « Autres prestations ».');
  var deliverables = uniqueStrings_(p.deliverables, 60);
  deliverables.forEach(function (item) {
    var sep = item.indexOf('::'), cat = item.slice(0, sep), label = item.slice(sep + 2);
    if (sep < 1 || categories.indexOf(cat) === -1 || !OPTIONS[cat] || OPTIONS[cat].indexOf(label) === -1) throw new Error('Une prestation sélectionnée n’est pas reconnue.');
  });
  var styles = uniqueStrings_(p.styles, STYLES.length);
  if (styles.some(function (s) { return STYLES.indexOf(s) === -1; })) throw new Error('Une préférence de style n’est pas reconnue.');
  var budget = safeText_(p.budget, 80), deadline = safeText_(p.deadline, 80);
  if (BUDGETS.indexOf(budget) === -1) throw new Error('Choisissez un budget parmi les options proposées.');
  if (DEADLINES.indexOf(deadline) === -1) throw new Error('Choisissez un délai parmi les options proposées.');
  var targetDate = safeText_(p.targetDate, 20);
  if (targetDate && !/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) throw new Error('La date souhaitée n’est pas valide.');
  var projectDescription = safeText_(p.projectDescription, 3000);
  if (!projectDescription) throw new Error('La description du projet est obligatoire.');
  var files = validateAttachments_(p.attachments || []);
  return {
    requestId: id, client: { name: name, email: email, whatsapp: phone, company: company, website: website },
    categories: categories, otherProject: otherProject, deliverables: deliverables,
    deliverablesDescription: safeText_(p.deliverablesDescription, 2500), budget: budget, deadline: deadline,
    targetDate: targetDate, projectDescription: projectDescription, objectives: safeText_(p.objectives, 1500),
    audience: safeText_(p.audience, 1000), styles: styles, attachments: files
  };
}

function validateAttachments_(items) {
  if (!Array.isArray(items) || items.length > MAX_FILES) throw new Error('Le nombre de fichiers joints dépasse la limite autorisée.');
  var total = 0;
  var allowed = {
    jpg: ['image/jpeg'], jpeg: ['image/jpeg'], png: ['image/png'], webp: ['image/webp'],
    pdf: ['application/pdf'], ppt: ['application/vnd.ms-powerpoint'],
    pptx: ['application/vnd.openxmlformats-officedocument.presentationml.presentation']
  };
  return items.map(function (item) {
    var original = String(item && item.name || '');
    var ext = (original.split('.').pop() || '').toLowerCase();
    if (!allowed[ext]) throw new Error('Type de fichier refusé : ' + safeText_(original, 100));
    var mime = allowed[ext][0];
    if (item.type && item.type !== mime) throw new Error('Le type MIME ne correspond pas au fichier ' + safeText_(original, 100) + '.');
    var encoded = String(item.data || '');
    if (!encoded || encoded.length > MAX_FILE_BYTES * 1.5) throw new Error('Un fichier est vide ou trop volumineux.');
    var bytes;
    try { bytes = Utilities.base64Decode(encoded); } catch (e) { throw new Error('Un fichier joint est illisible.'); }
    if (!bytes.length || bytes.length > MAX_FILE_BYTES || Number(item.size) !== bytes.length) throw new Error('Un fichier dépasse la limite de 3 Mo ou sa taille est incorrecte.');
    total += bytes.length;
    if (total > MAX_TOTAL_BYTES) throw new Error('Les fichiers joints dépassent la limite totale de 8 Mo.');
    if (!matchesFileSignature_(ext, bytes)) throw new Error('Le contenu du fichier ' + safeText_(original, 100) + ' ne correspond pas à son extension.');
    var name = safeFilePart_(original);
    return { name: name, type: mime, size: bytes.length, blob: Utilities.newBlob(bytes, mime, name) };
  });
}

function matchesFileSignature_(ext, bytes) {
  function b(i) { return bytes[i] & 255; }
  if (ext === 'jpg' || ext === 'jpeg') return bytes.length > 3 && b(0) === 255 && b(1) === 216 && b(2) === 255;
  if (ext === 'png') return bytes.length > 8 && b(0) === 137 && b(1) === 80 && b(2) === 78 && b(3) === 71 && b(4) === 13 && b(5) === 10 && b(6) === 26 && b(7) === 10;
  if (ext === 'webp') return bytes.length > 12 && b(0) === 82 && b(1) === 73 && b(2) === 70 && b(3) === 70 && b(8) === 87 && b(9) === 69 && b(10) === 66 && b(11) === 80;
  if (ext === 'pdf') return bytes.length > 5 && String.fromCharCode(b(0), b(1), b(2), b(3), b(4)) === '%PDF-';
  if (ext === 'ppt') return bytes.length > 8 && b(0) === 208 && b(1) === 207 && b(2) === 17 && b(3) === 224;
  if (ext === 'pptx') return bytes.length > 4 && b(0) === 80 && b(1) === 75 && b(2) === 3 && b(3) === 4;
  return false;
}

function makeRow_(p, folder) {
  var fileNames = p.attachments.map(function (f) { return f.name + ' (' + Math.round(f.size / 1024) + ' Ko)'; }).join('\n');
  return [p.requestId, new Date(), 'Nouvelle demande', '', p.client.name, p.client.email, p.client.whatsapp, p.client.company, p.client.website,
    p.categories.map(function (c) { return CATEGORIES[c]; }).join(', '), p.deliverables.map(function (d) { return d.split('::').slice(1).join('::'); }).join(', '),
    p.otherProject, p.deliverablesDescription, p.budget, p.deadline, p.targetDate, p.projectDescription, p.objectives, p.audience, p.styles.join(', '),
    folder.getUrl(), folder.getId(), fileNames, 'admin=pending;client=pending'].map(safeCell_);
}

function findRequestRow_(sheet, id) {
  if (sheet.getLastRow() < 2) return 0;
  var result = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).createTextFinder(id).matchEntireCell(true).findNext();
  return result ? result.getRow() : 0;
}

/**
 * Suppression administrateur récupérable via la corbeille Drive.
 * À appeler uniquement depuis l’éditeur Apps Script après confirmation explicite :
 * deleteRequestAndFiles('ID_DE_LA_DEMANDE', 'SUPPRIMER ID_DE_LA_DEMANDE')
 */
function deleteRequestAndFiles(requestId, confirmation) {
  var id = safeText_(requestId, 80);
  if (!id || confirmation !== 'SUPPRIMER ' + id) throw new Error('Confirmation requise : SUPPRIMER ' + id);
  var props = PropertiesService.getScriptProperties();
  var sheet = SpreadsheetApp.openById(props.getProperty('QUOTE_SPREADSHEET_ID')).getSheetByName(SHEET_TAB);
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('Le service est occupé.');
  try {
    var row = findRequestRow_(sheet, id);
    if (!row) throw new Error('Demande introuvable.');
    var folderId = String(sheet.getRange(row, 22).getValue() || '');
    var rootId = props.getProperty('QUOTE_ROOT_FOLDER_ID');
    if (folderId && folderId !== rootId) DriveApp.getFolderById(folderId).setTrashed(true);
    sheet.deleteRow(row);
    return 'Demande supprimée et dossier joint déplacé dans la corbeille Drive.';
  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }
}

function sendNotifications_(p, folder, attachments, needAdmin, needClient) {
  var props = PropertiesService.getScriptProperties();
  var admin = props.getProperty('ADMIN_EMAIL') || DEFAULT_ADMIN_EMAIL;
  var subject = 'Nouvelle demande de devis — Vasilías Studio';
  var parts = [
    ['Identifiant', p.requestId], ['Nom', p.client.name], ['E-mail', p.client.email], ['WhatsApp', p.client.whatsapp],
    ['Entreprise / marque', p.client.company], ['Site / réseau', p.client.website],
    ['Catégories', p.categories.map(function (c) { return CATEGORIES[c]; }).join(', ')],
    ['Prestations', p.deliverables.map(function (d) { return d.split('::').slice(1).join('::'); }).join(', ')],
    ['Autre projet', p.otherProject], ['Livrables souhaités', p.deliverablesDescription], ['Budget estimé', p.budget],
    ['Délai souhaité', p.deadline], ['Date souhaitée', p.targetDate], ['Description', p.projectDescription],
    ['Objectifs', p.objectives], ['Public cible', p.audience], ['Style graphique', p.styles.join(', ')],
    ['Fichiers', p.attachments.map(function (f) { return f.name; }).join(', ') || 'Aucun']
  ];
  var plain = parts.map(function (pair) { return pair[0] + ': ' + (pair[1] || '—'); }).join('\n\n');
  var html = '<h2>Nouvelle demande de devis</h2><table cellpadding="6" cellspacing="0" border="0">' + parts.map(function (pair) { return '<tr><th align="left" valign="top">' + htmlEscape_(pair[0]) + '</th><td>' + htmlEscape_(pair[1] || '—').replace(/\n/g, '<br>') + '</td></tr>'; }).join('') + '</table><p><a href="' + htmlEscape_(folder.getUrl()) + '">Ouvrir le dossier privé des références (accès Google requis)</a></p>';
  var adminSent = false, clientSent = false, errors = [];
  if (needAdmin) {
    try { MailApp.sendEmail({ to: admin, subject: subject, body: plain + '\n\nDossier privé : ' + folder.getUrl(), htmlBody: html, attachments: attachments.map(function (f) { return f.copyBlob(); }) }); adminSent = true; }
    catch (err) { errors.push('notification administrateur : ' + safeText_(err.message, 250)); }
  }
  if (needClient) {
    try {
      MailApp.sendEmail({ to: p.client.email, subject: 'Confirmation de votre demande — Vasilías Studio', body: 'Bonjour ' + p.client.name + ',\n\nMerci de faire confiance à Vasilías Studio. Votre demande a bien été transmise. Nous allons l’examiner afin de vous proposer une solution adaptée à vos besoins.\n\nCet e-mail confirme la réception de votre demande; il ne constitue pas un devis ni une confirmation de commande.\n\nVasilías Studio' });
      clientSent = true;
    } catch (err) { errors.push('confirmation client : ' + safeText_(err.message, 250)); }
  }
  return { adminSent: adminSent, clientSent: clientSent, errors: errors };
}

function readStoredAttachments_(folder) {
  var result = [], iterator = folder.getFiles();
  while (iterator.hasNext()) {
    var file = iterator.next();
    result.push({ name: file.getName(), blob: file.getBlob() });
  }
  return result;
}

function safeText_(value, max) {
  var text = String(value == null ? '' : value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ').trim();
  return text.slice(0, max || 3000);
}
function safeCell_(value) {
  var text = value instanceof Date ? value : String(value == null ? '' : value);
  if (typeof text === 'string' && /^[=+@\-]/.test(text)) return "'" + text;
  return text;
}
function safeFilePart_(name) {
  var text = safeText_(name, 160).replace(/[\\/:*?"<>|\s]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return text || 'reference';
}
function uniqueStrings_(value, limit) {
  if (!Array.isArray(value)) return [];
  var seen = {};
  return value.slice(0, limit).map(function (x) { return safeText_(x, 200); }).filter(function (x) { if (!x || seen[x]) return false; seen[x] = true; return true; });
}
function htmlEscape_(value) {
  return String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function digest_(text) {
  return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text)).replace(/=+$/g, '');
}
function reply_(requestId, ok, message) {
  var data = JSON.stringify({ type: 'vasilias-quote-result', requestId: String(requestId || ''), ok: !!ok, message: String(message || '') }).replace(/</g, '\\u003c');
  var html = '<!doctype html><html lang="fr"><meta charset="utf-8"><title>Réponse devis</title><body><p>Retour au formulaire…</p><script>window.parent.postMessage(' + data + ', "*");</script></body></html>';
  return HtmlService.createHtmlOutput(html).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
