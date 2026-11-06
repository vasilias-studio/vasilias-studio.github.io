/* ============================================================
   PORTFOLIO VASILÍAS — Static HTML version
   Interactions : préloader, header, menu, reveal, copie email, filtre
   ============================================================ */

document.addEventListener('DOMContentLoaded', function () {
  /* ---------- Preloader : affiché à chaque changement de page ---------- */
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var preloader = document.querySelector('.preloader');
  var cameByLink = false;
  try { cameByLink = sessionStorage.getItem('vasilias_nav') === '1'; sessionStorage.removeItem('vasilias_nav'); } catch (e) {}
  if (preloader) {
    if (reduced) {
      preloader.remove();
    } else {
      setTimeout(function () {
        preloader.classList.add('hide');
        setTimeout(function () { preloader.remove(); }, 750);
      }, cameByLink ? 250 : 500);
    }
  }

  /* Rideau de sortie : même écran qui se referme avant d'ouvrir la page suivante */
  document.addEventListener('click', function (ev) {
    if (reduced || ev.defaultPrevented || ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
    var a = ev.target.closest ? ev.target.closest('a[href]') : null;
    if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
    var url;
    try { url = new URL(a.href, location.href); } catch (e) { return; }
    if (url.origin !== location.origin || (url.protocol !== 'http:' && url.protocol !== 'https:')) return;
    if (url.pathname === location.pathname && url.search === location.search) return; /* ancre sur la même page */
    ev.preventDefault();
    var cover = document.createElement('div');
    cover.className = 'preloader hide';
    cover.setAttribute('aria-hidden', 'true');
    cover.innerHTML = '<img class="preloader-logo" src="assets/logo-vasilias.svg" alt="" width="317" height="178">';
    document.body.appendChild(cover);
    void cover.offsetWidth;
    cover.classList.remove('hide');
    try { sessionStorage.setItem('vasilias_nav', '1'); } catch (e) {}
    setTimeout(function () { location.href = url.href; }, 650);
  });
  /* Retour arrière (cache du navigateur) : retirer un rideau resté affiché */
  window.addEventListener('pageshow', function (e) {
    if (e.persisted) {
      document.querySelectorAll('.preloader').forEach(function (el) { el.remove(); });
    }
  });

  /* ---------- Reduced motion : figer les tracés SMIL du hero ---------- */
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    document.querySelectorAll('.hero-bg path').forEach(function (p) {
      p.querySelectorAll('animate').forEach(function (a) { a.remove(); });
      p.setAttribute('opacity', '0.3');
      p.removeAttribute('stroke-dasharray');
      p.setAttribute('stroke-dashoffset', '0');
    });
  }

  /* ---------- Header scrolled state ---------- */
  var header = document.querySelector('.site-header');
  if (header) {
    var onScroll = function () {
      if (window.scrollY > 40) header.classList.add('scrolled');
      else header.classList.remove('scrolled');
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  /* ---------- Mobile menu ---------- */
  var overlay = document.getElementById('menuOverlay');
  var openBtn = document.getElementById('menuOpenBtn');
  var closeBtn = document.getElementById('menuCloseBtn');
  var menuLinks = document.querySelectorAll('#menuOverlay a');

  function openMenu() {
    if (!overlay) return;
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
    // stagger links
    overlay.querySelectorAll('.menu-links a').forEach(function (a, i) {
      a.style.transitionDelay = (0.1 + i * 0.08) + 's';
    });
  }
  function closeMenu() {
    if (!overlay) return;
    overlay.classList.remove('open');
    document.body.style.overflow = '';
  }
  if (openBtn) openBtn.addEventListener('click', openMenu);
  if (closeBtn) closeBtn.addEventListener('click', closeMenu);
  menuLinks.forEach(function (a) { a.addEventListener('click', closeMenu); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeMenu();
  });

  /* ---------- Reveal on scroll ---------- */
  var revealEls = document.querySelectorAll('.reveal');
  var lineEls = document.querySelectorAll('.reveal-line');
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          en.target.classList.add('in-view');
          io.unobserve(en.target);
        }
      });
    }, { rootMargin: '-40px', threshold: 0.05 });
    revealEls.forEach(function (el) { io.observe(el); });
    lineEls.forEach(function (el) { io.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add('in-view'); });
    lineEls.forEach(function (el) { el.classList.add('in-view'); });
  }

  /* ---------- Word cycle animation (slogan) : lettre par lettre, toutes les 4s ---------- */
  var cycleWord = document.getElementById('cycleWord');
  if (cycleWord) {
    var words = ['Précision.', 'Sens.', 'Impact.', 'Émotion.'];
    var wi = 0;

    function eraseLetterByLetter(cb) {
      var text = cycleWord.textContent;
      var L = text.length;
      var i = L;
      var iv = setInterval(function () {
        i--;
        cycleWord.textContent = text.slice(0, i);
        if (i <= 0) {
          clearInterval(iv);
          cb();
        }
      }, 40); // efface ~1 lettre / 40ms
    }

    function typeLetterByLetter(word, cb) {
      var i = 0;
      var iv = setInterval(function () {
        i++;
        cycleWord.textContent = word.slice(0, i);
        if (i >= word.length) {
          clearInterval(iv);
          cb();
        }
      }, 60); // écrit ~1 lettre / 60ms
    }

    function next() {
      wi = (wi + 1) % words.length;
      var target = words[wi];
      eraseLetterByLetter(function () {
        typeLetterByLetter(target, function () {
          setTimeout(next, 4000); // pause 4s avant le mot suivant
        });
      });
    }

    // Démarre le cycle après 4s
    setTimeout(next, 4000);
  }

  /* ---------- Copy email ---------- */
  function bindCopy(btnId, textId) {
    var btn = document.getElementById(btnId);
    if (!btn) return;
    var emailEl = document.getElementById(textId);
    var email = emailEl ? emailEl.textContent.trim() : '';
    btn.addEventListener('click', function () {
      if (navigator.clipboard) {
        navigator.clipboard.writeText(email);
      }
      var original = btn.innerHTML;
      btn.innerHTML = '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg><span>' + (btn.getAttribute('data-copied') || 'Copié') + '</span>';
      setTimeout(function () { btn.innerHTML = original; }, 2000);
    });
  }
  bindCopy('copyEmailFooter', 'emailFooter');
  bindCopy('copyEmailContact', 'emailContact');

  /* ---------- Contact form (FormSubmit) ---------- */
  var form = document.getElementById('contactForm');
  var formSuccess = document.getElementById('formSuccess');
  var formError = document.getElementById('formError');
  var submitBtn = document.getElementById('submitBtn');
  var formAgain = document.getElementById('formAgain');

  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.querySelector('span') ? submitBtn.querySelector('span').textContent = 'Envoi…' : null;
        var txt = submitBtn.firstChild;
        if (txt) submitBtn.childNodes[0].textContent = 'Envoi… ';
      }
      if (formError) formError.style.display = 'none';
      var action = form.getAttribute('action');
      var data = new FormData(form);
      fetch(action, { method: 'POST', body: data, headers: { 'Accept': 'application/json' } })
        .then(function (res) {
          if (res.ok) {
            if (form) form.classList.add('hidden');
            if (formSuccess) formSuccess.classList.remove('hidden');
            if (submitBtn) { submitBtn.disabled = false; submitBtn.childNodes[0].textContent = 'Envoyer le message '; }
          } else {
            throw new Error('Envoi échoué');
          }
        })
        .catch(function () {
          if (formError) formError.style.display = 'block';
          if (submitBtn) { submitBtn.disabled = false; submitBtn.childNodes[0].textContent = 'Envoyer le message '; }
        });
    });
  }
  if (formAgain) {
    formAgain.addEventListener('click', function () {
      if (form) { form.classList.remove('hidden'); form.reset(); }
      if (formSuccess) formSuccess.classList.add('hidden');
    });
  }

  /* ---------- Work category filter ---------- */
  var filterBtns = document.querySelectorAll('[data-filter]');
  var workCards = document.querySelectorAll('[data-categories]');
  if (filterBtns.length) {
    filterBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        filterBtns.forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        var cat = btn.getAttribute('data-filter');
        workCards.forEach(function (card) {
          var cats = card.getAttribute('data-categories') || '';
          if (cat === 'Tous' || cats.indexOf(cat) !== -1) {
            card.style.display = '';
          } else {
            card.style.display = 'none';
          }
        });
      });
    });
  }
  /* ---------- Accueil : section vide = même hauteur que la section « moi » ---------- */
  var moiSec = document.getElementById('moi');
  var spacerSec = document.querySelector('.h2-spacer');
  if (moiSec && spacerSec) {
    var syncSpacer = function () { spacerSec.style.height = moiSec.offsetHeight + 'px'; };
    syncSpacer();
    window.addEventListener('resize', syncSpacer);
    window.addEventListener('load', syncSpacer);
    if ('ResizeObserver' in window) new ResizeObserver(syncSpacer).observe(moiSec);
  }
});
