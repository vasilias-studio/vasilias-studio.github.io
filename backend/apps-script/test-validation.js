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
console.log('Apps Script static/unit checks passed: validation, private storage, retention, iframe response, and readable HTML/text email layouts.');
