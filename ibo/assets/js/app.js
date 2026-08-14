/**
 * Servano – Suche, Ergebnisliste und Anbieterprofil (index.html).
 *
 * Wichtigste Änderungen gegenüber dem ersten Prototyp:
 *  - Zustand steht in der URL (#/suche?q=…&bezirk=…). Vor, Zurück, Neu laden und
 *    das Teilen eines Links funktionieren damit.
 *  - Kein `onclick="…${daten}…"` mehr im HTML: Alle Klicks laufen über
 *    Event-Delegation, alle Daten werden vor der Ausgabe maskiert.
 *  - Kategorien haben Synonyme, deshalb liefert "Installateure" jetzt Treffer.
 */
(function (global) {
  'use strict';

  var IBO = (global.IBO = global.IBO || {});

  var root;
  var tokensForHighlight = [];

  /* ------------------------------------------------------------------ *
   * Routing
   * ------------------------------------------------------------------ */

  var DEFAULT_STATE = {
    view: 'home',
    q: '',
    bezirk: '',
    kat: '',
    offen: false,
    notdienst: false,
    geprueft: false,
    sort: 'relevanz',
    slug: '',
  };

  function parseHash() {
    var hash = global.location.hash.replace(/^#/, '');
    var state = Object.assign({}, DEFAULT_STATE);
    if (!hash || hash === '/') return state;

    var parts = hash.split('?');
    var path = parts[0].replace(/^\/+|\/+$/g, '');
    var params = new URLSearchParams(parts[1] || '');

    if (path.indexOf('anbieter/') === 0) {
      state.view = 'detail';
      state.slug = decodeURIComponent(path.slice('anbieter/'.length));
      return state;
    }
    if (path === 'merkliste') {
      state.view = 'merkliste';
      return state;
    }
    if (path === 'suche') {
      state.view = 'suche';
      state.q = params.get('q') || '';
      state.bezirk = params.get('bezirk') || '';
      state.kat = params.get('kat') || '';
      state.offen = params.get('offen') === '1';
      state.notdienst = params.get('notdienst') === '1';
      state.geprueft = params.get('geprueft') === '1';
      state.sort = params.get('sort') || 'relevanz';
      return state;
    }
    return state;
  }

  function buildSearchHash(state) {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.bezirk) params.set('bezirk', state.bezirk);
    if (state.kat) params.set('kat', state.kat);
    if (state.offen) params.set('offen', '1');
    if (state.notdienst) params.set('notdienst', '1');
    if (state.geprueft) params.set('geprueft', '1');
    if (state.sort && state.sort !== 'relevanz') params.set('sort', state.sort);
    var query = params.toString();
    return '#/suche' + (query ? '?' + query : '');
  }

  function navigate(hash, replace) {
    if (replace && global.history && global.history.replaceState) {
      global.history.replaceState(null, '', hash);
      render();
    } else {
      global.location.hash = hash;
    }
  }

  /* ------------------------------------------------------------------ *
   * Suche
   * ------------------------------------------------------------------ */

  /** Baut den durchsuchbaren Text einer Firma und cached ihn am Objekt. */
  function haystack(company) {
    if (company._haystack) return company._haystack;
    var categoryText = (company.categories || [])
      .map(function (id) {
        var cat = IBO.categoryById(id);
        return cat ? cat.name + ' ' + cat.keywords.join(' ') : '';
      })
      .join(' ');

    company._haystack = {
      name: IBO.normalize(company.name),
      profession: IBO.normalize(company.profession),
      services: IBO.normalize((company.services || []).join(' ')),
      categories: IBO.normalize(categoryText),
      place: IBO.normalize(company.district + ' ' + IBO.districtName(company.district) + ' ' + company.address + ' ' + company.serviceArea),
      description: IBO.normalize(company.description),
    };
    return company._haystack;
  }

  var FIELD_WEIGHTS = { name: 10, profession: 7, services: 5, categories: 4, place: 3, description: 1 };

  /**
   * Bewertet eine Firma gegen die Suchbegriffe.
   * @returns {number} Punktzahl, 0 = kein Treffer (alle Begriffe müssen passen)
   */
  function scoreCompany(company, tokens) {
    if (!tokens.length) return 1;
    var fields = haystack(company);
    var total = 0;

    for (var i = 0; i < tokens.length; i++) {
      var token = tokens[i];
      var best = 0;
      for (var field in FIELD_WEIGHTS) {
        if (fields[field].indexOf(token) === -1) continue;
        var weight = FIELD_WEIGHTS[field];
        // Wortanfang zählt mehr als ein Treffer mitten im Wort.
        if (new RegExp('(^| )' + token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(fields[field])) {
          weight += 2;
        }
        if (weight > best) best = weight;
      }
      if (best === 0) return 0; // ein Begriff passt nirgends -> kein Treffer
      total += best;
    }
    return total;
  }

  /** Wendet Suchbegriffe, Filter und Sortierung an. */
  IBO.searchCompanies = function (state, companies) {
    var list = companies || IBO.companies;
    var tokens = IBO.tokenize(state.q);
    var now = new Date();

    var results = list
      .map(function (company) {
        return { company: company, score: scoreCompany(company, tokens) };
      })
      .filter(function (entry) {
        var c = entry.company;
        if (entry.score === 0) return false;
        if (state.bezirk && c.district !== state.bezirk) return false;
        if (state.kat && (c.categories || []).indexOf(state.kat) === -1) return false;
        if (state.offen && !IBO.isOpenNow(c, now)) return false;
        if (state.notdienst && !c.emergency24) return false;
        if (state.geprueft && !c.verified) return false;
        return true;
      });

    var sorters = {
      // Anzeigen werden bewusst NICHT nach oben sortiert – sie werden nur
      // gekennzeichnet. Das ist das Versprechen der Plattform.
      relevanz: function (a, b) {
        return b.score - a.score || a.company.name.localeCompare(b.company.name, 'de');
      },
      name: function (a, b) {
        return a.company.name.localeCompare(b.company.name, 'de');
      },
      bezirk: function (a, b) {
        return a.company.district.localeCompare(b.company.district) || a.company.name.localeCompare(b.company.name, 'de');
      },
      geprueft: function (a, b) {
        return Number(b.company.verified) - Number(a.company.verified) || b.score - a.score;
      },
    };

    results.sort(sorters[state.sort] || sorters.relevanz);
    return results.map(function (entry) {
      return entry.company;
    });
  };

  /* ------------------------------------------------------------------ *
   * Merkliste
   * ------------------------------------------------------------------ */

  function favorites() {
    return IBO.storage.get('merkliste', []);
  }

  function isFavorite(slug) {
    return favorites().indexOf(slug) !== -1;
  }

  function toggleFavorite(slug) {
    var list = favorites();
    var index = list.indexOf(slug);
    if (index === -1) {
      list.push(slug);
      IBO.toast('Zur Merkliste hinzugefügt.', 'success');
    } else {
      list.splice(index, 1);
      IBO.toast('Von der Merkliste entfernt.');
    }
    IBO.storage.set('merkliste', list);
    return index === -1;
  }

  /* ------------------------------------------------------------------ *
   * Bausteine
   * ------------------------------------------------------------------ */

  function companyBySlug(slug) {
    return (
      IBO.companies.filter(function (c) {
        return c.slug === slug;
      })[0] || null
    );
  }

  function badgeMarkup(company) {
    var open = IBO.isOpenNow(company);
    var html = '';
    if (company.verified) {
      html += '<span class="badge badge--verified">' + IBO.icon('verified') + 'Geprüft</span>';
    }
    if (company.emergency24) {
      html += '<span class="badge badge--emergency">' + IBO.icon('clock') + '24h Notdienst</span>';
    } else {
      html +=
        '<span class="badge ' +
        (open ? 'badge--open' : 'badge--closed') +
        '">' +
        IBO.icon('clock') +
        (open ? 'Jetzt geöffnet' : 'Geschlossen') +
        '</span>';
    }
    if (company.isSponsored) {
      html += '<span class="badge badge--ad" title="Bezahlte Platzierung – die Reihung wird dadurch nicht verändert">Anzeige</span>';
    }
    return html;
  }

  function favButton(company, small) {
    var active = isFavorite(company.slug);
    return (
      '<button type="button" class="btn btn--secondary' +
      (small ? ' btn--sm' : '') +
      '" data-action="fav" data-slug="' +
      IBO.esc(company.slug) +
      '" aria-pressed="' +
      active +
      '">' +
      IBO.icon('heart') +
      '<span>' +
      (active ? 'Gemerkt' : 'Merken') +
      '</span></button>'
    );
  }

  function companyCard(company) {
    var t = tokensForHighlight;
    return (
      '<article class="company-card' +
      (company.isSponsored ? ' company-card--ad' : '') +
      '">' +
      '<div class="company-card__top">' +
      '<div class="company-logo">' +
      IBO.icon(company.logoIcon) +
      '</div>' +
      '<div>' +
      '<div class="company-card__title">' +
      '<h3><a href="#/anbieter/' +
      encodeURIComponent(company.slug) +
      '">' +
      IBO.highlight(company.name, t) +
      '</a></h3>' +
      '</div>' +
      '<div class="company-meta">' +
      '<span>' +
      IBO.icon('building') +
      IBO.highlight(company.profession, t) +
      '</span>' +
      '<span>' +
      IBO.icon('pin') +
      IBO.esc(company.district + ' ' + IBO.districtName(company.district)) +
      '</span>' +
      '<span>' +
      IBO.icon('clock') +
      IBO.esc(IBO.hoursSummary(company)) +
      '</span>' +
      '</div>' +
      '</div>' +
      '</div>' +
      '<div class="company-card__badges">' +
      badgeMarkup(company) +
      '</div>' +
      '<div class="service-tags">' +
      (company.services || [])
        .slice(0, 4)
        .map(function (s) {
          return '<span class="service-tag">' + IBO.highlight(s, t) + '</span>';
        })
        .join('') +
      '</div>' +
      '<div class="company-card__actions">' +
      '<a class="btn btn--primary btn--sm" href="' +
      IBO.esc(IBO.telHref(company.phone)) +
      '">' +
      IBO.icon('phone') +
      '<span>Anrufen</span></a>' +
      '<a class="btn btn--secondary btn--sm" href="#/anbieter/' +
      encodeURIComponent(company.slug) +
      '">' +
      IBO.icon('arrowRight') +
      '<span>Profil</span></a>' +
      favButton(company, true) +
      '</div>' +
      '</article>'
    );
  }

  function searchFormMarkup(state) {
    var districtOptions = IBO.districts
      .map(function (d) {
        return (
          '<option value="' +
          d.code +
          '"' +
          (state.bezirk === d.code ? ' selected' : '') +
          '>' +
          d.code +
          ' ' +
          IBO.esc(d.name) +
          '</option>'
        );
      })
      .join('');

    return (
      '<form class="searchbar" id="search-form" role="search">' +
      '<div class="field">' +
      IBO.icon('search') +
      '<label class="visually-hidden" for="q">Suchbegriff</label>' +
      '<input type="search" id="q" name="q" value="' +
      IBO.esc(state.q) +
      '" placeholder="Firma, Beruf oder Leistung – z. B. Therme warten" autocomplete="off">' +
      '</div>' +
      '<div>' +
      '<label class="visually-hidden" for="bezirk">Bezirk</label>' +
      '<select id="bezirk" name="bezirk"><option value="">Alle 23 Bezirke</option>' +
      districtOptions +
      '</select>' +
      '</div>' +
      '<button type="submit" class="btn btn--primary">' +
      IBO.icon('search') +
      '<span>Suchen</span></button>' +
      '</form>'
    );
  }

  function filterBarMarkup(state) {
    var toggles = [
      { key: 'offen', label: 'Jetzt geöffnet', icon: 'clock' },
      { key: 'notdienst', label: '24h Notdienst', icon: 'warning' },
      { key: 'geprueft', label: 'Nur geprüfte Betriebe', icon: 'verified' },
    ]
      .map(function (item) {
        return (
          '<button type="button" class="chip" data-action="toggle" data-key="' +
          item.key +
          '" aria-pressed="' +
          Boolean(state[item.key]) +
          '">' +
          IBO.icon(item.icon) +
          IBO.esc(item.label) +
          '</button>'
        );
      })
      .join('');

    var categoryChip = state.kat
      ? '<button type="button" class="chip" data-action="clear-kat" aria-pressed="true">' +
        IBO.icon('filter') +
        IBO.esc((IBO.categoryById(state.kat) || {}).name || state.kat) +
        ' ' +
        IBO.icon('close') +
        '</button>'
      : '';

    var sortOptions = [
      ['relevanz', 'Relevanz'],
      ['name', 'Name (A–Z)'],
      ['bezirk', 'Bezirk'],
      ['geprueft', 'Geprüfte zuerst'],
    ]
      .map(function (opt) {
        return '<option value="' + opt[0] + '"' + (state.sort === opt[0] ? ' selected' : '') + '>' + opt[1] + '</option>';
      })
      .join('');

    return (
      '<div class="filters">' +
      categoryChip +
      toggles +
      '<div class="sort-field">' +
      '<label for="sort">Sortierung</label>' +
      '<select id="sort" data-action="sort">' +
      sortOptions +
      '</select>' +
      '</div>' +
      '</div>'
    );
  }

  /* ------------------------------------------------------------------ *
   * Ansichten
   * ------------------------------------------------------------------ */

  function viewHome(state) {
    var openNowCount = IBO.companies.filter(function (c) {
      return IBO.isOpenNow(c);
    }).length;

    var categoryCards = IBO.categories
      .map(function (cat) {
        var count = IBO.companies.filter(function (c) {
          return (c.categories || []).indexOf(cat.id) !== -1;
        }).length;
        return (
          '<button type="button" class="category-card" data-action="kat" data-kat="' +
          IBO.esc(cat.id) +
          '">' +
          IBO.icon(cat.icon) +
          '<span>' +
          IBO.esc(cat.name) +
          '</span>' +
          '<small>' +
          count +
          ' ' +
          IBO.plural(count, 'Betrieb', 'Betriebe') +
          '</small>' +
          '</button>'
        );
      })
      .join('');

    document.title = 'Servano – geprüfte Dienstleister in Wien finden';

    return (
      '<section class="hero">' +
      '<h1>Finde geprüfte Dienstleister in Wien</h1>' +
      '<p class="subtitle">Fair. Transparent. Ohne gekaufte Bewertungen. ' +
      'Jeder Betrieb wird vor der Freischaltung anhand von UID und Gewerberegister geprüft.</p>' +
      searchFormMarkup(state) +
      '<div class="trust-row">' +
      '<span>' +
      IBO.icon('verified') +
      IBO.companies.filter(function (c) {
        return c.verified;
      }).length +
      ' geprüfte Betriebe</span>' +
      '<span>' +
      IBO.icon('clock') +
      openNowCount +
      ' davon jetzt erreichbar</span>' +
      '<span>' +
      IBO.icon('shield') +
      'Anzeigen sind gekennzeichnet und werden nicht bevorzugt gereiht</span>' +
      '</div>' +
      '</section>' +
      '<section>' +
      '<div class="section-head">' +
      '<h2>Kategorien</h2>' +
      '<p>Direkt zur passenden Auswahl</p>' +
      '</div>' +
      '<div class="category-grid">' +
      categoryCards +
      '</div>' +
      '</section>' +
      '<section>' +
      '<div class="section-head"><h2>Gerade im Einsatz</h2><p>Betriebe mit Notdienst rund um die Uhr</p></div>' +
      '<div class="results-list">' +
      IBO.companies
        .filter(function (c) {
          return c.emergency24;
        })
        .map(companyCard)
        .join('') +
      '</div>' +
      '</section>'
    );
  }

  function viewSearch(state) {
    var results = IBO.searchCompanies(state);
    var titleParts = ['Suche'];
    if (state.q) titleParts.push('„' + state.q + '"');
    if (state.bezirk) titleParts.push(state.bezirk);
    document.title = titleParts.join(' ') + ' – Servano';

    var head =
      '<section class="hero" style="padding-top:20px">' +
      searchFormMarkup(state) +
      '</section>' +
      filterBarMarkup(state) +
      '<div class="results-head">' +
      '<h2>' +
      results.length +
      ' ' +
      IBO.plural(results.length, 'Betrieb gefunden', 'Betriebe gefunden') +
      '</h2>' +
      '<a class="btn btn--ghost btn--sm" href="#/">' +
      IBO.icon('arrowLeft') +
      '<span>Startseite</span></a>' +
      '</div>';

    if (!results.length) {
      var suggestions = IBO.categories
        .slice(0, 6)
        .map(function (cat) {
          return (
            '<button type="button" class="chip" data-action="kat" data-kat="' +
            IBO.esc(cat.id) +
            '">' +
            IBO.icon(cat.icon) +
            IBO.esc(cat.name) +
            '</button>'
          );
        })
        .join('');
      return (
        head +
        '<div class="empty-state">' +
        IBO.icon('search') +
        '<h2>Keine passenden Betriebe</h2>' +
        '<p>Für diese Kombination aus Suchbegriff und Filtern gibt es aktuell keinen Eintrag. ' +
        'Setzen Sie einen Filter zurück oder starten Sie mit einer Kategorie.</p>' +
        '<div class="filters" style="justify-content:center">' +
        '<button type="button" class="btn btn--secondary btn--sm" data-action="reset">' +
        IBO.icon('close') +
        '<span>Filter zurücksetzen</span></button>' +
        suggestions +
        '</div>' +
        '</div>'
      );
    }

    var adCount = results.filter(function (c) {
      return c.isSponsored;
    }).length;

    return (
      head +
      (adCount
        ? '<div class="notice notice--info">' +
          IBO.icon('info') +
          '<p>' +
          adCount +
          ' ' +
          IBO.plural(adCount, 'Eintrag ist', 'Einträge sind') +
          ' als <strong>Anzeige</strong> gekennzeichnet. Bezahlte Platzierungen ändern die Reihenfolge der Ergebnisse nicht.</p>' +
          '</div>'
        : '') +
      '<div class="results-list">' +
      results.map(companyCard).join('') +
      '</div>'
    );
  }

  function viewFavorites() {
    document.title = 'Merkliste – Servano';
    var list = favorites()
      .map(companyBySlug)
      .filter(Boolean);

    var head =
      '<div class="page-head"><h1>Merkliste</h1>' +
      '<p>Diese Betriebe sind nur auf diesem Gerät gespeichert – es werden keine Daten an den Server übertragen.</p></div>';

    if (!list.length) {
      return (
        head +
        '<div class="empty-state">' +
        IBO.icon('heart') +
        '<h2>Noch nichts gemerkt</h2>' +
        '<p>Über die Schaltfläche „Merken" bei einem Betrieb sammeln Sie hier Ihre Auswahl für später.</p>' +
        '<a class="btn btn--primary" href="#/">' +
        IBO.icon('search') +
        '<span>Jetzt suchen</span></a>' +
        '</div>'
      );
    }
    return head + '<div class="results-list">' + list.map(companyCard).join('') + '</div>';
  }

  function viewDetail(state) {
    var company = companyBySlug(state.slug);
    if (!company) {
      document.title = 'Nicht gefunden – Servano';
      return (
        '<div class="empty-state">' +
        IBO.icon('warning') +
        '<h2>Dieser Betrieb existiert nicht (mehr)</h2>' +
        '<p>Der Eintrag wurde entfernt oder der Link ist fehlerhaft.</p>' +
        '<a class="btn btn--primary" href="#/">Zur Startseite</a>' +
        '</div>'
      );
    }

    document.title = company.name + ' – ' + company.profession + ' in ' + company.district + ' Wien | Servano';
    injectStructuredData(company);

    var hoursRows = company.emergency24
      ? '<tr><th>Täglich</th><td>0–24 Uhr (Notdienst)</td></tr>'
      : IBO.hoursTable(company)
          .map(function (row) {
            return '<tr><th>' + IBO.esc(row.label) + '</th><td>' + IBO.esc(row.text) + '</td></tr>';
          })
          .join('');

    var mapHref = company.coords
      ? 'https://www.openstreetmap.org/?mlat=' + company.coords[0] + '&mlon=' + company.coords[1] + '#map=17/' + company.coords[0] + '/' + company.coords[1]
      : 'https://www.openstreetmap.org/search?query=' + encodeURIComponent(company.address + ', ' + company.district + ' Wien');

    return (
      '<nav class="breadcrumb" aria-label="Brotkrumen">' +
      '<a href="#/">Start</a><span aria-hidden="true">/</span>' +
      '<a href="' +
      IBO.esc(buildSearchHash(Object.assign({}, DEFAULT_STATE, { kat: (company.categories || [])[0] || '' }))) +
      '">' +
      IBO.esc(company.profession) +
      '</a><span aria-hidden="true">/</span>' +
      '<span class="muted">' +
      IBO.esc(company.name) +
      '</span>' +
      '</nav>' +
      '<div class="detail">' +
      '<header class="detail__header">' +
      '<div class="company-logo company-logo--lg">' +
      IBO.icon(company.logoIcon) +
      '</div>' +
      '<div>' +
      '<h1>' +
      IBO.esc(company.name) +
      '</h1>' +
      '<p class="muted">' +
      IBO.esc(company.profession) +
      ' in ' +
      IBO.esc(company.district + ' ' + IBO.districtName(company.district)) +
      '</p>' +
      '<div class="company-card__badges" style="margin-top:8px">' +
      badgeMarkup(company) +
      '</div>' +
      '</div>' +
      '</header>' +

      '<div>' +
      '<section class="detail__panel">' +
      '<h2>Über den Betrieb</h2>' +
      '<p>' +
      IBO.esc(company.description) +
      '</p>' +
      (company.verified
        ? '<div class="notice notice--success" style="margin:14px 0 0">' +
          IBO.icon('shield') +
          '<p>Gewerbeberechtigung und UID wurden am ' +
          IBO.esc(IBO.formatDate(company.verifiedSince)) +
          ' manuell geprüft (UID: ' +
          IBO.esc(company.uid) +
          ').</p></div>'
        : '<div class="notice notice--warning" style="margin:14px 0 0">' +
          IBO.icon('warning') +
          '<p>Dieser Eintrag ist noch nicht abschließend geprüft. Bitte lassen Sie sich die Gewerbeberechtigung zeigen.</p></div>') +
      '</section>' +

      '<section class="detail__panel">' +
      '<h2>Leistungen</h2>' +
      '<ul class="service-list">' +
      (company.services || [])
        .map(function (s) {
          return '<li>' + IBO.icon('check') + '<span>' + IBO.esc(s) + '</span></li>';
        })
        .join('') +
      '</ul>' +
      '</section>' +

      '<section class="detail__panel" id="anfrage">' +
      '<h2>' +
      IBO.icon('mail') +
      ' Unverbindlich anfragen</h2>' +
      '<p class="muted" style="font-size:.88rem">Ihre Anfrage geht ausschließlich an diesen Betrieb. ' +
      'Es werden keine Daten an weitere Anbieter oder an Dritte weitergegeben.</p>' +
      requestFormMarkup(company) +
      '</section>' +
      '</div>' +

      '<aside>' +
      '<section class="detail__panel">' +
      '<h2>Kontakt</h2>' +
      '<div class="info-list">' +
      '<div>' +
      IBO.icon('pin') +
      '<span>' +
      IBO.esc(company.address) +
      '<br>' +
      IBO.esc(company.district + ' Wien') +
      '</span></div>' +
      '<div>' +
      IBO.icon('phone') +
      '<a href="' +
      IBO.esc(IBO.telHref(company.phone)) +
      '">' +
      IBO.esc(company.phone) +
      '</a></div>' +
      '<div>' +
      IBO.icon('mail') +
      '<a href="mailto:' +
      IBO.esc(company.email) +
      '">' +
      IBO.esc(company.email) +
      '</a></div>' +
      '<div>' +
      IBO.icon('globe') +
      '<a href="' +
      IBO.escAttrUrl(company.website) +
      '" target="_blank" rel="noopener noreferrer">' +
      IBO.esc(company.website.replace(/^https?:\/\//, '')) +
      '</a></div>' +
      '<div>' +
      IBO.icon('map') +
      '<span><strong>Einsatzgebiet:</strong><br>' +
      IBO.esc(company.serviceArea) +
      '</span></div>' +
      '</div>' +
      '<div class="stack" style="margin-top:16px">' +
      '<a class="btn btn--success btn--block" href="' +
      IBO.esc(IBO.telHref(company.phone)) +
      '">' +
      IBO.icon('phone') +
      '<span>Jetzt anrufen</span></a>' +
      favButton(company) +
      '</div>' +
      '</section>' +

      '<section class="detail__panel">' +
      '<h2>Öffnungszeiten</h2>' +
      '<table class="hours-table"><tbody>' +
      hoursRows +
      '</tbody></table>' +
      '</section>' +

      '<section class="detail__panel">' +
      '<h2>Gut zu wissen</h2>' +
      '<div class="info-list">' +
      '<div>' +
      IBO.icon('user') +
      '<span><strong>Team:</strong> ' +
      IBO.esc(company.employees) +
      ' Personen</span></div>' +
      '<div>' +
      IBO.icon('calendar') +
      '<span><strong>Gegründet:</strong> ' +
      IBO.esc(company.founded) +
      '</span></div>' +
      '<div>' +
      IBO.icon('globe') +
      '<span><strong>Sprachen:</strong> ' +
      IBO.esc((company.languages || []).join(', ')) +
      '</span></div>' +
      '<div>' +
      IBO.icon('star') +
      '<span><strong>Zahlung:</strong> ' +
      IBO.esc((company.payment || []).join(', ')) +
      '</span></div>' +
      '</div>' +
      '</section>' +

      '<a class="map-embed" href="' +
      IBO.esc(mapHref) +
      '" target="_blank" rel="noopener noreferrer">' +
      IBO.icon('map') +
      '<span>Auf OpenStreetMap ansehen</span>' +
      '</a>' +
      '</aside>' +
      '</div>'
    );
  }

  function requestFormMarkup(company) {
    return (
      '<form id="request-form" data-slug="' +
      IBO.esc(company.slug) +
      '" novalidate>' +
      '<div class="form-row">' +
      '<div class="form-group">' +
      '<label for="req-name">Ihr Name</label>' +
      '<input type="text" id="req-name" name="name" autocomplete="name" required>' +
      '<span class="field-error" data-error-for="req-name" hidden></span>' +
      '</div>' +
      '<div class="form-group">' +
      '<label for="req-contact">E-Mail oder Telefon</label>' +
      '<input type="text" id="req-contact" name="contact" autocomplete="email" required>' +
      '<span class="field-error" data-error-for="req-contact" hidden></span>' +
      '</div>' +
      '</div>' +
      '<div class="form-group">' +
      '<label for="req-message">Ihr Anliegen</label>' +
      '<textarea id="req-message" name="message" required ' +
      'placeholder="Was soll gemacht werden? Je genauer, desto verlässlicher das Angebot."></textarea>' +
      '<span class="hint">Mindestens 15 Zeichen. Bitte keine sensiblen Daten wie Zugangscodes.</span>' +
      '<span class="field-error" data-error-for="req-message" hidden></span>' +
      '</div>' +
      '<div class="form-group">' +
      '<label class="checkbox">' +
      '<input type="checkbox" id="req-consent" name="consent" required>' +
      '<span>Ich stimme zu, dass meine Angaben zur Bearbeitung dieser Anfrage an den Betrieb weitergegeben werden.</span>' +
      '</label>' +
      '<span class="field-error" data-error-for="req-consent" hidden></span>' +
      '</div>' +
      '<div class="form-actions">' +
      '<button type="submit" class="btn btn--primary btn--block">' +
      IBO.icon('mail') +
      '<span>Anfrage senden</span></button>' +
      '</div>' +
      '</form>'
    );
  }

  /** Strukturierte Daten für Suchmaschinen (schema.org LocalBusiness). */
  function injectStructuredData(company) {
    var existing = document.getElementById('ld-company');
    if (existing) existing.remove();
    var data = {
      '@context': 'https://schema.org',
      '@type': 'LocalBusiness',
      name: company.name,
      description: company.description,
      telephone: company.phone,
      email: company.email,
      url: company.website,
      address: {
        '@type': 'PostalAddress',
        streetAddress: company.address,
        postalCode: company.district,
        addressLocality: 'Wien',
        addressCountry: 'AT',
      },
      areaServed: company.serviceArea,
      openingHours: company.emergency24 ? 'Mo-Su 00:00-24:00' : undefined,
    };
    if (company.coords) {
      data.geo = { '@type': 'GeoCoordinates', latitude: company.coords[0], longitude: company.coords[1] };
    }
    var script = document.createElement('script');
    script.type = 'application/ld+json';
    script.id = 'ld-company';
    script.textContent = JSON.stringify(data);
    document.head.appendChild(script);
  }

  /* ------------------------------------------------------------------ *
   * Rendern & Ereignisse
   * ------------------------------------------------------------------ */

  function render() {
    var state = parseHash();
    tokensForHighlight = IBO.tokenize(state.q);

    var html;
    if (state.view === 'detail') html = viewDetail(state);
    else if (state.view === 'suche') html = viewSearch(state);
    else if (state.view === 'merkliste') html = viewFavorites();
    else html = viewHome(state);

    root.innerHTML = html;

    // Bei Navigation innerhalb der Anwendung an den Anfang springen.
    if (state.view !== 'home') global.scrollTo({ top: 0, behavior: 'auto' });
  }

  function currentSearchState() {
    var state = parseHash();
    if (state.view !== 'suche') {
      state = Object.assign({}, DEFAULT_STATE, { view: 'suche', q: state.q, kat: state.kat });
    }
    return state;
  }

  function onSubmit(event) {
    var form = event.target;

    if (form.id === 'search-form') {
      event.preventDefault();
      var state = currentSearchState();
      state.q = form.querySelector('#q').value.trim();
      state.bezirk = form.querySelector('#bezirk').value;
      navigate(buildSearchHash(state));
      return;
    }

    if (form.id === 'request-form') {
      event.preventDefault();
      submitRequest(form);
    }
  }

  function setFieldError(form, id, message) {
    var field = form.querySelector('#' + id);
    var slot = form.querySelector('[data-error-for="' + id + '"]');
    if (!slot) return;
    if (message) {
      slot.textContent = message;
      slot.hidden = false;
      if (field) field.setAttribute('aria-invalid', 'true');
    } else {
      slot.textContent = '';
      slot.hidden = true;
      if (field) field.removeAttribute('aria-invalid');
    }
  }

  function submitRequest(form) {
    var slug = form.getAttribute('data-slug');
    var company = companyBySlug(slug);
    var name = form.querySelector('#req-name').value.trim();
    var contact = form.querySelector('#req-contact').value.trim();
    var message = form.querySelector('#req-message').value.trim();
    var consent = form.querySelector('#req-consent').checked;
    var firstInvalid = null;

    var nameError = name.length < 2 ? 'Bitte geben Sie Ihren Namen an.' : '';
    var contactOk = IBO.validateEmail(contact).valid || IBO.validatePhone(contact).valid;
    var contactError = contactOk ? '' : 'Bitte eine gültige E-Mail-Adresse oder Telefonnummer angeben.';
    var messageError = message.length < 15 ? 'Bitte beschreiben Sie Ihr Anliegen mit mindestens 15 Zeichen.' : '';
    var consentError = consent ? '' : 'Ohne Zustimmung können wir die Anfrage nicht weiterleiten.';

    setFieldError(form, 'req-name', nameError);
    setFieldError(form, 'req-contact', contactError);
    setFieldError(form, 'req-message', messageError);
    setFieldError(form, 'req-consent', consentError);

    if (nameError) firstInvalid = 'req-name';
    else if (contactError) firstInvalid = 'req-contact';
    else if (messageError) firstInvalid = 'req-message';
    else if (consentError) firstInvalid = 'req-consent';

    if (firstInvalid) {
      var el = form.querySelector('#' + firstInvalid);
      if (el) el.focus();
      IBO.toast('Bitte prüfen Sie die markierten Felder.', 'error');
      return;
    }

    // Ohne Backend landet die Anfrage lokal – das Admin-Modul zeigt sie an.
    IBO.storage.push('anfragen', {
      id: IBO.uid('anf'),
      companySlug: slug,
      companyName: company ? company.name : slug,
      name: name,
      contact: contact,
      message: message,
      createdAt: new Date().toISOString(),
      status: 'neu',
    });

    form.innerHTML =
      '<div class="notice notice--success">' +
      IBO.icon('check') +
      '<p><strong>Anfrage vorgemerkt.</strong> Im Prototyp wird sie lokal gespeichert und ist im ' +
      'Admin-Bereich sichtbar. Produktiv würde sie jetzt an ' +
      IBO.esc(company ? company.name : 'den Betrieb') +
      ' zugestellt.</p></div>';
    IBO.toast('Anfrage wurde übernommen.', 'success');
  }

  function onClick(event) {
    var target = event.target.closest('[data-action]');
    if (!target) return;
    var action = target.getAttribute('data-action');

    if (action === 'kat') {
      var katState = Object.assign({}, DEFAULT_STATE, { view: 'suche', kat: target.getAttribute('data-kat') });
      navigate(buildSearchHash(katState));
      return;
    }

    if (action === 'toggle') {
      var key = target.getAttribute('data-key');
      var state = currentSearchState();
      state[key] = !state[key];
      navigate(buildSearchHash(state));
      return;
    }

    if (action === 'clear-kat') {
      var cleared = currentSearchState();
      cleared.kat = '';
      navigate(buildSearchHash(cleared));
      return;
    }

    if (action === 'reset') {
      navigate(buildSearchHash(Object.assign({}, DEFAULT_STATE, { view: 'suche' })));
      return;
    }

    if (action === 'fav') {
      var slug = target.getAttribute('data-slug');
      var added = toggleFavorite(slug);
      // Alle Schaltflächen zu diesem Betrieb aktualisieren, ohne neu zu rendern.
      Array.prototype.forEach.call(document.querySelectorAll('[data-action="fav"][data-slug="' + slug + '"]'), function (btn) {
        btn.setAttribute('aria-pressed', String(added));
        var label = btn.querySelector('span');
        if (label) label.textContent = added ? 'Gemerkt' : 'Merken';
      });
      if (parseHash().view === 'merkliste') render();
    }
  }

  function onChange(event) {
    if (event.target.getAttribute('data-action') === 'sort') {
      var state = currentSearchState();
      state.sort = event.target.value;
      navigate(buildSearchHash(state));
    }
  }

  function init() {
    root = document.getElementById('app');
    if (!root) return;
    global.addEventListener('hashchange', render);
    root.addEventListener('submit', onSubmit);
    root.addEventListener('click', onClick);
    root.addEventListener('change', onChange);
    render();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);
