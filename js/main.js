/* ============================================================
   PORTFOLIO VASILÍAS — Static HTML + Hub Live Hydration
   Interactions : préloader, header, menu, reveal, copie email, filtre, carrousel
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

  /* ---------- Reveal on scroll (compatible hydratation dynamique) ---------- */
  var io = null;
  if ('IntersectionObserver' in window) {
    io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          en.target.classList.add('in-view');
          io.unobserve(en.target);
        }
      });
    }, { rootMargin: '-40px', threshold: 0.05 });
  }
  function observeReveals() {
    var revealEls = document.querySelectorAll('.reveal:not(.in-view)');
    var lineEls = document.querySelectorAll('.reveal-line:not(.in-view)');
    if (io) {
      revealEls.forEach(function (el) { io.observe(el); });
      lineEls.forEach(function (el) { io.observe(el); });
    } else {
      revealEls.forEach(function (el) { el.classList.add('in-view'); });
      lineEls.forEach(function (el) { el.classList.add('in-view'); });
    }
  }
  observeReveals();

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
      }, 40);
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
      }, 60);
    }

    function next() {
      wi = (wi + 1) % words.length;
      var target = words[wi];
      eraseLetterByLetter(function () {
        typeLetterByLetter(target, function () {
          setTimeout(next, 4000);
        });
      });
    }

    setTimeout(next, 4000);
  }

  /* ---------- Copy email (lecture live à chaque clic) ---------- */
  function bindCopy(btnId, textId) {
    var btn = document.getElementById(btnId);
    if (!btn) return;
    btn.addEventListener('click', function () {
      var emailEl = document.getElementById(textId);
      var email = emailEl ? emailEl.textContent.trim() : '';
      if (navigator.clipboard && email) {
        navigator.clipboard.writeText(email);
      }
      var original = btn.innerHTML;
      btn.innerHTML = '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg><span>' + (btn.getAttribute('data-copied') || 'Copié') + '</span>';
      setTimeout(function () { btn.innerHTML = original; }, 2000);
    });
  }
  bindCopy('copyEmailFooter', 'emailFooter');
  bindCopy('copyEmailContact', 'emailContact');

  /* ---------- Contact form (Google Apps Script or legacy fetch fallback) ---------- */
  var form = document.getElementById('contactForm');
  var formSuccess = document.getElementById('formSuccess');
  var formError = document.getElementById('formError');
  var submitBtn = document.getElementById('submitBtn');
  var formAgain = document.getElementById('formAgain');
  var contactSendingOverlay = document.getElementById('contactSendingOverlay');
  var contactResponseFrame = document.getElementById('contactSubmissionFrame');
  var contactNonceInput = form && form.querySelector('[name="clientNonce"]');
  var activeContactNonce = '';
  var contactTimeout = null;
  function newFormNonce() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2) + '-' + Math.random().toString(36).slice(2);
  }
  function isFormsScriptOrigin(origin) {
    if (origin === 'null') return true;
    try {
      var host = new URL(origin).hostname;
      return host === 'script.google.com' || host === 'script.googleusercontent.com' || host.endsWith('.script.googleusercontent.com');
    } catch (error) { return false; }
  }

  if (form) {
    var packLabels = {
      'logo-brandboard': 'Pack Logo + Brandboard',
      'prinkipas': 'Pack Prínkipas',
      'vasilias': 'Pack Vasilías'
    };
    var requestedPack = new URLSearchParams(window.location.search).get('pack');
    var requestedPackLabel = packLabels[requestedPack];
    if (requestedPackLabel) {
      var subjectField = form.querySelector('#subject');
      var messageField = form.querySelector('#message');
      if (subjectField && !subjectField.value) subjectField.value = 'Demande — ' + requestedPackLabel;
      if (messageField && !messageField.value) {
        messageField.value = `Bonjour,\n\nJe souhaite discuter du ${requestedPackLabel}.\n\nMon projet et mes objectifs :\n`;
      }
    }
  }

  if (form) {
    form.addEventListener('submit', function (e) {
      var action = form.getAttribute('action') || '';
      if (/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(action)) {
        e.preventDefault();
        if (formError) formError.style.display = 'none';
        activeContactNonce = newFormNonce();
        if (contactNonceInput) contactNonceInput.value = activeContactNonce;
        form.target = contactResponseFrame.name;
        form.method = 'POST';
        form.enctype = 'application/x-www-form-urlencoded';
        if (submitBtn) {
          submitBtn.disabled = true;
          var nativeText = submitBtn.firstChild;
          if (nativeText) nativeText.textContent = 'Envoi… ';
        }
        if (contactSendingOverlay) contactSendingOverlay.hidden = false;
        var requestNonce = activeContactNonce;
        contactTimeout = window.setTimeout(function () {
          if (activeContactNonce !== requestNonce) return;
          if (contactSendingOverlay) contactSendingOverlay.hidden = true;
          if (formError) {
            formError.textContent = 'La réponse tarde à arriver. Vérifiez votre e-mail avant de renvoyer votre message, afin d’éviter un doublon.';
            formError.style.display = 'block';
          }
          if (submitBtn) { submitBtn.disabled = false; if (submitBtn.firstChild) submitBtn.firstChild.textContent = 'Réessayer l’envoi '; }
        }, 120000);
        form.submit();
        return;
      }
      e.preventDefault();
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.querySelector('span') ? submitBtn.querySelector('span').textContent = 'Envoi…' : null;
        var txt = submitBtn.firstChild;
        if (txt) submitBtn.childNodes[0].textContent = 'Envoi… ';
      }
      if (formError) formError.style.display = 'none';
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
  window.addEventListener('message', function (event) {
    var data = event.data || {};
    if (!isFormsScriptOrigin(event.origin) || data.source !== 'vasilias-apps-script' || data.formType !== 'contact' || !activeContactNonce || data.clientNonce !== activeContactNonce) return;
    if (contactTimeout) window.clearTimeout(contactTimeout);
    if (contactSendingOverlay) contactSendingOverlay.hidden = true;
    if (data.success) {
      if (form) form.classList.add('hidden');
      if (formSuccess) {
        formSuccess.classList.remove('hidden');
        formSuccess.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    } else {
      if (formError) {
        formError.textContent = 'L’envoi n’a pas abouti. Vos informations restent dans le formulaire; corrigez ou réessayez.';
        formError.style.display = 'block';
      }
      if (submitBtn) { submitBtn.disabled = false; if (submitBtn.firstChild) submitBtn.firstChild.textContent = 'Réessayer l’envoi '; }
    }
  });
  if (formAgain) {
    formAgain.addEventListener('click', function () {
      if (form) { form.classList.remove('hidden'); form.reset(); }
      if (formSuccess) formSuccess.classList.add('hidden');
      if (submitBtn) { submitBtn.disabled = false; if (submitBtn.firstChild) submitBtn.firstChild.textContent = 'Envoyer le message '; }
    });
  }
  window.addEventListener('pageshow', function () {
    if (form && submitBtn) {
      submitBtn.disabled = false;
      if (submitBtn.firstChild) submitBtn.firstChild.textContent = 'Envoyer le message ';
    }
  });

  /* ---------- Work category filter (délégation d'événements pour cartes dynamiques) ---------- */
  var filterBar = document.getElementById('filterBar');
  function applyActiveWorkFilter() {
    if (!filterBar) return;
    var activeBtn = filterBar.querySelector('[data-filter].active');
    var cat = activeBtn ? activeBtn.getAttribute('data-filter') : 'Tous';
    document.querySelectorAll('[data-categories]').forEach(function (card) {
      var cats = (card.getAttribute('data-categories') || '').split(/\s+/);
      if (cat === 'Tous' || cats.indexOf(cat) !== -1) {
        card.style.display = '';
      } else {
        card.style.display = 'none';
      }
    });
  }
  if (filterBar) {
    filterBar.addEventListener('click', function (ev) {
      var btn = ev.target.closest ? ev.target.closest('[data-filter]') : null;
      if (!btn) return;
      filterBar.querySelectorAll('[data-filter]').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      applyActiveWorkFilter();
    });
  }

  /* ---------- Accueil : section vide = même hauteur que la section « moi » ---------- */
  var moiSec = document.getElementById('moi');
  var spacerSec = document.querySelector('.h2-spacer');
  var syncSpacer = function () {
    if (moiSec && spacerSec) spacerSec.style.height = moiSec.offsetHeight + 'px';
  };
  if (moiSec && spacerSec) {
    syncSpacer();
    window.addEventListener('resize', syncSpacer);
    window.addEventListener('load', syncSpacer);
    if ('ResizeObserver' in window) new ResizeObserver(syncSpacer).observe(moiSec);
  }

  /* ---------- Carrousel des images de couverture (pages projet) ---------- */
  function initSliders() {
    document.querySelectorAll('[data-slider]').forEach(function (slider) {
      if (slider.dataset.sliderBound === '1') return;
      slider.dataset.sliderBound = '1';
      var track = slider.querySelector('.slider-track');
      var slides = track ? track.children : [];
      var prev = slider.querySelector('.slider-prev');
      var next = slider.querySelector('.slider-next');
      var count = slides.length, index = 0;
      if (count < 2) { slider.classList.add('is-single'); return; }
      slider.classList.remove('is-single');
      function go(i) {
        index = (i + count) % count;
        track.style.transform = 'translateX(' + (-100 * index) + '%)';
        for (var k = 0; k < count; k++) {
          slides[k].setAttribute('aria-hidden', k === index ? 'false' : 'true');
        }
      }
      if (prev) prev.addEventListener('click', function () { go(index - 1); });
      if (next) next.addEventListener('click', function () { go(index + 1); });
      slider.setAttribute('tabindex', '0');
      slider.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowLeft') { go(index - 1); }
        else if (e.key === 'ArrowRight') { go(index + 1); }
      });
      var x0 = null;
      slider.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; }, { passive: true });
      slider.addEventListener('touchend', function (e) {
        if (x0 === null) return;
        var dx = e.changedTouches[0].clientX - x0;
        if (Math.abs(dx) > 40) go(index + (dx < 0 ? 1 : -1));
        x0 = null;
      });
      go(0);
    });
  }
  initSliders();

  /* Ré-attacher les observateurs après hydratation en direct depuis le Hub */
  document.addEventListener('vasilias:hydrated', function () {
    observeReveals();
    applyActiveWorkFilter();
    syncSpacer();
    initSliders();
  });
});
