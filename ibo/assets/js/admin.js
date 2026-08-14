/**
 * Servano – Admin-Bereich (verwaltung.html).
 *
 * Vorher stand hier eine fest verdrahtete Tabelle mit einer einzigen Zeile und
 * Schaltflächen ohne Funktion. Jetzt bildet der Bereich den kompletten
 * Freigabe-Ablauf ab: Anträge aus signup.html prüfen, Betriebe aktiv oder
 * inaktiv schalten und Kundenanfragen einsehen.
 *
 * WICHTIG: Die Anmeldung ist eine reine Demo-Schranke im Browser. Sie schützt
 * keine Daten. Produktiv gehört das hinter eine serverseitige Authentifizierung.
 */
(function (global) {
  'use strict';

  var IBO = (global.IBO = global.IBO || {});

  var DEMO_PASSWORD = 'servano-demo';
  var SESSION_KEY = 'admin-session';
  var STATUS_KEY = 'firmen-status';

  var state = { tab: 'betriebe', filter: '' };

  function el(id) {
    return document.getElementById(id);
  }

  /* ------------------------------------------------------------------ *
   * Datenzugriff
   * ------------------------------------------------------------------ */

  function statusMap() {
    return IBO.storage.get(STATUS_KEY, {});
  }

  function companyStatus(slug) {
    var entry = statusMap()[slug];
    return entry || { active: true, deleted: false };
  }

  function setCompanyStatus(slug, patch) {
    var map = statusMap();
    map[slug] = Object.assign({ active: true, deleted: false }, map[slug], patch);
    IBO.storage.set(STATUS_KEY, map);
  }

  function applications() {
    return IBO.storage.get('antraege', []);
  }

  function requests() {
    return IBO.storage.get('anfragen', []);
  }

  function updateItem(key, id, patch) {
    var list = IBO.storage.get(key, []);
    var next = list.map(function (item) {
      return item.id === id ? Object.assign({}, item, patch) : item;
    });
    IBO.storage.set(key, next);
  }

  function removeItem(key, id) {
    var list = IBO.storage.get(key, []).filter(function (item) {
      return item.id !== id;
    });
    IBO.storage.set(key, list);
  }

  /* ------------------------------------------------------------------ *
   * Anmeldung (Demo)
   * ------------------------------------------------------------------ */

  function isLoggedIn() {
    return IBO.storage.get(SESSION_KEY, false) === true;
  }

  function renderLogin() {
    el('admin-login').hidden = false;
    el('admin-panel').hidden = true;
    var form = el('loginForm');
    form.onsubmit = function (event) {
      event.preventDefault();
      var value = el('adminPassword').value;
      if (value === DEMO_PASSWORD) {
        IBO.storage.set(SESSION_KEY, true);
        IBO.toast('Angemeldet (Demo-Modus).', 'success');
        renderPanel();
      } else {
        el('loginError').hidden = false;
        el('adminPassword').setAttribute('aria-invalid', 'true');
        el('adminPassword').select();
      }
    };
  }

  function logout() {
    IBO.storage.remove(SESSION_KEY);
    IBO.toast('Abgemeldet.');
    renderLogin();
  }

  /* ------------------------------------------------------------------ *
   * Tabellen
   * ------------------------------------------------------------------ */

  function matchesFilter(text) {
    if (!state.filter) return true;
    return IBO.normalize(text).indexOf(IBO.normalize(state.filter)) !== -1;
  }

  function companyRows() {
    var rows = IBO.companies
      .filter(function (c) {
        return !companyStatus(c.slug).deleted;
      })
      .filter(function (c) {
        return matchesFilter(c.name + ' ' + c.profession + ' ' + c.district + ' ' + c.uid);
      })
      .map(function (c) {
        var status = companyStatus(c.slug);
        return (
          '<tr>' +
          '<td><strong>' +
          IBO.esc(c.name) +
          '</strong><br><span class="muted" style="font-size:.8rem">' +
          IBO.esc(c.uid) +
          '</span></td>' +
          '<td>' +
          IBO.esc(c.profession) +
          '</td>' +
          '<td>' +
          IBO.esc(c.district) +
          '</td>' +
          '<td>' +
          (c.verified
            ? '<span class="badge badge--verified">' + IBO.icon('verified') + 'geprüft</span>'
            : '<span class="badge badge--neutral">offen</span>') +
          (c.isSponsored ? ' <span class="badge badge--ad">Anzeige</span>' : '') +
          '</td>' +
          '<td>' +
          (status.active
            ? '<span class="badge badge--open">aktiv</span>'
            : '<span class="badge badge--closed">pausiert</span>') +
          '</td>' +
          '<td><div class="table-actions">' +
          '<a class="btn btn--secondary btn--sm" href="index.html#/anbieter/' +
          encodeURIComponent(c.slug) +
          '" target="_blank" rel="noopener">' +
          IBO.icon('external') +
          '<span>Profil</span></a>' +
          '<button type="button" class="btn btn--secondary btn--sm" data-action="toggle-active" data-slug="' +
          IBO.esc(c.slug) +
          '">' +
          IBO.icon(status.active ? 'close' : 'check') +
          '<span>' +
          (status.active ? 'Pausieren' : 'Aktivieren') +
          '</span></button>' +
          '<button type="button" class="btn btn--danger btn--sm" data-action="delete-company" data-slug="' +
          IBO.esc(c.slug) +
          '">' +
          IBO.icon('trash') +
          '<span>Entfernen</span></button>' +
          '</div></td>' +
          '</tr>'
        );
      });

    if (!rows.length) return '<tr><td colspan="6" class="muted">Keine Betriebe für diesen Filter.</td></tr>';
    return rows.join('');
  }

  function applicationRows() {
    var list = applications()
      .slice()
      .reverse()
      .filter(function (a) {
        return matchesFilter(a.name + ' ' + a.uid + ' ' + a.email + ' ' + a.district);
      });

    if (!list.length) {
      return (
        '<tr><td colspan="6" class="muted">Noch keine Anträge. Über <a href="signup.html">signup.html</a> ' +
        'lässt sich einer anlegen.</td></tr>'
      );
    }

    var statusBadges = {
      offen: '<span class="badge badge--neutral">offen</span>',
      freigegeben: '<span class="badge badge--open">freigegeben</span>',
      abgelehnt: '<span class="badge badge--emergency">abgelehnt</span>',
    };

    return list
      .map(function (a) {
        var atu = IBO.validateATU(a.uid);
        var category = IBO.categoryById(a.category);
        return (
          '<tr>' +
          '<td><strong>' +
          IBO.esc(a.name) +
          '</strong><br><span class="muted" style="font-size:.8rem">' +
          IBO.esc(a.id) +
          '</span></td>' +
          '<td>' +
          IBO.esc(a.uid) +
          '<br>' +
          (atu.valid
            ? '<span class="badge badge--verified">' + IBO.icon('check') + 'Prüfziffer ok</span>'
            : '<span class="badge badge--emergency">' + IBO.icon('warning') + 'prüfen</span>') +
          '</td>' +
          '<td>' +
          IBO.esc(category ? category.name : a.category) +
          '<br><span class="muted" style="font-size:.8rem">' +
          IBO.esc(a.district) +
          '</span></td>' +
          '<td><a href="mailto:' +
          IBO.esc(a.email) +
          '">' +
          IBO.esc(a.email) +
          '</a><br>' +
          IBO.esc(a.phone) +
          '</td>' +
          '<td>' +
          (statusBadges[a.status] || IBO.esc(a.status)) +
          '<br><span class="muted" style="font-size:.8rem">' +
          IBO.esc(IBO.formatDate(a.createdAt)) +
          '</span></td>' +
          '<td><div class="table-actions">' +
          '<button type="button" class="btn btn--success btn--sm" data-action="approve" data-id="' +
          IBO.esc(a.id) +
          '">' +
          IBO.icon('check') +
          '<span>Freigeben</span></button>' +
          '<button type="button" class="btn btn--secondary btn--sm" data-action="reject" data-id="' +
          IBO.esc(a.id) +
          '">' +
          IBO.icon('close') +
          '<span>Ablehnen</span></button>' +
          '<button type="button" class="btn btn--danger btn--sm" data-action="delete-application" data-id="' +
          IBO.esc(a.id) +
          '">' +
          IBO.icon('trash') +
          '<span>Löschen</span></button>' +
          '</div></td>' +
          '</tr>'
        );
      })
      .join('');
  }

  function requestRows() {
    var list = requests()
      .slice()
      .reverse()
      .filter(function (r) {
        return matchesFilter(r.companyName + ' ' + r.name + ' ' + r.contact + ' ' + r.message);
      });

    if (!list.length) {
      return '<tr><td colspan="5" class="muted">Noch keine Kundenanfragen eingegangen.</td></tr>';
    }

    return list
      .map(function (r) {
        return (
          '<tr>' +
          '<td>' +
          IBO.esc(IBO.formatDateTime(r.createdAt)) +
          '</td>' +
          '<td>' +
          IBO.esc(r.companyName) +
          '</td>' +
          '<td>' +
          IBO.esc(r.name) +
          '<br><span class="muted" style="font-size:.8rem">' +
          IBO.esc(r.contact) +
          '</span></td>' +
          '<td>' +
          IBO.esc(r.message) +
          '</td>' +
          '<td><div class="table-actions">' +
          (r.status === 'erledigt'
            ? '<span class="badge badge--open">erledigt</span>'
            : '<button type="button" class="btn btn--secondary btn--sm" data-action="done" data-id="' +
              IBO.esc(r.id) +
              '">' +
              IBO.icon('check') +
              '<span>Erledigt</span></button>') +
          '<button type="button" class="btn btn--danger btn--sm" data-action="delete-request" data-id="' +
          IBO.esc(r.id) +
          '">' +
          IBO.icon('trash') +
          '<span>Löschen</span></button>' +
          '</div></td>' +
          '</tr>'
        );
      })
      .join('');
  }

  /* ------------------------------------------------------------------ *
   * Panel
   * ------------------------------------------------------------------ */

  function statsMarkup() {
    var active = IBO.companies.filter(function (c) {
      return !companyStatus(c.slug).deleted && companyStatus(c.slug).active;
    }).length;
    var open = applications().filter(function (a) {
      return a.status === 'offen';
    }).length;
    var newRequests = requests().filter(function (r) {
      return r.status !== 'erledigt';
    }).length;
    var unverified = IBO.companies.filter(function (c) {
      return !c.verified && !companyStatus(c.slug).deleted;
    }).length;

    return [
      { value: active, label: 'aktive Betriebe' },
      { value: open, label: 'offene Anträge' },
      { value: newRequests, label: 'neue Anfragen' },
      { value: unverified, label: 'ungeprüft' },
    ]
      .map(function (s) {
        return '<div class="stat"><strong>' + s.value + '</strong><span>' + s.label + '</span></div>';
      })
      .join('');
  }

  function tableMarkup() {
    if (state.tab === 'antraege') {
      return (
        '<div class="table-wrapper"><table class="data-table">' +
        '<thead><tr><th>Betrieb</th><th>UID</th><th>Kategorie</th><th>Kontakt</th><th>Status</th><th>Aktion</th></tr></thead>' +
        '<tbody>' +
        applicationRows() +
        '</tbody></table></div>'
      );
    }
    if (state.tab === 'anfragen') {
      return (
        '<div class="table-wrapper"><table class="data-table">' +
        '<thead><tr><th>Eingang</th><th>Betrieb</th><th>Kunde</th><th>Anliegen</th><th>Aktion</th></tr></thead>' +
        '<tbody>' +
        requestRows() +
        '</tbody></table></div>'
      );
    }
    return (
      '<div class="table-wrapper"><table class="data-table">' +
      '<thead><tr><th>Betrieb</th><th>Gewerbe</th><th>Bezirk</th><th>Prüfung</th><th>Sichtbarkeit</th><th>Aktion</th></tr></thead>' +
      '<tbody>' +
      companyRows() +
      '</tbody></table></div>'
    );
  }

  function renderPanel() {
    el('admin-login').hidden = true;
    el('admin-panel').hidden = false;

    var openCount = applications().filter(function (a) {
      return a.status === 'offen';
    }).length;

    var tabs = [
      { id: 'betriebe', label: 'Betriebe', count: IBO.companies.length },
      { id: 'antraege', label: 'Anträge', count: openCount },
      { id: 'anfragen', label: 'Anfragen', count: requests().length },
    ]
      .map(function (tab) {
        return (
          '<button type="button" class="tab" role="tab" data-tab="' +
          tab.id +
          '" aria-selected="' +
          (state.tab === tab.id) +
          '">' +
          IBO.esc(tab.label) +
          (tab.count ? ' <span class="badge badge--neutral">' + tab.count + '</span>' : '') +
          '</button>'
        );
      })
      .join('');

    el('admin-panel').innerHTML =
      '<div class="stat-grid">' +
      statsMarkup() +
      '</div>' +
      '<div class="tabs" role="tablist">' +
      tabs +
      '</div>' +
      '<div class="filters">' +
      '<label class="visually-hidden" for="admin-filter">Tabelle durchsuchen</label>' +
      '<input type="search" id="admin-filter" placeholder="Tabelle durchsuchen…" value="' +
      IBO.esc(state.filter) +
      '" style="max-width:280px">' +
      '<div class="sort-field">' +
      '<button type="button" class="btn btn--secondary btn--sm" data-action="export">' +
      IBO.icon('download') +
      '<span>Daten exportieren</span></button>' +
      '<button type="button" class="btn btn--secondary btn--sm" data-action="reset-demo">' +
      IBO.icon('trash') +
      '<span>Demo-Daten löschen</span></button>' +
      '<button type="button" class="btn btn--secondary btn--sm" data-action="logout">' +
      IBO.icon('logout') +
      '<span>Abmelden</span></button>' +
      '</div>' +
      '</div>' +
      tableMarkup();

    var filterInput = el('admin-filter');
    filterInput.addEventListener(
      'input',
      IBO.debounce(function (event) {
        state.filter = event.target.value;
        renderPanel();
        var again = el('admin-filter');
        again.focus();
        again.setSelectionRange(again.value.length, again.value.length);
      }, 250)
    );
  }

  /* ------------------------------------------------------------------ *
   * Aktionen
   * ------------------------------------------------------------------ */

  function exportData() {
    var payload = {
      exportiertAm: new Date().toISOString(),
      firmenStatus: statusMap(),
      antraege: applications(),
      anfragen: requests(),
    };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = 'servano-export-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1000);
    IBO.toast('Export wurde erstellt.', 'success');
  }

  function onPanelClick(event) {
    var tabBtn = event.target.closest('[data-tab]');
    if (tabBtn) {
      state.tab = tabBtn.getAttribute('data-tab');
      renderPanel();
      return;
    }

    var target = event.target.closest('[data-action]');
    if (!target) return;
    var action = target.getAttribute('data-action');
    var id = target.getAttribute('data-id');
    var slug = target.getAttribute('data-slug');

    switch (action) {
      case 'logout':
        logout();
        return;
      case 'export':
        exportData();
        return;
      case 'reset-demo':
        if (global.confirm('Alle lokal gespeicherten Anträge, Anfragen und Statusänderungen löschen?')) {
          IBO.storage.remove('antraege');
          IBO.storage.remove('anfragen');
          IBO.storage.remove(STATUS_KEY);
          IBO.toast('Lokale Demo-Daten gelöscht.');
          renderPanel();
        }
        return;
      case 'toggle-active':
        setCompanyStatus(slug, { active: !companyStatus(slug).active });
        renderPanel();
        return;
      case 'delete-company':
        if (global.confirm('Betrieb aus der Liste entfernen? (Nur lokal, die Demo-Daten bleiben unverändert.)')) {
          setCompanyStatus(slug, { deleted: true });
          IBO.toast('Betrieb entfernt.');
          renderPanel();
        }
        return;
      case 'approve':
        updateItem('antraege', id, { status: 'freigegeben', decidedAt: new Date().toISOString() });
        IBO.toast('Antrag freigegeben.', 'success');
        renderPanel();
        return;
      case 'reject':
        updateItem('antraege', id, { status: 'abgelehnt', decidedAt: new Date().toISOString() });
        IBO.toast('Antrag abgelehnt.');
        renderPanel();
        return;
      case 'delete-application':
        removeItem('antraege', id);
        renderPanel();
        return;
      case 'done':
        updateItem('anfragen', id, { status: 'erledigt' });
        renderPanel();
        return;
      case 'delete-request':
        removeItem('anfragen', id);
        renderPanel();
        return;
      default:
    }
  }

  function init() {
    if (!el('admin-panel')) return;
    el('admin-panel').addEventListener('click', onPanelClick);
    if (isLoggedIn()) renderPanel();
    else renderLogin();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);
