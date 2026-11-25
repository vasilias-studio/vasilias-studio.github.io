/* ============================================================
   Vasilías : scrolling immersif
   Lenis (inertie) + GSAP ScrollTrigger (animations liées au scroll).
   - Lenis ne lisse que la molette (le tactile reste natif).
   - Désactivé entièrement si prefers-reduced-motion : le site garde
     alors son comportement d'origine (IntersectionObserver + CSS).
   ============================================================ */
(function () {
  'use strict';

  var root = document.documentElement;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (!window.gsap || !window.ScrollTrigger) return;

  var gsap = window.gsap;
  var ScrollTrigger = window.ScrollTrigger;
  gsap.registerPlugin(ScrollTrigger);
  ScrollTrigger.config({ ignoreMobileResize: true });

  var isHome = document.body.classList.contains('home-v2');
  var lenis = null;
  var triggers = [];       // ScrollTriggers créés pour les reveals génériques
  var mm = null;

  try {
    root.classList.add('imm-on');

    /* ---------- 1. Défilement fluide (molette uniquement) ---------- */
    if (window.Lenis) {
      lenis = new window.Lenis({
        autoRaf: false,
        lerp: 0.09,
        smoothWheel: true,
        syncTouch: false,          // tactile natif : aucun geste bloqué
        allowNestedScroll: true,   // panneaux internes (formulaire, menu) scrollables
        anchors: true              // liens #ancre pris en charge par Lenis
      });
      lenis.on('scroll', ScrollTrigger.update);
      gsap.ticker.add(function (t) { lenis.raf(t * 1000); });
      gsap.ticker.lagSmoothing(0);

      /* Menu mobile ouvert : on fige le scroll de la page */
      var overlay = document.getElementById('menuOverlay');
      if (overlay) {
        overlay.setAttribute('data-lenis-prevent', '');
        new MutationObserver(function () {
          if (overlay.classList.contains('open')) lenis.stop(); else lenis.start();
        }).observe(overlay, { attributes: true, attributeFilter: ['class'] });
      }
    }

    /* ---------- 2. Reveals génériques pilotés par le scroll ---------- */
    var DIRS = {
      'reveal-up':       { y: 34 },
      'reveal-down':     { y: -34 },
      'reveal-left':     { x: -46 },
      'reveal-right':    { x: 46 },
      'reveal-zoom':     { scale: 0.88 },
      'reveal-zoom-out': { scale: 1.1 },
      'reveal-fade':     {}
    };
    // Éléments gérés par une chorégraphie dédiée (home) : on les exclut du générique
    var CUSTOM = '.h2-moi .reveal, .h2-process .reveal, .h2-step, #projets .h2-marquee';

    function dirFor(el) {
      for (var k in DIRS) if (el.classList.contains(k)) return DIRS[k];
      return DIRS['reveal-up'];
    }

    function scanReveals() {
      // Nettoie les triggers dont l'élément a disparu (re-rendu par l'hydratation)
      triggers = triggers.filter(function (st) {
        var el = st.vars && st.vars.trigger;
        if (el && !el.isConnected) { st.kill(); return false; }
        return true;
      });

      document.querySelectorAll('.reveal:not([data-imm])').forEach(function (el) {
        if (el.matches(CUSTOM) || el.closest('.h2-moi, .h2-process')) return;
        el.setAttribute('data-imm', '1');
        var from = Object.assign({ opacity: 0 }, dirFor(el));
        var tw = gsap.fromTo(el, from,
          { opacity: 1, x: 0, y: 0, scale: 1, ease: 'none', clearProps: 'transform',
            scrollTrigger: { trigger: el, start: 'top 94%', end: 'top 66%', scrub: 0.4 } });
        triggers.push(tw.scrollTrigger);
      });

      document.querySelectorAll('.reveal-line:not([data-imm])').forEach(function (el) {
        el.setAttribute('data-imm', '1');
        var child = el.firstElementChild;
        if (!child) return;
        var tw = gsap.fromTo(child, { yPercent: 110 },
          { yPercent: 0, ease: 'none',
            scrollTrigger: { trigger: el, start: 'top 94%', end: 'top 70%', scrub: 0.4 } });
        triggers.push(tw.scrollTrigger);
      });
    }

    /* ---------- 3. Chorégraphie de la page d'accueil ---------- */
    function buildHome() {
      var hero = document.querySelector('.h2-hero');
      var heroSpace = document.querySelector('.h2-hero-space');
      if (hero && heroSpace) {
        gsap.to(hero, {
          '--hp': 1, ease: 'none',
          scrollTrigger: { trigger: heroSpace, start: 'top top', end: 'bottom top', scrub: true }
        });
      }

      /* Section « moi » : le portrait se dévoile de bas en haut, le texte glisse */
      var moiText = document.querySelector('.h2-moi-grid > div');
      var moiMedia = document.querySelector('.h2-moi-media');
      var moiImg = moiMedia && moiMedia.querySelector('img');
      if (moiText) {
        gsap.fromTo(moiText, { opacity: 0, x: 46 }, {
          opacity: 1, x: 0, ease: 'none', clearProps: 'transform',
          scrollTrigger: { trigger: '#moi', start: 'top 80%', end: 'top 35%', scrub: 0.5 }
        });
      }
      if (moiMedia) {
        gsap.fromTo(moiMedia, { clipPath: 'inset(100% 0% 0% 0%)', opacity: 1 }, {
          clipPath: 'inset(0% 0% 0% 0%)', ease: 'none', clearProps: 'clipPath',
          scrollTrigger: { trigger: '#moi', start: 'top 75%', end: 'top 20%', scrub: 0.5 }
        });
        if (moiImg) {
          gsap.fromTo(moiImg, { scale: 1.14, transformOrigin: '50% 100%' }, {
            scale: 1, ease: 'none',
            scrollTrigger: { trigger: '#moi', start: 'top 75%', end: 'bottom 40%', scrub: 0.6 }
          });
        }
      }

      /* Processus : épinglé sur desktop, séquentiel sur mobile */
      var proc = document.getElementById('processus');
      var steps = gsap.utils.toArray('.h2-step');
      var procTitle = proc && proc.querySelector('.h2-title');
      var procBtn = proc && proc.querySelector('.h2-center');
      [procTitle, procBtn].forEach(function (el) { if (el) el.removeAttribute('style'); });

      mm = gsap.matchMedia();

      mm.add('(min-width: 901px) and (min-height: 640px)', function () {
        if (!proc || !steps.length) return;
        proc.classList.add('imm-pinned');
        gsap.set(steps, { opacity: 0.16, y: 28, '--on': 0 });
        if (procTitle) gsap.set(procTitle, { opacity: 0, y: 30 });
        if (procBtn) gsap.set(procBtn, { opacity: 0, y: 20 });

        var tl = gsap.timeline({
          defaults: { ease: 'none' },
          scrollTrigger: {
            trigger: proc, start: 'top top', end: '+=' + Math.round(window.innerHeight * 1.5),
            pin: true, scrub: 0.5, anticipatePin: 1, invalidateOnRefresh: true
          }
        });
        if (procTitle) tl.to(procTitle, { opacity: 1, y: 0, duration: 0.6 });
        steps.forEach(function (s, i) {
          tl.to(s, { opacity: 1, y: 0, '--on': 1, duration: 0.8 }, i === 0 ? '>-0.2' : '>-0.15');
        });
        if (procBtn) tl.to(procBtn, { opacity: 1, y: 0, duration: 0.5 }, '>-0.1');
        tl.to({}, { duration: 0.4 }); // courte tenue finale avant de libérer la section

        return function () {
          proc.classList.remove('imm-pinned');
          gsap.set(steps, { clearProps: 'opacity,transform,--on' });
          if (procTitle) gsap.set(procTitle, { clearProps: 'opacity,transform' });
          if (procBtn) gsap.set(procBtn, { clearProps: 'opacity,transform' });
        };
      });

      mm.add('(max-width: 900px), (max-height: 639px)', function () {
        if (!proc) return;
        var made = [];
        if (procTitle) made.push(gsap.fromTo(procTitle, { opacity: 0, y: 30 }, {
          opacity: 1, y: 0, ease: 'none',
          scrollTrigger: { trigger: procTitle, start: 'top 92%', end: 'top 68%', scrub: 0.4 } }));
        steps.forEach(function (s) {
          made.push(gsap.fromTo(s, { opacity: 0.16, y: 28, '--on': 0 }, {
            opacity: 1, y: 0, '--on': 1, ease: 'none',
            scrollTrigger: { trigger: s, start: 'top 90%', end: 'top 58%', scrub: 0.4 } }));
        });
        if (procBtn) made.push(gsap.fromTo(procBtn, { opacity: 0, y: 20 }, {
          opacity: 1, y: 0, ease: 'none',
          scrollTrigger: { trigger: procBtn, start: 'top 95%', end: 'top 75%', scrub: 0.4 } }));
        return function () {
          if (procTitle) gsap.set(procTitle, { clearProps: 'opacity,transform' });
          steps.forEach(function (s) { gsap.set(s, { clearProps: 'opacity,transform,--on' }); });
          if (procBtn) gsap.set(procBtn, { clearProps: 'opacity,transform' });
        };
      });

      /* Projets : titre + carrousels (glissement des images, vitesse liée au scroll) */
      var projTitle = document.querySelector('#projets .h2-title');
      if (projTitle) projTitle.removeAttribute('style');
      var marquees = gsap.utils.toArray('#projets .h2-marquee');
      marquees.forEach(function (m) {
        m.removeAttribute('style');
        // Les marges négatives d'origine sont portées par le CSS : on ne touche qu'à l'opacité et au décalage
        gsap.fromTo(m, { opacity: 0, y: 60 }, {
          opacity: 1, y: 0, ease: 'none', clearProps: 'transform',
          scrollTrigger: { trigger: m, start: 'top 98%', end: 'top 70%', scrub: 0.4 }
        });
        ScrollTrigger.create({
          trigger: m, start: 'top bottom', end: 'bottom top',
          onUpdate: function (self) { m.style.setProperty('--mp', self.progress.toFixed(4)); }
        });
      });

      // Vitesse des défilements automatiques : accélère avec la vélocité du scroll, puis retombe
      var tracks = [];
      function collectTracks() {
        tracks = gsap.utils.toArray('#projets .h2-track').map(function (t) {
          var a = t.getAnimations && t.getAnimations()[0];
          return a || null;
        }).filter(Boolean);
      }
      collectTracks();
      var rate = 1;
      gsap.ticker.add(function () {
        if (!tracks.length || !lenis) return;
        var target = 1 + Math.min(Math.abs(lenis.velocity || 0), 60) * 0.06;
        rate += (target - rate) * 0.08;
        if (Math.abs(rate - 1) < 0.002) rate = 1;
        tracks.forEach(function (a) { a.playbackRate = rate; });
      });
      document.addEventListener('vasilias:hydrated', collectTracks);

      /* Champs d'intervention : lignes qui entrent en alternance */
      gsap.utils.toArray('#champs .h2-row').forEach(function (row, i) {
        row.removeAttribute('style');
        var fromX = (i % 2 === 0 ? -1 : 1) * 7; // en vw
        gsap.fromTo(row, { opacity: 0, x: fromX + 'vw' }, {
          opacity: 1, x: 0, ease: 'none', clearProps: 'transform',
          scrollTrigger: { trigger: row, start: 'top 95%', end: 'top 62%', scrub: 0.5 }
        });
      });
    }

    if (isHome) buildHome();
    scanReveals();

    /* ---------- 4. Rafraîchissements ---------- */
    var refresh = function () { ScrollTrigger.refresh(); };
    window.addEventListener('load', function () { refresh(); setTimeout(refresh, 600); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(refresh);
    document.addEventListener('vasilias:hydrated', function () { scanReveals(); refresh(); });
    window.addEventListener('pageshow', function (e) { if (e.persisted) refresh(); });
    window.addEventListener('orientationchange', function () { setTimeout(refresh, 250); });
  } catch (err) {
    // Filet de sécurité : en cas d'erreur, on rend la main au comportement d'origine
    root.classList.remove('imm-on');
    if (lenis) { try { lenis.destroy(); } catch (e) {} }
    if (mm) { try { mm.revert(); } catch (e) {} }
    ScrollTrigger.getAll().forEach(function (st) { st.kill(); });
    if (window.console) console.warn('[immersive] désactivé :', err);
  }
})();
