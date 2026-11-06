'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(__dirname + '/Code.gs', 'utf8');
const sandbox = {
  Date,
  Utilities: {
    base64Decode: value => Array.from(Buffer.from(value, 'base64')),
    newBlob: (bytes, type, name) => ({ bytes, type, name, copyBlob() { return this; } })
  }
};
vm.createContext(sandbox);
vm.runInContext(source, sandbox);
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p6sAAAAASUVORK5CYII=', 'base64');
const base = {
  requestId: '12345678-1234-1234',
  startedAt: Date.now() - 10000,
  honeypot: '',
  privacyAccepted: true,
  client: { name: 'Test Client', email: 'client@example.com', whatsapp: '+261 34 12 345 67', company: 'Test Studio', website: 'https://example.com' },
  categories: ['identity', 'packaging'],
  otherProject: '',
  deliverables: ['identity::Logo principal', 'packaging::Design de boîte'],
  deliverablesDescription: 'Logo et boîte',
  budget: '200 000 à 450 000 Ar',
  deadline: 'Dans un mois',
  targetDate: '2026-12-01',
  projectDescription: 'Créer une identité et un emballage.',
  objectives: 'Clarifier la marque.',
  audience: 'Adultes',
  styles: ['Moderne', 'Élégant'],
  attachments: [{ name: 'reference.png', type: 'image/png', data: png.toString('base64'), size: png.length }]
};
const valid = sandbox.validatePayload_(base);
assert.equal(valid.client.email, 'client@example.com');
assert.equal(valid.categories.length, 2);
assert.equal(valid.attachments[0].name, 'reference.png');
assert.equal(sandbox.matchesFileSignature_('png', Array.from(png)), true);
assert.throws(() => sandbox.validatePayload_(Object.assign({}, base, { honeypot: 'bot' })), /validée/);
assert.throws(() => sandbox.validatePayload_(Object.assign({}, base, { client: Object.assign({}, base.client, { email: 'invalid' }) })), /e-mail/);
assert.throws(() => sandbox.validatePayload_(Object.assign({}, base, { deliverables: ['graphic::Option inconnue'] })), /prestation/);
assert.throws(() => sandbox.validatePayload_(Object.assign({}, base, { categories: ['other'], otherProject: '' })), /Précisez/);
assert.throws(() => sandbox.validatePayload_(Object.assign({}, base, { attachments: [{ name: 'bad.png', type: 'image/png', data: Buffer.from('not a png').toString('base64'), size: 9 }] })), /extension/);
console.log('Apps Script validation checks passed: valid quote, PNG signature, honeypot, email, option whitelist, other-project requirement, and spoofed file.');
