/**
 * Servano – gemeinsame Hilfsfunktionen für alle Seiten.
 * Klassisches Script (kein Modul), damit die Seiten auch per file:// laufen.
 */
(function (global) {
  'use strict';

  var IBO = (global.IBO = global.IBO || {});

  /* ------------------------------------------------------------------ *
   * Sicherheit
   * ------------------------------------------------------------------ */

  /**
   * Maskiert HTML-Sonderzeichen. Muss auf JEDEN Wert angewandt werden, der aus
   * Daten oder Nutzereingaben in ein Template kommt – sonst ist jede Firma mit
   * `<script>` im Namen ein XSS.
   */
  IBO.esc = function (value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  /** Maskiert einen Wert für die Verwendung in einem Attribut-Kontext + URL. */
  IBO.escAttrUrl = function (value) {
    var v = String(value || '').trim();
    // Nur http/https/tel/mailto zulassen – blockt javascript: und data: URLs.
    if (!/^(https?:|tel:|mailto:|#|\/|\.)/i.test(v)) return '#';
    return IBO.esc(v);
  };

  /* ------------------------------------------------------------------ *
   * Text & Suche
   * ------------------------------------------------------------------ */

  /**
   * Normalisiert Text für die Suche: Kleinschreibung, Umlaute ausgeschrieben,
   * Akzente entfernt. So findet "muller", "müller" und "mueller" dieselbe Firma.
   */
  IBO.normalize = function (text) {
    return String(text || '')
      .toLowerCase()
      .replace(/ä/g, 'ae')
      .replace(/ö/g, 'oe')
      .replace(/ü/g, 'ue')
      .replace(/ß/g, 'ss')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  };

  /** Zerlegt eine Suchanfrage in normalisierte Einzelbegriffe. */
  IBO.tokenize = function (query) {
    var n = IBO.normalize(query);
    return n ? n.split(' ') : [];
  };

  var CHAR_EXPANSIONS = { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' };

  /**
   * Normalisiert wie IBO.normalize, merkt sich aber zu jedem normalisierten
   * Zeichen die Position im Originaltext. Nur so lässt sich ein Treffer auf
   * "mueller" später im Original als "Müller" markieren.
   */
  function normalizeWithMap(text) {
    var norm = '';
    var map = [];
    for (var i = 0; i < text.length; i++) {
      var lower = text[i].toLowerCase();
      var expanded = CHAR_EXPANSIONS[lower];
      if (expanded === undefined) {
        expanded = lower.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        expanded = expanded.replace(/[^a-z0-9]/g, ' ');
      }
      for (var j = 0; j < expanded.length; j++) {
        norm += expanded[j];
        map.push(i);
      }
    }
    return { norm: norm, map: map };
  }

  /**
   * Hebt Suchtreffer im Text hervor und maskiert dabei selbst – die Rückgabe
   * ist fertiges HTML und darf nicht erneut maskiert werden.
   */
  IBO.highlight = function (text, tokens) {
    var raw = text === null || text === undefined ? '' : String(text);
    if (!tokens || !tokens.length) return IBO.esc(raw);

    var mapped = normalizeWithMap(raw);
    var ranges = [];

    tokens.forEach(function (token) {
      if (!token || token.length < 2) return;
      var from = 0;
      var index;
      while ((index = mapped.norm.indexOf(token, from)) !== -1) {
        ranges.push([mapped.map[index], mapped.map[index + token.length - 1] + 1]);
        from = index + token.length;
      }
    });

    if (!ranges.length) return IBO.esc(raw);

    ranges.sort(function (a, b) {
      return a[0] - b[0];
    });

    // Überlappende Treffer zusammenfassen, damit keine verschachtelten
    // <mark>-Elemente entstehen.
    var merged = [];
    ranges.forEach(function (range) {
      var last = merged[merged.length - 1];
      if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
      else merged.push([range[0], range[1]]);
    });

    var out = '';
    var cursor = 0;
    merged.forEach(function (range) {
      out += IBO.esc(raw.slice(cursor, range[0])) + '<mark>' + IBO.esc(raw.slice(range[0], range[1])) + '</mark>';
      cursor = range[1];
    });
    return out + IBO.esc(raw.slice(cursor));
  };

  IBO.plural = function (count, one, many) {
    return count === 1 ? one : many;
  };

  /* ------------------------------------------------------------------ *
   * Validierung (Österreich)
   * ------------------------------------------------------------------ */

  /**
   * Prüft eine österreichische UID (ATU + 8 Ziffern) inklusive Prüfziffer.
   * Algorithmus des BMF: Quersumme der verdoppelten Ziffern an geraden Stellen.
   * Beispiel gültig: ATU13585627
   */
  IBO.validateATU = function (input) {
    var raw = String(input || '')
      .toUpperCase()
      .replace(/[\s.\-/]/g, '');
    if (!raw) return { valid: false, code: 'empty', message: 'Bitte UID-Nummer eingeben.' };
    if (!/^ATU\d{8}$/.test(raw)) {
      return {
        valid: false,
        code: 'format',
        message: 'Format ungültig – erwartet wird "ATU" gefolgt von 8 Ziffern (z. B. ATU13585627).',
      };
    }
    var digits = raw.slice(3).split('').map(Number);
    var sum = 0;
    for (var i = 0; i < 7; i++) {
      if (i % 2 === 0) {
        sum += digits[i]; // ungerade Position (1, 3, 5, 7)
      } else {
        var doubled = digits[i] * 2;
        sum += Math.floor(doubled / 10) + (doubled % 10);
      }
    }
    var checkDigit = (96 - sum) % 10;
    if (checkDigit !== digits[7]) {
      return {
        valid: false,
        code: 'checksum',
        message: 'Prüfziffer stimmt nicht – bitte die UID-Nummer noch einmal kontrollieren.',
        normalized: raw,
      };
    }
    return { valid: true, code: 'ok', message: 'UID-Format und Prüfziffer sind gültig.', normalized: raw };
  };

  /** GISA-Zahl: 1–8 Ziffern, optional. */
  IBO.validateGISA = function (input) {
    var raw = String(input || '').replace(/[\s.\-/]/g, '');
    if (!raw) return { valid: true, code: 'empty', normalized: '' };
    if (!/^\d{1,8}$/.test(raw)) {
      return { valid: false, code: 'format', message: 'GISA-Zahl besteht aus bis zu 8 Ziffern.' };
    }
    return { valid: true, code: 'ok', normalized: raw };
  };

  IBO.validateEmail = function (input) {
    var raw = String(input || '').trim();
    if (!raw) return { valid: false, message: 'Bitte E-Mail-Adresse eingeben.' };
    if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(raw)) {
      return { valid: false, message: 'Diese E-Mail-Adresse sieht nicht gültig aus.' };
    }
    return { valid: true, normalized: raw.toLowerCase() };
  };

  /** Österreichische Telefonnummer, tolerant gegenüber Schreibweisen. */
  IBO.validatePhone = function (input) {
    var raw = String(input || '').replace(/[\s()./-]/g, '');
    if (!raw) return { valid: false, message: 'Bitte Telefonnummer eingeben.' };
    if (!/^(\+43|0043|0)\d{6,13}$/.test(raw)) {
      return { valid: false, message: 'Bitte eine österreichische Nummer angeben (z. B. +43 1 234 56 78).' };
    }
    return { valid: true, normalized: raw.replace(/^0043/, '+43') };
  };

  /** Entfernt Leerzeichen für tel:-Links. */
  IBO.telHref = function (phone) {
    return 'tel:' + String(phone || '').replace(/[^\d+]/g, '');
  };

  /* ------------------------------------------------------------------ *
   * Öffnungszeiten
   * ------------------------------------------------------------------ */

  var DAY_KEYS = ['so', 'mo', 'di', 'mi', 'do', 'fr', 'sa'];
  var DAY_LABELS = {
    mo: 'Montag',
    di: 'Dienstag',
    mi: 'Mittwoch',
    do: 'Donnerstag',
    fr: 'Freitag',
    sa: 'Samstag',
    so: 'Sonntag',
  };
  var DAY_ORDER = ['mo', 'di', 'mi', 'do', 'fr', 'sa', 'so'];

  IBO.DAY_LABELS = DAY_LABELS;
  IBO.DAY_ORDER = DAY_ORDER;

  function toMinutes(hhmm) {
    var parts = String(hhmm).split(':');
    return parseInt(parts[0], 10) * 60 + parseInt(parts[1] || '0', 10);
  }

  /**
   * Ist der Betrieb gerade geöffnet?
   * @param {object} company Firma mit `hours` und optional `emergency24`
   * @param {Date} [now] Zeitpunkt (für Tests injizierbar)
   */
  IBO.isOpenNow = function (company, now) {
    if (!company) return false;
    if (company.emergency24) return true;
    var d = now || new Date();
    var key = DAY_KEYS[d.getDay()];
    var ranges = (company.hours || {})[key];
    if (!ranges || !ranges.length) return false;
    var minutes = d.getHours() * 60 + d.getMinutes();
    return ranges.some(function (range) {
      return minutes >= toMinutes(range[0]) && minutes < toMinutes(range[1]);
    });
  };

  /** Kurzfassung der Öffnungszeiten für Listenansichten. */
  IBO.hoursSummary = function (company, now) {
    if (company.emergency24) return 'Rund um die Uhr erreichbar (Notdienst)';
    var d = now || new Date();
    var key = DAY_KEYS[d.getDay()];
    var ranges = (company.hours || {})[key];
    if (!ranges || !ranges.length) return 'Heute geschlossen';
    return (
      'Heute ' +
      ranges
        .map(function (r) {
          return r[0] + '–' + r[1];
        })
        .join(', ')
    );
  };

  /** Fasst gleiche aufeinanderfolgende Tage zusammen: "Mo–Fr 08:00–18:00". */
  IBO.hoursTable = function (company) {
    var hours = company.hours || {};
    var rows = [];
    DAY_ORDER.forEach(function (day) {
      var ranges = hours[day] || [];
      var text = ranges.length
        ? ranges
            .map(function (r) {
              return r[0] + '–' + r[1];
            })
            .join(', ')
        : 'geschlossen';
      var last = rows[rows.length - 1];
      if (last && last.text === text) {
        last.days.push(day);
      } else {
        rows.push({ days: [day], text: text });
      }
    });
    return rows.map(function (row) {
      var first = DAY_LABELS[row.days[0]].slice(0, 2);
      var label =
        row.days.length === 1 ? first : first + '–' + DAY_LABELS[row.days[row.days.length - 1]].slice(0, 2);
      return { label: label, text: row.text };
    });
  };

  /* ------------------------------------------------------------------ *
   * Speicher (localStorage mit Fallback)
   * ------------------------------------------------------------------ */

  var memoryStore = {};

  IBO.storage = {
    get: function (key, fallback) {
      try {
        var raw = global.localStorage.getItem('servano.' + key);
        return raw === null ? fallback : JSON.parse(raw);
      } catch (e) {
        return Object.prototype.hasOwnProperty.call(memoryStore, key) ? memoryStore[key] : fallback;
      }
    },
    set: function (key, value) {
      try {
        global.localStorage.setItem('servano.' + key, JSON.stringify(value));
      } catch (e) {
        memoryStore[key] = value; // z. B. Privatmodus oder Speicher voll
      }
      return value;
    },
    remove: function (key) {
      try {
        global.localStorage.removeItem('servano.' + key);
      } catch (e) {
        delete memoryStore[key];
      }
    },
    push: function (key, entry) {
      var list = IBO.storage.get(key, []);
      list.push(entry);
      return IBO.storage.set(key, list);
    },
  };

  /* ------------------------------------------------------------------ *
   * Kleinkram
   * ------------------------------------------------------------------ */

  IBO.debounce = function (fn, wait) {
    var timer = null;
    return function () {
      var args = arguments;
      var self = this;
      clearTimeout(timer);
      timer = setTimeout(function () {
        fn.apply(self, args);
      }, wait || 200);
    };
  };

  IBO.formatDate = function (isoString) {
    var d = new Date(isoString);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  IBO.formatDateTime = function (isoString) {
    var d = new Date(isoString);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleString('de-AT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  IBO.uid = function (prefix) {
    return (prefix || 'id') + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
  };

  /** Kurze Statusmeldung am unteren Bildschirmrand (ersetzt alert()). */
  IBO.toast = function (message, tone) {
    var host = document.getElementById('toast-host');
    if (!host) {
      host = document.createElement('div');
      host.id = 'toast-host';
      host.className = 'toast-host';
      host.setAttribute('role', 'status');
      host.setAttribute('aria-live', 'polite');
      document.body.appendChild(host);
    }
    var el = document.createElement('div');
    el.className = 'toast toast--' + (tone || 'info');
    el.innerHTML = IBO.icon(tone === 'error' ? 'warning' : 'check') + '<span>' + IBO.esc(message) + '</span>';
    host.appendChild(el);
    setTimeout(function () {
      el.classList.add('toast--out');
      setTimeout(function () {
        el.remove();
      }, 300);
    }, 4000);
  };
})(window);
