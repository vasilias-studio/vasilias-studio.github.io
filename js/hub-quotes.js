/* ====================================================================
   Hub — onglet Devis
   Affiche et modifie les devis créés automatiquement par le formulaire du site.
   Les données restent dans le Google Sheet privé (Apps Script) : elles ne sont
   jamais écrites dans le dépôt public. Accès par clé secrète (Paramètres → Devis).
   Dépend des fonctions globales du Hub : $, $all, esc, ic, fillIcons, toast,
   modal, confirmModal, store, currentView.
==================================================================== */
(function () {
  'use strict';

  var KEY_LS = 'hub2_quote_key';
  var ISSUER_LS = 'hub2_quote_issuer';
  var PHONE_LS = 'hub2_quote_phone';
  var SITE_LS = 'hub2_quote_site';
  var PHONE_DEFAULT = '+261 38 85 825 16';
  var SITE_DEFAULT = 'vasilias-studio.github.io';
  var DEFAULT_STATUSES = ['À chiffrer', 'Brouillon', 'Envoyé', 'Accepté', 'Refusé', 'Expiré'];
  var STATUS_CLS = { 'À chiffrer': 'warn', 'Brouillon': 'neut', 'Envoyé': 'info', 'Accepté': 'ok', 'Refusé': 'err', 'Expiré': 'neut' };
  var ERRORS = {
    unauthorized: 'Clé refusée. Vérifiez la clé collée dans Paramètres → Devis.',
    admin_not_configured: 'La clé n’existe pas encore côté Apps Script : exécutez setupAdminKey() dans l’éditeur.',
    too_many_attempts: 'Trop d’essais avec une mauvaise clé. Réessayez dans 15 minutes.',
    not_found: 'Ce devis n’existe plus dans la feuille.',
    busy: 'Le serveur est occupé, réessayez dans un instant.',
    server_error: 'Erreur côté Apps Script. Consultez ses journaux d’exécution.',
    unknown_action: 'Le script Apps Script n’est pas à jour : ajoutez Quotes.gs puis redéployez une nouvelle version.',
    network: 'Impossible de joindre Apps Script. Vérifiez la connexion et que le déploiement est bien en accès « Tout le monde ».'
  };

  var st = { quotes: null, statuses: DEFAULT_STATUSES, filter: 'all', query: '', loading: false, error: '', open: null, dirty: false };

  /* ---------- utilitaires ---------- */
  function endpoint() { var c = window.VAS_FORMS_CONFIG; return (c && c.endpoint) || ''; }
  function adminKey() { return localStorage.getItem(KEY_LS) || ''; }
  function errMsg(code) { return ERRORS[code] || ('Erreur inattendue (' + code + ').'); }
  function ar(n) { return String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '\u202F') + ' Ar'; }
  function fdate(iso) {
    var d = new Date(iso);
    return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  function dayOf(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    var p = function (x) { return (x < 10 ? '0' : '') + x; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }
  function pill(status) { return '<span class="pill ' + (STATUS_CLS[status] || 'neut') + '">' + esc(status) + '</span>'; }
  function num(v) { var n = Number(String(v).replace(/[\s\u00A0\u202F]/g, '').replace(',', '.')); return isFinite(n) ? n : 0; }
  function findQuote(number) { return (st.quotes || []).filter(function (q) { return q.number === number; })[0] || null; }
  function viewActive() { return typeof currentView !== 'undefined' && currentView === 'quotes'; }

  function api(action, payload) {
    var body = new URLSearchParams();
    body.set('action', action);
    body.set('adminKey', adminKey());
    if (payload) body.set('payload', JSON.stringify(payload));
    // Requête « simple » (formulaire) : pas de pré-vérification CORS, le corps reste hors de l’URL.
    return fetch(endpoint(), { method: 'POST', body: body, redirect: 'follow', credentials: 'omit' })
      .then(function (r) { if (!r.ok) throw new Error('http'); return r.json(); });
  }

  /* ---------- calcul (identique au serveur, qui reste la référence) ---------- */
  function isPct(l) { return l.percent !== null && l.percent !== undefined; }
  function baseOf(lines) {
    var b = 0;
    lines.forEach(function (l) { if (!isPct(l) && l.unitPrice !== null && l.unitPrice !== undefined) b += Math.round(l.quantity * l.unitPrice); });
    return b;
  }
  function lineAmount(l, base) {
    if (isPct(l)) return Math.round(base * l.percent / 100 * l.quantity);
    if (l.unitPrice === null || l.unitPrice === undefined) return null;
    return Math.round(l.quantity * l.unitPrice);
  }
  function priceCell(l) { return isPct(l) ? String(l.percent).replace('.', ',') + '%' : (l.unitPrice === null || l.unitPrice === undefined ? '' : String(l.unitPrice)); }
  function totalsOf(lines, discount, rate) {
    var subtotal = 0, unpriced = 0, base = baseOf(lines);
    lines.forEach(function (l) {
      var a = lineAmount(l, base);
      if (a === null) unpriced++; else subtotal += a;
    });
    var disc = Math.min(Math.max(Math.round(discount || 0), 0), subtotal);
    var tr = Math.min(Math.max(rate || 0, 0), 100);
    var taxable = subtotal - disc;
    var tax = Math.round(taxable * tr / 100);
    return { subtotal: subtotal, discount: disc, taxRate: tr, tax: tax, total: taxable + tax, unpricedCount: unpriced };
  }

  /* ---------- styles ---------- */
  function injectCss() {
    if (document.getElementById('hubQuotesCss')) return;
    var s = document.createElement('style');
    s.id = 'hubQuotesCss';
    s.textContent =
      '.nav-btn .q-badge{margin-left:auto;min-width:20px;height:20px;padding:0 .35rem;border-radius:2px;background:var(--bronze);color:#fff;font-size:.7rem;font-weight:700;display:inline-flex;align-items:center;justify-content:center}' +
      '.nav-btn .q-badge[hidden]{display:none}' +
      '.qt-bar{display:flex;gap:.6rem;flex-wrap:wrap;align-items:center;margin:0 0 1rem}' +
      '.qt-bar .qt-in{width:auto;min-width:240px;flex:1 1 240px}' +
      '.qt-in{width:100%;padding:.55rem .75rem;border:1px solid var(--line-strong);border-radius:2px;background:var(--bg);font-size:.9rem}' +
      '.qt-in:focus{outline:2px solid var(--accent);outline-offset:1px}' +
      'textarea.qt-in{min-height:70px;resize:vertical}' +
      '.stat.qt-on{outline:2px solid var(--bronze);outline-offset:-2px}' +
      '.qt-list{display:flex;flex-direction:column;gap:.6rem}' +
      '.qt-row{display:flex;gap:1rem;justify-content:space-between;align-items:flex-start;width:100%;text-align:left;background:var(--bg);border:1px solid var(--line);border-radius:2px;padding:1rem 1.1rem;cursor:pointer}' +
      '.qt-row:hover{border-color:var(--bronze)}' +
      '.qt-main{display:flex;flex-direction:column;gap:.2rem;min-width:0}' +
      '.qt-main strong{font-size:.95rem;letter-spacing:.02em}' +
      '.qt-sub{font-size:.8125rem;color:var(--sub);overflow-wrap:anywhere}' +
      '.qt-side{display:flex;flex-direction:column;align-items:flex-end;gap:.3rem;flex:none}' +
      '.qt-amt{font-weight:600}' +
      '.qt-amt.todo{color:var(--warn);font-weight:600}' +
      '.qt-over{color:var(--err,#9B1C1C)}' +
      '.qt-head{display:flex;gap:.6rem;flex-wrap:wrap;align-items:center;justify-content:space-between;margin-bottom:1rem}' +
      '.qt-head h2{margin:0}' +
      '.qt-actions{display:flex;gap:.5rem;flex-wrap:wrap}' +
      '.qt-f{display:flex;flex-direction:column;gap:.25rem;font-size:.8125rem;color:var(--sub);margin-bottom:.75rem}' +
      '.qt-f span{font-weight:600}' +
      '.qt-g2{display:grid;grid-template-columns:1fr;gap:0 1rem}' +
      '@media(min-width:700px){.qt-g2{grid-template-columns:1fr 1fr}}' +
      '.qt-req dt{font-size:.6875rem;text-transform:uppercase;letter-spacing:.08em;color:var(--sub);margin-top:.7rem}' +
      '.qt-req dd{margin:.1rem 0 0;font-size:.9rem;white-space:pre-wrap;overflow-wrap:anywhere}' +
      '.qt-line{display:grid;grid-template-columns:1fr;gap:.4rem;padding:.8rem 0;border-top:1px solid var(--line)}' +
      '.qt-line.todo{background:linear-gradient(90deg,var(--warn-bg),transparent 40%)}' +
      '.qt-line .qt-n{display:grid;grid-template-columns:64px 88px minmax(110px,1fr) auto;gap:.5rem;align-items:end}' +
      '.stats.qt-stats{background:none;border:0;gap:.5rem;grid-template-columns:repeat(auto-fit,minmax(120px,1fr))}' +
      '.qt-stats .stat{border:1px solid var(--line)}' +
      '.qt-title{font-size:1.05rem;font-weight:700;letter-spacing:.04em;display:flex;align-items:center;gap:.6rem;flex-wrap:wrap}' +
      '@media(min-width:900px){.qt-line{grid-template-columns:2fr 3fr 3fr;align-items:end}}' +
      '.qt-tot{margin:1rem 0 0 auto;max-width:360px;font-size:.9rem}' +
      '.qt-tot div{display:flex;justify-content:space-between;gap:1rem;padding:.3rem 0}' +
      '.qt-tot .big{border-top:2px solid var(--ink);margin-top:.4rem;padding-top:.6rem;font-size:1.1rem;font-weight:700}' +
      '.qt-tot input{width:110px;text-align:right}' +
      '.qt-warn{background:var(--warn-bg);color:var(--warn);border:1px solid var(--warn-dot);border-radius:2px;padding:.6rem .8rem;font-size:.85rem;margin:.8rem 0}' +
      '.qt-hist{font-size:.8125rem;color:var(--sub);margin:.4rem 0 0;padding-left:1.1rem;line-height:1.7}' +
      '@media(max-width:600px){.qt-row{flex-direction:column}.qt-side{align-items:flex-start}}' +
      '.qt-chk{display:flex;align-items:flex-start;gap:.55rem;margin:.75rem 0 0;padding:.55rem .7rem;border:1px solid var(--line);border-radius:2px;background:var(--bg);font-size:.875rem;line-height:1.4;cursor:pointer}' +
      '.qt-chk:hover{border-color:var(--bronze)}' +
      '.qt-chk input{width:18px;height:18px;margin:.05rem 0 0;flex:none;accent-color:var(--bronze)}' +
      '.qt-sign-on{color:var(--bronze-text);font-weight:600}';
    document.head.appendChild(s);
  }

  /* ---------- chargement ---------- */
  function load(force) {
    if (st.loading) return Promise.resolve();
    if (!endpoint() || !adminKey()) return Promise.resolve();
    st.loading = true; st.error = '';
    return api('quotes.list').then(function (res) {
      if (!res.ok) { st.error = res.error || 'server_error'; return; }
      st.quotes = res.quotes || [];
      if (res.statuses && res.statuses.length) st.statuses = res.statuses;
    }).catch(function () { st.error = 'network'; })
      .then(function () { st.loading = false; refreshBadge(); render(); });
  }

  function refreshBadge() {
    var b = document.getElementById('qBadge');
    if (!b) return;
    var n = (st.quotes || []).filter(function (q) { return q.status === 'À chiffrer'; }).length;
    b.textContent = n;
    b.hidden = !n;
    b.setAttribute('aria-label', n + ' devis à chiffrer');
  }

  window.quotesBadgeRefresh = function () { if (endpoint() && adminKey()) load(true); };

  /* ---------- rendu ---------- */
  function render() {
    if (!viewActive()) return;
    if (st.open && findQuote(st.open)) renderDetail(findQuote(st.open)); else { st.open = null; renderList(); }
    if (typeof fillIcons === 'function') fillIcons($('#view'));
  }

  window.viewQuotes = function () {
    injectCss();
    st.open = null; st.dirty = false;
    var v = $('#view');
    if (!endpoint()) {
      v.innerHTML = '<div class="card"><h2>Formulaire non configuré</h2><p class="help">L’adresse Apps Script du site (<code>js/forms-config.js</code>) est vide : les devis ne peuvent pas être lus.</p></div>';
      return;
    }
    if (!adminKey()) { renderSetup(); return; }
    st.error = '';
    if (st.quotes === null) {
      v.innerHTML = '<div class="card" aria-busy="true"><p class="help">Chargement des devis…</p></div>';
      load(true);
    } else {
      render();
      load(true); // actualisation silencieuse
    }
  };

  function renderSetup() {
    $('#view').innerHTML =
      '<div class="card"><h2>Connecter le Hub aux devis</h2>' +
      '<p class="help">Les devis contiennent des données clients : ils restent dans votre Google Sheet privé et le Hub les lit avec une clé secrète. À faire une seule fois :</p>' +
      '<ol style="margin:.8rem 0 1rem 1.2rem;font-size:.9rem;line-height:1.9">' +
      '<li>Dans Apps Script, ajoutez le fichier <code>Quotes.gs</code> et remplacez <code>Code.gs</code> (dossier <code>backend/apps-script</code>).</li>' +
      '<li>Exécutez <code>setupQuotes()</code> puis <code>setupAdminKey()</code> et copiez la clé affichée dans le journal d’exécution.</li>' +
      '<li>Déployez une <strong>nouvelle version</strong> du Web App, puis collez la clé ci-dessous.</li></ol>' +
      '<label class="qt-f"><span>Clé d’accès aux devis</span><input class="qt-in" type="password" id="qtKeyIn" autocomplete="off" spellcheck="false"></label>' +
      '<button class="btn btn-primary" id="qtKeySave">Enregistrer et charger les devis</button>' +
      '<p class="help">La clé est conservée uniquement dans ce navigateur.</p></div>';
    $('#qtKeySave').addEventListener('click', function () {
      var k = $('#qtKeyIn').value.trim();
      if (!k) { toast('Collez d’abord la clé.', 'warn'); return; }
      localStorage.setItem(KEY_LS, k);
      st.quotes = null; st.error = '';
      window.viewQuotes();
    });
  }

  function matches(q, query) {
    if (!query) return true;
    var hay = [q.number, q.client && q.client.name, q.client && q.client.company, q.client && q.client.email,
      q.request && (q.request.categories || []).join(' ')].join(' ').toLowerCase();
    return hay.indexOf(query) >= 0;
  }

  function renderList() {
    var v = $('#view');
    if (st.error && st.quotes === null) {
      v.innerHTML = '<div class="card"><h2>Devis indisponibles</h2><p class="help">' + esc(errMsg(st.error)) + '</p>' +
        '<div class="qt-actions" style="margin-top:.8rem"><button class="btn btn-primary btn-sm" id="qtRetry">Réessayer</button>' +
        '<button class="btn btn-ghost btn-sm" id="qtChangeKey">Changer la clé</button></div></div>';
      $('#qtRetry').addEventListener('click', function () { st.error = ''; window.viewQuotes(); });
      $('#qtChangeKey').addEventListener('click', function () { renderSetup(); });
      return;
    }
    var all = st.quotes || [];
    var counts = {};
    all.forEach(function (q) { counts[q.status] = (counts[q.status] || 0) + 1; });
    var shown = all.filter(function (q) { return (st.filter === 'all' || q.status === st.filter) && matches(q, st.query); });

    var h = '';
    if (st.error) h += '<div class="qt-warn">' + esc(errMsg(st.error)) + ' Les données affichées peuvent être anciennes.</div>';
    h += '<div class="stats qt-stats" role="group" aria-label="Filtrer par statut">' +
      statBtn('all', 'Tous', all.length) +
      st.statuses.map(function (s) { return statBtn(s, s, counts[s] || 0); }).join('') + '</div>';
    h += '<div class="qt-bar"><input class="qt-in" type="search" id="qtSearch" placeholder="Rechercher : numéro, client, entreprise…" value="' + esc(st.query) + '" aria-label="Rechercher un devis">' +
      '<button class="btn btn-ghost btn-sm" id="qtRefresh">' + ic('refresh') + ' Actualiser</button></div>';
    if (!all.length) {
      h += '<div class="empty">Aucun devis pour l’instant. Un devis apparaît ici automatiquement dès qu’une demande est envoyée depuis le formulaire du site.</div>';
    } else if (!shown.length) {
      h += '<div class="empty">Aucun devis ne correspond à ce filtre.</div>';
    } else {
      h += '<div class="qt-list">' + shown.map(rowHtml).join('') + '</div>';
    }
    v.innerHTML = h;

    $all('.stat[data-f]', v).forEach(function (b) { b.addEventListener('click', function () { st.filter = b.getAttribute('data-f'); renderList(); fillIcons($('#view')); }); });
    $all('.qt-row', v).forEach(function (b) { b.addEventListener('click', function () { st.open = b.getAttribute('data-n'); st.dirty = false; render(); window.scrollTo(0, 0); }); });
    $('#qtRefresh').addEventListener('click', function () { load(true); toast('Actualisation…'); });
    var search = $('#qtSearch');
    search.addEventListener('input', function () {
      st.query = search.value.trim().toLowerCase();
      var pos = search.selectionStart;
      renderList(); fillIcons($('#view'));
      var again = $('#qtSearch'); again.focus(); try { again.setSelectionRange(pos, pos); } catch (e) { /* ignore */ }
    });
  }

  function statBtn(f, label, n) {
    return '<button type="button" class="stat' + (st.filter === f ? ' qt-on' : '') + '" data-f="' + esc(f) + '"><span class="v">' + n + '</span><span class="l">' + esc(label) + '</span></button>';
  }

  function rowHtml(q) {
    var t = q.totals || {};
    var todo = t.unpricedCount > 0 || !t.subtotal;
    var cats = q.request && q.request.categories && q.request.categories.length ? q.request.categories.join(', ') : '';
    var overdue = q.status === 'Envoyé' && new Date(q.validUntil) < new Date();
    return '<button type="button" class="qt-row" data-n="' + esc(q.number) + '">' +
      '<span class="qt-main"><strong>' + esc(q.number) + '</strong>' +
      '<span>' + esc((q.client && q.client.name) || '—') + (q.client && q.client.company ? ' · ' + esc(q.client.company) : '') + '</span>' +
      (cats ? '<span class="qt-sub">' + esc(cats) + '</span>' : '') + '</span>' +
      '<span class="qt-side">' + pill(q.status) +
      '<span class="qt-amt' + (todo ? ' todo' : '') + '">' + (todo ? 'À chiffrer' : esc(ar(t.total))) + '</span>' +
      '<span class="qt-sub' + (overdue ? ' qt-over' : '') + '">' + esc(fdate(q.createdAt)) + (overdue ? ' · échéance dépassée' : '') + '</span></span></button>';
  }

  /* ---------- détail / édition ---------- */
  function field(label, name, value, type, extra) {
    return '<label class="qt-f"><span>' + esc(label) + '</span><input class="qt-in" data-f="' + name + '" type="' + (type || 'text') + '" value="' + esc(value) + '" ' + (extra || '') + '></label>';
  }

  function lineHtml(l, i, base) {
    var amount = lineAmount(l, base || 0);
    var todo = amount === null;
    var total = todo ? 'À définir' : ar(amount) + (isPct(l) ? ' (' + String(l.percent).replace('.', ',') + ' % du total des prestations)' : '');
    return '<div class="qt-line' + (todo ? ' todo' : '') + '" data-i="' + i + '">' +
      '<label class="qt-f" style="margin:0"><span>Désignation</span><input class="qt-in" data-l="label" type="text" maxlength="200" value="' + esc(l.label) + '"></label>' +
      '<label class="qt-f" style="margin:0"><span>Description</span><input class="qt-in" data-l="description" type="text" maxlength="600" value="' + esc(l.description) + '"></label>' +
      '<div class="qt-n">' +
      '<label class="qt-f" style="margin:0"><span>Qté</span><input class="qt-in" data-l="quantity" type="number" min="0.01" step="any" inputmode="decimal" value="' + esc(l.quantity) + '"></label>' +
      '<label class="qt-f" style="margin:0"><span>Unité</span><input class="qt-in" data-l="unit" type="text" maxlength="20" value="' + esc(l.unit) + '"></label>' +
      '<label class="qt-f" style="margin:0"><span>Prix (Ar ou %)</span><input class="qt-in" data-l="unitPrice" type="text" inputmode="decimal" autocomplete="off" placeholder="À chiffrer ou 20%" value="' + esc(priceCell(l)) + '"></label>' +
      '<button type="button" class="btn btn-ghost btn-sm" data-del="' + i + '" aria-label="Supprimer la ligne ' + (i + 1) + '">' + ic('close') + '</button></div>' +
      '<div class="qt-sub" data-lt="' + i + '">Total ligne : ' + esc(total) + '</div></div>';
  }

  function reqHtml(r) {
    r = r || {};
    function row(label, v) { return v && String(v).length ? '<dt>' + esc(label) + '</dt><dd>' + esc(Array.isArray(v) ? v.join(', ') : v) + '</dd>' : ''; }
    var html = row('Catégories', r.categories) + row('Budget indiqué par le client', r.budget) + row('Délai souhaité', r.deadline) + row('Date précise', r.targetDate) +
      row('Description du projet', r.description) + row('Précisions sur les livrables', r.deliverablesDescription) + row('Fichiers sources', r.sourceFiles) + row('Objectifs', r.objectives) + row('Public cible', r.audience) + row('Style graphique', r.styles);
    return html ? '<dl class="qt-req">' + html + '</dl>' : '<p class="help">Aucun détail enregistré.</p>';
  }

  function contactLinks(q) {
    var c = q.client || {}, out = '';
    if (c.email) {
      var subject = 'Devis ' + q.number + ' — Vasilías Studio';
      var body = 'Bonjour ' + (c.name || '') + ',\n\nMerci pour votre demande. Veuillez trouver ci-joint le devis ' + q.number + '.\nN’hésitez pas à me poser vos questions.\n\nCordialement,\nVasilías Studio';
      out += '<a class="btn btn-ghost btn-sm" href="mailto:' + encodeURIComponent(c.email).replace('%40', '@') + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body) + '">E-mail au client</a>';
    }
    var digits = String(c.whatsapp || '').replace(/[^\d]/g, '');
    if (digits.length >= 9) {
      if (digits.charAt(0) === '0') digits = '261' + digits.slice(1); // numéro local malgache
      out += '<a class="btn btn-ghost btn-sm" target="_blank" rel="noopener noreferrer" href="https://wa.me/' + digits + '">WhatsApp</a>';
    }
    return out;
  }

  function renderDetail(q) {
    var c = q.client || {};
    var lines = (q.lines || []).map(function (l) { return { label: l.label, description: l.description, quantity: l.quantity, unit: l.unit, unitPrice: l.unitPrice, percent: isPct(l) ? l.percent : null }; });
    var base0 = baseOf(lines);
    var h = '<div class="qt-head"><div><button type="button" class="btn btn-ghost btn-sm" id="qtBack">← Tous les devis</button></div>' +
      '<div class="qt-actions">' + contactLinks(q) + '<button type="button" class="btn btn-ghost btn-sm" id="qtPreview">' + ic('description') + ' Aperçu / PDF</button>' +
      '<button type="button" class="btn btn-primary btn-sm" id="qtSave">' + ic('check') + ' Enregistrer</button></div></div>' +
      '<div class="card"><div class="qt-head" style="margin:0"><div class="qt-title">' + esc(q.number) + ' ' + pill(q.status) + '</div>' +
      '<span class="qt-sub">Créé le ' + esc(fdate(q.createdAt)) + (q.auto ? ' · automatiquement depuis le formulaire' : '') + '</span></div></div>' +
      '<form id="qtForm" autocomplete="off" novalidate>' +
      '<div class="grid2"><div class="card"><h2>Client</h2>' +
      field('Nom', 'cName', c.name, 'text', 'maxlength="120"') + field('Entreprise ou marque', 'cCompany', c.company, 'text', 'maxlength="120"') +
      '<div class="qt-g2">' + field('E-mail', 'cEmail', c.email, 'email', 'maxlength="254"') + field('WhatsApp', 'cWhatsapp', c.whatsapp, 'text', 'maxlength="40"') + '</div>' +
      field('Site ou réseau social', 'cWebsite', c.website, 'text', 'maxlength="500"') + '</div>' +
      '<div class="card"><h2>Demande du client</h2>' + reqHtml(q.request) + '</div></div>' +
      '<div class="card"><h2>Lignes du devis</h2><p class="help">Les prix viennent de la feuille « Tarifs ». Une ligne sans prix reste « à chiffrer ».</p>' +
      '<div id="qtLines">' + lines.map(function (l, i) { return lineHtml(l, i, base0); }).join('') + '</div>' +
      '<button type="button" class="btn btn-ghost btn-sm" id="qtAdd" style="margin-top:.6rem">' + ic('add') + ' Ajouter une ligne</button>' +
      '<div class="qt-warn" id="qtTodoWarn" hidden></div>' +
      '<div class="qt-tot" id="qtTot"></div></div>' +
      '<div class="grid2"><div class="card"><h2>Suivi</h2>' +
      '<label class="qt-f"><span>Statut</span><select class="qt-in" data-f="status">' + st.statuses.map(function (s) { return '<option' + (s === q.status ? ' selected' : '') + '>' + esc(s) + '</option>'; }).join('') + '</select></label>' +
      '<div class="qt-g2">' + field('Date d’émission', 'issuedAt', dayOf(q.issuedAt), 'date') + field('Validité (jours)', 'validityDays', q.validityDays, 'number', 'min="1" max="365" step="1"') + '</div>' +
      '<p class="help">Valable jusqu’au <strong id="qtUntil"></strong>.</p>' +
      '<label class="qt-chk"><input type="checkbox" id="qtSign"' + (signatureEnabled(q.number, q.status) ? ' checked' : '') + '>' +
      '<span>Ajouter ma signature sur ce devis' + (q.status === 'Accepté' ? ' <span class="qt-sign-on">(devis validé : signé automatiquement)</span>' : '') + '</span></label></div>' +
      '<div class="card"><h2>Mentions sur le devis</h2>' +
      '<label class="qt-f"><span>Remarques</span><textarea class="qt-in" data-f="notes" maxlength="2000">' + esc(q.notes) + '</textarea></label>' +
      '<label class="qt-f"><span>Conditions de règlement</span><textarea class="qt-in" data-f="conditions" maxlength="3000" style="min-height:150px" placeholder="Une condition par ligne, précédée de « • » pour une liste à puces.">' + esc(q.conditions) + '</textarea></label>' +
      '<div class="qt-actions"><button type="button" class="btn btn-ghost btn-sm" id="qtTermsFill">' + ic('add') + ' Insérer les conditions par défaut</button>' +
      '<button type="button" class="btn btn-ghost btn-sm" id="qtTermsClear">Vider</button>' +
      '<span class="help" style="margin:0;align-self:center">Conditions par défaut modifiables dans Paramètres → Devis.</span></div></div></div>' +
      '<div class="card"><h2>Coordonnées de paiement</h2>' +
      '<p class="help">Coordonnées de paiement imprimées en bas des devis et des reçus, sur deux colonnes. Le téléphone et le site sont imprimés en haut, sous l’e-mail. Enregistrés sur cet appareil et appliqués à tous les devis.</p>' +
      '<div class="qt-g2">' +
      '<label class="qt-f"><span>Mobile Money</span><textarea class="qt-in" id="qtPayMomo" maxlength="220" rows="2" style="min-height:54px;resize:vertical" placeholder="' + PAYCO_FIELDS[0].ph + '" value="' + esc(payCo().momo) + '"></textarea></label>' +
      '<label class="qt-f"><span>Compte bancaire</span><textarea class="qt-in" id="qtPayBank" maxlength="220" rows="2" style="min-height:54px;resize:vertical" placeholder="' + PAYCO_FIELDS[1].ph + '" value="' + esc(payCo().bank) + '"></textarea></label></div>' +
      '<label class="qt-f"><span>Au nom de</span><textarea class="qt-in" id="qtPayHolder" maxlength="220" rows="2" style="min-height:54px;resize:vertical" placeholder="' + PAYCO_FIELDS[2].ph + '" value="' + esc(payCo().holder) + '"></textarea></label>' +
      '<div class="qt-g2" style="margin-top:.8rem">' +
      '<label class="qt-f"><span>Téléphone (en-tête)</span><input class="qt-in" type="tel" id="qtPhone" maxlength="40" value="' + esc(issuer().phone) + '" placeholder="' + PHONE_DEFAULT + '"></label>' +
      '<label class="qt-f"><span>Site web (en-tête)</span><input class="qt-in" type="text" id="qtSite" maxlength="60" value="' + esc(issuer().site) + '" placeholder="' + SITE_DEFAULT + '"></label></div>' +
      '<div class="qt-actions"><button type="button" class="btn btn-ghost btn-sm" id="qtPayCoSave">' + ic('check') + ' Enregistrer les coordonnées</button>' +
      '<span class="help" style="margin:0;align-self:center">Message de confirmation ajouté automatiquement en bas de page.</span></div></div>' +
      '</form>' +
      '<div class="card" id="qtPay"></div>' +
      '<div class="card"><h2>Historique</h2><ul class="qt-hist">' +
      (q.history || []).slice().reverse().map(function (e) { return '<li>' + esc(fdate(e.at)) + ' — ' + esc(e.event) + '</li>'; }).join('') + '</ul></div>';
    $('#view').innerHTML = h;
    st.work = { rate: q.taxRate || 0, discount: q.discount || 0, lines: lines };
    paintTotals(q);
    paintPayments(q);
    bindPayments(q);

    $('#qtBack').addEventListener('click', function () {
      if (!st.dirty) { st.open = null; render(); return; }
      confirmModal('Quitter sans enregistrer ?', 'Les modifications de ce devis seront perdues.', function () { st.open = null; st.dirty = false; render(); });
    });
    $('#qtSave').addEventListener('click', function () { save(q); });
    $('#qtPreview').addEventListener('click', function () {
      var sb = document.getElementById('qtSign');
      preview(q, sb ? !!sb.checked : undefined);
    });
    $('#qtTermsFill').addEventListener('click', function () {
      var ta = $('#qtForm [data-f="conditions"]');
      if (!ta) return;
      var def = termsDefault();
      if (ta.value.trim() && !confirm('Remplacer les conditions actuelles par les conditions par défaut ?')) return;
      ta.value = def;
      st.dirty = true;
      toast('Conditions par défaut insérées. Pensez à enregistrer le devis.', 'ok');
    });
    $('#qtTermsClear').addEventListener('click', function () {
      var ta = $('#qtForm [data-f="conditions"]');
      if (!ta) return;
      ta.value = '';
      st.dirty = true;
      toast('Conditions vidées.', 'ok');
    });
    $('#qtPayCoSave').addEventListener('click', function () {
      savePayCo({
        momo: $('#qtPayMomo').value,
        bank: $('#qtPayBank').value,
        holder: $('#qtPayHolder').value
      });
      saveContactHeader($('#qtPhone').value, $('#qtSite').value);
      toast('Coordonnées enregistrées.', 'ok');
    });
    var signBox = document.getElementById('qtSign');
    if (signBox) signBox.addEventListener('change', function () {
      setSignature(q.number, signBox.checked);
      toast(signBox.checked ? 'Signature ajoutée sur ce devis.' : 'Signature retirée de ce devis.', 'ok');
    });
    $('#qtAdd').addEventListener('click', function () {
      var g = gather(q); g.lines.push({ label: '', description: '', quantity: 1, unit: 'forfait', unitPrice: null, percent: null });
      st.work.lines = g.lines; repaintLines(q);
      var last = $all('.qt-line [data-l=label]'); if (last.length) last[last.length - 1].focus();
      st.dirty = true;
    });
    var form = $('#qtForm');
    form.addEventListener('input', function () { st.dirty = true; paintTotals(q); });
    form.addEventListener('click', function (e) {
      var del = e.target.closest ? e.target.closest('[data-del]') : null;
      if (!del) return;
      var g = gather(q); g.lines.splice(Number(del.getAttribute('data-del')), 1);
      st.work.lines = g.lines; repaintLines(q); st.dirty = true;
    });
  }

  function repaintLines(q) {
    var base = baseOf(st.work.lines);
    $('#qtLines').innerHTML = st.work.lines.map(function (l, i) { return lineHtml(l, i, base); }).join('');
    fillIcons($('#view'));
    paintTotals(q);
  }

  /** Lit le formulaire et retourne l’état courant du devis (non enregistré). */
  function gather(q) {
    var f = $('#qtForm');
    function val(n) { var e = f.querySelector('[data-f="' + n + '"]'); return e ? e.value : ''; }
    var lines = $all('.qt-line', f).map(function (row) {
      function lv(n) { return row.querySelector('[data-l="' + n + '"]').value; }
      var raw = lv('unitPrice').trim();
      var qty = num(lv('quantity'));
      var pm = raw.match(/^(\d+(?:[.,]\d+)?)\s*%$/);
      var pct = pm && Number(pm[1].replace(',', '.')) > 0 && Number(pm[1].replace(',', '.')) <= 500 ? Number(pm[1].replace(',', '.')) : null;
      return {
        label: lv('label').trim(), description: lv('description').trim(), quantity: qty > 0 ? qty : 1,
        unit: lv('unit').trim() || 'forfait',
        unitPrice: pct !== null || raw === '' || pm ? null : Math.max(0, Math.round(num(raw))),
        percent: pct
      };
    });
    var discountEl = document.getElementById('qtDiscount'), taxEl = document.getElementById('qtTax');
    return {
      client: { name: val('cName').trim(), company: val('cCompany').trim(), email: val('cEmail').trim(), whatsapp: val('cWhatsapp').trim(), website: val('cWebsite').trim() },
      lines: lines,
      discount: discountEl ? Math.max(0, Math.round(num(discountEl.value))) : (st.work.discount || 0),
      taxRate: taxEl ? Math.min(100, Math.max(0, num(taxEl.value))) : (st.work.rate || 0),
      status: val('status'),
      issuedAt: val('issuedAt'),
      validityDays: Math.min(365, Math.max(1, Math.round(num(val('validityDays')) || 30))),
      notes: val('notes').trim(), conditions: val('conditions').trim()
    };
  }

  function paintTotals(q) {
    var g = gather(q);
    var t = totalsOf(g.lines.filter(function (l) { return l.label; }), g.discount, g.taxRate);
    st.work.discount = g.discount; st.work.rate = g.taxRate;
    var box = $('#qtTot');
    var hadFocus = document.activeElement && document.activeElement.id;
    // On ne reconstruit pas les champs remise/TVA pendant la frappe : on met seulement à jour les montants.
    if (!document.getElementById('qtDiscount')) {
      box.innerHTML =
        '<div><span>Sous-total</span><strong id="qtSub"></strong></div>' +
        '<div><label for="qtDiscount">Remise (Ar)</label><input class="qt-in" id="qtDiscount" type="number" min="0" step="1" inputmode="numeric" value="' + esc(g.discount || 0) + '"></div>' +
        '<div><label for="qtTax">TVA (%)</label><input class="qt-in" id="qtTax" type="number" min="0" max="100" step="any" inputmode="decimal" value="' + esc(g.taxRate || 0) + '"></div>' +
        '<div id="qtTaxRow"><span>Montant TVA</span><strong id="qtTaxAmt"></strong></div>' +
        '<div class="big"><span>Total</span><strong id="qtTotal"></strong></div>';
      if (hadFocus) { var back = document.getElementById(hadFocus); if (back) back.focus(); }
    }
    $('#qtSub').textContent = ar(t.subtotal);
    $('#qtTaxAmt').textContent = ar(t.tax);
    $('#qtTaxRow').hidden = !t.taxRate;
    $('#qtTotal').textContent = ar(t.total);
    var base = baseOf(g.lines);
    $all('.qt-line').forEach(function (row, i) {
      var l = g.lines[i]; if (!l) return;
      var amount = lineAmount(l, base), todo = amount === null;
      row.classList.toggle('todo', todo);
      var lt = row.querySelector('[data-lt]');
      if (lt) lt.textContent = 'Total ligne : ' + (todo ? 'À définir' : ar(amount) + (isPct(l) ? ' (' + String(l.percent).replace('.', ',') + ' % du total des prestations)' : ''));
    });
    var warn = $('#qtTodoWarn');
    warn.hidden = !t.unpricedCount;
    warn.textContent = t.unpricedCount ? t.unpricedCount + ' ligne(s) sans prix : le total ne les inclut pas encore.' : '';
    var until = new Date(g.issuedAt ? g.issuedAt + 'T12:00:00' : q.issuedAt);
    if (!isNaN(until.getTime())) { until.setDate(until.getDate() + g.validityDays); $('#qtUntil').textContent = fdate(until.toISOString()); }
    paintPaySummary(q);
  }

  function save(q) {
    var g = gather(q);
    var lines = g.lines.filter(function (l) { return l.label; });
    if (!lines.length) { toast('Ajoutez au moins une ligne avec une désignation.', 'warn'); return; }
    var patch = {
      baseUpdatedAt: q.updatedAt, client: g.client, lines: lines, discount: g.discount, taxRate: g.taxRate,
      notes: g.notes, conditions: g.conditions, validityDays: g.validityDays
    };
    if (g.status !== q.status) patch.status = g.status;
    if (g.issuedAt && g.issuedAt !== dayOf(q.issuedAt)) patch.issuedAt = new Date(g.issuedAt + 'T12:00:00').toISOString();
    var btn = $('#qtSave'); btn.disabled = true;
    api('quotes.update', { number: q.number, patch: patch }).then(function (res) {
      if (res.ok) {
        st.quotes = st.quotes.map(function (x) { return x.number === res.quote.number ? res.quote : x; });
        st.dirty = false; refreshBadge(); toast('Devis enregistré.', 'ok'); render();
      } else if (res.error === 'conflict') {
        modal('Ce devis a été modifié ailleurs',
          '<p>Une version plus récente existe (autre appareil ou onglet). Pour ne rien écraser, rechargez-la puis refaites vos changements.</p>',
          [{ label: 'Recharger la version récente', cls: 'btn-primary', onClick: function (bg) {
            st.quotes = st.quotes.map(function (x) { return x.number === res.quote.number ? res.quote : x; });
            st.dirty = false; bg.remove(); render();
          } }, { label: 'Annuler', cls: 'btn-ghost' }]);
      } else {
        toast(errMsg(res.error), 'err');
      }
    }).catch(function () { toast(errMsg('network'), 'err'); })
      .then(function () { var b = $('#qtSave'); if (b) b.disabled = false; });
  }

  /* ---------- aperçu imprimable / PDF ---------- */
  function issuer() {
    var d = (typeof store !== 'undefined' && store.data && store.data.contact) || {};
    return {
      email: d.email || '', positioning: d.positioning || 'Graphic & Digital Designer', legal: localStorage.getItem(ISSUER_LS) || '',
      phone: (localStorage.getItem(PHONE_LS) || '').trim() || PHONE_DEFAULT,
      site: (localStorage.getItem(SITE_LS) || '').trim() || SITE_DEFAULT
    };
  }

  function preview(q, withSignature) {
    var g = gather(q);
    var lines = g.lines.filter(function (l) { return l.label; });
    var issued = g.issuedAt ? new Date(g.issuedAt + 'T12:00:00') : new Date(q.issuedAt);
    var until = new Date(issued.getTime()); until.setDate(until.getDate() + g.validityDays);
    var w = window.open('', '_blank');
    if (!w) { toast('Le navigateur a bloqué la fenêtre : autorisez les pop-ups pour ce site.', 'warn'); return; }
    w.document.open();
    w.document.write(docHtml({
      number: q.number, issued: issued.toISOString(), until: until.toISOString(), client: g.client, lines: lines,
      totals: totalsOf(lines, g.discount, g.taxRate), notes: g.notes, conditions: g.conditions,
      signature: signatureEnabled(q.number, g.status, withSignature)
    }));
    w.document.close();
  }

  /* ---------- signature manuscrite ---------- */
  var SIG_FILE = 'assets/signature.svg';
  var SIG_DEFAULT_LS = 'hub2_quote_signature_default';
  var SIG_MAP_LS = 'hub2_quote_signature_map';
  /* Signature embarquée en base64 : html2canvas (utilisé pour le PDF) ne rasterise pas
     les <img> pointant vers un SVG externe — d’où un cadre vide. Un PNG en data URI
     s’affiche de façon fiable à l’écran comme dans le PDF, sans attente réseau. */
  var SIG_PNG = 'data:image/png;base64,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';
  /* ---------- conditions de règlement par défaut ---------- */
  var TERMS_LS = 'hub2_quote_terms';
  var TERMS_DEFAULT = [
    '• Pour toute prestation d’un montant inférieur ou égal à 100 000 Ar, le règlement intégral (100 %) est exigé avant le démarrage du projet.',
    '• Pour toute prestation supérieure à 100 000 Ar, un acompte de 50 % est exigé pour valider le devis et débuter le projet. Le solde de 50 % devra être réglé avant la livraison des fichiers finaux.',
    '• Les travaux débutent après confirmation de la réception du paiement requis.',
    '• Toute retouche supplémentaire non prévue dans l’offre initiale fera l’objet d’une facturation complémentaire.',
    '• Toute prestation supplémentaire devra être validée par le client avant sa réalisation.',
    '• En cas d’annulation après le démarrage du projet, les sommes versées restent acquises au prestataire en contrepartie du travail déjà engagé.'
  ].join('\n');

  function termsDefault() {
    var v = localStorage.getItem(TERMS_LS);
    return v === null ? TERMS_DEFAULT : v;
  }
  function saveTermsDefault(text) {
    var t = String(text || '').trim();
    try {
      if (t && t !== TERMS_DEFAULT) localStorage.setItem(TERMS_LS, t);
      else localStorage.removeItem(TERMS_LS);
    } catch (e) { toast('Stockage du navigateur plein.', 'err'); }
  }
  /** « • » ou « - » en début de ligne → liste à puces imprimée proprement. */
  function conditionsHtml(text) {
    var lines = String(text || '').split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean);
    if (!lines.length) return '';
    var bullets = lines.every(function (l) { return /^[•*\-–—]/.test(l); });
    if (bullets) {
      return '<ul class="terms">' + lines.map(function (l) {
        return '<li>' + esc(l.replace(/^[•*\-–—]\s*/, '')) + '</li>';
      }).join('') + '</ul>';
    }
    return '<div class="terms-text">' + esc(text).replace(/\n/g, '<br>') + '</div>';
  }

  /* ---------- coordonnées de paiement imprimées sur les devis et reçus ---------- */
  var PAYCO_LS = 'hub2_quote_payco';
  var PAYCO_FIELDS = [
    { k: 'momo', label: 'Mobile Money', ph: 'Ex. : MVola 034 12 345 67' },
    { k: 'bank', label: 'Compte bancaire', ph: 'Ex. : BNI 00011 00001234567 89' },
    { k: 'holder', label: 'Au nom de', ph: 'Nom du titulaire du compte' }
  ];
  function saveContactHeader(phone, site) {
    var ph = String(phone || '').trim(), si = String(site || '').trim();
    if (ph) localStorage.setItem(PHONE_LS, ph); else localStorage.removeItem(PHONE_LS);
    if (si) localStorage.setItem(SITE_LS, si); else localStorage.removeItem(SITE_LS);
  }

  function payCo() {
    var out = {};
    try { out = JSON.parse(localStorage.getItem(PAYCO_LS) || '{}') || {}; } catch (e) { out = {}; }
    PAYCO_FIELDS.forEach(function (f) { if (typeof out[f.k] !== 'string') out[f.k] = ''; });
    return out;
  }
  function savePayCo(obj) {
    var clean = {};
    PAYCO_FIELDS.forEach(function (f) { clean[f.k] = String((obj || {})[f.k] || '').trim().slice(0, 220); });
    try { localStorage.setItem(PAYCO_LS, JSON.stringify(clean)); } catch (e) { toast('Stockage du navigateur plein.', 'err'); }
    return clean;
  }
  /** Bloc deux colonnes imprimé en bas des devis et des reçus. */
  /* Bandeau de bas de page : le bloc d’origine (coordonnées sur 2 colonnes, nom, « Au nom de »)
     reste inchangé ; les conditions de règlement sont ajoutées en 3ᵉ colonne. */
  function payBlockHtml() {
    var c = payCo();
    var cells = PAYCO_FIELDS.filter(function (f) { return c[f.k]; }).map(function (f) {
      return '<div><div class="l">' + esc(f.label) + '</div><div class="v">' + esc(c[f.k]).replace(/\n/g, '<br>') + '</div></div>';
    });
    return cells.length ? '<div class="payco cols-' + cells.length + '">' + cells.join('') + '</div>' : '';
  }
  function footerBlockHtml(conditionsText, colTitle) {
    var pay = payBlockHtml();
    var cond = conditionsText
      ? '<div class="payco-terms"><div class="l">' + esc(colTitle || 'Conditions de règlement') + '</div>' + conditionsHtml(conditionsText) + '</div>' : '';
    if (!pay && !cond) return '';
    if (!cond) return pay;
    if (!pay) return '<div class="payco-row cols-1">' + cond + '</div>';
    return '<div class="payco-row">' + pay + cond + '</div>';
  }
  var RECEIPT_NOTICE = 'Le présent reçu atteste du paiement de la somme indiquée ci-dessus et vaut justificatif de règlement.';
  var PAY_THANKS = 'Merci de transmettre une confirmation du paiement après chaque transaction.';
  function payThanksHtml() { return '<div class="thanks">' + esc(PAY_THANKS) + '</div>'; }

  var SIG_NAME = 'SOLO Ericot Lauranto';
  /** Nom imprimé sous la signature (surchargeable dans Paramètres → Devis). */
  function signatureName() { var v = localStorage.getItem('hub2_quote_sign_name'); return v && v.trim() ? v.trim() : SIG_NAME; }
  function signatureNameHtml() { return '<span class="sig-name">' + esc(signatureName()) + '</span>'; }
  function signatureImg() { return '<img class="sig-img" src="' + SIG_PNG + '" width="190" height="145" alt="Signature Vasilías Studio">'; }
  function signatureDefault() { var v = localStorage.getItem(SIG_DEFAULT_LS); return v === null ? true : v === '1'; }
  function signatureMap() { try { return JSON.parse(localStorage.getItem(SIG_MAP_LS) || '{}') || {}; } catch (e) { return {}; } }
  /** Choix explicite du devis → devis validé (Accepté) → réglage global. */
  function signatureEnabled(number, status, override) {
    if (override === true || override === false) return override;
    var m = signatureMap();
    if (number && Object.prototype.hasOwnProperty.call(m, number)) return !!m[number];
    if (status === 'Accepté') return true;
    return signatureDefault();
  }
  function setSignature(number, on) {
    if (!number) return;
    var m = signatureMap(); m[number] = on ? 1 : 0;
    try { localStorage.setItem(SIG_MAP_LS, JSON.stringify(m)); } catch (e) { /* quota : préférence non conservée */ }
  }

  function docCss() {
    return '@page{size:A4;margin:16mm}*{box-sizing:border-box}' +
      'body{margin:0;color:#161513;font:13px/1.55 "Josefin Sans","Helvetica Neue",Helvetica,Arial,sans-serif;background:#fff}' +
      '.bar{position:sticky;top:0;background:#161513;color:#fff;padding:.6rem 1rem;display:flex;gap:1rem;align-items:center;justify-content:space-between;font-size:13px}' +
      '.bar button{background:#BF814B;color:#fff;border:0;padding:.5rem 1rem;font:inherit;font-weight:600;cursor:pointer}' +
      '.warn{background:#FBF3DD;color:#7A5800;padding:.5rem 1rem;font-size:13px}' +
      '.page{max-width:794px;margin:0 auto;padding:36px 40px}' +
      '.top{display:flex;justify-content:space-between;gap:2rem;align-items:flex-start}' +
      '.brand{color:#BF814B;font-weight:700;letter-spacing:.28em;font-size:12px}' +
      '.me{color:#6A665C;font-size:12px;margin-top:.4rem}' +
      '.me-phone{color:#161513;letter-spacing:.02em}' +
      '.me-site{color:#BF814B}' +
      'h1{font-weight:300;font-size:34px;letter-spacing:.12em;margin:0;text-align:right}' +
      '.ref{text-align:right;color:#6A665C;font-size:12px;margin-top:.4rem}' +
      '.rule{width:44px;height:2px;background:#BF814B;margin:22px 0}' +
      '.to{margin:0 0 26px}.to .l{font-size:10px;letter-spacing:.14em;color:#BF814B;font-weight:700}' +
      'table{width:100%;border-collapse:collapse}' +
      'th{font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:#6A665C;text-align:left;border-bottom:1px solid #161513;padding:8px 6px}' +
      'td{padding:10px 6px;border-bottom:1px solid #E6E1D9;vertical-align:top}.r{text-align:right;white-space:nowrap}th.r{text-align:right}' +
      '.d{color:#6A665C;font-size:12px;margin-top:2px}' +
      '.tot{margin:18px 0 0 auto;width:300px}.tot div{display:flex;justify-content:space-between;padding:4px 0}' +
      '.tot .big{border-top:2px solid #161513;margin-top:6px;padding-top:8px;font-size:16px;font-weight:700}' +
      '.sec{margin-top:26px;font-size:12px}.sec .l{font-size:10px;letter-spacing:.14em;color:#BF814B;font-weight:700;margin-bottom:4px}' +
      '.sign{margin-top:34px;display:flex;gap:24px}.sign div{flex:1;border:1px solid #E6E1D9;height:96px;padding:8px;font-size:11px;color:#6A665C}' +
      '.sign .sig-me{display:flex;flex-direction:column;justify-content:flex-end;align-items:center;text-align:center}' +
      '.sign .sig-img{height:54px;width:auto;max-width:100%;display:block;margin:0 auto 2px}' +
      '.sign .sig-name{display:block;font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:#161513;font-weight:600}' +
      '.foot{margin-top:34px;border-top:1px solid #E6E1D9;padding-top:10px;color:#6A665C;font-size:11px;white-space:pre-line}' +
      '.payco{margin-top:28px;padding-top:12px;border-top:1px solid #E6E1D9;display:grid;grid-template-columns:1fr 1fr;gap:8px 24px}' +
      '.payco .l{font-size:10px;letter-spacing:.14em;color:#BF814B;font-weight:700;margin-bottom:2px;text-transform:uppercase}' +
      '.payco .v{font-size:12px;color:#161513;overflow-wrap:anywhere}' +
      /* 3ᵉ colonne : conditions de règlement, alignée sur le bloc d’origine */
      '.payco-row{display:grid;grid-template-columns:1fr 1.25fr;gap:0 24px;align-items:start}' +
      '.payco-row.cols-1{grid-template-columns:1fr}' +
      '.payco-terms{margin-top:28px;padding-top:12px;border-top:1px solid #E6E1D9}' +
      '.payco-terms .l{font-size:10px;letter-spacing:.14em;color:#BF814B;font-weight:700;margin-bottom:2px;text-transform:uppercase}' +
      '.payco-terms ul.terms,.payco-terms .terms-text{font-size:9.8px;line-height:1.45;padding-left:12px;margin:0}' +
      '.payco-terms ul.terms li{margin-bottom:2px}' +
      '.thanks{margin-top:22px;padding:9px 12px;border-left:3px solid #BF814B;background:#F7F6F4;font-size:11.5px;color:#3F3B35}' +
      '.terms{margin:0;padding-left:16px;font-size:11.5px;line-height:1.65;color:#2C2924}' +
      '.terms li{margin-bottom:3px}' +
      '.terms li::marker{color:#BF814B}' +
      '.terms-text{font-size:11.5px;line-height:1.65;white-space:pre-wrap}' +
      '@media print{.bar,.warn{display:none}.page{padding:0}}';
  }

  function pdfScript(fn) {
    return '<script>function dlPdf(){var b=document.getElementById("dl"),el=document.querySelector(".page");' +
      'if(!window.html2pdf){window.print();return;}' +
      'var t=b.textContent;b.disabled=true;b.textContent="Génération du PDF…";' +
      '(document.fonts&&document.fonts.ready?document.fonts.ready:Promise.resolve()).then(function(){' +
      'return html2pdf().set({margin:[12,12,12,12],filename:"' + esc(fn) + '",image:{type:"jpeg",quality:0.98},' +
      'html2canvas:{scale:2,useCORS:true,backgroundColor:"#ffffff"},jsPDF:{unit:"mm",format:"a4",orientation:"portrait"},' +
      'pagebreak:{mode:["css","legacy"],avoid:["tr",".sign",".sec"]}}).from(el).toPdf().get("pdf").then(function(pdf){var A=window.Android||(window.opener&&window.opener.Android);var nm="' + esc(fn) + '";if(A&&A.saveBase64){var u=pdf.output("datauristring");A.saveBase64(nm,"application/pdf",u.substring(u.indexOf(",")+1));}else{pdf.save(nm);}});' +
      '}).catch(function(){window.print();}).then(function(){b.disabled=false;b.textContent=t;});}<\/script>';
  }

  function docHtml(d) {
    var me = issuer();
    var docBase = baseOf(d.lines);
    var rows = d.lines.map(function (l) {
      var amount = lineAmount(l, docBase), todo = amount === null;
      var unitCell = isPct(l) ? esc(String(l.percent).replace('.', ',')) + ' % des prestations' : (todo ? '<em>À définir</em>' : esc(ar(l.unitPrice)));
      return '<tr><td><strong>' + esc(l.label) + '</strong>' + (l.description ? '<div class="d">' + esc(l.description) + '</div>' : '') + '</td>' +
        '<td class="r">' + esc(l.quantity) + ' ' + esc(l.unit) + '</td>' +
        '<td class="r">' + unitCell + '</td>' +
        '<td class="r">' + (todo ? '<em>—</em>' : esc(ar(amount))) + '</td></tr>';
    }).join('');
    var t = d.totals, c = d.client;
    var css = docCss();
    return '<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Devis ' + esc(d.number) + ' — Vasilías Studio</title>' +
      '<meta name="viewport" content="width=device-width,initial-scale=1"><link href="https://fonts.googleapis.com/css2?family=Josefin+Sans:wght@300;400;600;700&display=swap" rel="stylesheet">' +
      '<style>' + css + '</style><script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"><\/script>' +
      pdfScript('Devis-' + d.number + '.pdf') + '</head><body>' +
      '<div class="bar"><span>Aperçu du devis ' + esc(d.number) + '</span><button id="dl" type="button" onclick="dlPdf()">Télécharger le devis (PDF)</button></div>' +
      (t.unpricedCount ? '<div class="warn">Attention : ' + t.unpricedCount + ' ligne(s) sont encore « à définir ». Chiffrez-les avant d’envoyer ce devis.</div>' : '') +
      '<div class="page"><div class="top"><div><div class="brand">VASILÍAS STUDIO</div><div class="me">' + esc(me.positioning) +
        (me.email ? '<br>' + esc(me.email) : '') +
        (me.phone ? '<br><span class="me-phone">' + esc(me.phone) + '</span>' : '') +
        (me.site ? '<br><span class="me-site">' + esc(me.site) + '</span>' : '') + '</div></div>' +
      '<div><h1>DEVIS</h1><div class="ref">N° ' + esc(d.number) + '<br>Émis le ' + esc(fdate(d.issued)) + '<br>Valable jusqu’au ' + esc(fdate(d.until)) + '</div></div></div>' +
      '<div class="rule"></div>' +
      '<div class="to"><div class="l">DESTINATAIRE</div><strong>' + esc(c.name) + '</strong>' + (c.company ? '<br>' + esc(c.company) : '') + (c.email ? '<br>' + esc(c.email) : '') + (c.whatsapp ? '<br>' + esc(c.whatsapp) : '') + '</div>' +
      '<table><thead><tr><th>Désignation</th><th class="r">Quantité</th><th class="r">Prix unitaire</th><th class="r">Total</th></tr></thead><tbody>' + rows + '</tbody></table>' +
      '<div class="tot"><div><span>Sous-total</span><span>' + esc(ar(t.subtotal)) + '</span></div>' +
      (t.discount ? '<div><span>Remise</span><span>− ' + esc(ar(t.discount)) + '</span></div>' : '') +
      (t.taxRate ? '<div><span>TVA (' + esc(t.taxRate) + ' %)</span><span>' + esc(ar(t.tax)) + '</span></div>' : '') +
      '<div class="big"><span>Total</span><span>' + esc(ar(t.total)) + '</span></div></div>' +
      (d.notes ? '<div class="sec"><div class="l">REMARQUES</div>' + esc(d.notes).replace(/\n/g, '<br>') + '</div>' : '') +
      /* Conditions de règlement : imprimées dans le bandeau de bas de page (3ᵉ colonne). */
      '<div class="sign"><div>Bon pour accord — nom, date et signature du client</div>' +
      '<div class="sig-me">' + (d.signature ? signatureImg() + signatureNameHtml() : 'Vasilías Studio') + '</div></div>' +
      footerBlockHtml(d.conditions) +
      (me.legal ? '<div class="foot">' + esc(me.legal) + '</div>' : '') +
      payThanksHtml() + '</div></body></html>';
  }


  /* ---------- paiements et reçus ---------- */
  var PAY_LS = 'hub2_quote_payments';
  var PAY_METHODS = ['Espèces', 'MVola', 'Orange Money', 'Airtel Money', 'Virement bancaire', 'Chèque', 'Autre'];
  function readPays() { try { return JSON.parse(localStorage.getItem(PAY_LS) || '{}') || {}; } catch (e) { return {}; } }
  function writePays(o) { localStorage.setItem(PAY_LS, JSON.stringify(o)); }
  function paysOf(number) { var a = readPays()[number]; return Array.isArray(a) ? a.slice().sort(function (x, y) { return (x.seq || 0) - (y.seq || 0); }) : []; }
  function sumPays(list) { return list.reduce(function (n, p) { return n + (Number(p.amount) || 0); }, 0); }
  function receiptNo(quoteNumber, seq) {
    // « DV-2026-004 » ou « DEV-2026-004 » → « REC-2026-004-01 » (préfixe de devis retiré, casse ignorée)
    var base = String(quoteNumber).replace(/^\s*(DEVIS|DEV|DV)[-_ ]?/i, '').replace(/\s+/g, '');
    return 'REC-' + base + '-' + String(seq).padStart(2, '0');
  }
  function todayIso() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function currentTotal(q) {
    var g = gather(q);
    return totalsOf(g.lines.filter(function (l) { return l.label; }), g.discount, g.taxRate).total || 0;
  }

  function paintPaySummary(q) {
    var box = document.getElementById('qtPaySum');
    if (!box) return;
    var total = currentTotal(q), paid = sumPays(paysOf(q.number)), rest = Math.max(0, total - paid);
    box.innerHTML = '<div><span>Total du devis</span><strong>' + esc(ar(total)) + '</strong></div>' +
      '<div><span>Déjà encaissé</span><strong>' + esc(ar(paid)) + '</strong></div>' +
      '<div class="big"><span>' + (total > 0 && rest === 0 ? 'Soldé' : 'Reste à payer') + '</span><strong>' + esc(ar(rest)) + '</strong></div>';
    var amt = box.parentNode.querySelector('[data-p="amount"]');
    if (amt) amt.placeholder = rest > 0 ? String(Math.round(rest)) : '';
  }

  function paintPayments(q) {
    var host = document.getElementById('qtPay');
    if (!host) return;
    var list = paysOf(q.number);
    var rows = list.length ? list.map(function (p) {
      return '<div style="display:flex;gap:.6rem;align-items:center;flex-wrap:wrap;padding:.6rem 0;border-bottom:1px solid var(--line)">' +
        '<div style="flex:1;min-width:180px"><strong>' + esc(p.no) + '</strong> · ' + esc(ar(p.amount)) +
        '<br><small class="mut">' + esc(fdate(new Date(p.date + 'T12:00:00').toISOString())) + ' · ' + esc(p.method) + (p.ref ? ' · réf. ' + esc(p.ref) : '') + '</small></div>' +
        '<button type="button" class="btn btn-ghost btn-sm" data-prc="' + esc(p.id) + '">' + ic('description') + ' Reçu / PDF</button>' +
        '<button type="button" class="btn btn-danger btn-sm" data-pdel="' + esc(p.id) + '">Supprimer</button></div>';
    }).join('') : '<p class="help" style="margin:.4rem 0">Aucun paiement enregistré pour ce devis.</p>';
    var nextSeq = list.reduce(function (m, p) { return Math.max(m, p.seq || 0); }, 0) + 1;
    host.innerHTML = '<h2>Paiements et reçus</h2>' +
      '<p class="help">Enregistrez chaque paiement reçu pour générer son reçu en PDF. Les paiements restent dans ce navigateur, comme la clé d’accès : ils ne vont ni dans le Google Sheet ni dans le dépôt public.</p>' +
      '<p class="help"><strong>' + list.length + ' reçu(s) émis' + (list.length ? '' : '') + '.</strong> Le prochain portera le n° <strong>' + esc(receiptNo(q.number, nextSeq)) + '</strong>' +
      (list.length ? ' — un acompte de 50 %, puis le solde, puis tout autre versement, produisent chacun leur propre reçu.' : ' — par exemple un acompte de 50 %, puis un second reçu pour le solde.') + '</p>' +
      '<div class="qt-tot" id="qtPaySum"></div>' + rows +
      '<h3 style="margin:1.1rem 0 .3rem;font-size:.95rem">Nouveau paiement</h3>' +
      '<div class="qt-g2"><label class="qt-f"><span>Date du paiement</span><input class="qt-in" type="date" data-p="date" value="' + todayIso() + '"></label>' +
      '<label class="qt-f"><span>Montant reçu (Ar)</span><input class="qt-in" type="number" min="1" step="1" inputmode="numeric" data-p="amount"></label></div>' +
      '<div class="qt-g2"><label class="qt-f"><span>Mode de paiement</span><select class="qt-in" data-p="method">' + PAY_METHODS.map(function (m) { return '<option>' + esc(m) + '</option>'; }).join('') + '</select></label>' +
      '<label class="qt-f"><span>Référence (n° de transaction, de chèque…)</span><input class="qt-in" type="text" maxlength="80" data-p="ref"></label></div>' +
      '<label class="qt-f"><span>Note (facultatif)</span><input class="qt-in" type="text" maxlength="200" data-p="note" placeholder="Ex. : acompte de 50 % à la commande"></label>' +
      '<label class="qt-chk"><input type="checkbox" data-p="sign"' + (signatureEnabled(q.number, q.status) ? ' checked' : '') + '><span>Ajouter ma signature sur le reçu</span></label>' +
      '<div class="qt-actions"><button type="button" class="btn btn-ghost btn-sm" data-phalf="1" title="Remplit la moitié du reste à payer">50 % du reste</button>' +
      '<button type="button" class="btn btn-ghost btn-sm" data-pfill="1" data-fill="rest">Solder le reste</button>' +
      '<button type="button" class="btn btn-primary btn-sm" data-padd="1">' + ic('check') + ' Enregistrer et créer le reçu</button></div>';
    paintPaySummary(q);
  }

  function bindPayments(q) {
    var host = document.getElementById('qtPay');
    if (!host) return;
    function pv(n) { var e = host.querySelector('[data-p="' + n + '"]'); return e ? e.value : ''; }
    host.addEventListener('click', function (e) {
      var t = e.target.closest ? e.target.closest('button') : null;
      if (!t) return;
      if (t.getAttribute('data-pfill')) {
        var rest = Math.max(0, currentTotal(q) - sumPays(paysOf(q.number)));
        var a = host.querySelector('[data-p="amount"]'); if (a) a.value = rest > 0 ? Math.round(rest) : '';
        return;
      }
      if (t.getAttribute('data-phalf')) {
        var restH = Math.max(0, currentTotal(q) - sumPays(paysOf(q.number)));
        var half = Math.round(restH / 2);
        var ah = host.querySelector('[data-p="amount"]'); if (ah) ah.value = half > 0 ? half : '';
        return;
      }
      if (t.getAttribute('data-prc')) {
        var pay = paysOf(q.number).filter(function (p) { return p.id === t.getAttribute('data-prc'); })[0];
        if (pay) openReceipt(q, pay);
        return;
      }
      if (t.getAttribute('data-pdel')) {
        var id = t.getAttribute('data-pdel');
        confirmModal('Supprimer ce paiement ?', 'Le paiement et son numéro de reçu seront retirés de ce navigateur.', function () {
          var all = readPays(); all[q.number] = (all[q.number] || []).filter(function (p) { return p.id !== id; });
          if (!all[q.number].length) delete all[q.number];
          writePays(all); paintPayments(q); toast('Paiement supprimé.', 'ok');
        });
        return;
      }
      if (t.getAttribute('data-padd')) {
        var amount = Math.round(num(pv('amount'))), date = pv('date');
        if (!(amount > 0)) { toast('Saisissez le montant reçu.', 'warn'); return; }
        if (!date || isNaN(new Date(date + 'T12:00:00').getTime())) { toast('Choisissez la date du paiement.', 'warn'); return; }
        var total = currentTotal(q), rest2 = total - sumPays(paysOf(q.number));
        if (total > 0 && amount > rest2) { toast('Ce montant dépasse le reste à payer (' + ar(Math.max(0, rest2)) + ').', 'warn'); return; }
        var all2 = readPays(), list = all2[q.number] || [];
        var seq = list.reduce(function (m, p) { return Math.max(m, p.seq || 0); }, 0) + 1;
        var signEl = host.querySelector('[data-p="sign"]');
        var rec = { id: 'p' + Date.now().toString(36), seq: seq, no: receiptNo(q.number, seq), date: date, amount: amount, method: pv('method'), ref: pv('ref').trim(), note: pv('note').trim(), signature: signEl ? !!signEl.checked : signatureEnabled(q.number, q.status), at: new Date().toISOString(), total: total };
        list.push(rec); all2[q.number] = list; writePays(all2);
        paintPayments(q); toast('Paiement enregistré, reçu ' + rec.no + ' créé.', 'ok');
        openReceipt(q, rec);
      }
    });
  }

  function openReceipt(q, pay) {
    var g = gather(q);
    var total = currentTotal(q) || Number(pay.total) || 0;
    var upTo = paysOf(q.number).filter(function (p) { return (p.seq || 0) <= (pay.seq || 0); });
    var paidAfter = sumPays(upTo), paidBefore = paidAfter - pay.amount;
    var kind = total > 0 && paidAfter >= total ? (paidBefore > 0 ? 'Solde' : 'Paiement intégral') : (paidBefore > 0 ? 'Paiement partiel' : 'Acompte');
    var part = (pay.seq || 1) + (paysOf(q.number).length > 1 ? ' / ' + paysOf(q.number).length : '');
    var w = window.open('', '_blank');
    if (!w) { toast('Le navigateur a bloqué la fenêtre : autorisez les pop-ups pour ce site.', 'warn'); return; }
    w.document.open();
    w.document.write(receiptHtml({
      number: pay.no, quote: q.number, issued: new Date(pay.date + 'T12:00:00').toISOString(), client: g.client,
      amount: pay.amount, method: pay.method, ref: pay.ref, note: pay.note, kind: kind, part: part,
      signature: pay.signature === undefined ? signatureEnabled(q.number, q.status) : !!pay.signature,
      total: total, paidAfter: paidAfter, remaining: Math.max(0, total - paidAfter)
    }));
    w.document.close();
  }

  function receiptHtml(r) {
    var me = issuer(), c = r.client || {};
    var css = docCss() +
      '.amt{margin:0 0 22px;padding:16px 18px;background:#F7F6F4;border-left:3px solid #BF814B;display:flex;justify-content:space-between;align-items:center;gap:1rem}' +
      '.amt .v{font-size:26px;font-weight:700;white-space:nowrap}' +
      '.tag{display:inline-block;padding:2px 10px;border:1px solid #BF814B;color:#BF814B;font-size:10px;letter-spacing:.14em;font-weight:700;text-transform:uppercase}' +
      '.kv td:first-child{width:38%;color:#6A665C}.paid{color:#0E6B45;font-weight:700}';
    var rows = [['Règlement', esc(r.kind) + ' sur le devis N° ' + esc(r.quote) + (r.part ? ' (reçu ' + esc(r.part) + ')' : '')], ['Date du paiement', esc(fdate(r.issued))], ['Mode de paiement', esc(r.method)]];
    if (r.ref) rows.push(['Référence', esc(r.ref)]);
    if (r.note) rows.push(['Note', esc(r.note)]);
    var kv = rows.map(function (x) { return '<tr><td>' + x[0] + '</td><td><strong>' + x[1] + '</strong></td></tr>'; }).join('');
    return '<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Reçu ' + esc(r.number) + ' — Vasilías Studio</title>' +
      '<meta name="viewport" content="width=device-width,initial-scale=1"><link href="https://fonts.googleapis.com/css2?family=Josefin+Sans:wght@300;400;600;700&display=swap" rel="stylesheet">' +
      '<style>' + css + '</style><script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"><\/script>' +
      pdfScript('Recu-' + r.number + '.pdf') + '</head><body>' +
      '<div class="bar"><span>Aperçu du reçu ' + esc(r.number) + '</span><button id="dl" type="button" onclick="dlPdf()">Télécharger le reçu (PDF)</button></div>' +
      '<div class="page"><div class="top"><div><div class="brand">VASILÍAS STUDIO</div><div class="me">' + esc(me.positioning) +
        (me.email ? '<br>' + esc(me.email) : '') +
        (me.phone ? '<br><span class="me-phone">' + esc(me.phone) + '</span>' : '') +
        (me.site ? '<br><span class="me-site">' + esc(me.site) + '</span>' : '') + '</div></div>' +
      '<div><h1>REÇU</h1><div class="ref">N° ' + esc(r.number) + '<br>Émis le ' + esc(fdate(r.issued)) + '<br>Devis N° ' + esc(r.quote) + '</div></div></div>' +
      '<div class="rule"></div>' +
      '<div class="to"><div class="l">REÇU DE</div><strong>' + esc(c.name) + '</strong>' + (c.company ? '<br>' + esc(c.company) : '') + (c.email ? '<br>' + esc(c.email) : '') + (c.whatsapp ? '<br>' + esc(c.whatsapp) : '') + '</div>' +
      '<div class="amt"><div><div class="tag">' + esc(r.kind) + '</div><div style="margin-top:6px;color:#6A665C;font-size:12px">Somme reçue avec nos remerciements</div></div><div class="v">' + esc(ar(r.amount)) + '</div></div>' +
      '<table class="kv"><tbody>' + kv + '</tbody></table>' +
      '<div class="tot"><div><span>Total du devis</span><span>' + esc(ar(r.total)) + '</span></div>' +
      '<div><span>Total payé à ce jour</span><span>' + esc(ar(r.paidAfter)) + '</span></div>' +
      '<div class="big"><span>' + (r.total > 0 && r.remaining === 0 ? 'Devis soldé' : 'Reste à payer') + '</span><span' + (r.total > 0 && r.remaining === 0 ? ' class="paid"' : '') + '>' + esc(ar(r.remaining)) + '</span></div></div>' +
      /* La mention légale est imprimée dans le bandeau de bas de page (3ᵉ colonne), comme les conditions du devis. */
      '<div class="sign"><div class="sig-me">' + (r.signature ? signatureImg() + signatureNameHtml() : 'Vasilías Studio') + '</div><div>Reçu par le client — nom et signature</div></div>' +
      footerBlockHtml(RECEIPT_NOTICE, 'Mention') +
      (me.legal ? '<div class="foot">' + esc(me.legal) + '</div>' : '') +
      payThanksHtml() + '</div></body></html>';
  }

  /* ---------- Paramètres → Devis ---------- */
  window.quotesSettingsMount = function () {
    injectCss();
    var slot = document.getElementById('quoteSettingsSlot');
    if (!slot) return;
    var has = !!adminKey();
    slot.innerHTML =
      '<div class="card"><h2>Devis automatiques</h2>' +
      '<p class="help">Chaque demande de devis du site crée un devis en brouillon, visible dans l’onglet Devis. Les prix se renseignent dans la feuille « Tarifs » de votre Google Sheet privé ; une prestation sans tarif reste « à chiffrer ».</p>' +
      '<p style="margin:.7rem 0;font-size:.9rem">' + (has ? 'Clé enregistrée sur cet appareil.' : 'Aucune clé enregistrée : le Hub ne peut pas lire les devis.') + '</p>' +
      '<label class="qt-f"><span>' + (has ? 'Remplacer la clé d’accès' : 'Clé d’accès aux devis') + '</span><input class="qt-in" type="password" id="qsKey" autocomplete="off" spellcheck="false"></label>' +
      '<div class="qt-actions"><button class="btn btn-primary btn-sm" id="qsSave">Enregistrer la clé et tester</button>' +
      (has ? '<button class="btn btn-danger btn-sm" id="qsRemove">Oublier la clé</button>' : '') + '</div>' +
      '<h3 style="margin:1.4rem 0 .2rem;font-size:.95rem">Coordonnées en haut des devis et reçus</h3>' +
      '<p class="help">Imprimées sous l’e-mail, dans l’en-tête du document.</p>' +
      '<div class="qt-g2">' +
      '<label class="qt-f"><span>Téléphone</span><input class="qt-in" type="tel" id="qsPhone" maxlength="40" value="' + esc(issuer().phone) + '" placeholder="' + PHONE_DEFAULT + '"></label>' +
      '<label class="qt-f"><span>Site web</span><input class="qt-in" type="text" id="qsSite" maxlength="60" value="' + esc(issuer().site) + '" placeholder="' + SITE_DEFAULT + '"></label></div>' +
      '<button class="btn btn-ghost btn-sm" id="qsContactSave">Enregistrer le téléphone et le site</button>' +
      '<label class="qt-f" style="margin-top:1.2rem"><span>Mentions affichées en bas des devis (téléphone, NIF, STAT, coordonnées bancaires…)</span>' +
      '<textarea class="qt-in" id="qsIssuer" maxlength="1000" placeholder="Une information par ligne">' + esc(localStorage.getItem(ISSUER_LS) || '') + '</textarea></label>' +
      '<button class="btn btn-ghost btn-sm" id="qsIssuerSave">Enregistrer les mentions</button>' +
      '<h3 style="margin:1.4rem 0 .2rem;font-size:.95rem">Conditions de règlement par défaut</h3>' +
      '<p class="help">Insérées en un clic dans un devis (« Insérer les conditions par défaut »). Une condition par ligne, « • » en tête pour une liste à puces.</p>' +
      '<label class="qt-f"><span>Texte des conditions</span><textarea class="qt-in" id="qsTerms" maxlength="3000" rows="9" style="min-height:170px;resize:vertical">' + esc(termsDefault()) + '</textarea></label>' +
      '<div class="qt-actions"><button class="btn btn-ghost btn-sm" id="qsTermsSave">Enregistrer les conditions</button>' +
      '<button class="btn btn-ghost btn-sm" id="qsTermsReset">Rétablir le texte d’origine</button></div>' +
      '<h3 style="margin:1.4rem 0 .2rem;font-size:.95rem">Coordonnées de paiement (bas des devis et reçus)</h3>' +
      '<p class="help">Affichées sur deux colonnes, pour laisser de la place à l’essentiel.</p>' +
      '<div class="qt-g2">' +
      '<label class="qt-f"><span>Mobile Money</span><textarea class="qt-in" id="qsPayMomo" maxlength="220" rows="2" style="min-height:54px;resize:vertical" placeholder="' + PAYCO_FIELDS[0].ph + '" value="' + esc(payCo().momo) + '"></textarea></label>' +
      '<label class="qt-f"><span>Compte bancaire</span><textarea class="qt-in" id="qsPayBank" maxlength="220" rows="2" style="min-height:54px;resize:vertical" placeholder="' + PAYCO_FIELDS[1].ph + '" value="' + esc(payCo().bank) + '"></textarea></label></div>' +
      '<label class="qt-f"><span>Au nom de</span><textarea class="qt-in" id="qsPayHolder" maxlength="220" rows="2" style="min-height:54px;resize:vertical" placeholder="' + PAYCO_FIELDS[2].ph + '" value="' + esc(payCo().holder) + '"></textarea></label>' +
      '<button class="btn btn-ghost btn-sm" id="qsPayCoSave">Enregistrer les coordonnées</button>' +
      '<label class="qt-f" style="margin-top:1.2rem"><span>Nom affiché sous la signature</span>' +
      '<input class="qt-in" type="text" id="qsSignName" maxlength="60" value="' + esc(signatureName()) + '" placeholder="SOLO Ericot Lauranto"></label>' +
      '<button class="btn btn-ghost btn-sm" id="qsSignNameSave">Enregistrer le nom</button>' +
      '<label class="qt-chk" style="margin-top:1.2rem"><input type="checkbox" id="qsSign"' + (signatureDefault() ? ' checked' : '') + '>' +
      '<span>Ajouter ma signature (<code>assets/signature.svg</code>) sur les devis et les reçus</span></label>' +
      '<p class="help">Réglage par défaut, appliqué aussi aux devis validés (« Accepté »). Chaque devis garde son propre réglage, modifiable dans sa fiche.</p>' +
      '<p class="help">Clé et mentions restent dans ce navigateur, jamais dans le dépôt public.</p></div>';
    $('#qsSave').addEventListener('click', function () {
      var k = $('#qsKey').value.trim();
      if (k) localStorage.setItem(KEY_LS, k);
      if (!adminKey()) { toast('Collez d’abord la clé.', 'warn'); return; }
      api('quotes.ping').then(function (res) {
        if (res.ok) { toast('Connexion aux devis réussie.', 'ok'); st.quotes = null; window.quotesSettingsMount(); refreshBadge(); }
        else toast(errMsg(res.error), 'err');
      }).catch(function () { toast(errMsg('network'), 'err'); });
    });
    var rm = $('#qsRemove');
    if (rm) rm.addEventListener('click', function () { localStorage.removeItem(KEY_LS); st.quotes = null; refreshBadge(); window.quotesSettingsMount(); toast('Clé oubliée sur cet appareil.'); });
    $('#qsIssuerSave').addEventListener('click', function () { localStorage.setItem(ISSUER_LS, $('#qsIssuer').value); toast('Mentions enregistrées.', 'ok'); });
    $('#qsContactSave').addEventListener('click', function () {
      saveContactHeader($('#qsPhone').value, $('#qsSite').value);
      toast('Téléphone et site enregistrés.', 'ok');
      if (st.open && findQuote(st.open)) render();
    });
    $('#qsTermsSave').addEventListener('click', function () {
      saveTermsDefault(document.getElementById('qsTerms').value);
      toast('Conditions par défaut enregistrées.', 'ok');
    });
    $('#qsTermsReset').addEventListener('click', function () {
      saveTermsDefault(TERMS_DEFAULT);
      document.getElementById('qsTerms').value = TERMS_DEFAULT;
      toast('Texte d’origine rétabli.', 'ok');
    });
    $('#qsPayCoSave').addEventListener('click', function () {
      savePayCo({
        momo: $('#qsPayMomo').value,
        bank: $('#qsPayBank').value,
        holder: $('#qsPayHolder').value
      });
      toast('Coordonnées de paiement enregistrées.', 'ok');
      if (st.open && findQuote(st.open)) render();
    });
    $('#qsSignNameSave').addEventListener('click', function () {
      var v = $('#qsSignName').value.trim();
      if (v) localStorage.setItem('hub2_quote_sign_name', v); else localStorage.removeItem('hub2_quote_sign_name');
      toast('Nom sous la signature enregistré.', 'ok');
    });
    var signDefault = $('#qsSign');
    if (signDefault) signDefault.addEventListener('change', function () {
      localStorage.setItem(SIG_DEFAULT_LS, signDefault.checked ? '1' : '0');
      toast(signDefault.checked ? 'Signature activée par défaut.' : 'Signature désactivée par défaut.', 'ok');
    });
  };
})();
