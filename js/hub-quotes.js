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
      '@media(max-width:600px){.qt-row{flex-direction:column}.qt-side{align-items:flex-start}}';
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
      '<p class="help">Valable jusqu’au <strong id="qtUntil"></strong>.</p></div>' +
      '<div class="card"><h2>Mentions sur le devis</h2>' +
      '<label class="qt-f"><span>Remarques</span><textarea class="qt-in" data-f="notes" maxlength="2000">' + esc(q.notes) + '</textarea></label>' +
      '<label class="qt-f"><span>Conditions de règlement</span><textarea class="qt-in" data-f="conditions" maxlength="2000" placeholder="Ex. : acompte à la commande, solde à la livraison…">' + esc(q.conditions) + '</textarea></label></div></div>' +
      '</form>' +
      '<div class="card"><h2>Historique</h2><ul class="qt-hist">' +
      (q.history || []).slice().reverse().map(function (e) { return '<li>' + esc(fdate(e.at)) + ' — ' + esc(e.event) + '</li>'; }).join('') + '</ul></div>';
    $('#view').innerHTML = h;
    st.work = { rate: q.taxRate || 0, discount: q.discount || 0, lines: lines };
    paintTotals(q);

    $('#qtBack').addEventListener('click', function () {
      if (!st.dirty) { st.open = null; render(); return; }
      confirmModal('Quitter sans enregistrer ?', 'Les modifications de ce devis seront perdues.', function () { st.open = null; st.dirty = false; render(); });
    });
    $('#qtSave').addEventListener('click', function () { save(q); });
    $('#qtPreview').addEventListener('click', function () { preview(q); });
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
    return { email: d.email || '', positioning: d.positioning || 'Graphic & Digital Designer', legal: localStorage.getItem(ISSUER_LS) || '' };
  }

  function preview(q) {
    var g = gather(q);
    var lines = g.lines.filter(function (l) { return l.label; });
    var issued = g.issuedAt ? new Date(g.issuedAt + 'T12:00:00') : new Date(q.issuedAt);
    var until = new Date(issued.getTime()); until.setDate(until.getDate() + g.validityDays);
    var w = window.open('', '_blank');
    if (!w) { toast('Le navigateur a bloqué la fenêtre : autorisez les pop-ups pour ce site.', 'warn'); return; }
    w.document.open();
    w.document.write(docHtml({
      number: q.number, issued: issued.toISOString(), until: until.toISOString(), client: g.client, lines: lines,
      totals: totalsOf(lines, g.discount, g.taxRate), notes: g.notes, conditions: g.conditions
    }));
    w.document.close();
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
    var css = '@page{size:A4;margin:16mm}*{box-sizing:border-box}' +
      'body{margin:0;color:#161513;font:13px/1.55 "Josefin Sans","Helvetica Neue",Helvetica,Arial,sans-serif;background:#fff}' +
      '.bar{position:sticky;top:0;background:#161513;color:#fff;padding:.6rem 1rem;display:flex;gap:1rem;align-items:center;justify-content:space-between;font-size:13px}' +
      '.bar button{background:#BF814B;color:#fff;border:0;padding:.5rem 1rem;font:inherit;font-weight:600;cursor:pointer}' +
      '.warn{background:#FBF3DD;color:#7A5800;padding:.5rem 1rem;font-size:13px}' +
      '.page{max-width:794px;margin:0 auto;padding:36px 40px}' +
      '.top{display:flex;justify-content:space-between;gap:2rem;align-items:flex-start}' +
      '.brand{color:#BF814B;font-weight:700;letter-spacing:.28em;font-size:12px}' +
      '.me{color:#6A665C;font-size:12px;margin-top:.4rem}' +
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
      '.sign{margin-top:34px;display:flex;gap:24px}.sign div{flex:1;border:1px solid #E6E1D9;height:90px;padding:8px;font-size:11px;color:#6A665C}' +
      '.foot{margin-top:34px;border-top:1px solid #E6E1D9;padding-top:10px;color:#6A665C;font-size:11px;white-space:pre-line}' +
      '@media print{.bar,.warn{display:none}.page{padding:0}}';
    return '<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Devis ' + esc(d.number) + ' — Vasilías Studio</title>' +
      '<meta name="viewport" content="width=device-width,initial-scale=1"><link href="https://fonts.googleapis.com/css2?family=Josefin+Sans:wght@300;400;600;700&display=swap" rel="stylesheet">' +
      '<style>' + css + '</style></head><body>' +
      '<div class="bar"><span>Aperçu du devis ' + esc(d.number) + '</span><button onclick="window.print()">Imprimer / Enregistrer en PDF</button></div>' +
      (t.unpricedCount ? '<div class="warn">Attention : ' + t.unpricedCount + ' ligne(s) sont encore « à définir ». Chiffrez-les avant d’envoyer ce devis.</div>' : '') +
      '<div class="page"><div class="top"><div><div class="brand">VASILÍAS STUDIO</div><div class="me">' + esc(me.positioning) + (me.email ? '<br>' + esc(me.email) : '') + '</div></div>' +
      '<div><h1>DEVIS</h1><div class="ref">N° ' + esc(d.number) + '<br>Émis le ' + esc(fdate(d.issued)) + '<br>Valable jusqu’au ' + esc(fdate(d.until)) + '</div></div></div>' +
      '<div class="rule"></div>' +
      '<div class="to"><div class="l">DESTINATAIRE</div><strong>' + esc(c.name) + '</strong>' + (c.company ? '<br>' + esc(c.company) : '') + (c.email ? '<br>' + esc(c.email) : '') + (c.whatsapp ? '<br>' + esc(c.whatsapp) : '') + '</div>' +
      '<table><thead><tr><th>Désignation</th><th class="r">Quantité</th><th class="r">Prix unitaire</th><th class="r">Total</th></tr></thead><tbody>' + rows + '</tbody></table>' +
      '<div class="tot"><div><span>Sous-total</span><span>' + esc(ar(t.subtotal)) + '</span></div>' +
      (t.discount ? '<div><span>Remise</span><span>− ' + esc(ar(t.discount)) + '</span></div>' : '') +
      (t.taxRate ? '<div><span>TVA (' + esc(t.taxRate) + ' %)</span><span>' + esc(ar(t.tax)) + '</span></div>' : '') +
      '<div class="big"><span>Total</span><span>' + esc(ar(t.total)) + '</span></div></div>' +
      (d.notes ? '<div class="sec"><div class="l">REMARQUES</div>' + esc(d.notes).replace(/\n/g, '<br>') + '</div>' : '') +
      (d.conditions ? '<div class="sec"><div class="l">CONDITIONS DE RÈGLEMENT</div>' + esc(d.conditions).replace(/\n/g, '<br>') + '</div>' : '') +
      '<div class="sign"><div>Bon pour accord — nom, date et signature du client</div><div>Vasilías Studio</div></div>' +
      (me.legal ? '<div class="foot">' + esc(me.legal) + '</div>' : '') + '</div></body></html>';
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
      '<label class="qt-f" style="margin-top:1.2rem"><span>Mentions affichées en bas des devis (téléphone, NIF, STAT, coordonnées bancaires…)</span>' +
      '<textarea class="qt-in" id="qsIssuer" maxlength="1000" placeholder="Une information par ligne">' + esc(localStorage.getItem(ISSUER_LS) || '') + '</textarea></label>' +
      '<button class="btn btn-ghost btn-sm" id="qsIssuerSave">Enregistrer les mentions</button>' +
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
  };
})();
