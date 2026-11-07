/**
 * Devis automatiques.
 *
 * - À chaque demande de devis reçue par le formulaire, un devis est créé en brouillon
 *   dans la feuille privée « Devis générés » (numéro DEV-AAAA-NNN).
 * - Les prix viennent de la feuille « Tarifs » (à remplir une fois). Une prestation sans
 *   tarif reste « à chiffrer » : aucun prix n'est inventé.
 * - Le Hub lit et modifie ces devis via une API protégée par une clé secrète
 *   (propriété de script VAS_ADMIN_KEY, créée par setupAdminKey()). Aucune donnée client
 *   n'est jamais publiée dans le dépôt public.
 */

var QUOTE_CONFIG = {
  sheetName: 'Devis générés',
  tariffSheetName: 'Tarifs',
  numberPrefix: 'DEV',
  validityDays: 30,
  currency: 'Ar',
  defaultTaxRate: 0,
  statuses: ['À chiffrer', 'Brouillon', 'Envoyé', 'Accepté', 'Refusé', 'Expiré'],
  // Par défaut, les devis suivent la même durée de rétention que les demandes (FORM_CONFIG.retentionMonths),
  // comme l'annonce la page confidentialité. Pour conserver plus longtemps certains statuts,
  // ajoutez-les ici (ex. ['Accepté']) ET mettez à jour la page confidentialité.
  keepStatuses: [],
  maxLines: 40,
  maxListed: 300,
  maxFailedKeyAttempts: 8,
  adminKeyProperty: 'VAS_ADMIN_KEY'
};

var QUOTE_SHEET_HEADERS = [
  'Numéro', 'Date de création', 'Statut', 'Client', 'Entreprise', 'E-mail',
  'Total (Ar)', 'ID demande', 'Données (JSON — ne pas modifier, utiliser le Hub)'
];
var TARIFF_HEADERS = ['Catégorie', 'Prestation', 'Prix unitaire (Ar)', 'Unité', 'Description (facultatif)'];

// Même liste que le formulaire (js/quote-form.js). Sert à préremplir la feuille Tarifs.
var SERVICE_CATALOG = [
  ['Identité visuelle', ['Logo principal', 'Déclinaisons du logo', 'Icône de marque', 'Palette de couleurs', 'Sélection typographique', 'Brandboard', 'Mini-charte graphique', 'Charte graphique complète']],
  ['Design graphique', ['Affiche publicitaire', 'Flyer', 'Brochure', 'Carte de visite', 'Catalogue', 'Supports imprimés']],
  ['Packaging', ['Design de boîte', 'Design d’étiquette', 'Design de bouteille ou contenant', 'Déclinaisons de packaging', 'Mockups de présentation']],
  ['Réseaux sociaux', ['Templates de publications', 'Templates de stories', 'Couverture Facebook', 'Couverture et bannière', 'Visuels publicitaires', 'Templates promotionnels', 'Identité visuelle pour les réseaux sociaux']],
  ['Autres prestations', ['Direction artistique', 'Présentation professionnelle', 'Supports de communication spécifiques', 'Projet graphique complexe ou multidisciplinaire', 'Autre prestation']]
];

/* ------------------------------------------------------------------ */
/* Fonctions pures (testées dans test-validation.js)                   */
/* ------------------------------------------------------------------ */

function cleanText_(value, max) {
  return String(value == null ? '' : value)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .trim()
    .slice(0, max);
}

/** Convertit une saisie en montant entier. Retourne null si vide ou invalide. */
function toAmount_(value, allowZero) {
  if (value === null || value === undefined || value === '') return null;
  var n = typeof value === 'number'
    ? value
    : Number(String(value).replace(/[\s\u00A0\u202F]/g, '').replace(',', '.').replace(/[^0-9.\-]/g, ''));
  if (!isFinite(n) || n < 0) return null;
  if (n === 0 && !allowZero) return null;
  return Math.round(n);
}

function formatQuoteNumber_(prefix, year, sequence) {
  var padded = String(sequence);
  while (padded.length < 3) padded = '0' + padded;
  return prefix + '-' + year + '-' + padded;
}

function normalizeQuoteLines_(input) {
  var list = Array.isArray(input) ? input : [];
  var lines = [];
  for (var i = 0; i < list.length && lines.length < QUOTE_CONFIG.maxLines; i++) {
    var raw = list[i] || {};
    var label = cleanText_(raw.label, 200);
    if (!label) continue;
    var quantity = Number(raw.quantity);
    if (!isFinite(quantity) || quantity <= 0 || quantity > 9999) quantity = 1;
    lines.push({
      label: label,
      description: cleanText_(raw.description, 600),
      quantity: Math.round(quantity * 100) / 100,
      unit: cleanText_(raw.unit, 20) || 'forfait',
      unitPrice: toAmount_(raw.unitPrice, true)
    });
  }
  return lines;
}

/** Construit les lignes du devis à partir de la demande analysée et de la grille de tarifs. */
function buildQuoteLines_(details, tariffs) {
  var d = details || {};
  var project = d.project || {};
  var grid = tariffs || {};
  var deliverables = Array.isArray(project.deliverables) ? project.deliverables : [];
  var lines = [];

  deliverables.forEach(function (item) {
    var label = cleanText_(item, 200);
    if (!label || lines.length >= QUOTE_CONFIG.maxLines) return;
    var tariff = grid[label.toLowerCase()] || null;
    lines.push({
      label: label,
      description: tariff ? tariff.description : '',
      quantity: 1,
      unit: tariff ? tariff.unit : 'forfait',
      unitPrice: tariff ? tariff.price : null
    });
  });

  var other = cleanText_(project.otherProject, 600);
  if (other && lines.length < QUOTE_CONFIG.maxLines) {
    lines.push({ label: 'Prestation spécifique', description: other, quantity: 1, unit: 'forfait', unitPrice: null });
  }

  if (!lines.length) {
    lines.push({
      label: 'Prestation à définir',
      description: cleanText_(project.deliverablesDescription || project.description, 600),
      quantity: 1,
      unit: 'forfait',
      unitPrice: null
    });
  }
  return lines;
}

function computeQuoteTotals_(lines, discount, taxRate) {
  var subtotal = 0;
  var unpricedCount = 0;
  (lines || []).forEach(function (line) {
    if (line.unitPrice === null || line.unitPrice === undefined) unpricedCount++;
    else subtotal += Math.round(Number(line.quantity) * Number(line.unitPrice));
  });
  var safeDiscount = Math.min(Math.max(Math.round(Number(discount) || 0), 0), subtotal);
  var safeTax = Math.min(Math.max(Number(taxRate) || 0, 0), 100);
  var taxable = subtotal - safeDiscount;
  var tax = Math.round(taxable * safeTax / 100);
  return {
    subtotal: subtotal,
    discount: safeDiscount,
    taxRate: safeTax,
    tax: tax,
    total: taxable + tax,
    unpricedCount: unpricedCount
  };
}

function quoteStatusFor_(totals) {
  return (totals.unpricedCount > 0 || totals.subtotal <= 0) ? 'À chiffrer' : 'Brouillon';
}

function addDaysIso_(isoDate, days) {
  var d = new Date(isoDate);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function constantTimeEquals_(a, b) {
  var x = String(a == null ? '' : a);
  var y = String(b == null ? '' : b);
  var diff = x.length ^ y.length;
  var len = Math.max(x.length, y.length);
  for (var i = 0; i < len; i++) {
    diff |= (x.charCodeAt(i) || 0) ^ (y.charCodeAt(i) || 0);
  }
  return diff === 0;
}

/**
 * Applique une modification venant du Hub sur un devis existant (liste blanche de champs).
 * Retourne le devis mis à jour ; ne touche ni au numéro, ni à la demande d'origine.
 */
function applyQuotePatch_(quote, patch, nowIso) {
  var q = JSON.parse(JSON.stringify(quote));
  var p = patch || {};
  var changes = [];

  if (p.client && typeof p.client === 'object') {
    var email = cleanText_(p.client.email, 254).toLowerCase();
    q.client = {
      name: cleanText_(p.client.name, 120),
      company: cleanText_(p.client.company, 120),
      email: email && validEmail_(email) ? email : q.client.email,
      whatsapp: cleanText_(p.client.whatsapp, 40),
      website: cleanText_(p.client.website, 500)
    };
    changes.push('client');
  }
  if (Array.isArray(p.lines)) {
    q.lines = normalizeQuoteLines_(p.lines);
    if (!q.lines.length) throw new Error('Quote needs at least one line');
    changes.push('lignes');
  }
  if (p.discount !== undefined) { q.discount = toAmount_(p.discount, true) || 0; changes.push('remise'); }
  if (p.taxRate !== undefined) {
    var rate = Number(p.taxRate);
    q.taxRate = isFinite(rate) ? Math.min(Math.max(rate, 0), 100) : 0;
    changes.push('TVA');
  }
  if (p.notes !== undefined) { q.notes = cleanText_(p.notes, 2000); changes.push('notes'); }
  if (p.conditions !== undefined) { q.conditions = cleanText_(p.conditions, 2000); changes.push('conditions'); }

  if (p.issuedAt) {
    var issued = new Date(p.issuedAt);
    if (!isNaN(issued.getTime())) { q.issuedAt = issued.toISOString(); changes.push('date d’émission'); }
  }
  if (p.validityDays !== undefined) {
    var days = Math.round(Number(p.validityDays));
    if (isFinite(days) && days >= 1 && days <= 365) { q.validityDays = days; changes.push('validité'); }
  }
  q.validUntil = addDaysIso_(q.issuedAt, q.validityDays);

  q.totals = computeQuoteTotals_(q.lines, q.discount, q.taxRate);

  var statusBefore = q.status;
  if (p.status !== undefined) {
    if (QUOTE_CONFIG.statuses.indexOf(p.status) < 0) throw new Error('Invalid status');
    q.status = p.status;
  } else if (statusBefore === 'À chiffrer' || statusBefore === 'Brouillon') {
    q.status = quoteStatusFor_(q.totals);
  }
  if (q.status !== statusBefore) changes.unshift('statut : ' + statusBefore + ' → ' + q.status);

  q.updatedAt = nowIso;
  q.history = (q.history || []).concat([{ at: nowIso, event: changes.length ? 'Modifié (' + changes.join(', ') + ')' : 'Enregistré' }]).slice(-50);
  return q;
}

/* ------------------------------------------------------------------ */
/* Stockage                                                            */
/* ------------------------------------------------------------------ */

function ensureQuoteSheets_(spreadsheet) {
  ensureSheet_(spreadsheet, QUOTE_CONFIG.sheetName, QUOTE_SHEET_HEADERS);
  var tariffs = spreadsheet.getSheetByName(QUOTE_CONFIG.tariffSheetName);
  if (!tariffs) {
    tariffs = spreadsheet.insertSheet(QUOTE_CONFIG.tariffSheetName);
  }
  if (tariffs.getLastRow() === 0) {
    tariffs.getRange(1, 1, 1, TARIFF_HEADERS.length).setValues([TARIFF_HEADERS]);
    tariffs.setFrozenRows(1);
    var rows = [];
    SERVICE_CATALOG.forEach(function (group) {
      group[1].forEach(function (service) { rows.push([group[0], service, '', 'forfait', '']); });
    });
    tariffs.getRange(2, 1, rows.length, TARIFF_HEADERS.length).setValues(rows);
  }
}

function readTariffs_(spreadsheet) {
  var sheet = spreadsheet.getSheetByName(QUOTE_CONFIG.tariffSheetName);
  var map = {};
  if (!sheet || sheet.getLastRow() < 2) return map;
  var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, TARIFF_HEADERS.length).getValues();
  values.forEach(function (row) {
    var label = cleanText_(row[1], 200);
    if (!label) return;
    map[label.toLowerCase()] = {
      price: toAmount_(row[2], false),
      unit: cleanText_(row[3], 20) || 'forfait',
      description: cleanText_(row[4], 600)
    };
  });
  return map;
}

function reserveQuoteNumber_(date) {
  var year = Number(Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy'));
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('Quote numbering busy');
  try {
    var props = PropertiesService.getScriptProperties();
    var key = 'VAS_QUOTE_SEQ_' + year;
    var sequence = Number(props.getProperty(key) || 0) + 1;
    props.setProperty(key, String(sequence));
    return formatQuoteNumber_(QUOTE_CONFIG.numberPrefix, year, sequence);
  } finally {
    lock.releaseLock();
  }
}

function quoteRow_(quote) {
  return [
    quote.number, new Date(quote.createdAt), quote.status,
    quote.client.name, quote.client.company, quote.client.email,
    quote.totals.total, quote.requestId, JSON.stringify(quote)
  ];
}

/** Crée le devis automatique d'une demande. Les erreurs sont gérées par l'appelant. */
function createQuoteFromRequest_(details, meta) {
  var spreadsheet = getSpreadsheet_();
  ensureQuoteSheets_(spreadsheet);

  var d = details || {};
  var project = d.project || {};
  var lines = buildQuoteLines_(d, readTariffs_(spreadsheet));
  var totals = computeQuoteTotals_(lines, 0, QUOTE_CONFIG.defaultTaxRate);
  var createdAt = (meta.receivedAt || new Date());
  var iso = createdAt.toISOString();

  var quote = {
    number: reserveQuoteNumber_(createdAt),
    requestId: meta.requestId,
    createdAt: iso,
    issuedAt: iso,
    validityDays: QUOTE_CONFIG.validityDays,
    validUntil: addDaysIso_(iso, QUOTE_CONFIG.validityDays),
    status: quoteStatusFor_(totals),
    currency: QUOTE_CONFIG.currency,
    auto: true,
    client: {
      name: cleanText_(meta.name, 120), company: cleanText_(meta.company, 120),
      email: cleanText_(meta.email, 254), whatsapp: cleanText_(meta.phone, 40),
      website: cleanText_(meta.website, 500)
    },
    request: {
      categories: Array.isArray(project.categories) ? project.categories.map(function (c) { return cleanText_(c, 80); }).slice(0, 10) : [],
      description: cleanText_(project.description, 1500),
      objectives: cleanText_(project.objectives, 800),
      audience: cleanText_(project.audience, 500),
      deliverablesDescription: cleanText_(project.deliverablesDescription, 1500),
      budget: cleanText_(d.budget, 120),
      deadline: cleanText_(d.deadline, 120),
      targetDate: cleanText_(d.targetDate, 60),
      styles: Array.isArray(d.styles) ? d.styles.map(function (s) { return cleanText_(s, 60); }).slice(0, 10) : []
    },
    lines: lines,
    discount: 0,
    taxRate: QUOTE_CONFIG.defaultTaxRate,
    totals: totals,
    notes: '',
    conditions: '',
    updatedAt: iso,
    history: [{ at: iso, event: 'Créé automatiquement depuis le formulaire' }]
  };
  appendRecord_(QUOTE_CONFIG.sheetName, quoteRow_(quote));
  return quote;
}

function listQuotes_() {
  var sheet = getSpreadsheet_().getSheetByName(QUOTE_CONFIG.sheetName);
  if (!sheet || sheet.getLastRow() < 2) return [];
  var cells = sheet.getRange(2, 9, sheet.getLastRow() - 1, 1).getValues();
  var quotes = [];
  cells.forEach(function (cell) {
    try {
      var q = JSON.parse(cell[0]);
      if (q && q.number) quotes.push(q);
    } catch (err) { /* ligne ignorée */ }
  });
  quotes.sort(function (a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); });
  return quotes.slice(0, QUOTE_CONFIG.maxListed);
}

function findQuoteRow_(sheet, number) {
  if (sheet.getLastRow() < 2) return 0;
  var numbers = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
  for (var i = 0; i < numbers.length; i++) {
    if (String(numbers[i][0]) === number) return i + 2;
  }
  return 0;
}

function updateQuote_(number, patch) {
  if (!number) return { ok: false, error: 'bad_request' };
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return { ok: false, error: 'busy' };
  try {
    var sheet = getSpreadsheet_().getSheetByName(QUOTE_CONFIG.sheetName);
    var row = sheet ? findQuoteRow_(sheet, number) : 0;
    if (!row) return { ok: false, error: 'not_found' };

    var current = JSON.parse(sheet.getRange(row, 9).getValue());
    // Protection contre l'écrasement : le Hub renvoie la version qu'il a ouverte.
    if (patch.baseUpdatedAt && patch.baseUpdatedAt !== current.updatedAt) {
      return { ok: false, error: 'conflict', quote: current };
    }
    var updated = applyQuotePatch_(current, patch, new Date().toISOString());
    var cells = quoteRow_(updated).map(function (value, index) {
      return index === 1 ? current.createdAt && new Date(current.createdAt) : safeCell_(value);
    });
    sheet.getRange(row, 1, 1, cells.length).setValues([cells]);
    SpreadsheetApp.flush();
    return { ok: true, quote: updated };
  } finally {
    lock.releaseLock();
  }
}

/** Retire les devis plus vieux que la durée de rétention (sauf les statuts listés dans keepStatuses). */
function purgeStaleQuotes_(cutoff) {
  var sheet = getSpreadsheet_().getSheetByName(QUOTE_CONFIG.sheetName);
  if (!sheet || sheet.getLastRow() < 2) return;
  var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 9).getValues();
  for (var i = values.length - 1; i >= 0; i--) {
    var date = values[i][1];
    var status = values[i][2];
    if (date instanceof Date && date < cutoff && QUOTE_CONFIG.keepStatuses.indexOf(status) < 0) {
      sheet.deleteRow(i + 2);
    }
  }
}

/* ------------------------------------------------------------------ */
/* API d'administration pour le Hub                                    */
/* ------------------------------------------------------------------ */

/** À lancer manuellement UNE fois (puis pour changer la clé). Affiche la clé dans le journal. */
function setupAdminKey() {
  var key = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
  PropertiesService.getScriptProperties().setProperty(QUOTE_CONFIG.adminKeyProperty, key);
  Logger.log('Clé d’accès du Hub aux devis (à coller dans Hub → Paramètres → Devis) :');
  Logger.log(key);
  Logger.log('Gardez-la secrète. Relancer cette fonction crée une nouvelle clé et invalide l’ancienne.');
}

/** Initialise (ou complète) les feuilles « Devis générés » et « Tarifs ». Sans risque à relancer. */
function setupQuotes() {
  ensureQuoteSheets_(getSpreadsheet_());
  Logger.log('Feuilles « ' + QUOTE_CONFIG.sheetName + ' » et « ' + QUOTE_CONFIG.tariffSheetName + ' » prêtes.');
}

function jsonOut_(object) {
  return ContentService.createTextOutput(JSON.stringify(object)).setMimeType(ContentService.MimeType.JSON);
}

/** Retourne null si la clé est valide, sinon un code d'erreur. */
function checkAdminKey_(provided) {
  var stored = PropertiesService.getScriptProperties().getProperty(QUOTE_CONFIG.adminKeyProperty);
  if (!stored) return 'admin_not_configured';
  var cache = CacheService.getScriptCache();
  var failures = Number(cache.get('vas_admin_fail') || 0);
  if (failures >= QUOTE_CONFIG.maxFailedKeyAttempts) return 'too_many_attempts';
  if (!provided || !constantTimeEquals_(provided, stored)) {
    cache.put('vas_admin_fail', String(failures + 1), 900);
    return 'unauthorized';
  }
  if (failures) cache.remove('vas_admin_fail');
  return null;
}

function handleQuoteAdmin_(p) {
  try {
    var denied = checkAdminKey_(field_(p, 'adminKey'));
    if (denied) return jsonOut_({ ok: false, error: denied });

    var action = field_(p, 'action');
    if (action === 'quotes.ping') {
      return jsonOut_({ ok: true, statuses: QUOTE_CONFIG.statuses, currency: QUOTE_CONFIG.currency });
    }
    if (action === 'quotes.list') {
      return jsonOut_({ ok: true, quotes: listQuotes_(), statuses: QUOTE_CONFIG.statuses, currency: QUOTE_CONFIG.currency });
    }
    if (action === 'quotes.update') {
      var payload = JSON.parse(field_(p, 'payload') || '{}');
      return jsonOut_(updateQuote_(cleanText_(payload.number, 40), payload.patch || {}));
    }
    return jsonOut_({ ok: false, error: 'unknown_action' });
  } catch (err) {
    // Aucun contenu client dans les journaux.
    console.error('Quote admin failed: ' + String((err && err.message) || 'unknown error'));
    return jsonOut_({ ok: false, error: 'server_error' });
  }
}
