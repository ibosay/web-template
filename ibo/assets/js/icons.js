/**
 * Servano – Icon-Set
 *
 * Ersetzt die frühere FontAwesome-Einbindung über ein CDN. Gründe:
 *  - Kein Verbindungsaufbau zu Drittservern (DSGVO: keine IP-Übertragung an CDN-Betreiber)
 *  - Funktioniert offline und ohne Netzwerklatenz
 *  - Nur die Icons, die wirklich gebraucht werden (~4 KB statt ~400 KB)
 *
 * Alle Icons sind 24x24 Strich-Icons und erben Farbe (currentColor) sowie Größe (em)
 * vom umgebenden Text.
 */
(function (global) {
  'use strict';

  var IBO = (global.IBO = global.IBO || {});

  var PATHS = {
    search: '<circle cx="11" cy="11" r="7"/><path d="M16.5 16.5 21 21"/>',
    wrench:
      '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.1-.5-.5-2.1z"/>',
    bolt: '<path d="M13 2 4 14h6l-1 8 9-12h-6z"/>',
    truck:
      '<path d="M2 7h11v10H2z"/><path d="M13 10h4l3 3v4h-7z"/><circle cx="6" cy="18" r="1.8"/><circle cx="16.5" cy="18" r="1.8"/>',
    scissors:
      '<circle cx="6" cy="7" r="2.5"/><circle cx="6" cy="17" r="2.5"/><path d="M8 8.5 20 18M8 15.5 20 6"/>',
    broom: '<path d="M15 3 9 9"/><path d="m6 12 6-6 6 6-3 3H9z"/><path d="M9 15v6M12 15v6M15 15v6"/>',
    roller: '<path d="M3 4h14v5H3z"/><path d="M17 6.5h3v4h-8v3"/><path d="M10 13.5h4V21h-4z"/>',
    key: '<circle cx="7" cy="12" r="4"/><path d="M11 12h10M18 12v3M15 12v2.5"/>',
    hammer: '<path d="m14 6 4-4 4 4-4 4z"/><path d="m15 9-3-3-9 9 3 3z"/><path d="m6 15 3 3-3 3-3-3z"/>',
    laptop: '<path d="M5 5h14v10H5z"/><path d="M2 19h20"/>',
    leaf: '<path d="M20 4C10 4 4 10 4 18c8 2 16-4 16-14z"/><path d="M4 20 14 10"/>',
    check: '<path d="m4 12 5 5L20 6"/>',
    verified: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
    pin: '<path d="M12 22s7-7.3 7-12a7 7 0 1 0-14 0c0 4.7 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5.5l3.5 2"/>',
    phone:
      '<path d="M6.6 10.8a15 15 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.6 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1 11.4 11.4 0 0 0 .6 3.6 1 1 0 0 1-.25 1z"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c2.5 2.7 3.7 5.7 3.7 9S14.5 18.3 12 21c-2.5-2.7-3.7-5.7-3.7-9S9.5 5.7 12 3z"/>',
    mail: '<path d="M3 5h18v14H3z"/><path d="m3 6 9 7 9-7"/>',
    arrowLeft: '<path d="M20 12H4"/><path d="m10 6-6 6 6 6"/>',
    arrowRight: '<path d="M4 12h16"/><path d="m14 6 6 6-6 6"/>',
    lock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    heart: '<path d="M12 20S3.5 14.5 3.5 8.9A4.4 4.4 0 0 1 12 6.8a4.4 4.4 0 0 1 8.5 2.1C20.5 14.5 12 20 12 20z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2 12h2M20 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/>',
    moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    external: '<path d="M14 4h6v6"/><path d="M20 4 11 13"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    shield: '<path d="M12 3l8 3v5c0 5-3.4 9-8 10-4.6-1-8-5-8-10V6z"/><path d="m9 12 2 2 4-4"/>',
    filter: '<path d="M3 5h18l-7 8v6l-4 2v-8z"/>',
    trash: '<path d="M4 7h16"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/><path d="M6 7v13a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7"/>',
    edit: '<path d="m15 4 5 5"/><path d="M4 20h5L20 9l-5-5L4 15z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 7.8v.4"/>',
    warning: '<path d="M12 3 2 20h20z"/><path d="M12 10v4"/><path d="M12 17v.4"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    building: '<path d="M4 21V4h11v17"/><path d="M15 9h5v12"/><path d="M8 8h3M8 12h3M8 16h3"/>',
    map: '<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3z"/><path d="M9 3v15M15 6v15"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    star: '<path d="m12 3 2.7 5.6 6.3.9-4.5 4.4 1 6.1-5.5-2.9L6.5 20l1-6.1L3 9.5l6.3-.9z"/>',
    download: '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M4 20h16"/>',
    logout: '<path d="M14 4h5a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-5"/><path d="M10 8 6 12l4 4"/><path d="M6 12h9"/>',
  };

  /** Baut das SVG-Sprite und hängt es (einmalig) an den Anfang des Body. */
  IBO.injectIconSprite = function () {
    if (document.getElementById('ibo-icon-sprite')) return;
    var symbols = Object.keys(PATHS)
      .map(function (name) {
        return '<symbol id="i-' + name + '" viewBox="0 0 24 24">' + PATHS[name] + '</symbol>';
      })
      .join('');
    var wrapper = document.createElement('div');
    wrapper.innerHTML =
      '<svg id="ibo-icon-sprite" aria-hidden="true" style="display:none" ' +
      'fill="none" stroke="currentColor" stroke-width="1.8" ' +
      'stroke-linecap="round" stroke-linejoin="round">' +
      symbols +
      '</svg>';
    document.body.insertBefore(wrapper.firstChild, document.body.firstChild);
  };

  /**
   * Liefert das Markup für ein Icon.
   * @param {string} name Schlüssel aus PATHS
   * @param {string} [extraClass] zusätzliche CSS-Klasse
   */
  IBO.icon = function (name, extraClass) {
    if (!PATHS[name]) name = 'info';
    return (
      '<svg class="icon' +
      (extraClass ? ' ' + extraClass : '') +
      '" aria-hidden="true" focusable="false"><use href="#i-' +
      name +
      '"></use></svg>'
    );
  };

  IBO.hasIcon = function (name) {
    return Object.prototype.hasOwnProperty.call(PATHS, name);
  };
})(window);
