/**
 * Servano – Registrierung von Betrieben (signup.html).
 *
 * Neu gegenüber dem Prototyp:
 *  - Echte UID-Prüfung inklusive Prüfziffer statt "beginnt mit ATU".
 *  - Feldbezogene Fehlermeldungen statt eines pauschalen alert().
 *  - Der Antrag wird gespeichert und taucht im Admin-Bereich als "offen" auf,
 *    damit der Freigabe-Prozess im Prototyp vollständig durchspielbar ist.
 *  - Eingaben überleben ein versehentliches Neuladen (Entwurf im Speicher).
 */
(function (global) {
  'use strict';

  var IBO = (global.IBO = global.IBO || {});
  var DRAFT_KEY = 'signup-entwurf';

  function el(id) {
    return document.getElementById(id);
  }

  function setError(id, message) {
    var field = el(id);
    var slot = document.querySelector('[data-error-for="' + id + '"]');
    if (slot) {
      slot.textContent = message || '';
      slot.hidden = !message;
    }
    if (field) {
      if (message) field.setAttribute('aria-invalid', 'true');
      else field.removeAttribute('aria-invalid');
    }
    return !message;
  }

  /* ------------------------------------------------------------------ *
   * Vorabprüfung der Gewerbedaten
   * ------------------------------------------------------------------ */

  function showCheckResult(result) {
    var box = el('checkResult');
    if (!box) return;
    box.className = 'check-result ' + (result.valid ? 'check-result--ok' : 'check-result--error');
    box.innerHTML =
      IBO.icon(result.valid ? 'verified' : 'warning') + '<span>' + IBO.esc(result.message) + '</span>';
  }

  function checkVerification() {
    var atu = IBO.validateATU(el('atuInput').value);
    var gisa = IBO.validateGISA(el('gisaInput').value);

    setError('atuInput', atu.valid ? '' : atu.message);
    setError('gisaInput', gisa.valid ? '' : gisa.message);

    if (!atu.valid) {
      showCheckResult({ valid: false, message: atu.message });
      el('atuInput').focus();
      return;
    }
    if (!gisa.valid) {
      showCheckResult({ valid: false, message: gisa.message });
      el('gisaInput').focus();
      return;
    }

    el('atuInput').value = atu.normalized;
    showCheckResult({
      valid: true,
      message:
        'UID ' +
        atu.normalized +
        ' ist formal gültig (Prüfziffer korrekt). Der Abgleich mit UID-Bestätigungsverfahren und GISA erfolgt anschließend manuell.',
    });
  }

  /* ------------------------------------------------------------------ *
   * Entwurf sichern
   * ------------------------------------------------------------------ */

  var TEXT_FIELDS = ['companyName', 'atuInput', 'gisaInput', 'emailInput', 'phoneInput', 'districtSelect', 'categorySelect', 'descriptionInput'];

  function saveDraft() {
    var draft = {};
    TEXT_FIELDS.forEach(function (id) {
      var field = el(id);
      if (field) draft[id] = field.value;
    });
    IBO.storage.set(DRAFT_KEY, draft);
  }

  function restoreDraft() {
    var draft = IBO.storage.get(DRAFT_KEY, null);
    if (!draft) return;
    TEXT_FIELDS.forEach(function (id) {
      var field = el(id);
      if (field && draft[id]) field.value = draft[id];
    });
    var note = el('draftNote');
    if (note) note.hidden = false;
  }

  /* ------------------------------------------------------------------ *
   * Absenden
   * ------------------------------------------------------------------ */

  function validateAll() {
    var errors = [];

    var name = el('companyName').value.trim();
    if (!setError('companyName', name.length < 3 ? 'Bitte den vollständigen Firmenwortlaut angeben.' : '')) {
      errors.push('companyName');
    }

    var atu = IBO.validateATU(el('atuInput').value);
    if (!setError('atuInput', atu.valid ? '' : atu.message)) errors.push('atuInput');

    var gisa = IBO.validateGISA(el('gisaInput').value);
    if (!setError('gisaInput', gisa.valid ? '' : gisa.message)) errors.push('gisaInput');

    var email = IBO.validateEmail(el('emailInput').value);
    if (!setError('emailInput', email.valid ? '' : email.message)) errors.push('emailInput');

    var phone = IBO.validatePhone(el('phoneInput').value);
    if (!setError('phoneInput', phone.valid ? '' : phone.message)) errors.push('phoneInput');

    var district = el('districtSelect').value;
    if (!setError('districtSelect', district ? '' : 'Bitte einen Bezirk wählen.')) errors.push('districtSelect');

    var category = el('categorySelect').value;
    if (!setError('categorySelect', category ? '' : 'Bitte eine Kategorie wählen.')) errors.push('categorySelect');

    var description = el('descriptionInput').value.trim();
    if (
      !setError(
        'descriptionInput',
        description.length < 30 ? 'Bitte beschreiben Sie Ihr Angebot mit mindestens 30 Zeichen.' : ''
      )
    ) {
      errors.push('descriptionInput');
    }

    var consent = el('consentInput').checked;
    if (!setError('consentInput', consent ? '' : 'Ohne Zustimmung ist keine Prüfung möglich.')) {
      errors.push('consentInput');
    }

    return {
      errors: errors,
      data: {
        name: name,
        uid: atu.normalized || el('atuInput').value.trim(),
        gisa: gisa.normalized || '',
        email: email.normalized || el('emailInput').value.trim(),
        phone: phone.normalized || el('phoneInput').value.trim(),
        district: district,
        category: category,
        description: description,
      },
    };
  }

  function handleSubmit(event) {
    event.preventDefault();
    var result = validateAll();

    if (result.errors.length) {
      var first = el(result.errors[0]);
      if (first) {
        first.focus();
        first.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
      IBO.toast(
        result.errors.length + ' ' + IBO.plural(result.errors.length, 'Feld benötigt', 'Felder benötigen') + ' noch Ihre Aufmerksamkeit.',
        'error'
      );
      return;
    }

    var application = Object.assign({ id: IBO.uid('antrag'), createdAt: new Date().toISOString(), status: 'offen' }, result.data);
    IBO.storage.push('antraege', application);
    IBO.storage.remove(DRAFT_KEY);

    var container = document.getElementById('signup-card');
    container.innerHTML =
      '<div class="notice notice--success">' +
      IBO.icon('check') +
      '<p><strong>Antrag eingegangen.</strong> Wir prüfen UID und Gewerbeberechtigung manuell und melden uns ' +
      'innerhalb von zwei Werktagen an ' +
      IBO.esc(application.email) +
      '.</p></div>' +
      '<h2>Was jetzt passiert</h2>' +
      '<ol class="stack" style="margin:12px 0 20px 20px">' +
      '<li>Abgleich der UID im Bestätigungsverfahren des Finanzministeriums.</li>' +
      '<li>Kontrolle der Gewerbeberechtigung im GISA-Register.</li>' +
      '<li>Freischaltung des Profils und Zugangsdaten per E-Mail.</li>' +
      '</ol>' +
      '<p class="muted" style="font-size:.85rem">Referenznummer: <strong>' +
      IBO.esc(application.id) +
      '</strong></p>' +
      '<div class="form-actions">' +
      '<a class="btn btn--secondary" href="index.html">Zur Startseite</a>' +
      '<a class="btn btn--primary" href="verwaltung.html">Antrag im Admin-Bereich ansehen</a>' +
      '</div>';
    container.scrollIntoView({ block: 'start', behavior: 'smooth' });
    IBO.toast('Antrag gespeichert.', 'success');
  }

  /* ------------------------------------------------------------------ *
   * Aufbau
   * ------------------------------------------------------------------ */

  function fillSelects() {
    var district = el('districtSelect');
    if (district) {
      district.insertAdjacentHTML(
        'beforeend',
        IBO.districts
          .map(function (d) {
            return '<option value="' + d.code + '">' + d.code + ' ' + IBO.esc(d.name) + '</option>';
          })
          .join('')
      );
    }

    var category = el('categorySelect');
    if (category) {
      category.insertAdjacentHTML(
        'beforeend',
        IBO.categories
          .map(function (c) {
            return '<option value="' + IBO.esc(c.id) + '">' + IBO.esc(c.name) + '</option>';
          })
          .join('')
      );
    }
  }

  function init() {
    var form = el('signupForm');
    if (!form) return;

    fillSelects();
    restoreDraft();

    form.addEventListener('submit', handleSubmit);
    form.addEventListener('input', IBO.debounce(saveDraft, 400));
    form.addEventListener('change', saveDraft);

    var checkBtn = el('checkBtn');
    if (checkBtn) checkBtn.addEventListener('click', checkVerification);

    var clearBtn = el('clearDraftBtn');
    if (clearBtn) {
      clearBtn.addEventListener('click', function () {
        IBO.storage.remove(DRAFT_KEY);
        form.reset();
        TEXT_FIELDS.concat(['consentInput']).forEach(function (id) {
          setError(id, '');
        });
        var note = el('draftNote');
        if (note) note.hidden = true;
        IBO.toast('Entwurf verworfen.');
      });
    }

    // Fehler verschwinden, sobald das Feld korrigiert wird.
    form.addEventListener(
      'blur',
      function (event) {
        var id = event.target.id;
        if (id === 'atuInput' && event.target.value.trim()) {
          var atu = IBO.validateATU(event.target.value);
          setError('atuInput', atu.valid ? '' : atu.message);
        }
        if (id === 'emailInput' && event.target.value.trim()) {
          var mail = IBO.validateEmail(event.target.value);
          setError('emailInput', mail.valid ? '' : mail.message);
        }
        if (id === 'phoneInput' && event.target.value.trim()) {
          var phone = IBO.validatePhone(event.target.value);
          setError('phoneInput', phone.valid ? '' : phone.message);
        }
      },
      true
    );
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);
