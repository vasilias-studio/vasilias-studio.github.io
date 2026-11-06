/* Devis personnalisé — envoi natif multipart via FormSubmit, après activation et validation de la notice. */
document.addEventListener('DOMContentLoaded', function () {
  var modal = document.getElementById('quoteModal');
  var openButton = document.getElementById('quoteOpen');
  var closeButton = document.getElementById('quoteClose');
  var dialog = modal && modal.querySelector('.quote-dialog');
  var wizard = document.getElementById('quoteWizard');
  if (!modal || !wizard || !dialog) return;

  var stepPanels = Array.prototype.slice.call(wizard.querySelectorAll('[data-quote-step]'));
  var previousButton = document.getElementById('quotePrevious');
  var continueButton = document.getElementById('quoteContinue');
  var submitButton = document.getElementById('quoteSubmit');
  var progressBar = dialog.querySelector('[role="progressbar"]');
  var progressFill = document.getElementById('quoteProgressFill');
  var stepCounter = document.getElementById('quoteStepCounter');
  var stepName = document.getElementById('quoteStepName');
  var liveMessage = document.getElementById('quoteLiveMessage');
  var fileInput = document.getElementById('quoteFiles');
  var fileList = document.getElementById('quoteFileList');
  var fileError = document.getElementById('quoteFileError');
  var dropZone = document.getElementById('quoteDropZone');
  var summary = document.getElementById('quoteSummary');
  var confirmation = document.getElementById('quoteConfirmation');
  var transportFrame = document.getElementById('quoteResponseFrame');
  var payloadInput = document.getElementById('quotePayload');
  var replyToInput = document.getElementById('quoteReplyTo');
  var nextInput = document.getElementById('quoteNext');
  var setupNotice = document.getElementById('quoteSetupNotice');
  var config = window.VAS_QUOTE_CONFIG || {};
  var currentStep = 1;
  var lastFocus = null;
  var startedAt = 0;
  var nonce = '';
  var sending = false;
  var sendTimer = null;
  var files = [];
  var previewUrls = new WeakMap();
  var selectedDeliverables = new Set();
  var maxFiles = 5;
  var maxFileBytes = 3 * 1024 * 1024;
  var maxTotalBytes = 8 * 1024 * 1024;
  var allowedTypes = {
    jpg: ['image/jpeg'], jpeg: ['image/jpeg'], png: ['image/png'], webp: ['image/webp'],
    pdf: ['application/pdf'], ppt: ['application/vnd.ms-powerpoint'],
    pptx: ['application/vnd.openxmlformats-officedocument.presentationml.presentation']
  };
  var categoryLabels = {
    identity: 'Identité visuelle', graphic: 'Design graphique', packaging: 'Packaging',
    social: 'Réseaux sociaux', other: 'Autres prestations'
  };
  var optionsByCategory = {
    identity: ['Logo principal', 'Déclinaisons du logo', 'Icône de marque', 'Palette de couleurs', 'Sélection typographique', 'Brandboard', 'Mini-charte graphique', 'Charte graphique complète'],
    graphic: ['Affiche publicitaire', 'Flyer', 'Brochure', 'Carte de visite', 'Catalogue', 'Supports imprimés'],
    packaging: ['Design de boîte', 'Design d’étiquette', 'Design de bouteille ou contenant', 'Déclinaisons de packaging', 'Mockups de présentation'],
    social: ['Templates de publications', 'Templates de stories', 'Couverture Facebook', 'Couverture et bannière', 'Visuels publicitaires', 'Templates promotionnels', 'Identité visuelle pour les réseaux sociaux'],
    other: ['Direction artistique', 'Présentation professionnelle', 'Supports de communication spécifiques', 'Projet graphique complexe ou multidisciplinaire', 'Autre prestation']
  };
  var stepNames = ['Informations du client', 'Type de projet', 'Détails des prestations', 'Budget et délais', 'Univers et références', 'Récapitulatif'];
  var toSafeText = function (value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]; }); };

  function isFormSubmitEndpoint(value) {
    return /^https:\/\/formsubmit\.co\/[^/?#]+$/.test(String(value || ''));
  }
  function setLive(text, isError) {
    liveMessage.textContent = text || '';
    liveMessage.classList.toggle('is-error', !!isError);
  }
  function selectedValues(name) {
    return Array.prototype.slice.call(wizard.querySelectorAll('input[name="' + name + '"]:checked')).map(function (el) { return el.value; });
  }
  function fieldValue(name) {
    var field = wizard.querySelector('[name="' + name + '"]');
    return field ? field.value.trim() : '';
  }
  function resetAfterSuccess() {
    files.forEach(function (file) { var url = previewUrls.get(file); if (url) URL.revokeObjectURL(url); });
    files = [];
    selectedDeliverables.clear();
    wizard.reset();
    wizard.querySelectorAll('.is-selected').forEach(function (el) { el.classList.remove('is-selected'); });
    wizard.hidden = false;
    document.querySelector('.quote-progress-wrap').hidden = false;
    confirmation.hidden = true;
    nonce = '';
    submitButton.textContent = 'Envoyer ma demande de devis';
    renderFiles();
    updateOtherProjectField();
  }
  function openModal() {
    if (!confirmation.hidden) resetAfterSuccess();
    lastFocus = document.activeElement;
    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('quote-modal-open');
    startedAt = Date.now();
    updateStep(1);
    setLive('');
    window.setTimeout(function () { dialog.focus(); }, 0);
  }
  function closeModal() {
    if (sending) return;
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('quote-modal-open');
    if (lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus();
  }
  function updateStep(step) {
    currentStep = Math.max(1, Math.min(stepPanels.length, step));
    stepPanels.forEach(function (panel) { panel.hidden = Number(panel.getAttribute('data-quote-step')) !== currentStep; });
    stepCounter.textContent = 'Étape ' + currentStep + ' sur ' + stepPanels.length;
    stepName.textContent = stepNames[currentStep - 1];
    progressBar.setAttribute('aria-valuenow', String(currentStep));
    progressFill.style.width = (currentStep / stepPanels.length * 100) + '%';
    previousButton.disabled = currentStep === 1 || sending;
    continueButton.hidden = currentStep === stepPanels.length;
    submitButton.hidden = currentStep !== stepPanels.length;
    setLive('');
    if (currentStep === 2) updateOtherProjectField();
    if (currentStep === 3) renderServiceOptions();
    if (currentStep === 6) renderSummary();
    var heading = stepPanels[currentStep - 1].querySelector('h3');
    if (heading) { heading.setAttribute('tabindex', '-1'); window.setTimeout(function () { heading.focus({ preventScroll: true }); }, 0); }
    dialog.scrollTop = 0;
  }
  function invalidField(panel) {
    var required = Array.prototype.slice.call(panel.querySelectorAll('input[required],textarea[required],select[required]'));
    for (var i = 0; i < required.length; i++) {
      if (!required[i].checkValidity()) { required[i].reportValidity(); return required[i]; }
    }
    return null;
  }
  function validateCurrentStep() {
    var panel = stepPanels[currentStep - 1];
    if (currentStep === 2 && selectedValues('category').length === 0) {
      setLive('Choisissez au moins une catégorie de projet.', true);
      return false;
    }
    if (currentStep === 2 && selectedValues('category').indexOf('other') !== -1 && !fieldValue('otherProject')) {
      document.getElementById('quoteOtherProject').focus();
      setLive('Précisez votre autre projet pour continuer.', true);
      return false;
    }
    if (currentStep === 3 && selectedDeliverables.size === 0 && !fieldValue('deliverables')) {
      setLive('Sélectionnez au moins une prestation ou décrivez les livrables souhaités.', true);
      var firstOption = document.querySelector('#quoteServicesOptions input');
      if (firstOption) firstOption.focus();
      return false;
    }
    var invalid = invalidField(panel);
    if (invalid) { setLive('Vérifiez les champs obligatoires avant de continuer.', true); return false; }
    if (currentStep === 5 && !validateFiles()) return false;
    return true;
  }
  function updateOtherProjectField() {
    var wrap = document.getElementById('quoteOtherProjectWrap');
    var input = document.getElementById('quoteOtherProject');
    var show = selectedValues('category').indexOf('other') !== -1;
    wrap.hidden = !show;
    input.required = show;
  }
  function renderServiceOptions() {
    var container = document.getElementById('quoteServicesOptions');
    var categories = selectedValues('category');
    var activeCategories = new Set(categories);
    selectedDeliverables.forEach(function (item) { if (!activeCategories.has(item.split('::')[0])) selectedDeliverables.delete(item); });
    container.textContent = '';
    categories.forEach(function (key) {
      var fieldset = document.createElement('fieldset');
      fieldset.className = 'quote-choice-group quote-service-group';
      var legend = document.createElement('legend');
      legend.textContent = categoryLabels[key];
      fieldset.appendChild(legend);
      var grid = document.createElement('div');
      grid.className = 'quote-service-option-grid';
      (optionsByCategory[key] || []).forEach(function (label, i) {
        var value = key + '::' + label;
        var wrapper = document.createElement('label');
        wrapper.className = 'quote-style-choice quote-service-choice';
        var input = document.createElement('input');
        input.type = 'checkbox'; input.name = 'deliverable'; input.value = value;
        input.checked = selectedDeliverables.has(value);
        var text = document.createElement('span'); text.textContent = label;
        wrapper.appendChild(input); wrapper.appendChild(text); grid.appendChild(wrapper);
      });
      fieldset.appendChild(grid); container.appendChild(fieldset);
    });
    container.querySelectorAll('input[name="deliverable"]').forEach(function (input) {
      input.addEventListener('change', function () {
        if (input.checked) selectedDeliverables.add(input.value); else selectedDeliverables.delete(input.value);
      });
    });
    if (!categories.length) {
      var note = document.createElement('p'); note.className = 'quote-empty-options';
      note.textContent = 'Aucune catégorie sélectionnée. Revenez à l’étape précédente pour choisir votre projet.';
      container.appendChild(note);
    }
  }
  function humanSize(bytes) {
    return bytes < 1024 * 1024 ? Math.max(1, Math.round(bytes / 1024)) + ' Ko' : (bytes / (1024 * 1024)).toFixed(1).replace('.', ',') + ' Mo';
  }
  function fileExtension(name) { return (name.split('.').pop() || '').toLowerCase(); }
  function fileIsAllowed(file) {
    var ext = fileExtension(file.name);
    if (!allowedTypes[ext]) return false;
    return !file.type || allowedTypes[ext].indexOf(file.type) !== -1;
  }
  function validateFiles() {
    var total = files.reduce(function (sum, file) { return sum + file.size; }, 0);
    if (files.length > maxFiles) { fileError.textContent = 'Ajoutez au maximum ' + maxFiles + ' fichiers.'; return false; }
    if (files.some(function (file) { return file.size > maxFileBytes; })) { fileError.textContent = 'Chaque fichier doit peser 3 Mo maximum.'; return false; }
    if (total > maxTotalBytes) { fileError.textContent = 'Le poids total des fichiers ne doit pas dépasser 8 Mo.'; return false; }
    fileError.textContent = '';
    return true;
  }
  function syncNativeFileInput() {
    if (!fileInput) return true;
    try {
      var transfer = new DataTransfer();
      files.forEach(function (file) { transfer.items.add(file); });
      fileInput.files = transfer.files;
      return true;
    } catch (error) {
      fileInput.value = '';
      return files.length === 0;
    }
  }
  function renderFiles() {
    var inputWarning = '';
    if (!syncNativeFileInput() && files.length) {
      files = [];
      syncNativeFileInput();
      inputWarning = 'Ce navigateur ne permet pas de joindre les fichiers sélectionnés. Vous pouvez continuer sans pièce jointe.';
    }
    fileList.textContent = '';
    files.forEach(function (file, index) {
      var li = document.createElement('li'); li.className = 'quote-file-item';
      var preview = document.createElement('span'); preview.className = 'quote-file-preview';
      if ((/^image\//.test(file.type) || ['jpg', 'jpeg', 'png', 'webp'].indexOf(fileExtension(file.name)) !== -1) && window.URL && URL.createObjectURL) {
        var img = document.createElement('img');
        var previewUrl = previewUrls.get(file);
        if (!previewUrl) { previewUrl = URL.createObjectURL(file); previewUrls.set(file, previewUrl); }
        img.src = previewUrl; img.alt = '';
        preview.appendChild(img);
      } else {
        preview.textContent = fileExtension(file.name).toUpperCase();
      }
      var details = document.createElement('span'); details.className = 'quote-file-details';
      var name = document.createElement('strong'); name.textContent = file.name;
      var size = document.createElement('small'); size.textContent = humanSize(file.size);
      details.appendChild(name); details.appendChild(size);
      var remove = document.createElement('button'); remove.type = 'button'; remove.className = 'quote-file-remove';
      remove.textContent = 'Supprimer'; remove.setAttribute('aria-label', 'Supprimer le fichier ' + file.name);
      remove.addEventListener('click', function () { var url = previewUrls.get(file); if (url) URL.revokeObjectURL(url); previewUrls.delete(file); files.splice(index, 1); renderFiles(); validateFiles(); });
      li.appendChild(preview); li.appendChild(details); li.appendChild(remove); fileList.appendChild(li);
    });
    validateFiles();
    if (inputWarning) fileError.textContent = inputWarning;
  }
  function addFiles(incoming) {
    var list = Array.prototype.slice.call(incoming || []);
    var problem = '';
    list.forEach(function (file) {
      if (!fileIsAllowed(file)) { problem = 'Format refusé : ' + file.name + '. Utilisez JPG, PNG, WebP, PDF, PPT ou PPTX.'; return; }
      if (file.size > maxFileBytes) { problem = file.name + ' dépasse la limite de 3 Mo.'; return; }
      if (files.length >= maxFiles) { problem = 'La limite de ' + maxFiles + ' fichiers est atteinte.'; return; }
      if (files.reduce(function (sum, current) { return sum + current.size; }, file.size) > maxTotalBytes) { problem = 'Le poids total dépasserait 8 Mo.'; return; }
      files.push(file);
    });
    renderFiles();
    if (problem) fileError.textContent = problem;
  }
  function summaryRow(label, value) {
    return '<div class="quote-summary-row"><dt>' + toSafeText(label) + '</dt><dd>' + (value ? toSafeText(value).replace(/\n/g, '<br>') : '<span class="quote-empty-value">Non renseigné</span>') + '</dd></div>';
  }
  function summarySection(title, step, rows) {
    return '<section class="quote-summary-section"><div class="quote-summary-head"><h4>' + toSafeText(title) + '</h4><button type="button" class="quote-edit-step" data-quote-edit="' + step + '">Modifier</button></div><dl>' + rows.join('') + '</dl></section>';
  }
  function renderSummary() {
    var cats = selectedValues('category').map(function (key) { return categoryLabels[key] || key; }).join(', ');
    var services = Array.from(selectedDeliverables).map(function (entry) { return entry.split('::').slice(1).join('::'); }).join(', ');
    var fileNames = files.map(function (file) { return file.name + ' (' + humanSize(file.size) + ')'; }).join('\n');
    var styles = selectedValues('style').join(', ');
    summary.innerHTML =
      summarySection('Informations client', 1, [summaryRow('Nom', fieldValue('clientName')), summaryRow('E-mail', fieldValue('email')), summaryRow('WhatsApp', fieldValue('whatsapp')), summaryRow('Entreprise', fieldValue('company')), summaryRow('Site / réseau', fieldValue('website'))]) +
      summarySection('Projet', 2, [summaryRow('Catégories', cats), summaryRow('Autre projet', fieldValue('otherProject')), summaryRow('Prestations', services), summaryRow('Livrables souhaités', fieldValue('deliverables')), summaryRow('Description', fieldValue('projectDescription')), summaryRow('Objectifs', fieldValue('objectives')), summaryRow('Public cible', fieldValue('audience'))]) +
      summarySection('Budget et délais', 4, [summaryRow('Budget estimé', selectedValues('budget')[0] || ''), summaryRow('Délai souhaité', selectedValues('deadline')[0] || ''), summaryRow('Date précise', fieldValue('targetDate'))]) +
      summarySection('Univers et références', 5, [summaryRow('Style graphique', styles), summaryRow('Fichiers joints', fileNames)]);
    submitButton.disabled = !(isFormSubmitEndpoint(config.endpoint) && config.enabled && config.privacyApproved && !sending);
    setupNotice.hidden = !!(isFormSubmitEndpoint(config.endpoint) && config.enabled && config.privacyApproved);
  }
  function collectPayload() {
    var categories = selectedValues('category').map(function (key) { return categoryLabels[key] || key; });
    var services = Array.from(selectedDeliverables).map(function (entry) { return entry.split('::').slice(1).join('::'); });
    return JSON.stringify({
      client: { name: fieldValue('clientName'), email: fieldValue('email'), whatsapp: fieldValue('whatsapp'), company: fieldValue('company'), website: fieldValue('website') },
      project: { categories: categories, otherProject: fieldValue('otherProject'), deliverables: services, deliverablesDescription: fieldValue('deliverables'), description: fieldValue('projectDescription'), objectives: fieldValue('objectives'), audience: fieldValue('audience') },
      budget: selectedValues('budget')[0] || '', deadline: selectedValues('deadline')[0] || '', targetDate: fieldValue('targetDate'),
      styles: selectedValues('style'), attachments: files.map(function (file) { return { name: file.name, size: humanSize(file.size) }; }),
      consentement: 'accepté'
    }, null, 2);
  }
  function showConfirmation(detail) {
    document.getElementById('quoteConfirmationDetail').textContent = detail && detail !== 'Votre demande est reçue.' && detail !== 'Votre demande a déjà été reçue.' ? detail : '';
    wizard.hidden = true;
    document.querySelector('.quote-progress-wrap').hidden = true;
    confirmation.hidden = false;
    confirmation.querySelector('h3').focus();
    clearTimeout(sendTimer);
    sending = false;
  }
  function sendRequest() {
    if (!isFormSubmitEndpoint(config.endpoint) || !config.enabled || !config.privacyApproved) {
      setLive('L’envoi reste désactivé tant que FormSubmit n’est pas activé et que la politique de confidentialité n’est pas validée.', true);
      return;
    }
    if (!document.getElementById('quoteConsent').checked) {
      document.getElementById('quoteConsent').reportValidity();
      return;
    }
    if (!validateFiles()) { setLive(fileError.textContent, true); return; }
    if (!nonce) nonce = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : 'q-' + Date.now() + '-' + Math.random().toString(36).slice(2);
    sending = true;
    submitButton.disabled = true;
    submitButton.innerHTML = '<span class="quote-spinner" aria-hidden="true"></span>Envoi en cours…';
    previousButton.disabled = true;
    setLive('Transmission de votre demande via FormSubmit…');
    try {
      wizard.action = config.endpoint;
      payloadInput.value = collectPayload();
      replyToInput.value = fieldValue('email');
      nextInput.value = 'https://vasilias-studio.github.io/quote-received.html?requestId=' + encodeURIComponent(nonce);
      wizard.submit();
      sendTimer = window.setTimeout(function () {
        if (!sending) return;
        sending = false;
        submitButton.disabled = false;
        submitButton.textContent = 'Réessayer l’envoi';
        previousButton.disabled = false;
        setLive('Aucune confirmation du serveur n’a été reçue. Votre demande n’est pas confirmée; réessayez ou écrivez à ericotlauranto34@gmail.com.', true);
      }, 45000);
    } catch (error) {
      sending = false;
      submitButton.disabled = false;
      previousButton.disabled = false;
      submitButton.textContent = 'Réessayer l’envoi';
      setLive(error.message || 'La préparation de la demande a échoué. Réessayez.', true);
    }
  }

  openButton.addEventListener('click', openModal);
  closeButton.addEventListener('click', closeModal);
  modal.querySelectorAll('[data-quote-close]').forEach(function (el) { el.addEventListener('click', closeModal); });
  continueButton.addEventListener('click', function () { if (validateCurrentStep()) updateStep(currentStep + 1); });
  previousButton.addEventListener('click', function () { if (currentStep > 1 && !sending) updateStep(currentStep - 1); });
  submitButton.addEventListener('click', sendRequest);
  wizard.addEventListener('change', function (event) {
    var target = event.target;
    if (!target) return;
    if (target.name === 'category') {
      var card = target.closest('.quote-category-card');
      if (card) card.classList.toggle('is-selected', target.checked);
      updateOtherProjectField();
      if (currentStep === 3) renderServiceOptions();
    }
    if (target.type === 'radio' && target.name) {
      wizard.querySelectorAll('input[type="radio"][name="' + target.name + '"]').forEach(function (input) {
        var label = input.closest('.quote-radio-card');
        if (label) label.classList.toggle('is-selected', input.checked);
      });
    }
    if (target.type === 'checkbox' && (target.name === 'style' || target.name === 'deliverable')) {
      var choice = target.closest('.quote-style-choice');
      if (choice) choice.classList.toggle('is-selected', target.checked);
    }
  });
  wizard.addEventListener('click', function (event) {
    var edit = event.target.closest('[data-quote-edit]');
    if (edit) updateStep(Number(edit.getAttribute('data-quote-edit')));
  });
  if (fileInput) fileInput.addEventListener('change', function () { addFiles(fileInput.files); });
  if (dropZone) {
    ['dragenter', 'dragover'].forEach(function (name) { dropZone.addEventListener(name, function (event) { event.preventDefault(); dropZone.classList.add('is-dragging'); }); });
    ['dragleave', 'drop'].forEach(function (name) { dropZone.addEventListener(name, function (event) { event.preventDefault(); dropZone.classList.remove('is-dragging'); }); });
    dropZone.addEventListener('drop', function (event) { addFiles(event.dataTransfer && event.dataTransfer.files); });
  }
  document.addEventListener('keydown', function (event) {
    if (modal.hidden) return;
    if (event.key === 'Escape') { event.preventDefault(); closeModal(); }
    if (event.key === 'Tab') {
      var focusable = Array.prototype.slice.call(dialog.querySelectorAll('button:not([disabled]):not([hidden]),input:not([disabled]):not([hidden]),textarea:not([disabled]):not([hidden]),a[href]')).filter(function (el) { return !el.closest('[hidden]'); });
      if (!focusable.length) return;
      var first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });
  window.addEventListener('message', function (event) {
    if (event.origin !== window.location.origin || event.source !== transportFrame.contentWindow || !event.data || event.data.type !== 'vasilias-quote-result' || event.data.requestId !== nonce) return;
    clearTimeout(sendTimer);
    sending = false;
    if (event.data.ok) {
      showConfirmation(event.data.message);
    } else {
      submitButton.disabled = false;
      submitButton.textContent = 'Réessayer l’envoi';
      previousButton.disabled = false;
      setLive(event.data.message || 'L’envoi a échoué. Vérifiez votre connexion ou réessayez.', true);
    }
  });
  if (setupNotice) setupNotice.hidden = !!(isFormSubmitEndpoint(config.endpoint) && config.enabled && config.privacyApproved);
});
