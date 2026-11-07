/*
 * Vasilías Studio — Google Apps Script form receiver.
 * Stores submissions in a private Google Sheet, quote attachments in a private
 * Drive folder, and sends notification emails. No data is written to the Hub.
 *
 * Run setupStorage() once from the Apps Script editor before deploying.
 * The website integration will send URL-encoded fields, with quote file data
 * encoded as base64 in gasFileNData fields.
 */

var FORM_CONFIG = {
  recipient: 'ericotlauranto34@gmail.com',
  parentFolderName: 'Vasilías Studio — Formulaires privés',
  attachmentsFolderName: 'Pièces jointes devis',
  spreadsheetName: 'Vasilías Studio — Demandes de formulaires',
  maxFiles: 5,
  maxFileBytes: 3 * 1024 * 1024,
  maxTotalFileBytes: 8 * 1024 * 1024,
  maxSubmissionsPerEmailPerHour: 5,
  retentionMonths: 3,
  allowedTypesByExtension: {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    pdf: 'application/pdf',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  }
};

var STORAGE_KEYS = {
  parentFolder: 'VAS_FORM_PARENT_FOLDER_ID',
  attachmentsFolder: 'VAS_FORM_ATTACHMENTS_FOLDER_ID',
  spreadsheet: 'VAS_FORM_SPREADSHEET_ID'
};

var QUOTE_HEADERS = [
  'ID demande', 'Date de réception', 'Nom et prénom', 'E-mail', 'WhatsApp',
  'Entreprise ou marque', 'Site / réseau social', 'Résumé détaillé',
  'Noms des fichiers', 'Liens privés Drive', 'Consentement'
];
var CONTACT_HEADERS = [
  'ID demande', 'Date de réception', 'Nom / entreprise', 'E-mail', 'Sujet', 'Message', 'Consentement'
];

/** Run once manually. Creates private storage in the account deploying this script. */
function setupStorage() {
  var props = PropertiesService.getScriptProperties();
  var parent = getOrCreateFolder_(props, STORAGE_KEYS.parentFolder, FORM_CONFIG.parentFolderName);
  var uploads = getOrCreateChildFolder_(props, STORAGE_KEYS.attachmentsFolder, parent, FORM_CONFIG.attachmentsFolderName);
  var spreadsheet = getOrCreateSpreadsheet_(props, parent);

  ensureSheet_(spreadsheet, 'Devis', QUOTE_HEADERS);
  ensureSheet_(spreadsheet, 'Contact', CONTACT_HEADERS);
  ensureQuoteSheets_(spreadsheet, true);
  installCleanupTrigger_();

  Logger.log('Stockage privé prêt. Sheet : ' + spreadsheet.getUrl());
  Logger.log('Dossier privé : ' + parent.getUrl());
  Logger.log('Pièces jointes : ' + uploads.getUrl());
}

function doPost(e) {
  var p = (e && e.parameter) || {};
  var type = field_(p, 'formType').toLowerCase();
  var clientNonce = field_(p, 'clientNonce').slice(0, 100);

  // Appels d'administration du Hub (devis) : protégés par une clé secrète, jamais par le formulaire public.
  if (field_(p, 'action').indexOf('quotes.') === 0) return handleQuoteAdmin_(p);

  // Honeypot: bots receive a generic success result, but no data is stored or emailed.
  if (field_(p, '_honey')) return responsePage_(true, type, clientNonce);

  try {
    if (type !== 'quote' && type !== 'contact') throw new Error('Invalid form type');
    requireStorage_();

    var senderEmail = field_(p, 'email').toLowerCase();
    if (!validEmail_(senderEmail)) throw new Error('Invalid email');
    if (!allowRate_(senderEmail)) throw new Error('Rate limit');

    if (type === 'quote') {
      sendQuote_(p, (e && e.parameters) || {}, senderEmail);
    } else {
      sendContact_(p, senderEmail);
    }

    return responsePage_(true, type, clientNonce);
  } catch (err) {
    // Do not log form contents or email addresses.
    console.error('Form processing failed: ' + String((err && err.message) || 'unknown error'));
    return responsePage_(false, type, clientNonce);
  }
}

function sendQuote_(p, all, senderEmail) {
  var name = field_(p, 'clientName');
  var company = field_(p, 'company');
  var phone = field_(p, 'whatsapp');
  var website = field_(p, 'website');
  var summary = field_(p, 'resume_detaille');
  var consent = field_(p, 'consentement');

  if (!name || !company || !phone || !summary || consent !== 'accepté') {
    throw new Error('Missing quote fields');
  }
  if (name.length > 120 || company.length > 120 || phone.length > 40 || website.length > 500 || summary.length > 30000) {
    throw new Error('Quote field too long');
  }

  var id = Utilities.getUuid();
  var attachments = quoteAttachments_(p);
  var saved = saveQuoteAttachments_(attachments, id);
  var receivedAt = new Date();
  var record = [
    id, receivedAt, name, senderEmail, phone, company, website, summary,
    saved.names.join('\n'), saved.links.join('\n'), consent
  ];
  appendRecord_('Devis', record);

  var details = parseQuoteSummary_(summary);
  var project = details && details.project || {};

  // Devis automatique : la demande est déjà enregistrée, un échec ici ne doit jamais la bloquer.
  var devis = null;
  try {
    devis = createQuoteFromRequest_(details, {
      requestId: id, receivedAt: receivedAt, name: name, email: senderEmail,
      phone: phone, company: company, website: website
    });
  } catch (err) {
    console.error('Automatic quote failed: ' + String((err && err.message) || 'unknown error'));
  }
  var sections = [
    {
      title: 'COORDONNÉES',
      rows: emailRows_([
        ['Nom', name], ['Entreprise ou marque', company], ['E-mail', senderEmail],
        ['WhatsApp', phone], ['Site / réseau', website]
      ])
    },
    {
      title: 'PROJET',
      rows: emailRows_([
        ['Catégories', project.categories], ['Autre projet', project.otherProject],
        ['Prestations demandées', project.deliverables], ['Précisions sur les livrables', project.deliverablesDescription],
        ['Fichiers sources', details && details.sourceFiles],
        ['Description', project.description], ['Objectifs', project.objectives], ['Public cible', project.audience]
      ])
    },
    {
      title: 'BUDGET ET DÉLAIS',
      rows: emailRows_([
        ['Budget estimé', details && details.budget], ['Délai souhaité', details && details.deadline],
        ['Date précise', details && details.targetDate]
      ])
    },
    {
      title: 'UNIVERS VISUEL',
      rows: emailRows_([['Style graphique', details && details.styles]])
    }
  ];
  if (!details) sections[1].rows = emailRows_([['Détails du projet', summary]]);
  sections.unshift({
    title: 'DEVIS AUTOMATIQUE',
    rows: devis
      ? emailRows_([
          ['Numéro', devis.number],
          ['Statut', devis.status],
          ['Total', devis.totals.unpricedCount
            ? 'À chiffrer (' + devis.totals.unpricedCount + ' ligne(s) sans tarif)'
            : String(devis.totals.total).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' ' + devis.currency],
          ['À consulter', 'Hub, onglet Devis']
        ])
      : emailRows_([['Devis automatique', 'Non créé — voir les journaux Apps Script']])
  });

  var fileRows = saved.names.map(function (fileName, index) {
    var fileUrl = saved.links[index] || '';
    var safeName = escapeEmailHtml_(fileName);
    return {
      label: 'Fichier ' + (index + 1),
      value: fileName + (fileUrl ? ' — ' + fileUrl : ''),
      html: fileUrl
        ? '<a href="' + escapeEmailHtml_(fileUrl) + '" style="color:#8a552b;text-decoration:underline">' + safeName + '</a> <span style="color:#6a665c">(Drive privé)</span>'
        : safeName
    };
  });
  sections.push({
    title: 'FICHIERS JOINTS',
    rows: fileRows.length ? fileRows : [{ label: 'Pièces jointes', value: 'Aucune pièce jointe.' }]
  });

  var mailOptions = {
    to: FORM_CONFIG.recipient,
    replyTo: senderEmail,
    subject: '[SITE-FORM] Devis — ' + safeSubject_(name),
    body: buildNotificationText_('Nouvelle demande de devis', id, receivedAt, sections),
    htmlBody: buildNotificationHtml_('Nouvelle demande de devis', id, receivedAt, sections)
  };
  if (attachments.length) mailOptions.attachments = attachments;
  MailApp.sendEmail(mailOptions);
}

function sendContact_(p, senderEmail) {
  var name = field_(p, 'name');
  var subject = field_(p, 'subject');
  var message = field_(p, 'message');
  var consent = field_(p, 'consentement');

  if (!name || !message || consent !== 'accepté' || name.length > 120 || subject.length > 160 || message.length > 10000) {
    throw new Error('Invalid contact fields');
  }

  var id = Utilities.getUuid();
  var receivedAt = new Date();
  appendRecord_('Contact', [id, receivedAt, name, senderEmail, subject, message, consent]);

  var sections = [
    { title: 'COORDONNÉES', rows: emailRows_([['Nom / entreprise', name], ['E-mail', senderEmail], ['Sujet', subject]]) },
    { title: 'MESSAGE', rows: emailRows_([['Contenu', message]]) }
  ];

  MailApp.sendEmail({
    to: FORM_CONFIG.recipient,
    replyTo: senderEmail,
    subject: '[SITE-FORM] Contact — ' + safeSubject_(subject || name),
    body: buildNotificationText_('Nouveau message de contact', id, receivedAt, sections),
    htmlBody: buildNotificationHtml_('Nouveau message de contact', id, receivedAt, sections)
  });
}

function parseQuoteSummary_(value) {
  try {
    var parsed = JSON.parse(String(value || ''));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch (err) {
    return null;
  }
}

function emailRows_(pairs) {
  return pairs.map(function (pair) {
    var value = pair[1];
    if (Array.isArray(value)) value = value.join(', ');
    if (value && typeof value === 'object') value = '';
    value = String(value == null ? '' : value).trim();
    return value ? { label: pair[0], value: value } : null;
  }).filter(function (row) { return !!row; });
}

function escapeEmailHtml_(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function formatEmailDate_(date) {
  return Utilities.formatDate(date, 'Indian/Antananarivo', 'dd/MM/yyyy HH:mm') + ' (heure de Madagascar)';
}

function buildNotificationText_(title, id, receivedAt, sections) {
  var lines = [title + ' — Vasilías Studio', 'Référence : ' + id, ''];
  sections.forEach(function (section) {
    lines.push(section.title);
    section.rows.forEach(function (row) { lines.push(row.label + ' : ' + row.value); });
    lines.push('');
  });
  lines.push('Reçu le : ' + formatEmailDate_(receivedAt));
  lines.push('Répondez directement à cet e-mail pour contacter la personne.');
  return lines.join('\n');
}

function buildNotificationHtml_(title, id, receivedAt, sections) {
  var FONT = "'Josefin Sans','Helvetica Neue',Helvetica,Arial,sans-serif";
  var INK = '#161513', MUTED = '#6a665c', RULE = '#e6e1d9', HAIR = '#f0ece6', BRONZE = '#BF814B';

  var blocks = sections.map(function (section) {
    var rows = section.rows.map(function (row, index) {
      var content = row.html || escapeEmailHtml_(row.value).replace(/\r?\n/g, '<br>');
      var border = index === 0 ? '' : 'border-top:1px solid ' + HAIR + ';';
      return '<tr>' +
        '<td valign="top" width="34%" style="padding:12px 16px 12px 0;' + border + 'color:' + MUTED + ';font:12px/1.5 ' + FONT + ';letter-spacing:.3px">' + escapeEmailHtml_(row.label) + '</td>' +
        '<td valign="top" style="padding:12px 0;' + border + 'color:' + INK + ';font:15px/1.65 ' + FONT + ';word-break:break-word">' + content + '</td>' +
        '</tr>';
    }).join('');
    return '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 28px;border-collapse:collapse">' +
      '<tr><td colspan="2" style="padding:0 0 10px;border-bottom:1px solid ' + RULE + ';color:' + BRONZE + ';font:bold 11px/1.4 ' + FONT + ';letter-spacing:2.4px">' + escapeEmailHtml_(section.title) + '</td></tr>' +
      rows + '</table>';
  }).join('');

  return '<!doctype html><html lang="fr"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"></head>' +
    '<body style="margin:0;padding:28px 12px;background:#f7f5f1">' +
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center">' +
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#ffffff;border:1px solid ' + RULE + '">' +
    // En-tête
    '<tr><td style="padding:36px 36px 8px">' +
      '<div style="color:' + BRONZE + ';font:bold 11px/1.4 ' + FONT + ';letter-spacing:3px">VASILÍAS STUDIO</div>' +
      '<h1 style="margin:18px 0 8px;color:' + INK + ';font:300 28px/1.25 ' + FONT + '">' + escapeEmailHtml_(title) + '</h1>' +
      '<div style="color:' + MUTED + ';font:14px/1.5 ' + FONT + '">Nouvelle demande reçue depuis le site</div>' +
      '<div style="width:44px;height:2px;margin:22px 0 0;background:' + BRONZE + ';line-height:2px;font-size:2px">&nbsp;</div>' +
    '</td></tr>' +
    // Référence
    '<tr><td style="padding:20px 36px 24px;color:' + MUTED + ';font:12px/1.7 ' + FONT + '">' +
      '<span style="letter-spacing:1.5px">RÉFÉRENCE</span>&nbsp;&nbsp;<span style="color:' + INK + '">' + escapeEmailHtml_(id) + '</span><br>' +
      '<span style="letter-spacing:1.5px">REÇU LE</span>&nbsp;&nbsp;<span style="color:' + INK + '">' + escapeEmailHtml_(formatEmailDate_(receivedAt)) + '</span>' +
    '</td></tr>' +
    // Contenu
    '<tr><td style="padding:8px 36px 4px">' + blocks + '</td></tr>' +
    // Pied
    '<tr><td style="padding:20px 36px 30px;border-top:1px solid ' + RULE + ';color:' + MUTED + ';font:12px/1.7 ' + FONT + '">' +
      'Répondez directement à cet e-mail pour contacter la personne.<br>' +
      '<span style="color:#8a847b">Notification automatique · Vasilías Studio</span>' +
    '</td></tr>' +
    '</table></td></tr></table></body></html>';
}

function quoteAttachments_(p) {
  var count = Number(field_(p, 'attachmentCount') || '0');
  if (!Number.isInteger(count) || count < 0 || count > FORM_CONFIG.maxFiles) {
    throw new Error('Invalid attachment count');
  }

  var files = [];
  var totalBytes = 0;
  for (var i = 0; i < count; i++) {
    var name = safeFilename_(field_(p, 'gasFile' + i + 'Name'));
    var type = field_(p, 'gasFile' + i + 'Type').toLowerCase();
    var data = field_(p, 'gasFile' + i + 'Data').replace(/^data:[^,]*;base64,/i, '').replace(/\s/g, '');
    var extension = name.indexOf('.') === -1 ? '' : name.split('.').pop().toLowerCase();
    var expectedType = FORM_CONFIG.allowedTypesByExtension[extension];

    if (!name || !expectedType || !data) throw new Error('Invalid attachment');
    if (type && type !== expectedType && !(extension === 'jpg' && type === 'image/pjpeg')) {
      throw new Error('Attachment type mismatch');
    }
    if (data.length > Math.ceil(FORM_CONFIG.maxFileBytes * 4 / 3) + 16) {
      throw new Error('Attachment too large');
    }

    var bytes = Utilities.base64Decode(data);
    if (bytes.length > FORM_CONFIG.maxFileBytes) throw new Error('Attachment too large');
    totalBytes += bytes.length;
    if (totalBytes > FORM_CONFIG.maxTotalFileBytes) throw new Error('Attachments too large');
    files.push(Utilities.newBlob(bytes, expectedType, name));
  }
  return files;
}

function saveQuoteAttachments_(blobs, requestId) {
  var folder = getFolderFromProperty_(STORAGE_KEYS.attachmentsFolder);
  var names = [];
  var links = [];
  blobs.forEach(function (blob, index) {
    var fileName = requestId.slice(0, 8) + '_' + (index + 1) + '_' + safeFilename_(blob.getName());
    var file = folder.createFile(blob.setName(fileName));
    names.push(blob.getName());
    links.push(file.getUrl());
  });
  return { names: names, links: links };
}

function appendRecord_(sheetName, row) {
  var spreadsheet = getSpreadsheet_();
  var sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) throw new Error('Storage sheet missing');

  var safeRow = row.map(function (value, index) {
    if (index === 1 && value instanceof Date) return value;
    return safeCell_(value);
  });

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('Storage busy');
  try {
    sheet.appendRow(safeRow);
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }
}

/** Daily cleanup: remove Sheet rows and Drive attachments older than 3 months,
 * and move matching [SITE-FORM] Gmail threads older than 3 months to Trash.
 * Gmail keeps trashed items recoverable for up to a further 30 days.
 */
function purgeOldSubmissions() {
  var cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - FORM_CONFIG.retentionMonths);

  var spreadsheet = getSpreadsheet_();
  ['Devis', 'Contact'].forEach(function (sheetName) {
    var sheet = spreadsheet.getSheetByName(sheetName);
    if (!sheet || sheet.getLastRow() < 2) return;
    var dates = sheet.getRange(2, 2, sheet.getLastRow() - 1, 1).getValues();
    for (var i = dates.length - 1; i >= 0; i--) {
      var date = dates[i][0];
      if (date instanceof Date && date < cutoff) sheet.deleteRow(i + 2);
    }
  });
  purgeStaleQuotes_(cutoff);

  var folder = getFolderFromProperty_(STORAGE_KEYS.attachmentsFolder);
  var files = folder.getFiles();
  while (files.hasNext()) {
    var file = files.next();
    if (file.getDateCreated() < cutoff) file.setTrashed(true);
  }

  // This query only targets messages created by these two forms.
  var oldThreads;
  do {
    oldThreads = GmailApp.search('subject:SITE-FORM older_than:' + FORM_CONFIG.retentionMonths + 'm', 0, 100);
    if (oldThreads.length) GmailApp.moveThreadsToTrash(oldThreads);
  } while (oldThreads.length === 100);
}

function installCleanupTrigger_() {
  var triggers = ScriptApp.getProjectTriggers();
  var exists = triggers.some(function (trigger) {
    return trigger.getHandlerFunction() === 'purgeOldSubmissions';
  });
  if (!exists) {
    ScriptApp.newTrigger('purgeOldSubmissions').timeBased().everyDays(1).atHour(3).create();
  }
}

function allowRate_(email) {
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, email);
  var key = 'form-rate-' + Utilities.base64EncodeWebSafe(digest).slice(0, 32);
  var cache = CacheService.getScriptCache();
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(3000)) return false;
  try {
    var current = Number(cache.get(key) || '0');
    if (current >= FORM_CONFIG.maxSubmissionsPerEmailPerHour) return false;
    cache.put(key, String(current + 1), 3600);
    return true;
  } finally {
    lock.releaseLock();
  }
}

function getOrCreateFolder_(props, key, name) {
  var id = props.getProperty(key);
  if (id) return DriveApp.getFolderById(id);
  var folder = DriveApp.createFolder(name);
  props.setProperty(key, folder.getId());
  return folder;
}

function getOrCreateChildFolder_(props, key, parent, name) {
  var id = props.getProperty(key);
  if (id) return DriveApp.getFolderById(id);
  var folder = parent.createFolder(name);
  props.setProperty(key, folder.getId());
  return folder;
}

function getOrCreateSpreadsheet_(props, parent) {
  var id = props.getProperty(STORAGE_KEYS.spreadsheet);
  if (id) return SpreadsheetApp.openById(id);
  var spreadsheet = SpreadsheetApp.create(FORM_CONFIG.spreadsheetName);
  DriveApp.getFileById(spreadsheet.getId()).moveTo(parent);
  props.setProperty(STORAGE_KEYS.spreadsheet, spreadsheet.getId());
  return spreadsheet;
}

function ensureSheet_(spreadsheet, name, headers) {
  var sheet = spreadsheet.getSheetByName(name);
  if (!sheet) sheet = spreadsheet.insertSheet(name);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    return;
  }
  // Safely add newly introduced header columns without touching existing rows.
  var width = Math.max(sheet.getLastColumn(), headers.length);
  var current = sheet.getRange(1, 1, 1, width).getValues()[0];
  for (var i = 0; i < headers.length; i++) {
    if (!current[i]) current[i] = headers[i];
  }
  sheet.getRange(1, 1, 1, width).setValues([current]);
}

function requireStorage_() {
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty(STORAGE_KEYS.parentFolder) ||
      !props.getProperty(STORAGE_KEYS.attachmentsFolder) ||
      !props.getProperty(STORAGE_KEYS.spreadsheet)) {
    throw new Error('Run setupStorage first');
  }
}

function getSpreadsheet_() {
  var id = PropertiesService.getScriptProperties().getProperty(STORAGE_KEYS.spreadsheet);
  if (!id) throw new Error('Storage not initialized');
  return SpreadsheetApp.openById(id);
}

function getFolderFromProperty_(key) {
  var id = PropertiesService.getScriptProperties().getProperty(key);
  if (!id) throw new Error('Storage folder not initialized');
  return DriveApp.getFolderById(id);
}

function responsePage_(success, type, clientNonce) {
  var safeType = type === 'quote' || type === 'contact' ? type : 'unknown';
  var nonce = String(clientNonce || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 100);
  var title = success ? 'Demande transmise' : 'Envoi non confirmé';
  var message = success
    ? 'Merci. Votre demande a été transmise à Vasilías Studio.'
    : 'L’envoi n’a pas pu être confirmé. Réessayez plus tard ou contactez-nous par e-mail.';
  var siteLink = safeType === 'quote'
    ? 'https://vasilias-studio.github.io/services.html'
    : 'https://vasilias-studio.github.io/contact.html';
  var response = JSON.stringify({ source: 'vasilias-apps-script', success: !!success, formType: safeType, clientNonce: nonce });
  var returnUrl = 'https://vasilias-studio.github.io/form-response.html?source=vasilias-form-response&formType=' +
    encodeURIComponent(safeType) + '&success=' + (success ? '1' : '0') + '&clientNonce=' + encodeURIComponent(nonce);
  var htmlReturnUrl = returnUrl.replace(/&/g, '&amp;');
  var html = '<!doctype html><html lang="fr"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<meta http-equiv="refresh" content="0;url=' + htmlReturnUrl + '">' +
    '<title>' + title + ' — Vasilías Studio</title>' +
    '<style>body{margin:0;background:#f5f2ed;color:#24211e;font:16px/1.6 Arial,sans-serif;display:grid;min-height:100vh;place-items:center}.card{background:#fff;max-width:560px;margin:24px;padding:36px;border:1px solid #ded8d1;border-radius:16px}h1{font-size:1.7rem;margin:0 0 12px}a{color:#8a552b}.mark{color:#BF814B;font-size:2rem}</style></head>' +
    '<body><main class="card"><div class="mark">' + (success ? '✓' : '•') + '</div><h1>' + title + '</h1><p>' + message + '</p><p><a href="' + siteLink + '">Retour au site</a></p></main>' +
    '<script>(function(){try{window.top.postMessage(' + response + ',"*");}catch(e){}})();</script></body></html>';
  return HtmlService.createHtmlOutput(html)
    .setTitle(title + ' — Vasilías Studio')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function field_(params, name) {
  var value = params && params[name];
  if (Array.isArray(value)) value = value[0];
  return String(value == null ? '' : value).trim();
}

function validEmail_(email) {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function safeSubject_(value) {
  return String(value || '').replace(/[\r\n]+/g, ' ').replace(/[^\p{L}\p{N} .,_-]/gu, '').slice(0, 100).trim() || 'Demande';
}

function safeFilename_(value) {
  return String(value || '').replace(/[\r\n\u0000-\u001f]/g, '').replace(/[\\/]/g, '_').slice(0, 160).trim();
}

function safeCell_(value) {
  // Un nombre fini ne peut pas contenir de formule : on le garde numérique (totaux, sommes dans la feuille).
  if (typeof value === 'number' && isFinite(value)) return value;
  var text = String(value == null ? '' : value);
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}
