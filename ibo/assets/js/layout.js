/**
 * Servano – gemeinsame Kopf- und Fußzeile.
 *
 * Vorher war die Navigation auf jeder Seite von Hand kopiert und dadurch
 * uneinheitlich (Impressum und Datenschutz hatten gar keine). Jetzt gibt es
 * genau eine Quelle: Jede Seite setzt `data-page="…"` auf <body> und enthält
 * die Platzhalter `<div data-header></div>` / `<div data-footer></div>`.
 */
(function (global) {
  'use strict';

  var IBO = (global.IBO = global.IBO || {});

  var NAV = [
    { page: 'home', href: 'index.html', label: 'Suchen', icon: 'search' },
    { page: 'info', href: 'info.html', label: "So funktioniert's", icon: 'info' },
    { page: 'merkliste', href: 'index.html#/merkliste', label: 'Merkliste', icon: 'heart' },
    { page: 'signup', href: 'signup.html', label: 'Für Betriebe', icon: 'building' },
    { page: 'admin', href: 'verwaltung.html', label: 'Admin', icon: 'lock' },
  ];

  var THEME_KEY = 'theme';

  /* ------------------------------------------------------------------ *
   * Farbschema
   * ------------------------------------------------------------------ */

  IBO.getTheme = function () {
    return IBO.storage.get(THEME_KEY, 'auto');
  };

  IBO.applyTheme = function (theme) {
    if (theme === 'auto') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', theme);
    }
    IBO.storage.set(THEME_KEY, theme);
    updateThemeButton();
  };

  function prefersDark() {
    return global.matchMedia && global.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  function isDarkActive() {
    var theme = IBO.getTheme();
    return theme === 'dark' || (theme === 'auto' && prefersDark());
  }

  function updateThemeButton() {
    var btn = document.querySelector('[data-theme-toggle]');
    if (!btn) return;
    var dark = isDarkActive();
    btn.innerHTML = IBO.icon(dark ? 'sun' : 'moon');
    btn.setAttribute('aria-label', dark ? 'Helles Design aktivieren' : 'Dunkles Design aktivieren');
    btn.setAttribute('title', btn.getAttribute('aria-label'));
  }

  /* ------------------------------------------------------------------ *
   * Markup
   * ------------------------------------------------------------------ */

  function headerMarkup(current) {
    var links = NAV.map(function (item) {
      var isCurrent = item.page === current;
      return (
        '<a href="' +
        item.href +
        '"' +
        (isCurrent ? ' aria-current="page"' : '') +
        '>' +
        IBO.icon(item.icon) +
        '<span>' +
        IBO.esc(item.label) +
        '</span></a>'
      );
    }).join('');

    return (
      '<a class="skip-link" href="#main">Zum Inhalt springen</a>' +
      '<header class="site-header">' +
      '<div class="container header-content">' +
      '<a class="logo" href="index.html">Servano<span>.</span></a>' +
      '<nav class="site-nav" id="site-nav" aria-label="Hauptnavigation">' +
      links +
      '</nav>' +
      '<div class="header-actions">' +
      '<button type="button" class="theme-toggle" data-theme-toggle></button>' +
      '<button type="button" class="nav-toggle" data-nav-toggle aria-expanded="false" ' +
      'aria-controls="site-nav" aria-label="Menü öffnen">' +
      IBO.icon('menu') +
      '</button>' +
      '</div>' +
      '</div>' +
      '</header>'
    );
  }

  function footerMarkup() {
    var year = new Date().getFullYear();
    return (
      '<footer class="site-footer">' +
      '<div class="container">' +
      '<div class="footer-grid">' +
      '<div>' +
      '<h3>Servano</h3>' +
      '<p>Das Verzeichnis für geprüfte Dienstleistungsbetriebe in Wien. ' +
      'Keine gekauften Bewertungen, keine Abo-Falle, klar gekennzeichnete Anzeigen.</p>' +
      '</div>' +
      '<div>' +
      '<h3>Plattform</h3>' +
      '<div class="footer-links">' +
      '<a href="index.html">Dienstleister suchen</a>' +
      '<a href="info.html">So funktioniert\'s</a>' +
      '<a href="signup.html">Betrieb eintragen</a>' +
      '</div>' +
      '</div>' +
      '<div>' +
      '<h3>Rechtliches</h3>' +
      '<div class="footer-links">' +
      '<a href="impressum.html">Impressum</a>' +
      '<a href="datenschutz.html">Datenschutz</a>' +
      '<a href="agb.html">Nutzungsbedingungen</a>' +
      '</div>' +
      '</div>' +
      '</div>' +
      '<div class="footer-bottom">' +
      '<span>&copy; ' +
      year +
      ' Servano Plattform GmbH, Wien</span>' +
      '<span>Prototyp – alle Firmendaten sind Beispieldaten.</span>' +
      '</div>' +
      '</div>' +
      '</footer>'
    );
  }

  /* ------------------------------------------------------------------ *
   * Initialisierung
   * ------------------------------------------------------------------ */

  function initNavToggle() {
    var toggle = document.querySelector('[data-nav-toggle]');
    var nav = document.getElementById('site-nav');
    if (!toggle || !nav) return;

    toggle.addEventListener('click', function () {
      var open = nav.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Menü schließen' : 'Menü öffnen');
      toggle.innerHTML = IBO.icon(open ? 'close' : 'menu');
    });

    // Menü bei Escape und beim Klick nach außen schließen.
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && nav.classList.contains('is-open')) {
        toggle.click();
        toggle.focus();
      }
    });

    document.addEventListener('click', function (event) {
      if (!nav.classList.contains('is-open')) return;
      if (nav.contains(event.target) || toggle.contains(event.target)) return;
      toggle.click();
    });
  }

  function initThemeToggle() {
    var btn = document.querySelector('[data-theme-toggle]');
    if (!btn) return;
    updateThemeButton();
    btn.addEventListener('click', function () {
      IBO.applyTheme(isDarkActive() ? 'light' : 'dark');
    });
    if (global.matchMedia) {
      var mq = global.matchMedia('(prefers-color-scheme: dark)');
      var onChange = function () {
        if (IBO.getTheme() === 'auto') updateThemeButton();
      };
      if (mq.addEventListener) mq.addEventListener('change', onChange);
      else if (mq.addListener) mq.addListener(onChange);
    }
  }

  IBO.initLayout = function () {
    IBO.injectIconSprite();

    var current = document.body.getAttribute('data-page') || '';
    var headerSlot = document.querySelector('[data-header]');
    var footerSlot = document.querySelector('[data-footer]');

    if (headerSlot) headerSlot.outerHTML = headerMarkup(current);
    if (footerSlot) footerSlot.outerHTML = footerMarkup();

    initNavToggle();
    initThemeToggle();
  };

  document.addEventListener('DOMContentLoaded', function () {
    IBO.initLayout();
  });
})(window);
