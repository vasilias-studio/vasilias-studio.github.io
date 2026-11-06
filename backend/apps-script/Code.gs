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
  installCleanupTrigger_();

  Logger.log('Stockage privé prêt. Sheet : ' + spreadsheet.getUrl());
  Logger.log('Dossier privé : ' + parent.getUrl());
  Logger.log('Pièces jointes : ' + uploads.getUrl());
}

function doPost(e) {
  var p = (e && e.parameter) || {};
  var type = field_(p, 'formType').toLowerCase();

  // Honeypot: bots receive a generic success page, but no data is stored or emailed.
  if (field_(p, '_honey')) return responsePage_(true, type);

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

    return responsePage_(true, type);
  } catch (err) {
    // Do not log form contents or email addresses.
    console.error('Form processing failed: ' + String((err && err.message) || 'unknown error'));
    return responsePage_(false, type);
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

  var attachmentNotes = saved.links.length
    ? '\n\nFichiers enregistrés dans Drive (accès privé) :\n' + saved.links.join('\n')
    : '\n\nAucune pièce jointe.';
  var body = [
    'Nouvelle demande de devis — Vasilías Studio',
    '',
    'ID : ' + id,
    'Nom : ' + name,
    'E-mail : ' + senderEmail,
    'WhatsApp : ' + phone,
    'Entreprise ou marque : ' + company,
    'Site / réseau : ' + (website || '(non renseigné)'),
    '',
    'Résumé détaillé du projet :',
    summary,
    attachmentNotes,
    '',
    'Reçu le : ' + receivedAt.toISOString()
  ].join('\n');

  var mailOptions = {
    to: FORM_CONFIG.recipient,
    replyTo: senderEmail,
    subject: '[SITE-FORM] Devis — ' + safeSubject_(name),
    body: body
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

  var body = [
    'Nouveau message de contact — Vasilías Studio',
    '',
    'ID : ' + id,
    'Nom / entreprise : ' + name,
    'E-mail : ' + senderEmail,
    'Sujet : ' + (subject || '(non précisé)'),
    '',
    'Message :',
    message,
    '',
    'Reçu le : ' + receivedAt.toISOString()
  ].join('\n');

  MailApp.sendEmail({
    to: FORM_CONFIG.recipient,
    replyTo: senderEmail,
    subject: '[SITE-FORM] Contact — ' + safeSubject_(subject || name),
    body: body
  });
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

  var folder = getFolderFromProperty_(STORAGE_KEYS.attachmentsFolder);
  var files = folder.getFiles();
  while (files.hasNext()) {
    var file = files.next();
    if (file.getDateCreated() < cutoff) file.setTrashed(true);
  }

  // This query only targets messages created by these two forms.
  var oldThreads;
  do {
    oldThreads = GmailApp.search('subject:SITE-FORM older_than:3m', 0, 100);
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

function responsePage_(success, type) {
  var title = success ? 'Demande transmise' : 'Envoi non confirmé';
  var message = success
    ? 'Merci. Votre demande a été transmise à Vasilías Studio.'
    : 'L’envoi n’a pas pu être confirmé. Réessayez plus tard ou contactez-nous par e-mail.';
  var siteLink = type === 'quote'
    ? 'https://vasilias-studio.github.io/services.html'
    : 'https://vasilias-studio.github.io/contact.html';
  var html = '<!doctype html><html lang="fr"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>' + title + ' — Vasilías Studio</title>' +
    '<style>body{margin:0;background:#f5f2ed;color:#24211e;font:16px/1.6 Arial,sans-serif;display:grid;min-height:100vh;place-items:center}.card{background:#fff;max-width:560px;margin:24px;padding:36px;border:1px solid #ded8d1;border-radius:16px}h1{font-size:1.7rem;margin:0 0 12px}a{color:#8a552b}.mark{color:#BF814B;font-size:2rem}</style></head>' +
    '<body><main class="card"><div class="mark">' + (success ? '✓' : '•') + '</div><h1>' + title + '</h1><p>' + message + '</p><p><a href="' + siteLink + '">Retour au site</a></p></main></body></html>';
  return HtmlService.createHtmlOutput(html).setTitle(title + ' — Vasilías Studio');
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
  var text = String(value == null ? '' : value);
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}
