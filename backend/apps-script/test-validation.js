'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(__dirname + '/Code.gs', 'utf8');
const sandbox = {
  Utilities: {
    base64Decode(value) { return Array.from(Buffer.from(value, 'base64')); },
    newBlob(bytes, type, name) { return { bytes, type, name, getName() { return name; } }; },
    formatDate() { return '06/11/2026 21:57'; },
    DigestAlgorithm: { SHA_256: 'SHA_256' }
  },
  HtmlService: {
    XFrameOptionsMode: { ALLOWALL: 'ALLOWALL' },
    createHtmlOutput(html) {
      return {
        html,
        setTitle(title) { this.title = title; return this; },
        setXFrameOptionsMode(mode) { this.frameMode = mode; return this; }
      };
    }
  }
};
vm.createContext(sandbox);
vm.runInContext(source, sandbox);
vm.runInContext(fs.readFileSync(__dirname + '/Quotes.gs', 'utf8'), sandbox);

assert.equal(sandbox.validEmail_('client@example.com'), true);
assert.equal(sandbox.validEmail_('not-an-email'), false);
assert.equal(sandbox.field_({ multiselect: ['first', 'second'] }, 'multiselect'), 'first');
assert.equal(sandbox.safeSubject_('Projet\n test — Vasilías').includes('\n'), false);
assert.equal(sandbox.safeFilename_('../reference.png').includes('/'), false);
assert.equal(sandbox.safeCell_('=IMPORTXML("bad")').startsWith("'"), true);
assert.equal(sandbox.safeCell_('Une demande simple'), 'Une demande simple');

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p6sAAAAASUVORK5CYII=', 'base64');
const files = sandbox.quoteAttachments_({
  attachmentCount: '1',
  gasFile0Name: 'reference.png',
  gasFile0Type: 'image/png',
  gasFile0Data: png.toString('base64')
});
assert.equal(files.length, 1);
assert.equal(files[0].name, 'reference.png');
assert.equal(files[0].type, 'image/png');
assert.throws(() => sandbox.quoteAttachments_({ attachmentCount: '6' }), /Invalid attachment count/);
assert.throws(() => sandbox.quoteAttachments_({
  attachmentCount: '1', gasFile0Name: 'malware.exe', gasFile0Type: 'application/octet-stream', gasFile0Data: 'aGVsbG8='
}), /Invalid attachment/);

assert.match(source, /consent !== 'accepté'/);
assert.match(source, /function setupStorage\(\)/);
assert.match(source, /function purgeOldSubmissions\(\)/);
assert.match(source, /MailApp\.sendEmail/);
const response = sandbox.responsePage_(true, 'quote', 'nonce-123');
assert.match(response.html, /window\.top\.postMessage/);
assert.match(response.html, /vasilias-studio\.github\.io/);
assert.match(response.html, /nonce-123/);
assert.match(response.html, /form-response\.html/);
assert.match(response.html, /vasilias-form-response/);
assert.match(response.html, /,"\*"\)/);
assert.equal(response.frameMode, 'ALLOWALL');

const quoteSummary = sandbox.parseQuoteSummary_(JSON.stringify({
  project: { categories: ['Identité visuelle'], deliverables: ['Icône de marque'], description: 'Création du logo' },
  budget: '450 000 à 800 000 Ar', deadline: 'Dès que possible', styles: ['Minimaliste']
}));
assert.deepEqual(JSON.parse(JSON.stringify(quoteSummary.project.categories)), ['Identité visuelle']);
assert.equal(sandbox.emailRows_([['Catégories', quoteSummary.project.categories]])[0].value, 'Identité visuelle');
assert.equal(sandbox.escapeEmailHtml_('<script>"x"</script>'), '&lt;script&gt;&quot;x&quot;&lt;/script&gt;');
const notification = sandbox.buildNotificationHtml_('Nouvelle demande de devis', 'test-id', new Date('2026-11-06T18:57:00Z'), [
  { title: 'PROJET', rows: [{ label: 'Catégories', value: 'Identité visuelle' }] }
]);
assert.match(notification, /PROJET/);
assert.match(notification, /Identité visuelle/);
assert.doesNotMatch(notification, /\{"project"/);

// ---------------------------------------------------------------------------
// Devis automatiques (Quotes.gs)
// ---------------------------------------------------------------------------
assert.equal(sandbox.formatQuoteNumber_('DEV', 2026, 7), 'DEV-2026-007');
assert.equal(sandbox.formatQuoteNumber_('DEV', 2026, 1234), 'DEV-2026-1234');
assert.equal(sandbox.toAmount_('150 000', false), 150000);
assert.equal(sandbox.toAmount_('1 500,6', false), 1501);
assert.equal(sandbox.toAmount_('', false), null);
assert.equal(sandbox.toAmount_('abc', false), null);
assert.equal(sandbox.toAmount_(-5, true), null);
assert.equal(sandbox.toAmount_(0, false), null);
assert.equal(sandbox.toAmount_(0, true), 0);

const tariffs = { 'logo principal': { price: 300000, unit: 'forfait', description: 'Création du logo' } };
const requested = { project: { deliverables: ['Logo principal', 'Flyer'], otherProject: 'Habillage de véhicule' } };
const builtLines = JSON.parse(JSON.stringify(sandbox.buildQuoteLines_(requested, tariffs)));
assert.equal(builtLines.length, 3);
assert.equal(builtLines[0].unitPrice, 300000);
assert.equal(builtLines[0].description, 'Création du logo');
assert.equal(builtLines[1].unitPrice, null, 'une prestation sans tarif reste à chiffrer');
assert.equal(builtLines[2].label, 'Prestation spécifique');
const fallbackLines = sandbox.buildQuoteLines_({ project: { description: 'Un site vitrine' } }, {});
assert.equal(fallbackLines.length, 1);
assert.equal(fallbackLines[0].label, 'Prestation à définir');
assert.equal(sandbox.buildQuoteLines_(null, null).length, 1);

const totals = JSON.parse(JSON.stringify(sandbox.computeQuoteTotals_([
  { quantity: 1, unitPrice: 100000 }, { quantity: 2, unitPrice: 50000 }, { quantity: 1, unitPrice: null }
], 20000, 20)));
assert.deepEqual(totals, { subtotal: 200000, discount: 20000, taxRate: 20, tax: 36000, total: 216000, unpricedCount: 1 });
assert.equal(sandbox.computeQuoteTotals_([{ quantity: 1, unitPrice: 1000 }], 999999, 0).total, 0, 'la remise ne dépasse jamais le sous-total');
assert.equal(sandbox.computeQuoteTotals_([{ quantity: 1, unitPrice: 1000 }], 0, 500).taxRate, 100);
assert.equal(sandbox.quoteStatusFor_({ unpricedCount: 1, subtotal: 5000 }), 'À chiffrer');
assert.equal(sandbox.quoteStatusFor_({ unpricedCount: 0, subtotal: 5000 }), 'Brouillon');
assert.equal(sandbox.quoteStatusFor_({ unpricedCount: 0, subtotal: 0 }), 'À chiffrer');
assert.equal(sandbox.constantTimeEquals_('abc', 'abc'), true);
assert.equal(sandbox.constantTimeEquals_('abc', 'abd'), false);
assert.equal(sandbox.constantTimeEquals_('abc', 'abcd'), false);

const baseQuote = {
  number: 'DEV-2026-001', status: 'À chiffrer', createdAt: '2026-11-06T10:00:00.000Z', issuedAt: '2026-11-06T10:00:00.000Z',
  validityDays: 30, client: { name: 'Marie', company: 'Orquid', email: 'marie@example.com', whatsapp: '+261', website: '' },
  lines: builtLines, discount: 0, taxRate: 0, notes: '', conditions: '', history: [], updatedAt: '2026-11-06T10:00:00.000Z'
};
const priced = sandbox.applyQuotePatch_(baseQuote, {
  lines: [{ label: 'Logo principal', quantity: 1, unitPrice: '300 000' }, { label: 'Flyer\u0007', quantity: 2, unitPrice: 40000, unit: 'pièce' }],
  notes: 'Merci de confirmer'
}, '2026-11-07T08:00:00.000Z');
assert.equal(priced.number, 'DEV-2026-001', 'le numéro ne change jamais');
assert.equal(priced.status, 'Brouillon', 'tout chiffré => brouillon automatiquement');
assert.equal(priced.totals.total, 380000);
assert.equal(priced.lines[1].label, 'Flyer', 'caractères de contrôle retirés');
assert.equal(priced.history.length, 1);
assert.match(priced.history[0].event, /statut : À chiffrer → Brouillon/);
assert.equal(priced.validUntil, '2026-12-06T10:00:00.000Z');
assert.equal(baseQuote.status, 'À chiffrer', 'le devis d’origine n’est pas modifié');
const sent = sandbox.applyQuotePatch_(priced, { status: 'Envoyé', validityDays: 15 }, '2026-11-08T08:00:00.000Z');
assert.equal(sent.status, 'Envoyé');
assert.equal(sent.validUntil, '2026-11-21T10:00:00.000Z');
const edited = sandbox.applyQuotePatch_(sent, { discount: 30000 }, '2026-11-09T08:00:00.000Z');
assert.equal(edited.status, 'Envoyé', 'un statut manuel n’est pas recalculé');
assert.equal(edited.totals.total, 350000);
assert.throws(() => sandbox.applyQuotePatch_(baseQuote, { status: 'Hacké' }, 'x'), /Invalid status/);
assert.throws(() => sandbox.applyQuotePatch_(baseQuote, { lines: [{ label: '' }] }, 'x'), /at least one line/);
const badEmail = sandbox.applyQuotePatch_(baseQuote, { client: { name: 'Marie', email: 'pas-un-email' } }, '2026-11-07T08:00:00.000Z');
assert.equal(badEmail.client.email, 'marie@example.com', 'un e-mail invalide ne remplace pas l’existant');

// API d’administration : clé secrète, verrouillage après échecs répétés, aiguillage de doPost.
const cacheStore = {};
sandbox.CacheService = { getScriptCache: () => ({ get: (k) => cacheStore[k] || null, put: (k, v) => { cacheStore[k] = v; }, remove: (k) => { delete cacheStore[k]; } }) };
let storedKey = 'k'.repeat(64);
sandbox.PropertiesService = { getScriptProperties: () => ({ getProperty: (k) => (k === 'VAS_ADMIN_KEY' ? storedKey : null) }) };
sandbox.ContentService = { MimeType: { JSON: 'JSON' }, createTextOutput: (text) => ({ text, setMimeType() { return this; } }) };
const call = (params) => JSON.parse(sandbox.doPost({ parameter: params }).text);
assert.equal(call({ action: 'quotes.list', adminKey: 'mauvaise' }).error, 'unauthorized');
assert.equal(call({ action: 'quotes.list' }).error, 'unauthorized');
assert.equal(call({ action: 'quotes.ping', adminKey: storedKey }).ok, true);
assert.equal(call({ action: 'quotes.nope', adminKey: storedKey }).error, 'unknown_action');
for (let i = 0; i < 8; i++) call({ action: 'quotes.list', adminKey: 'x' + i });
assert.equal(call({ action: 'quotes.ping', adminKey: storedKey }).error, 'too_many_attempts', 'verrouillage anti force brute');
Object.keys(cacheStore).forEach((k) => delete cacheStore[k]);
storedKey = '';
assert.equal(call({ action: 'quotes.ping', adminKey: 'peu importe' }).error, 'admin_not_configured');


// Intégration avec une feuille Google simulée : numérotation, grille de tarifs, lecture, mise à jour, conflit, purge.
function makeSheet() {
  const rows = [];
  const cellAt = (r, c) => { const row = rows[r - 1]; return row && row[c - 1] !== undefined ? row[c - 1] : ''; };
  return {
    rows,
    getLastRow: () => rows.length,
    getLastColumn: () => rows.reduce((m, r) => Math.max(m, r.length), 0),
    setFrozenRows() {},
    appendRow(r) { rows.push(r.slice()); },
    deleteRow(i) { rows.splice(i - 1, 1); },
    getRange(r, c, nr = 1, nc = 1) {
      return {
        getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => cellAt(r + i, c + j))),
        getValue: () => cellAt(r, c),
        setValues(v) { v.forEach((vr, i) => { rows[r - 1 + i] = rows[r - 1 + i] || []; vr.forEach((x, j) => { rows[r - 1 + i][c - 1 + j] = x; }); }); }
      };
    }
  };
}
const fakeSheets = {};
const fakeBook = {
  getSheetByName: (n) => fakeSheets[n] || null,
  insertSheet(n) { fakeSheets[n] = makeSheet(); return fakeSheets[n]; }
};
const propStore = { VAS_FORM_SPREADSHEET_ID: 'sheet-id', VAS_ADMIN_KEY: 'a'.repeat(64) };
sandbox.PropertiesService = { getScriptProperties: () => ({ getProperty: (k) => propStore[k] || null, setProperty: (k, v) => { propStore[k] = v; } }) };
sandbox.SpreadsheetApp = { openById: () => fakeBook, flush() {} };
sandbox.LockService = { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) };
sandbox.Session = { getScriptTimeZone: () => 'UTC' };
sandbox.Utilities.formatDate = (d, tz, fmt) => (fmt === 'yyyy' ? String(d.getUTCFullYear()) : '06/11/2026 21:57');

fakeBook.insertSheet('Devis');
sandbox.ensureQuoteSheets_(fakeBook);
const catalogSize = 3 + 8 + 6 + 5 + 7 + 5 + 1; // 3 packs + 31 prestations + option « Fichiers sources »
assert.equal(fakeSheets['Tarifs'].rows.length, catalogSize + 1, 'la grille de tarifs est préremplie avec toutes les prestations du formulaire');
const logoRow = fakeSheets['Tarifs'].rows.find((r) => r[1] === 'Logo principal');
logoRow[2] = '300 000';

const meta = (at) => ({ requestId: 'req-' + at, receivedAt: new Date(at), name: 'Marie Rakoto', email: 'marie@example.com', phone: '+261 34 00 000 00', company: 'Orquid Spices', website: '' });
const q1 = sandbox.createQuoteFromRequest_({ project: { deliverables: ['Logo principal'], categories: ['Identité visuelle'] }, budget: '200 000 à 450 000 Ar' }, meta('2026-11-06T10:00:00Z'));
assert.equal(q1.number, 'DEV-2026-001');
assert.equal(q1.status, 'Brouillon');
assert.equal(q1.totals.total, 300000);
const q2 = sandbox.createQuoteFromRequest_({ project: { deliverables: ['Flyer'] } }, meta('2026-11-07T10:00:00Z'));
assert.equal(q2.number, 'DEV-2026-002');
assert.equal(q2.status, 'À chiffrer', 'sans tarif, le devis reste à chiffrer');
assert.equal(fakeSheets['Devis générés'].rows.length, 3);
assert.equal(fakeSheets['Devis générés'].rows[1][2], 'Brouillon');

let listed = call({ action: 'quotes.list', adminKey: 'a'.repeat(64) });
assert.equal(listed.ok, true);
assert.deepEqual(listed.quotes.map((q) => q.number), ['DEV-2026-002', 'DEV-2026-001'], 'les plus récents en premier');

const upd = call({ action: 'quotes.update', adminKey: 'a'.repeat(64), payload: JSON.stringify({ number: 'DEV-2026-002', patch: { baseUpdatedAt: q2.updatedAt, lines: [{ label: 'Flyer', quantity: 2, unitPrice: 75000 }] } }) });
assert.equal(upd.ok, true);
assert.equal(upd.quote.status, 'Brouillon', 'devis chiffré dans le Hub => brouillon');
assert.equal(fakeSheets['Devis générés'].rows[2][6], 150000, 'le total est recopié dans la feuille');
assert.equal(fakeSheets['Devis générés'].rows[2][2], 'Brouillon');
const stale = call({ action: 'quotes.update', adminKey: 'a'.repeat(64), payload: JSON.stringify({ number: 'DEV-2026-002', patch: { baseUpdatedAt: q2.updatedAt, status: 'Refusé' } }) });
assert.equal(stale.error, 'conflict', 'une version périmée n’écrase jamais une modification plus récente');
assert.equal(stale.quote.status, 'Brouillon');
assert.equal(call({ action: 'quotes.update', adminKey: 'a'.repeat(64), payload: JSON.stringify({ number: 'DEV-2099-999', patch: {} }) }).error, 'not_found');
assert.equal(call({ action: 'quotes.update', adminKey: 'a'.repeat(64), payload: '{pas du json' }).error, 'server_error');
call({ action: 'quotes.update', adminKey: 'a'.repeat(64), payload: JSON.stringify({ number: 'DEV-2026-001', patch: { status: 'Envoyé' } }) });

assert.equal(sandbox.QUOTE_CONFIG.keepStatuses.length, 0, 'par défaut, la rétention des devis suit la page confidentialité');
sandbox.QUOTE_CONFIG.keepStatuses = ['Envoyé'];
sandbox.purgeStaleQuotes_(new Date('2027-01-01T00:00:00Z'));
assert.deepEqual(fakeSheets['Devis générés'].rows.slice(1).map((r) => r[0]), ['DEV-2026-001'], 'un statut listé dans keepStatuses survit à la purge');
sandbox.QUOTE_CONFIG.keepStatuses = [];
sandbox.purgeStaleQuotes_(new Date('2027-01-01T00:00:00Z'));
assert.equal(fakeSheets['Devis générés'].rows.length, 1, 'sinon tout est purgé après la durée de rétention');


// Packs et fichiers sources.
const tariffRows = fakeSheets['Tarifs'].rows;
const packRow = tariffRows.find((r) => r[1] === 'Pack Prínkipas');
assert.equal(packRow[2], 450000, 'les packs sont préchiffrés dans la grille');
assert.equal(tariffRows.find((r) => r[1] === 'Pack Logo + Brandboard')[2], 200000);
assert.equal(tariffRows.find((r) => r[1] === 'Pack Vasilías')[2], 800000);
assert.match(tariffRows.find((r) => r[1] === 'Pack Logo + Brandboard')[4], /Fichiers sources non inclus/);
assert.equal(tariffRows.find((r) => r[1] === 'Fichiers sources')[2], '', 'le prix de l’option sources reste à saisir');
const YES = 'Oui, je souhaite les fichiers sources';
const NO = 'Non, les fichiers finaux me suffisent';

const qPack = sandbox.createQuoteFromRequest_({ project: { deliverables: ['Pack Prínkipas'] }, sourceFiles: YES }, meta('2026-11-08T10:00:00Z'));
assert.equal(qPack.lines.length, 1, 'Prínkipas inclut déjà les sources : pas de ligne en plus');
assert.equal(qPack.totals.total, 450000);
assert.equal(qPack.status, 'Brouillon', 'un pack seul est chiffré automatiquement');
assert.equal(qPack.request.sourceFiles, YES);
assert.match(qPack.lines[0].description, /Fichiers sources inclus/);

const qLogoSrc = sandbox.createQuoteFromRequest_({ project: { deliverables: ['Pack Logo + Brandboard'] }, sourceFiles: YES }, meta('2026-11-08T11:00:00Z'));
assert.deepEqual(Array.from(qLogoSrc.lines.map((l) => l.label)), ['Pack Logo + Brandboard', 'Fichiers sources'], 'sources demandées hors pack => ligne en option');
assert.equal(qLogoSrc.lines[1].unitPrice, null);
assert.equal(qLogoSrc.status, 'À chiffrer');
assert.equal(qLogoSrc.totals.total, 200000);

const qLogoNo = sandbox.createQuoteFromRequest_({ project: { deliverables: ['Pack Logo + Brandboard'] }, sourceFiles: NO }, meta('2026-11-08T12:00:00Z'));
assert.equal(qLogoNo.lines.length, 1);
assert.equal(qLogoNo.status, 'Brouillon');
assert.equal(sandbox.buildQuoteLines_({ project: { deliverables: ['Flyer'] }, sourceFiles: YES }, {}).length, 2, 'prestation individuelle + sources => ligne en option');
assert.equal(sandbox.buildQuoteLines_({ project: { deliverables: ['Flyer'] }, sourceFiles: 'Je ne sais pas encore' }, {}).length, 1);
assert.equal(sandbox.buildQuoteLines_({ project: { description: 'x' }, sourceFiles: YES }, {}).length, 2, 'même sans prestation choisie');

// Complément de la grille : ajoute ce qui manque, sans jamais toucher aux prix saisis.
const flyerIdx = tariffRows.findIndex((r) => r[1] === 'Flyer');
tariffRows.splice(flyerIdx, 1);
const packIdx = tariffRows.findIndex((r) => r[1] === 'Pack Vasilías');
tariffRows.splice(packIdx, 1);
assert.equal(tariffRows.length, catalogSize + 1 - 2);
sandbox.ensureQuoteSheets_(fakeBook, false);
assert.equal(tariffRows.length, catalogSize + 1 - 2, 'sans complément, rien n’est ajouté');
sandbox.ensureQuoteSheets_(fakeBook, true);
assert.equal(tariffRows.length, catalogSize + 1, 'le complément réajoute exactement les deux lignes manquantes');
assert.equal(tariffRows.find((r) => r[1] === 'Pack Vasilías')[2], 800000);
assert.equal(tariffRows.find((r) => r[1] === 'Logo principal')[2], '300 000', 'les prix saisis ne sont jamais écrasés');
sandbox.ensureQuoteSheets_(fakeBook, true);
assert.equal(tariffRows.length, catalogSize + 1, 'idempotent');

console.log('Apps Script static/unit checks passed: validation, private storage, retention, iframe response, readable HTML/text email layouts, and automatic quotes (pricing, patching, admin key).');
