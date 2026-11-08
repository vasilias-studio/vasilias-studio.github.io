/* ============================================================
   VASILÍAS STUDIO — Hub <-> Site Live Synchronization Engine
   Applique hub-data.json en temps réel sur toutes les pages publiques
   ET génère/met à jour le HTML statique + sitemap.xml lors des
   synchronisations automatiques depuis le Hub.
   ============================================================ */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.VasiliasSync = api;
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  var SITE_ORIGIN = 'https://vasilias-studio.github.io/';
  var LS_DATA = 'hub2_data';
  var LS_LIVE_CACHE = 'hub2_live_cache';
  var LS_PENDING = 'hub2_pending_sync';

  var SOCIAL_PATHS = {
    behance: {
      vb: '0 0 24 24',
      d: 'M16.969 16.927a2.561 2.561 0 0 0 1.901.677 2.501 2.501 0 0 0 1.531-.475c.362-.235.636-.584.779-.99h2.585a5.091 5.091 0 0 1-1.9 2.896 5.292 5.292 0 0 1-3.091.88 5.839 5.839 0 0 1-2.284-.433 4.871 4.871 0 0 1-1.723-1.211 5.657 5.657 0 0 1-1.08-1.874 7.057 7.057 0 0 1-.383-2.393c-.005-.8.129-1.595.396-2.349a5.313 5.313 0 0 1 5.088-3.604 4.87 4.87 0 0 1 2.376.563c.661.362 1.231.87 1.668 1.485a6.2 6.2 0 0 1 .943 2.133c.194.821.263 1.666.205 2.508h-7.699c-.063.79.184 1.574.688 2.187ZM6.947 4.084a8.065 8.065 0 0 1 1.928.198 4.29 4.29 0 0 1 1.49.638c.418.303.748.711.958 1.182.241.579.357 1.203.341 1.83a3.506 3.506 0 0 1-.506 1.961 3.726 3.726 0 0 1-1.503 1.287 3.588 3.588 0 0 1 2.027 1.437c.464.747.697 1.615.67 2.494a4.593 4.593 0 0 1-.423 2.032 3.945 3.945 0 0 1-1.163 1.413 5.114 5.114 0 0 1-1.683.807 7.135 7.135 0 0 1-1.928.259H0V4.084h6.947Zm-.235 12.9c.308.004.616-.029.916-.099a2.18 2.18 0 0 0 .766-.332c.228-.158.411-.371.534-.619.142-.317.208-.663.191-1.009a2.08 2.08 0 0 0-.642-1.715 2.618 2.618 0 0 0-1.696-.505h-3.54v4.279h3.471Zm13.635-5.967a2.13 2.13 0 0 0-1.654-.619 2.336 2.336 0 0 0-1.163.259 2.474 2.474 0 0 0-.738.62 2.359 2.359 0 0 0-.396.792c-.074.239-.12.485-.137.734h4.769a3.239 3.239 0 0 0-.679-1.785l-.002-.001Zm-13.813-.648a2.254 2.254 0 0 0 1.423-.433c.399-.355.607-.88.56-1.413a1.916 1.916 0 0 0-.178-.891 1.298 1.298 0 0 0-.495-.533 1.851 1.851 0 0 0-.711-.274 3.966 3.966 0 0 0-.835-.073H3.241v3.631h3.293v-.014ZM21.62 5.122h-5.976v1.527h5.976V5.122Z'
    },
    instagram: {
      vb: '0 0 24 24',
      d: 'M7.0301.084c-1.2768.0602-2.1487.264-2.911.5634-.7888.3075-1.4575.72-2.1228 1.3877-.6652.6677-1.075 1.3368-1.3802 2.127-.2954.7638-.4956 1.6365-.552 2.914-.0564 1.2775-.0689 1.6882-.0626 4.947.0062 3.2586.0206 3.6671.0825 4.9473.061 1.2765.264 2.1482.5635 2.9107.308.7889.72 1.4573 1.388 2.1228.6679.6655 1.3365 1.0743 2.1285 1.38.7632.295 1.6361.4961 2.9134.552 1.2773.056 1.6884.069 4.9462.0627 3.2578-.0062 3.668-.0207 4.9478-.0814 1.28-.0607 2.147-.2652 2.9098-.5633.7889-.3086 1.4578-.72 2.1228-1.3881.665-.6682 1.0745-1.3378 1.3795-2.1284.2957-.7632.4966-1.636.552-2.9124.056-1.2809.0692-1.6898.063-4.948-.0063-3.2583-.021-3.6668-.0817-4.9465-.0607-1.2797-.264-2.1487-.5633-2.9117-.3084-.7889-.72-1.4568-1.3876-2.1228C21.2982 1.33 20.628.9208 19.8378.6165 19.074.321 18.2017.1197 16.9244.0645 15.6471.0093 15.236-.005 11.977.0014 8.718.0076 8.31.0215 7.0301.0839m.1402 21.6932c-1.17-.0509-1.8053-.2453-2.2287-.408-.5606-.216-.96-.4771-1.3819-.895-.422-.4178-.6811-.8186-.9-1.378-.1644-.4234-.3624-1.058-.4171-2.228-.0595-1.2645-.072-1.6442-.079-4.848-.007-3.2037.0053-3.583.0607-4.848.05-1.169.2456-1.805.408-2.2282.216-.5613.4762-.96.895-1.3816.4188-.4217.8184-.6814 1.3783-.9003.423-.1651 1.0575-.3614 2.227-.4171 1.2655-.06 1.6447-.072 4.848-.079 3.2033-.007 3.5835.005 4.8495.0608 1.169.0508 1.8053.2445 2.228.408.5608.216.96.4754 1.3816.895.4217.4194.6816.8176.9005 1.3787.1653.4217.3617 1.056.4169 2.2263.0602 1.2655.0739 1.645.0796 4.848.0058 3.203-.0055 3.5834-.061 4.848-.051 1.17-.245 1.8055-.408 2.2294-.216.5604-.4763.96-.8954 1.3814-.419.4215-.8181.6811-1.3783.9-.4224.1649-1.0577.3617-2.2262.4174-1.2656.0595-1.6448.072-4.8493.079-3.2045.007-3.5825-.006-4.848-.0608M16.953 5.5864A1.44 1.44 0 1 0 18.39 4.144a1.44 1.44 0 0 0-1.437 1.4424M5.8385 12.012c.0067 3.4032 2.7706 6.1557 6.173 6.1493 3.4026-.0065 6.157-2.7701 6.1506-6.1733-.0065-3.4032-2.771-6.1565-6.174-6.1498-3.403.0067-6.156 2.771-6.1496 6.1738M8 12.0077a4 4 0 1 1 4.008 3.9921A3.9996 3.9996 0 0 1 8 12.0077'
    },
    linkedin: {
      vb: '0 0 72 72',
      d: 'M62,62 L51.315625,62 L51.315625,43.8021149 C51.315625,38.8127542 49.4197917,36.0245323 45.4707031,36.0245323 C41.1746094,36.0245323 38.9300781,38.9261103 38.9300781,43.8021149 L38.9300781,62 L28.6333333,62 L28.6333333,27.3333333 L38.9300781,27.3333333 L38.9300781,32.0029283 C38.9300781,32.0029283 42.0260417,26.2742151 49.3825521,26.2742151 C56.7356771,26.2742151 62,30.7644705 62,40.051212 L62,62 Z M16.349349,22.7940133 C12.8420573,22.7940133 10,19.9296567 10,16.3970067 C10,12.8643566 12.8420573,10 16.349349,10 C19.8566406,10 22.6970052,12.8643566 22.6970052,16.3970067 C22.6970052,19.9296567 19.8566406,22.7940133 16.349349,22.7940133 Z M11.0325521,62 L21.769401,62 L21.769401,27.3333333 L11.0325521,27.3333333 L11.0325521,62 Z'
    },
    facebook: {
      vb: '0 0 24 24',
      d: 'M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z'
    },
    defaultIcon: {
      vb: '0 0 24 24',
      d: 'M14 3h7v7h-2V6.41l-9.29 9.3-1.42-1.42 9.3-9.29H14V3ZM5 5h6v2H7v10h10v-4h2v6H5V5Z'
    }
  };

  var TOOL_ICONS = {
    'adobe illustrator': 'assets/icons/adobeillustrator.svg',
    'illustrator': 'assets/icons/adobeillustrator.svg',
    'adobe photoshop': 'assets/icons/adobephotoshop.svg',
    'photoshop': 'assets/icons/adobephotoshop.svg',
    'adobe indesign': 'assets/icons/adobeindesign.svg',
    'indesign': 'assets/icons/adobeindesign.svg',
    'figma': 'assets/icons/figma.svg',
    'blender': 'assets/icons/blender.svg',
    'canva': 'assets/icons/canva.svg'
  };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function escMultilineHtml(s) {
    return String(s == null ? '' : s)
      .split(/\r?\n/)
      .map(function (line) { return esc(line); })
      .join('<br>');
  }

  function normalizeAssetPath(p) {
    if (!p || p === 'none') return '';
    var s = String(p).trim();
    if (!s || s === 'none') return '';
    if (/^(https?:|data:|\/)/i.test(s)) return s;
    return /^assets\//.test(s) ? s : 'assets/' + s.replace(/^\.?\//, '');
  }

  function relAssetPath(p) {
    if (!p) return '';
    return String(p).trim().replace(/^\.?\//, '').replace(/^assets\//, '');
  }

  function fullUrl(p) {
    if (!p) return SITE_ORIGIN + 'assets/og/og-image-v2.jpg';
    var s = String(p).trim();
    if (/^https?:\/\//i.test(s)) return s;
    var asset = normalizeAssetPath(s);
    return SITE_ORIGIN + asset.replace(/^\//, '');
  }

  function socialIconSvg(name) {
    var key = String(name || '').toLowerCase().trim();
    var spec = SOCIAL_PATHS.defaultIcon;
    if (key.indexOf('behance') >= 0) spec = SOCIAL_PATHS.behance;
    else if (key.indexOf('instagram') >= 0) spec = SOCIAL_PATHS.instagram;
    else if (key.indexOf('linkedin') >= 0) spec = SOCIAL_PATHS.linkedin;
    else if (key.indexOf('facebook') >= 0) spec = SOCIAL_PATHS.facebook;
    return '<svg class="soc" viewBox="' + spec.vb + '" fill="currentColor" aria-hidden="true" focusable="false"><path d="' + spec.d + '"/></svg>';
  }

  function toolIconHtml(toolName) {
    var key = String(toolName || '').toLowerCase().trim();
    var src = TOOL_ICONS[key];
    if (!src) {
      Object.keys(TOOL_ICONS).some(function (k) {
        if (key.indexOf(k) >= 0) { src = TOOL_ICONS[k]; return true; }
        return false;
      });
    }
    return src ? '<img class="tool-ico" src="' + esc(src) + '" alt="" width="20" height="20" loading="lazy" decoding="async">' : '';
  }

  function getPublishedProjects(data) {
    return ((data && data.projects) || []).filter(function (p) {
      return p && p.status === 'published';
    });
  }

  function getProjectCovers(p) {
    if (!p) return [];
    var raw = Array.isArray(p.covers)
      ? p.covers
      : ((p.cover && p.cover !== 'none') ? [p.cover] : []);
    var seen = {};
    var out = [];
    raw.forEach(function (c) {
      var norm = normalizeAssetPath(c);
      if (norm && !seen[norm]) {
        seen[norm] = 1;
        out.push(norm);
      }
    });
    return out;
  }

  function getPrimaryCover(p) {
    if (!p) return '';
    var covers = getProjectCovers(p);
    if (p.cover && p.cover !== 'none') {
      var main = normalizeAssetPath(p.cover);
      if (main && (!covers.length || covers.indexOf(main) >= 0)) return main;
    }
    return covers[0] || '';
  }

  var SLIDER_PREV_BTN = '<button type="button" class="slider-btn slider-prev" aria-label="Image précédente"><svg aria-hidden="true" focusable="false" class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg></button>';
  var SLIDER_NEXT_BTN = '<button type="button" class="slider-btn slider-next" aria-label="Image suivante"><svg aria-hidden="true" focusable="false" class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg></button>';

  function buildProjectCoverHeroHtml(project, data, inView) {
    var covers = getProjectCovers(project);
    if (!covers.length) return '';
    var primary = getPrimaryCover(project);
    var alts = (data && data.alts) || {};
    var revCls = 'reveal reveal-right' + (inView ? ' in-view' : '');
    if (covers.length === 1) {
      var src = covers[0];
      var rel = relAssetPath(src);
      var alt = alts[rel] || ('Visuel principal du projet ' + project.title);
      return '<div class="case-hero ' + revCls + '" data-hub="project-covers"><img data-hub="project-cover" src="' + esc(encodeURI(src)) + '" alt="' + esc(alt) + '" loading="eager" fetchpriority="high" decoding="async"></div>';
    }
    var mainIdx = covers.indexOf(primary);
    if (mainIdx < 0) mainIdx = 0;
    var slidesHtml = covers.map(function (cSrc, idx) {
      var cRel = relAssetPath(cSrc);
      var cAlt = alts[cRel] || (idx === 0 ? ('Visuel principal du projet ' + project.title) : ('Visuel de couverture ' + (idx + 1) + ' — ' + project.title));
      var hubAttr = idx === mainIdx ? ' data-hub="project-cover"' : '';
      var loadAttr = idx === 0 ? ' loading="eager" fetchpriority="high" decoding="async"' : ' loading="lazy" decoding="async"';
      return '<img' + hubAttr + ' src="' + esc(encodeURI(cSrc)) + '" alt="' + esc(cAlt) + '"' + loadAttr + '>';
    }).join('');
    return '<div class="case-hero case-slider ' + revCls + '" data-hub="project-covers" data-slider="" aria-roledescription="carrousel">'
      + '<div class="slider-track">' + slidesHtml + '</div>'
      + SLIDER_PREV_BTN
      + SLIDER_NEXT_BTN
      + '</div>';
  }

  function projectHref(p) {
    if (!p) return 'work.html';
    if (p.page && /\.html$/i.test(p.page)) return p.page;
    var slug = String(p.slug || p.id || 'projet').replace(/\.html$/i, '');
    if (!/^work-/.test(slug)) slug = 'work-' + slug;
    return slug + '.html';
  }

  function projectClientLabel(p) {
    if (!p) return '';
    if (p.client && String(p.client).trim()) return String(p.client).trim();
    if (p.nature === 'Concept fictif') return 'Fictif';
    if (p.nature && p.nature !== 'À confirmer') return p.nature;
    return '';
  }

  var CORE_SITE_PAGES = [
    { file: 'index.html', title: 'Accueil', inMenu: true },
    { file: 'work.html', title: 'Projets', inMenu: true },
    { file: 'about.html', title: 'À propos', inMenu: true },
    { file: 'services.html', title: 'Services', inMenu: true },
    { file: 'contact.html', title: 'Contact', inMenu: true },
    { file: 'print.html', title: 'Imprimés', inMenu: false },
    { file: 'social.html', title: 'Réseaux sociaux', inMenu: false }
  ];

  function defaultProjectDesc(p) {
    if (!p) return '';
    var title = String(p.title || 'Projet').trim();
    var tag = String(p.tagline || '').replace(/\s+/g, ' ').trim();
    var ov = String(p.overview || '').replace(/\s+/g, ' ').trim();
    var cats = Array.isArray(p.category) && p.category.length ? p.category.join(', ') : '';
    var text = '';
    if (tag && ov && tag.toLowerCase() !== ov.toLowerCase()) {
      text = 'Étude de cas ' + title + ' par Vasilías — ' + tag.replace(/[.!?]+$/, '') + '. ' + ov;
    } else if (ov) {
      text = ov.indexOf(title) >= 0 ? ov : ('Étude de cas ' + title + ' par Vasilías : ' + ov);
    } else if (tag) {
      text = 'Étude de cas ' + title + ' par Vasilías — ' + tag + (cats ? ' (' + cats + ').' : '.');
    } else {
      text = 'Étude de cas ' + title + ' par Vasilías Studio' + (cats ? ' : ' + cats + '.' : '.');
    }
    if (text.length > 160) {
      var cut = text.slice(0, 157);
      var sp = cut.lastIndexOf(' ');
      text = (sp > 110 ? cut.slice(0, sp) : cut).replace(/[,;:\s]+$/, '') + '…';
    }
    return text;
  }

  function findProjectByFile(data, pageFile) {
    if (!data || !Array.isArray(data.projects) || !pageFile) return null;
    for (var i = 0; i < data.projects.length; i++) {
      var p = data.projects[i];
      if (p && projectHref(p) === pageFile) return p;
    }
    return null;
  }

  function reconcileData(data, extraWatch) {
    if (!data || typeof data !== 'object') return data;
    var projects = Array.isArray(data.projects) ? data.projects : (data.projects = []);

    /* 1. Garantir p.page = work-<slug>.html sur chaque projet */
    projects.forEach(function (p) {
      if (!p) return;
      p.page = projectHref(p);
    });

    var pubProjects = getPublishedProjects(data);
    var pubFilesMap = {};
    pubProjects.forEach(function (p) {
      pubFilesMap[projectHref(p)] = p;
    });

    /* 2. Réconcilier data.pages (pages cœur + pages custom non-projet + tous les projets publiés) */
    var existingPages = Array.isArray(data.pages) ? data.pages : [];
    var existingByFile = {};
    existingPages.forEach(function (pg) {
      if (pg && pg.file) existingByFile[pg.file] = pg;
    });

    var nextPages = [];
    var seenPage = {};
    CORE_SITE_PAGES.forEach(function (core) {
      var prev = existingByFile[core.file];
      seenPage[core.file] = 1;
      nextPages.push({
        file: core.file,
        title: (prev && prev.title) ? prev.title : core.title,
        inMenu: (prev && typeof prev.inMenu === 'boolean') ? prev.inMenu : core.inMenu
      });
    });
    existingPages.forEach(function (pg) {
      if (!pg || !pg.file || seenPage[pg.file]) return;
      if (/^work-[^/]+\.html$/i.test(pg.file)) return;
      seenPage[pg.file] = 1;
      nextPages.push({
        file: pg.file,
        title: pg.title || pg.name || pg.file,
        inMenu: Boolean(pg.inMenu)
      });
    });
    pubProjects.forEach(function (p) {
      var file = projectHref(p);
      if (seenPage[file]) return;
      seenPage[file] = 1;
      var prev = existingByFile[file];
      nextPages.push({
        file: file,
        title: 'Étude : ' + (p.title || p.slug || file),
        inMenu: Boolean(prev && prev.inMenu)
      });
    });
    data.pages = nextPages;

    /* 3. Réconcilier data.seo : créer/compléter automatiquement l'entrée SEO de chaque projet publié ou prêt */
    if (!data.seo || typeof data.seo !== 'object') data.seo = {};
    projects.forEach(function (p) {
      if (!p) return;
      var file = projectHref(p);
      var shouldSeed = (p.status === 'published' || p.status === 'ready' || Boolean(data.seo[file]));
      if (!shouldSeed) return;
      var cur = data.seo[file] || {};
      var isAuto = !data.seo[file] || (cur.auto === true && !cur.updated);
      var defTitle = (p.title || p.slug || 'Projet') + ' — Vasilías';
      var defDesc = defaultProjectDesc(p);
      var cover = getPrimaryCover(p);
      var fallbackOg = (data.seo['work.html'] && data.seo['work.html'].img)
        || (data.seo['index.html'] && data.seo['index.html'].img)
        || (SITE_ORIGIN + 'assets/og/og-image-v2.jpg');
      var defImg = cover ? fullUrl(cover) : fallbackOg;
      var entry = {
        title: isAuto ? defTitle : (cur.title || defTitle),
        ogTitle: isAuto ? defTitle : (cur.ogTitle || cur.title || defTitle),
        desc: isAuto ? defDesc : (cur.desc || defDesc),
        ogDesc: isAuto ? defDesc : (cur.ogDesc || cur.desc || defDesc),
        img: isAuto ? defImg : (cur.img || defImg),
        canonical: cur.canonical || (SITE_ORIGIN + file)
      };
      if (isAuto) entry.auto = true;
      if (cur.updated) entry.updated = cur.updated;
      if (cur.imgWidth) entry.imgWidth = cur.imgWidth;
      if (cur.imgHeight) entry.imgHeight = cur.imgHeight;
      data.seo[file] = entry;
    });

    /* 4. Réconcilier data.watch (Surveillance) avec toutes les pages cœur + projets publiés */
    var nextWatch = [];
    var seenWatch = {};
    function addWatch(u) {
      if (!u) return;
      var s = String(u).trim();
      if (!s || seenWatch[s]) return;
      seenWatch[s] = 1;
      nextWatch.push(s);
    }
    CORE_SITE_PAGES.forEach(function (core) { addWatch(core.file); });
    pubProjects.forEach(function (p) { addWatch(projectHref(p)); });
    ['robots.txt', 'sitemap.xml'].forEach(addWatch);
    [data.watch, extraWatch].forEach(function (list) {
      if (!Array.isArray(list)) return;
      list.forEach(function (u) {
        if (!u) return;
        var clean = String(u).trim().replace(/^https?:\/\/vasilias-studio\.github\.io\//i, '');
        if (/^work-[^/]+\.html$/i.test(clean) && !pubFilesMap[clean]) return;
        addWatch(u);
      });
    });
    data.watch = nextWatch;

    /* 5. Enrichir data.media[*].used pour refléter les pages projets & SEO */
    if (Array.isArray(data.media)) {
      var usageMap = {};
      function markUsed(rawPath, label) {
        var rel = relAssetPath(normalizeAssetPath(rawPath));
        if (!rel) return;
        if (!usageMap[rel]) usageMap[rel] = [];
        if (usageMap[rel].indexOf(label) < 0) usageMap[rel].push(label);
      }
      projects.forEach(function (p) {
        if (!p || p.status === 'archived') return;
        var pFile = projectHref(p);
        var pPrimary = getPrimaryCover(p);
        if (pPrimary && p.status === 'published') {
          markUsed(pPrimary, 'index.html');
          markUsed(pPrimary, 'work.html');
        }
        getProjectCovers(p).forEach(function (c) { markUsed(c, pFile); });
        (Array.isArray(p.gallery) ? p.gallery : []).forEach(function (g) { markUsed(g, pFile); });
      });
      ((data && data.supports) || []).forEach(function (sp) {
        if (!sp || !sp.page) return;
        if (sp.cover) markUsed(sp.cover, sp.page);
        (Array.isArray(sp.gallery) ? sp.gallery : []).forEach(function (g) { markUsed(g, sp.page); });
      });
      Object.keys(data.seo || {}).forEach(function (pgFile) {
        var s = data.seo[pgFile];
        if (!s || !s.img) return;
        var local = String(s.img).replace(/^https?:\/\/vasilias-studio\.github\.io\//i, '');
        if (!/^https?:/i.test(local)) markUsed(local, 'SEO ' + pgFile);
      });
      data.media.forEach(function (m) {
        if (!m) return;
        var rel = relAssetPath(normalizeAssetPath(m.path || m.file));
        if (rel && usageMap[rel] && usageMap[rel].length) {
          m.used = usageMap[rel].join(', ');
        }
      });
    }

    return data;
  }

  function setMeta(doc, selector, attr, val) {
    if (val == null || val === '') return;
    var el = doc.querySelector(selector);
    if (el) el.setAttribute(attr, val);
  }

  function applySeo(doc, data, pageFile) {
    var seoMap = (data && data.seo) || {};
    var seo = seoMap[pageFile] || {};
    var proj = /^work-/i.test(pageFile || '') ? findProjectByFile(data, pageFile) : null;
    var effTitle = seo.title || (proj ? ((proj.title || proj.slug || 'Projet') + ' — Vasilías') : '');
    var effDesc = seo.desc || (proj ? defaultProjectDesc(proj) : '');
    if (effTitle) {
      var titleEl = doc.querySelector('title');
      if (titleEl) titleEl.textContent = effTitle;
      setMeta(doc, 'meta[property="og:title"]', 'content', seo.ogTitle || effTitle);
      setMeta(doc, 'meta[name="twitter:title"]', 'content', seo.ogTitle || effTitle);
    }
    if (effDesc) {
      setMeta(doc, 'meta[name="description"]', 'content', effDesc);
      setMeta(doc, 'meta[property="og:description"]', 'content', seo.ogDesc || effDesc);
      setMeta(doc, 'meta[name="twitter:description"]', 'content', seo.ogDesc || effDesc);
    }
    var globalSeo = ((data && data.seo) || {})['index.html'] || {};
    var projCover = proj ? getPrimaryCover(proj) : '';
    var shareImage = seo.img || projCover || globalSeo.img;
    if (shareImage) {
      var imgUrl = fullUrl(shareImage);
      var prevImgEl = doc.querySelector('meta[property="og:image"]');
      var prevImg = prevImgEl ? (prevImgEl.getAttribute('content') || '') : '';
      setMeta(doc, 'meta[property="og:image"]', 'content', imgUrl);
      setMeta(doc, 'meta[name="twitter:image"]', 'content', imgUrl);
      /* Type MIME déduit de l'extension, pour rester cohérent avec l'image choisie dans le Hub */
      var imgExt = ((imgUrl.split('?')[0].match(/\.([a-z0-9]+)$/i) || [])[1] || '').toLowerCase();
      var imgMime = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' }[imgExt];
      if (imgMime) setMeta(doc, 'meta[property="og:image:type"]', 'content', imgMime);
      /* Nouvelle image sans dimensions connues : retirer les anciennes valeurs, devenues fausses */
      if (prevImg && prevImg !== imgUrl && !seo.imgWidth && !seo.imgHeight) {
        ['og:image:width', 'og:image:height'].forEach(function (prop) {
          var el = doc.querySelector('meta[property="' + prop + '"]');
          if (el && el.parentNode) el.parentNode.removeChild(el);
        });
      }
    }
    if (seo.imgWidth) setMeta(doc, 'meta[property="og:image:width"]', 'content', seo.imgWidth);
    if (seo.imgHeight) setMeta(doc, 'meta[property="og:image:height"]', 'content', seo.imgHeight);
    var effCanonical = seo.canonical || (proj ? (SITE_ORIGIN + pageFile) : '');
    if (effCanonical) {
      setMeta(doc, 'link[rel="canonical"]', 'href', effCanonical);
      setMeta(doc, 'meta[property="og:url"]', 'content', effCanonical);
    }
  }

  function applyGlobalChrome(doc, data) {
    var contact = (data && data.contact) || {};
    var email = contact.email || 'ericotlauranto34@gmail.com';
    var positioning = contact.positioning || 'Graphic & Digital Designer — Freelance';
    var availability = contact.availability || 'Disponible pour projets';
    var profiles = ((data && data.profiles) || []).filter(function (pr) {
      return pr && pr.url && !/^mailto:/i.test(pr.url);
    });

    /* Mobile menu footer */
    var menuFoot = doc.querySelector('.menu-foot');
    if (menuFoot) {
      var cols = menuFoot.querySelectorAll(':scope > div');
      if (cols[0]) {
        var posP = cols[0].querySelectorAll('p');
        if (posP[1]) posP[1].textContent = positioning;
      }
      if (cols[1]) {
        var mailA = cols[1].querySelector('a');
        if (mailA) {
          mailA.setAttribute('href', 'mailto:' + email);
          mailA.textContent = email;
        }
      }
    }

    /* Footer CTA + brand + social profiles */
    var footer = doc.querySelector('.site-footer');
    if (footer) {
      var ctaMail = footer.querySelector('.footer-btns a.btn-light');
      if (ctaMail) ctaMail.setAttribute('href', 'mailto:' + email);
      var emailFooter = footer.querySelector('#emailFooter');
      if (emailFooter) emailFooter.textContent = email;

      var brandCol = footer.querySelector('.footer-grid > div:first-child');
      if (brandCol) {
        var ps = brandCol.querySelectorAll('p:not(.brand)');
        if (ps[0]) ps[0].textContent = positioning;
        if (ps[1]) ps[1].textContent = availability;
      }

      var footerCols = footer.querySelectorAll('.footer-grid > div');
      var socialUl = footer.querySelector('[data-hub="footer-profiles"]') || (footerCols[2] ? footerCols[2].querySelector('ul') : null);
      if (socialUl && profiles.length) {
        socialUl.innerHTML = profiles.map(function (pr) {
          return '<li><a href="' + esc(pr.url) + '" target="_blank" rel="noopener noreferrer">' + socialIconSvg(pr.name) + esc(pr.name) + '</a></li>';
        }).join('');
      }
    }
  }

  function buildHomeCardHtml(item, alts, isClone) {
    var href = item.href;
    var cover = normalizeAssetPath(item.cover);
    var rel = relAssetPath(cover);
    var alt = (alts && alts[rel]) || item.alt || item.title || '';
    var roleAttrs = isClone ? 'role="presentation" tabindex="-1"' : 'role="listitem"';
    var tagsHtml = (item.tags || []).map(function (t) {
      return '<span>' + esc(t) + '</span>';
    }).join('');
    return '<a class="h2-card" ' + roleAttrs + ' href="' + esc(href) + '">'
      + '<span class="h2-card-media">'
      + (cover ? '<img src="' + esc(encodeURI(cover)) + '" alt="' + esc(alt) + '" loading="lazy" decoding="async">' : '')
      + '</span>'
      + '<strong class="h2-card-t">' + esc(item.title) + '</strong>'
      + '<span class="h2-card-d">' + esc(item.desc || '') + '</span>'
      + '<span class="h2-tags">' + tagsHtml + '</span>'
      + '</a>';
  }

  function applyHome(doc, data) {
    var alts = (data && data.alts) || {};
    if (data.pitch) {
      var moiTitle = doc.querySelector('#moi .h2-title');
      var moiSub = doc.querySelector('#moi .h2-sub');
      if (moiTitle && data.pitch.tagline) moiTitle.textContent = data.pitch.tagline;
      if (moiSub && data.pitch.intro) moiSub.textContent = data.pitch.intro;
    }

    if (data.process) {
      var procTitle = doc.querySelector('#processus > .h2-title');
      if (procTitle && data.process.heading) {
        procTitle.innerHTML = escMultilineHtml(data.process.heading);
      }
      var stepsOl = doc.querySelector('#processus .h2-steps');
      if (stepsOl && Array.isArray(data.process.steps) && data.process.steps.length) {
        stepsOl.innerHTML = data.process.steps.map(function (st, idx) {
          var d = (0.05 + idx * 0.1).toFixed(2).replace(/0$/, '') + 's';
          var num = String(idx + 1).padStart(2, '0');
          return '<li class="h2-step reveal reveal-up" style="--d:' + d + '">'
            + '<span class="h2-num">' + num + '</span>'
            + '<h3 class="h2-step-t">' + esc(st.title) + '</h3>'
            + '<p class="h2-step-d">' + esc(st.desc) + '</p>'
            + '</li>';
        }).join('');
      }
    }

    /* Marquee projets sélectionnés */
    var tracks = doc.querySelectorAll('#projets .h2-track');
    if (tracks.length) {
      var cards = [];
      getPublishedProjects(data).forEach(function (p) {
        cards.push({
          href: projectHref(p),
          cover: getPrimaryCover(p),
          title: p.title,
          desc: p.tagline || '',
          tags: p.category || []
        });
      });
      ((data && data.supports) || []).forEach(function (sp) {
        if (sp && sp.showOnHome !== false) {
          cards.push({
            href: sp.page || 'work.html',
            cover: sp.cover,
            title: sp.title,
            desc: sp.desc || '',
            tags: sp.category ? [sp.category] : []
          });
        }
      });
      if (cards.length) {
        var primaryHtml = cards.map(function (c) { return buildHomeCardHtml(c, alts, false); }).join('\n      ');
        var cloneHtml = cards.map(function (c) { return buildHomeCardHtml(c, alts, true); }).join('\n      ');
        Array.prototype.forEach.call(tracks, function (track) {
          var sets = track.querySelectorAll('.h2-set');
          if (sets[0]) sets[0].innerHTML = primaryHtml;
          if (sets[1]) sets[1].innerHTML = cloneHtml;
        });
      }
    }

    /* Champs d'intervention */
    if (data.fieldsHeading) {
      var chTitle = doc.querySelector('#champs > .h2-title');
      if (chTitle) chTitle.innerHTML = escMultilineHtml(data.fieldsHeading);
    }
    if (Array.isArray(data.fields) && data.fields.length) {
      var rowsEl = doc.querySelector('#champs .h2-rows');
      if (rowsEl) {
        rowsEl.innerHTML = data.fields.map(function (f, idx) {
          var even = idx % 2 === 1 ? ' even' : '';
          var d = (0.05 + idx * 0.1).toFixed(2).replace(/0$/, '') + 's';
          return '<a class="h2-row' + even + ' reveal reveal-up" style="--d:' + d + '" href="' + esc(f.href || 'services.html') + '">'
            + '<span class="h2-row-t">' + esc(f.title) + '</span>'
            + '<span class="h2-row-d">' + esc(f.desc || '') + '</span>'
            + '</a>';
        }).join('\n      ');
      }
    }
  }

  function applyWork(doc, data) {
    var alts = (data && data.alts) || {};
    var pub = getPublishedProjects(data);
    var supports = (data && data.supports) || [];

    /* Grid des projets publiés */
    var workGrid = doc.querySelector('.work-grid');
    if (workGrid) {
      if (!pub.length) {
        workGrid.innerHTML = '<p style="color:var(--muted);padding:2rem 0;">Aucun projet publié pour le moment.</p>';
      } else {
        workGrid.innerHTML = pub.map(function (p, idx) {
          var num = String(idx + 1).padStart(2, '0');
          var clientLbl = projectClientLabel(p);
          var metaTxt = [p.year, clientLbl].filter(Boolean).join(' · ');
          var cats = p.category || [];
          var cover = getPrimaryCover(p);
          var rel = relAssetPath(cover);
          var alt = alts[rel] || ('Vignette du projet ' + p.title);
          var anim = idx % 2 === 0 ? 'reveal-right' : 'reveal-down';
          return '<a class="work-card reveal ' + anim + '" href="' + esc(projectHref(p)) + '" data-categories="' + esc(cats.join(' ')) + '">'
            + '<div class="work-card-media">'
            + (cover ? '<img src="' + esc(encodeURI(cover)) + '" alt="' + esc(alt) + '" loading="lazy" decoding="async">' : '')
            + '</div>'
            + '<div class="work-card-body">'
            + '<div>'
            + '<div class="selected-meta"><span class="num">' + num + '</span>' + (metaTxt ? '<span>·</span><span>' + esc(metaTxt) + '</span>' : '') + '</div>'
            + '<h3 class="work-card-title">' + esc(p.title) + '</h3>'
            + '<p class="work-card-cats">' + esc(cats.join(' · ')) + '</p>'
            + '</div>'
            + '<svg aria-hidden="true" focusable="false" class="work-card-arrow ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg>'
            + '</div>'
            + '</a>';
        }).join('\n\n      ');
      }
    }

    /* Supports de communication */
    var mediaGrid = doc.querySelector('.media-grid');
    if (mediaGrid && supports.length) {
      mediaGrid.innerHTML = supports.map(function (sp, idx) {
        var cover = normalizeAssetPath(sp.cover);
        var rel = relAssetPath(cover);
        var alt = alts[rel] || sp.title;
        var anim = idx % 2 === 0 ? 'reveal-left' : 'reveal-right';
        return '<a class="media-card reveal ' + anim + '" href="' + esc(sp.page || '#') + '" data-categories="' + esc(sp.category || '') + '">'
          + '<div class="media-card-media">'
          + (cover ? '<img src="' + esc(encodeURI(cover)) + '" alt="' + esc(alt) + '" loading="lazy" decoding="async">' : '')
          + (sp.tag ? '<span class="media-tag">' + esc(sp.tag) + '</span>' : '')
          + '</div>'
          + '<h3 class="media-card-title">' + esc(sp.title) + '</h3>'
          + '<p class="media-card-desc">' + esc(sp.desc || '') + '</p>'
          + '</a>';
      }).join('\n\n        ');
    }

    /* Barre de filtres dynamique */
    var filterBar = doc.querySelector('#filterBar');
    if (filterBar) {
      var activeBtn = filterBar.querySelector('button.active');
      var activeCat = activeBtn ? activeBtn.getAttribute('data-filter') : 'Tous';
      var counts = {};
      var order = ['Identity', 'Branding', 'Packaging', 'Print', 'Social'];
      pub.forEach(function (p) {
        (p.category || []).forEach(function (c) {
          counts[c] = (counts[c] || 0) + 1;
          if (order.indexOf(c) === -1) order.push(c);
        });
      });
      supports.forEach(function (sp) {
        if (sp && sp.category) {
          counts[sp.category] = (counts[sp.category] || 0) + 1;
          if (order.indexOf(sp.category) === -1) order.push(sp.category);
        }
      });
      var total = pub.length + supports.length;
      if (activeCat !== 'Tous' && !counts[activeCat]) activeCat = 'Tous';
      var btns = ['<button' + (activeCat === 'Tous' ? ' class="active"' : '') + ' data-filter="Tous">Tous (' + total + ')</button>'];
      order.forEach(function (c) {
        if (counts[c]) {
          btns.push('<button' + (activeCat === c ? ' class="active"' : '') + ' data-filter="' + esc(c) + '">' + esc(c) + ' (' + counts[c] + ')</button>');
        }
      });
      filterBar.innerHTML = btns.join('\n      ');
    }
  }

  /* Boutons « Demander un devis » : catégorie du formulaire de devis déduite du titre du service */
  var QUOTE_BTN_ARROW = '<svg aria-hidden="true" focusable="false" class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><polyline points="19 12 12 19 5 12"></polyline></svg>';
  function quoteCategoryFor(title) {
    var t = String(title || '').toLowerCase();
    if (/packag|emball|étiquet|etiquet/.test(t)) return 'packaging';
    if (/réseaux|reseaux|social/.test(t)) return 'social';
    if (/logo|identit|brandboard|charte/.test(t)) return 'identity';
    if (/support|communication|print|affiche|flyer|brochure/.test(t)) return 'graphic';
    return 'other';
  }

  function applyServices(doc, data) {
    var grid = doc.querySelector('.services-grid');
    if (!grid || !Array.isArray(data.services)) return;
    var anims = ['reveal-left', 'reveal-right', 'reveal-down', 'reveal-zoom', 'reveal-fade', 'reveal-zoom-out'];
    var serviceImages = ['logo-identite', 'brandboard-v2', 'supports-communication-v2', 'reseaux-sociaux-v2', 'packaging-v2'];
    grid.innerHTML = data.services.map(function (s, idx) {
      var img = normalizeAssetPath(s.image) || ('assets/services/' + serviceImages[idx % serviceImages.length] + '.jpg');
      var num = String(idx + 1).padStart(2, '0');
      var anim = anims[idx % anims.length];
      return '<div class="service-card reveal ' + anim + '">'
        + '<div>'
        + '<span class="service-num">' + num + '</span>'
        + '<h2 class="service-title">' + esc(s.title) + '</h2>'
        + '<p class="service-desc">' + esc(s.desc || '') + '</p>'
        + '</div>'
        + '<div class="service-foot"><span>' + esc(s.foot || '') + '</span>'
        + '<a class="btn btn-dark service-quote-btn" href="#quoteSectionTitle" data-quote-category="' + quoteCategoryFor(s.title) + '" aria-label="Demander un devis : ' + esc(s.title) + '">Demander un devis ' + QUOTE_BTN_ARROW + '</a>'
        + '</div>'
        + '<figure class="service-media"><img src="' + esc(img) + '" alt="" width="1180" height="1180" loading="lazy" decoding="async"></figure>'
        + '</div>';
    }).join('\n      ');
  }

  function applyAbout(doc, data) {
    var alts = (data && data.alts) || {};
    var ab = (data && data.about) || {};
    if (ab.portrait) {
      var pImg = doc.querySelector('.about-portrait img');
      if (pImg) {
        var pSrc = normalizeAssetPath(ab.portrait);
        pImg.setAttribute('src', pSrc);
        var rel = relAssetPath(pSrc);
        if (alts[rel]) pImg.setAttribute('alt', alts[rel]);
      }
    }
    if (ab.caption !== undefined) {
      var cap = doc.querySelector('.about-portrait-caption');
      if (cap) cap.textContent = ab.caption;
    }
    if (ab.heading) {
      var h2 = doc.querySelector('.about-grid .about-h2');
      if (h2) h2.textContent = ab.heading;
    }
    if (ab.lead) {
      var lead = doc.querySelector('.about-body-lg');
      if (lead) lead.textContent = ab.lead;
    }
    if (Array.isArray(ab.paragraphs) && ab.paragraphs.length) {
      var bodyEl = doc.querySelector('[data-hub="about-paragraphs"]') || doc.querySelector('.about-grid > div:nth-child(2) > div:first-child .about-body');
      if (bodyEl) {
        bodyEl.innerHTML = ab.paragraphs.map(function (para) {
          return '<p>' + esc(para) + '</p>';
        }).join('\n            ');
      }
    }

    /* Méthodologie de la page À propos */
    var method = doc.querySelector('[data-hub="about-work-process"]');
    var workProcess = ab.workProcess || {};
    if (method && Array.isArray(workProcess.steps) && workProcess.steps.length) {
      var methodSteps = workProcess.steps.map(function (step, idx) {
        var delay = (0.05 + idx * 0.1).toFixed(2).replace(/0$/, '') + 's';
        var num = String(idx + 1).padStart(2, '0');
        var points = (step.points || []).map(function (point) { return '<li>' + esc(point) + '</li>'; }).join('');
        return '<li class="about-method-step reveal reveal-up" style="--d:' + delay + '">'
          + '<span class="about-method-number" aria-hidden="true">' + num + '</span>'
          + '<h4 class="about-method-step-title">' + esc(step.title) + '</h4>'
          + '<p class="about-method-hook">' + esc(step.hook || '') + '</p>'
          + '<ul class="about-method-list">' + points + '</ul>'
          + '<p class="about-method-goal"><span>Objectif</span> ' + esc(step.goal || '') + '</p>'
          + '</li>';
      }).join('');
      method.innerHTML = '<header class="about-method-head reveal reveal-up">'
        + '<h3 class="about-method-title" id="about-method-title">' + esc(workProcess.title || 'Comment je travaille') + '</h3>'
        + '<p class="about-method-intro">' + esc(workProcess.intro || '') + '</p></header>'
        + '<ol class="about-method-grid">' + methodSteps + '</ol>'
        + (workProcess.quote ? '<blockquote class="about-method-quote reveal reveal-up"><p>« ' + esc(workProcess.quote) + ' »</p></blockquote>' : '');
    }

    /* Compétences & Outils */
    var skillsWrap = doc.querySelector('[data-hub="skills-list"]');
    if (skillsWrap && Array.isArray(data.skills)) {
      var skillDescriptions = {
        'Branding & identité visuelle': 'Conception d’univers de marque cohérents et reconnaissables.',
        'Design graphique': 'Création de supports visuels adaptés aux objectifs de communication.',
        'Direction artistique': 'Définition d’une intention visuelle et cohérence de l’ensemble des créations.',
        'Packaging': 'Conception graphique et mise en valeur des produits à travers leur emballage.',
        'Design digital & UI/UX': 'Conception d’interfaces et d’expériences numériques claires et fonctionnelles.',
        'Création 3D (Blender)': 'Modélisation et création de visuels tridimensionnels.'
      };
      var skSec = skillsWrap.closest ? (skillsWrap.closest('.about-capabilities-panel') || skillsWrap.closest('.about-section')) : null;
      var capabilitiesGrid = skillsWrap.closest ? skillsWrap.closest('.about-capabilities-grid') : null;
      if (!data.skills.length && skSec) {
        skSec.style.display = 'none';
        if (capabilitiesGrid) capabilitiesGrid.classList.add('is-tools-only');
      } else {
        if (skSec) skSec.style.display = '';
        if (capabilitiesGrid) capabilitiesGrid.classList.remove('is-tools-only');
        skillsWrap.innerHTML = data.skills.map(function (sk, idx) {
          var num = String(idx + 1).padStart(2, '0');
          var delay = (0.05 + idx * 0.07).toFixed(2).replace(/0$/, '') + 's';
          var desc = skillDescriptions[sk] || '';
          return '<li class="about-skill-item reveal reveal-up" style="--d:' + delay + '"><span class="about-skill-number">' + num + '</span><div><h5>' + esc(sk) + '</h5>' + (desc ? '<p>' + esc(desc) + '</p>' : '') + '</div></li>';
        }).join('');
      }
    }

    var toolsWrap = doc.querySelector('[data-hub="tools-list"]') || doc.querySelectorAll('.about-tools')[skillsWrap ? 1 : 0];
    if (toolsWrap && Array.isArray(data.tools)) {
      toolsWrap.innerHTML = data.tools.map(function (tl) {
        return '<span>' + toolIconHtml(tl) + esc(tl) + '</span>';
      }).join('');
    }
  }

  function applyContact(doc, data) {
    var ct = (data && data.contact) || {};
    var email = ct.email || 'ericotlauranto34@gmail.com';
    if (ct.heading) {
      var h2 = doc.querySelector('.contact-grid .about-h2');
      if (h2) h2.textContent = ct.heading;
    }
    if (ct.intro) {
      var intro = doc.querySelector('.contact-intro');
      if (intro) intro.textContent = ct.intro;
    }
    var emailEl = doc.querySelector('#emailContact');
    if (emailEl) emailEl.textContent = email;
    var mailBtn = doc.querySelector('.mail-actions a.btn-dark');
    if (mailBtn) mailBtn.setAttribute('href', 'mailto:' + email);
    var form = doc.querySelector('#contactForm');
    var formsEndpoint = typeof window !== 'undefined' && window.VAS_FORMS_CONFIG && window.VAS_FORMS_CONFIG.endpoint;
    if (form && formsEndpoint) form.setAttribute('action', formsEndpoint);
    var formErr = doc.querySelector('#formError');
    if (formErr) {
      formErr.textContent = 'Une erreur est survenue. Veuillez réessayer ou envoyer directement à ' + email + '.';
    }
    var socialList = doc.querySelector('.social-list');
    var profiles = ((data && data.profiles) || []).filter(function (pr) {
      return pr && pr.url && !/^mailto:/i.test(pr.url);
    });
    if (socialList && profiles.length) {
      socialList.innerHTML = profiles.map(function (pr) {
        return '<a class="social-item" href="' + esc(pr.url) + '" target="_blank" rel="noopener noreferrer">'
          + socialIconSvg(pr.name)
          + '<span class="name">' + esc(pr.name) + '</span>'
          + '</a>';
      }).join('');
    }
  }

  function applySupportPage(doc, data, pageFile) {
    var supports = (data && data.supports) || [];
    var sp = supports.find(function (x) { return x && x.page === pageFile; });
    if (!sp) return;
    if (sp.title) {
      var pt = doc.querySelector('.page-title');
      if (pt) pt.textContent = sp.title;
    }
    if (sp.overview) {
      var ov = doc.querySelector('.case-overview p');
      if (ov) ov.textContent = sp.overview;
    }
    if (sp.cover) {
      var heroImg = doc.querySelector('.case-hero img');
      if (heroImg) heroImg.setAttribute('src', normalizeAssetPath(sp.cover));
    }
    var spAlts = (data && data.alts) || {};
    var spGal = doc.querySelector('[data-hub="support-gallery"]');
    if (spGal && Array.isArray(sp.gallery)) {
      var spImgs = sp.gallery.filter(Boolean);
      spGal.innerHTML = spImgs.length
        ? '<div class="case-grid-2">' + spImgs.map(function (g) {
          var gs = normalizeAssetPath(g);
          var gr = relAssetPath(gs);
          return '<img src="' + esc(encodeURI(gs)) + '" alt="' + esc(spAlts[gr] || sp.title) + '" loading="lazy" decoding="async">';
        }).join('') + '</div>'
        : '';
    }
    var spFmt = doc.querySelector('[data-hub="support-formats"]');
    if (spFmt && Array.isArray(sp.formats) && sp.formats.length) {
      spFmt.innerHTML = sp.formats.map(function (f) { return '<span>' + esc(f) + '</span>'; }).join('\n        ');
    }
  }

  function projectSectionsHtml(sections) {
    return (Array.isArray(sections) ? sections : []).map(function (sec, i) {
      var title = String((sec && sec.title) || '').trim();
      var text = String((sec && sec.text) || '').trim();
      if (!title && !text) return '';
      var paras = text ? text.split(/\n{2,}/).map(function (t) { return t.trim(); }).filter(Boolean).map(function (t) {
        return '<p>' + esc(t).replace(/\n/g, '<br>') + '</p>';
      }).join('') : '';
      return '<div class="case-block case-block-text reveal ' + (i % 2 ? 'reveal-up' : 'reveal-zoom') + '" data-hub="project-section">'
        + (title ? '<h3>' + esc(title) + '</h3>' : '') + paras + '</div>';
    }).join('\n    ');
  }

  function applyProjectPage(doc, data, pageFile) {
    var projects = (data && data.projects) || [];
    var baseSlug = pageFile.replace(/\.html$/i, '');
    var p = projects.find(function (x) {
      return x && (projectHref(x) === pageFile || x.slug === baseSlug || ('work-' + x.slug) === baseSlug);
    });
    if (!p) return;

    var pub = getPublishedProjects(data);
    var pubIdx = pub.indexOf(p);
    var numLabel = pubIdx >= 0 ? ('Projet ' + String(pubIdx + 1).padStart(2, '0')) : 'Projet';

    var eyeRow = doc.querySelector('.case-header .eyebrow-row');
    if (eyeRow) {
      var numEl = eyeRow.querySelector('.num');
      if (numEl) numEl.textContent = numLabel;
      var spans = eyeRow.querySelectorAll('span');
      if (spans.length >= 3) spans[spans.length - 1].textContent = (p.category || []).join(' · ');
    }
    var titleEl = doc.querySelector('.case-title');
    if (titleEl && p.title) titleEl.textContent = p.title;
    var tagEl = doc.querySelector('.case-tagline');
    if (tagEl && p.tagline !== undefined) tagEl.textContent = p.tagline;

    var metaCols = doc.querySelectorAll('.case-meta > div');
    if (metaCols[0]) {
      var v0 = metaCols[0].querySelector('.v');
      if (v0) v0.textContent = p.year || '—';
    }
    if (metaCols[1]) {
      var v1 = metaCols[1].querySelector('.v');
      if (v1) v1.textContent = projectClientLabel(p) || '—';
    }
    if (metaCols[2]) {
      var v2 = metaCols[2].querySelector('.v');
      if (v2) v2.textContent = p.role || (p.category || []).join(' · ') || '—';
    }

    if (p.overview) {
      var ovP = doc.querySelector('.case-overview p');
      if (ovP) ovP.textContent = p.overview;
    }

    if (Array.isArray(p.sections)) {
      Array.prototype.slice.call(doc.querySelectorAll('.case-block-text')).forEach(function (el) {
        if (el.parentNode) el.parentNode.removeChild(el);
      });
      var secHtml = projectSectionsHtml(p.sections);
      var ovBlock = doc.querySelector('.case-overview');
      if (secHtml && ovBlock) ovBlock.insertAdjacentHTML('afterend', '\n    ' + secHtml);
    }

    var oldCovImg = doc.querySelector('[data-hub="project-cover"]');
    var oldHero = doc.querySelector('[data-hub="project-covers"]')
      || (oldCovImg && oldCovImg.closest ? oldCovImg.closest('.case-hero') : null)
      || doc.querySelector('.page > .case-hero');

    if (!Array.isArray(p.covers) && oldHero && oldHero.hasAttribute('data-slider') && oldCovImg) {
      var legacySrc = getPrimaryCover(p);
      if (legacySrc) {
        var legacyRel = relAssetPath(legacySrc);
        var legacyAlts = (data && data.alts) || {};
        oldCovImg.setAttribute('src', encodeURI(legacySrc));
        if (legacyAlts[legacyRel]) oldCovImg.setAttribute('alt', legacyAlts[legacyRel]);
      }
    } else {
      var covers = getProjectCovers(p);
      var primaryCov = getPrimaryCover(p);
      var altsMap = (data && data.alts) || {};
      if (!covers.length) {
        if (oldHero) oldHero.remove();
      } else {
        var sameSlides = false;
        if (oldHero) {
          var isSliderHero = oldHero.hasAttribute('data-slider');
          if (covers.length >= 2 && isSliderHero) {
            var curSlides = oldHero.querySelectorAll('.slider-track > img');
            if (curSlides.length === covers.length) {
              sameSlides = Array.prototype.every.call(curSlides, function (im, idx) {
                return normalizeAssetPath(decodeURI(im.getAttribute('src') || '')) === covers[idx];
              });
              if (sameSlides) {
                var mIdx = covers.indexOf(primaryCov);
                if (mIdx < 0) mIdx = 0;
                Array.prototype.forEach.call(curSlides, function (im, idx) {
                  if (idx === mIdx) im.setAttribute('data-hub', 'project-cover');
                  else im.removeAttribute('data-hub');
                  var rPath = relAssetPath(covers[idx]);
                  if (altsMap[rPath]) im.setAttribute('alt', altsMap[rPath]);
                });
              }
            }
          } else if (covers.length === 1 && !isSliderHero) {
            var allImgs = oldHero.querySelectorAll('img');
            if (allImgs.length === 1 && normalizeAssetPath(decodeURI(allImgs[0].getAttribute('src') || '')) === covers[0]) {
              sameSlides = true;
              allImgs[0].setAttribute('data-hub', 'project-cover');
              var singleRel = relAssetPath(covers[0]);
              allImgs[0].setAttribute('alt', altsMap[singleRel] || ('Visuel principal du projet ' + p.title));
            }
          }
        }
        if (!sameSlides) {
          var wasInView = !!(oldHero && oldHero.classList && oldHero.classList.contains('in-view'));
          var tmpWrap = doc.createElement('div');
          tmpWrap.innerHTML = buildProjectCoverHeroHtml(p, data, wasInView);
          var newHero = tmpWrap.firstElementChild;
          if (newHero) {
            if (oldHero && oldHero.parentNode) {
              oldHero.parentNode.replaceChild(newHero, oldHero);
            } else {
              var metaBlock = doc.querySelector('.case-meta');
              if (metaBlock && metaBlock.parentNode) metaBlock.parentNode.insertBefore(newHero, metaBlock.nextSibling);
            }
          }
        }
      }
    }

    var galWrap = doc.querySelector('[data-hub="project-gallery"]');
    if (galWrap && Array.isArray(p.gallery)) {
      var alts = (data && data.alts) || {};
      if (!p.gallery.length) {
        galWrap.innerHTML = '';
      } else {
        galWrap.innerHTML = '<div class="case-grid-2">' + p.gallery.map(function (gPath) {
          var src = normalizeAssetPath(gPath);
          var rel = relAssetPath(src);
          return '<img src="' + esc(encodeURI(src)) + '" alt="' + esc(alts[rel] || p.title) + '" loading="lazy" decoding="async">';
        }).join('') + '</div>';
      }
    }

    /* Projet suivant */
    var nextSec = doc.querySelector('.next-project');
    if (nextSec) {
      var nextP = null;
      var nextNum = '';
      if (pub.length > 1) {
        var nextIdx = pubIdx >= 0 ? (pubIdx + 1) % pub.length : 0;
        if (pub[nextIdx] === p && pub.length > 1) nextIdx = (nextIdx + 1) % pub.length;
        nextP = pub[nextIdx];
        nextNum = 'Projet ' + String(nextIdx + 1).padStart(2, '0');
      }
      if (nextP && nextP !== p) {
        nextSec.innerHTML = '<a class="link" href="' + esc(projectHref(nextP)) + '">'
          + '<div class="next-flex">'
          + '<div>'
          + '<span class="num">' + esc(nextNum) + '</span>'
          + '<h3 class="title">' + esc(nextP.title) + '</h3>'
          + '<p class="cats">' + esc((nextP.category || []).join(' · ')) + '</p>'
          + '</div>'
          + '<span class="cta">Découvrir l\'étude <svg aria-hidden="true" focusable="false" class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg></span>'
          + '</div>'
          + '</a>';
      } else {
        nextSec.innerHTML = '<a class="link" href="work.html">'
          + '<div class="next-flex">'
          + '<div>'
          + '<span class="num">Portfolio</span>'
          + '<h3 class="title">Tous les projets</h3>'
          + '<p class="cats">Index des réalisations</p>'
          + '</div>'
          + '<span class="cta">Voir l\'index <svg aria-hidden="true" focusable="false" class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg></span>'
          + '</div>'
          + '</a>';
      }
    }
  }

  function applyAlts(doc, data) {
    var alts = (data && data.alts) || {};
    Array.prototype.forEach.call(doc.querySelectorAll('img[src]'), function (img) {
      if (img.classList && (img.classList.contains('preloader-logo') || img.classList.contains('tool-ico'))) return;
      var src = decodeURI(img.getAttribute('src') || '');
      var rel = relAssetPath(src);
      if (rel && alts[rel]) {
        img.setAttribute('alt', alts[rel]);
      }
    });
  }

  function applyToDocument(doc, data, pageFile) {
    if (!doc || !data) return;
    var file = pageFile || 'index.html';
    applySeo(doc, data, file);
    applyGlobalChrome(doc, data);

    if (file === 'index.html') applyHome(doc, data);
    else if (file === 'work.html') applyWork(doc, data);
    else if (file === 'services.html') applyServices(doc, data);
    else if (file === 'about.html') applyAbout(doc, data);
    else if (file === 'contact.html') applyContact(doc, data);
    else if (file === 'print.html' || file === 'social.html') applySupportPage(doc, data, file);
    else if (/^work-/.test(file)) applyProjectPage(doc, data, file);

    applyAlts(doc, data);
  }

  function serializeDocument(doc) {
    return '<!DOCTYPE html>\n' + doc.documentElement.outerHTML.replace(/\s*<\/body>\s*<\/html>\s*$/i, '\n</body></html>') + '\n';
  }

  function buildProjectPageHtml(project, pubIndex, nextProject, data) {
    var file = projectHref(project);
    var contact = (data && data.contact) || {};
    var email = contact.email || 'ericotlauranto34@gmail.com';
    var positioning = contact.positioning || 'Graphic & Digital Designer — Freelance';
    var availability = contact.availability || 'Disponible pour projets';
    var seo = ((data && data.seo) && data.seo[file]) || {};
    var pageTitle = seo.title || (project.title + ' — Vasilías');
    var pageDesc = seo.desc || defaultProjectDesc(project);
    var coverAsset = getPrimaryCover(project);
    var globalShareImage = (((data && data.seo) || {})['index.html'] || {}).img;
    var ogImage = fullUrl(seo.img || coverAsset || globalShareImage || 'assets/og/og-image-v2.jpg');
    var canonical = seo.canonical || (SITE_ORIGIN + file);
    var alts = (data && data.alts) || {};
    var heroBlockHtml = buildProjectCoverHeroHtml(project, data, false);
    var numLabel = pubIndex >= 0 ? ('Projet ' + String(pubIndex + 1).padStart(2, '0')) : 'Projet';
    var catsDot = (project.category || []).join(' · ');
    var profiles = ((data && data.profiles) || []).filter(function (pr) {
      return pr && pr.url && !/^mailto:/i.test(pr.url);
    });
    var footerProfilesHtml = profiles.map(function (pr) {
      return '<li><a href="' + esc(pr.url) + '" target="_blank" rel="noopener noreferrer">' + socialIconSvg(pr.name) + esc(pr.name) + '</a></li>';
    }).join('');
    var galleryImgs = Array.isArray(project.gallery) ? project.gallery.filter(Boolean) : [];
    var galleryHtml = galleryImgs.length
      ? '<div class="case-grid-2">' + galleryImgs.map(function (g) {
        var gs = normalizeAssetPath(g);
        var gr = relAssetPath(gs);
        return '<img src="' + esc(encodeURI(gs)) + '" alt="' + esc(alts[gr] || project.title) + '" loading="lazy" decoding="async">';
      }).join('') + '</div>'
      : '';

    var pub = getPublishedProjects(data);
    var nextIdx = nextProject ? pub.indexOf(nextProject) : -1;
    var nextHtml = (nextProject && nextProject !== project)
      ? '<a class="link" href="' + esc(projectHref(nextProject)) + '"><div class="next-flex"><div><span class="num">Projet ' + String((nextIdx >= 0 ? nextIdx : 0) + 1).padStart(2, '0') + '</span><h3 class="title">' + esc(nextProject.title) + '</h3><p class="cats">' + esc((nextProject.category || []).join(' · ')) + '</p></div><span class="cta">Découvrir l\'étude <svg aria-hidden="true" focusable="false" class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg></span></div></a>'
      : '<a class="link" href="work.html"><div class="next-flex"><div><span class="num">Portfolio</span><h3 class="title">Tous les projets</h3><p class="cats">Index des réalisations</p></div><span class="cta">Voir l\'index <svg aria-hidden="true" focusable="false" class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg></span></div></a>';

    return '<!DOCTYPE html>\n'
      + '<html lang="fr">\n'
      + '<head>\n'
      + '  <meta charset="UTF-8">\n'
      + '  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n'
      + '  <title>' + esc(pageTitle) + '</title>\n'
      + '  <meta name="description" content="' + esc(pageDesc) + '">\n'
      + '  <link rel="icon" href="favicon.svg" type="image/svg+xml">\n'
      + '  <link rel="preconnect" href="https://fonts.googleapis.com">\n'
      + '  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
      + '  <link href="https://fonts.googleapis.com/css2?family=Josefin+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">\n'
      + '  <link rel="stylesheet" href="css/style.css?v=68">\n'
      + '  <meta property="og:type" content="website">\n'
      + '  <meta property="og:site_name" content="Vasilías Studio">\n'
      + '  <meta property="og:locale" content="fr_FR">\n'
      + '  <meta property="og:title" content="' + esc(pageTitle) + '">\n'
      + '  <meta property="og:description" content="' + esc(pageDesc) + '">\n'
      + '  <meta property="og:url" content="' + esc(canonical) + '">\n'
      + '  <meta property="og:image" content="' + esc(ogImage) + '">\n'
      + '  <meta property="og:image:width" content="' + esc(seo.imgWidth || 1200) + '">\n'
      + '  <meta property="og:image:height" content="' + esc(seo.imgHeight || 630) + '">\n'
      + '  <meta property="og:image:type" content="' + (/\.png(\?|$)/i.test(ogImage) ? 'image/png' : 'image/jpeg') + '">\n'
      + '  <meta name="twitter:card" content="summary_large_image">\n'
      + '  <meta name="twitter:title" content="' + esc(pageTitle) + '">\n'
      + '  <meta name="twitter:description" content="' + esc(pageDesc) + '">\n'
      + '  <meta name="twitter:image" content="' + esc(ogImage) + '">\n'
      + '  <link rel="canonical" href="' + esc(canonical) + '">\n'
      + '</head>\n'
      + '<body data-hub-generated="1">\n'
      + '  <div class="preloader"><img class="preloader-logo" src="assets/logo-vasilias.svg" alt="" width="317" height="178"></div>\n'
      + '  <script>try{if(sessionStorage.getItem("vasilias_nav")==="1")document.querySelector(".preloader").classList.add("from-nav")}catch(e){}<\/script>\n'
      + '  <header class="site-header">\n'
      + '    <div class="container site-header-inner">\n'
      + '      <a href="index.html" class="wordmark">Vasilias</a>\n'
      + '      <nav class="nav-desktop">\n'
      + '        <a href="work.html" class="active" aria-current="page">Projets</a>\n'
      + '        <a href="about.html">À Propos</a>\n'
      + '        <a href="services.html">Services</a>\n'
      + '        <a href="contact.html">Contact</a>\n'
      + '      </nav>\n'
      + '      <button class="menu-btn" id="menuOpenBtn" aria-label="Ouvrir le menu">\n'
      + '        <svg aria-hidden="true" focusable="false" class="ico" viewBox="0 0 24 24" fill="none" stroke="#161513" stroke-width="2" stroke-linecap="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></svg>\n'
      + '      </button>\n'
      + '    </div>\n'
      + '  </header>\n'
      + '  <div class="menu-overlay" id="menuOverlay">\n'
      + '    <div class="menu-top">\n'
      + '      <a href="index.html" class="wordmark">Vasilias</a>\n'
      + '      <button class="menu-close" id="menuCloseBtn" aria-label="Fermer le menu">\n'
      + '        <svg aria-hidden="true" focusable="false" class="ico" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>\n'
      + '      </button>\n'
      + '    </div>\n'
      + '    <nav class="menu-links">\n'
      + '      <a href="index.html">Accueil</a>\n'
      + '      <a href="work.html" class="active" aria-current="page">Projets</a>\n'
      + '      <a href="about.html">À Propos</a>\n'
      + '      <a href="services.html">Services</a>\n'
      + '      <a href="contact.html">Contact</a>\n'
      + '    </nav>\n'
      + '    <div class="menu-foot">\n'
      + '      <div><p class="label">Positionnement</p><p>' + esc(positioning) + '</p></div>\n'
      + '      <div><p class="label">Contact Direct</p><a href="mailto:' + esc(email) + '">' + esc(email) + '</a></div>\n'
      + '    </div>\n'
      + '  </div>\n'
      + '  <article class="page">\n'
      + '    <div class="case-header reveal reveal-up">\n'
      + '      <div class="eyebrow-row font-mono-custom">\n'
      + '        <span class="num">' + esc(numLabel) + '</span><span>·</span><span>' + esc(catsDot) + '</span>\n'
      + '      </div>\n'
      + '      <h1 class="case-title">' + esc(project.title) + '</h1>\n'
      + '      <p class="case-tagline">' + esc(project.tagline || '') + '</p>\n'
      + '    </div>\n'
      + '    <div class="case-meta reveal reveal-left">\n'
      + '      <div><p class="k">Date</p><p class="v">' + esc(project.year || '—') + '</p></div>\n'
      + '      <div><p class="k">Client</p><p class="v">' + esc(projectClientLabel(project) || '—') + '</p></div>\n'
      + '      <div style="grid-column:span 2;"><p class="k">Rôles &amp; Disciplines</p><p class="v">' + esc(project.role || catsDot || '—') + '</p></div>\n'
      + '    </div>\n'
      + (heroBlockHtml ? '    ' + heroBlockHtml + '\n' : '')
      + '    <div class="case-overview reveal reveal-down">\n'
      + '      <h2>Aperçu du Projet</h2>\n'
      + '      <p>' + esc(project.overview || project.tagline || '') + '</p>\n'
      + '    </div>\n'
      + (projectSectionsHtml(project.sections) ? '    ' + projectSectionsHtml(project.sections) + '\n' : '')
      + '    <div class="case-block reveal reveal-up" data-hub="project-gallery">' + galleryHtml + '</div>\n'
      + '    <section class="next-project reveal reveal-up">' + nextHtml + '</section>\n'
      + '  </article>\n'
      + '  <footer class="site-footer">\n'
      + '    <div class="container">\n'
      + '      <div class="footer-cta">\n'
      + '        <h2>Un projet en tête ? <span class="accent">Travaillons ensemble.</span></h2>\n'
      + '        <div class="footer-btns">\n'
      + '          <a class="btn btn-light" style="background:#fff;color:#161513;" href="mailto:' + esc(email) + '">Envoyer un email <svg aria-hidden="true" focusable="false" class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg></a>\n'
      + '          <button class="btn btn-copy" id="copyEmailFooter" data-copied="Adresse copiée"><span id="emailFooter" style="display:none;">' + esc(email) + '</span><svg aria-hidden="true" focusable="false" class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg><span>Copier l\'email</span></button>\n'
      + '        </div>\n'
      + '      </div>\n'
      + '      <div class="footer-grid">\n'
      + '        <div><p class="brand">Vasilías</p><p>' + esc(positioning) + '</p><p>' + esc(availability) + '</p></div>\n'
      + '        <div><h4>Navigation</h4><ul><li><a href="work.html">Index des Projets</a></li><li><a href="about.html">À Propos &amp; Parcours</a></li><li><a href="services.html">Services &amp; Expertises</a></li><li><a href="contact.html">Prise de Contact</a></li></ul></div>\n'
      + '        <div><h4>Réseaux &amp; Profils</h4><ul data-hub="footer-profiles">' + footerProfilesHtml + '</ul></div>\n'
      + '        <div class="legal"><p>Droits &amp; Mentions</p><p>© <span id="year"></span> Vasilías. Tous droits réservés.</p></div>\n'
      + '      </div>\n'
      + '    </div>\n'
      + '  </footer>\n'
      + '  <script>document.getElementById(\'year\').textContent = new Date().getFullYear();</script>\n'
      + '  <script src="js/hub-sync.js?v=13"></script>\n'
      + '  <script src="js/main.js?v=15"></script>\n'
      + '</body>\n'
      + '</html>\n';
  }

  function buildSitemapXml(data) {
    var urls = [
      { loc: SITE_ORIGIN, freq: 'monthly', prio: '1.0' },
      { loc: SITE_ORIGIN + 'work.html', freq: 'monthly', prio: '0.9' }
    ];
    getPublishedProjects(data).forEach(function (p) {
      urls.push({ loc: SITE_ORIGIN + projectHref(p), freq: 'yearly', prio: '0.8' });
    });
    urls.push(
      { loc: SITE_ORIGIN + 'services.html', freq: 'yearly', prio: '0.8' },
      { loc: SITE_ORIGIN + 'about.html', freq: 'yearly', prio: '0.7' },
      { loc: SITE_ORIGIN + 'print.html', freq: 'yearly', prio: '0.6' },
      { loc: SITE_ORIGIN + 'social.html', freq: 'yearly', prio: '0.6' },
      { loc: SITE_ORIGIN + 'contact.html', freq: 'yearly', prio: '0.9' }
    );
    var seen = {};
    var body = urls.filter(function (u) {
      if (seen[u.loc]) return false;
      seen[u.loc] = true;
      return true;
    }).map(function (u) {
      return '  <url>\n    <loc>' + esc(u.loc) + '</loc>\n    <changefreq>' + u.freq + '</changefreq>\n    <priority>' + u.prio + '</priority>\n  </url>';
    }).join('\n');
    return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + body + '\n</urlset>\n';
  }

  /* ---------- Hydratation automatique sur le site public ---------- */
  function detectPageFile() {
    if (typeof location === 'undefined') return 'index.html';
    var p = (location.pathname || '').split('/').pop();
    if (!p || p === '/') return 'index.html';
    if (!/\.html$/i.test(p)) return p + '.html';
    return p;
  }

  function safeJsonParse(raw) {
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  }

  function updatedAtMs(d) {
    if (!d || !d.meta || !d.meta.updatedAt) return 0;
    var t = Date.parse(d.meta.updatedAt);
    return isNaN(t) ? 0 : t;
  }

  function pickNewest(a, b) {
    if (!a) return b;
    if (!b) return a;
    return updatedAtMs(a) >= updatedAtMs(b) ? a : b;
  }

  function notifyHydrated() {
    if (typeof document !== 'undefined' && typeof CustomEvent === 'function') {
      document.dispatchEvent(new CustomEvent('vasilias:hydrated'));
    }
  }

  function initLiveSite() {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    /* Ne pas hydrater hub.html lui-même */
    if (document.getElementById('lock') && document.getElementById('app')) return;

    var pageFile = detectPageFile();
    var localDraft = null;
    var liveCache = null;
    var pending = false;
    try {
      localDraft = safeJsonParse(localStorage.getItem(LS_DATA));
      liveCache = safeJsonParse(localStorage.getItem(LS_LIVE_CACHE));
      pending = localStorage.getItem(LS_PENDING) === '1';
    } catch (e) {}

    var initial = pending && localDraft ? localDraft : pickNewest(localDraft, liveCache);
    if (initial) {
      try { applyToDocument(document, initial, pageFile); } catch (e) {}
    }

    /* Récupération fraîche de hub-data.json sans cache navigateur */
    if (typeof fetch === 'function') {
      fetch('hub-data.json?t=' + Date.now(), { cache: 'no-store' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (remote) {
          if (!remote) return;
          var best = remote;
          try {
            var curDraft = safeJsonParse(localStorage.getItem(LS_DATA));
            var isPending = localStorage.getItem(LS_PENDING) === '1';
            if (isPending && curDraft) {
              best = pickNewest(curDraft, remote);
            } else if (curDraft && updatedAtMs(curDraft) > updatedAtMs(remote)) {
              best = curDraft;
            }
            localStorage.setItem(LS_LIVE_CACHE, JSON.stringify(best));
          } catch (e) {}
          applyToDocument(document, best, pageFile);
          notifyHydrated();
        })
        .catch(function () {});
    }

    /* Mise à jour instantanée inter-onglets (0 ms) dès qu'on enregistre dans le Hub */
    if (typeof BroadcastChannel === 'function') {
      try {
        var bc = new BroadcastChannel('vasilias_hub');
        bc.onmessage = function (ev) {
          if (ev && ev.data && ev.data.type === 'hub-update' && ev.data.payload) {
            applyToDocument(document, ev.data.payload, pageFile);
            notifyHydrated();
          }
        };
      } catch (e) {}
    }
    window.addEventListener('storage', function (ev) {
      if (ev.key === LS_DATA || ev.key === LS_LIVE_CACHE) {
        var next = safeJsonParse(ev.newValue);
        if (next) {
          applyToDocument(document, next, pageFile);
          notifyHydrated();
        }
      }
    });
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initLiveSite);
    } else {
      initLiveSite();
    }
  }

  return {
    esc: esc,
    normalizeAssetPath: normalizeAssetPath,
    relAssetPath: relAssetPath,
    fullUrl: fullUrl,
    projectHref: projectHref,
    defaultProjectDesc: defaultProjectDesc,
    reconcileData: reconcileData,
    getPublishedProjects: getPublishedProjects,
    getProjectCovers: getProjectCovers,
    getPrimaryCover: getPrimaryCover,
    buildProjectCoverHeroHtml: buildProjectCoverHeroHtml,
    applyToDocument: applyToDocument,
    serializeDocument: serializeDocument,
    buildProjectPageHtml: buildProjectPageHtml,
    buildSitemapXml: buildSitemapXml
  };
});
