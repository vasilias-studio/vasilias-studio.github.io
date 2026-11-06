/* Public configuration for the quote form. No secrets belong in this file. */
window.VAS_QUOTE_CONFIG = Object.freeze({
  endpoint: (window.VAS_FORMS_CONFIG && window.VAS_FORMS_CONFIG.endpoint) || '',
  enabled: true,
  privacyApproved: true
});
