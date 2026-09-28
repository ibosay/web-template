import { useCallback, useEffect, useState } from 'react';
import { api } from '@appdeploy/client';
import { ArrowLeft, ArrowUpRight, Bookmark, BriefcaseBusiness, Clock3, Compass, ExternalLink, Heart, MapPin, Search, SlidersHorizontal, X } from 'lucide-react';

type Card = {
  id: string; isTestData?: boolean; name: string; address: string; postalCode: string;
  category: string; routeUrl?: string; trainsApprentices?: boolean;
  openingStatus: { kind: string; label: string }; offerings: { name: string; priceLabel: string }[];
};
type Page = { businesses: Card[]; total: number; hasMore: boolean };
type Detail = Card & { phone?: string; email?: string; website?: string; publicEmailAllowed?: boolean; publicWebsiteAllowed?: boolean; services?: { name: string; description?: string }[] };
const categoryLabels: Record<string, string> = {
  moving: 'Umzug', auto: 'Auto und Kfz', garden: 'Gartenpflege', plumber: 'Installateur',
  electrician: 'Elektriker', it: 'IT Hilfe', cleaning: 'Reinigung', carpenter: 'Tischler',
  painter: 'Maler', flooring: 'Bodenleger', tiler: 'Fliesenleger', tutoring: 'Nachhilfe',
  locksmith: 'Schlüsseldienst', 'house-care': 'Hausbetreuung', drywall: 'Trockenbau',
  mason: 'Maurer', roofer: 'Dachdecker', bicycle: 'Fahrradservice',
};
const website = 'https://servano-wien-v17-vorschau.ibosay.chatgpt.site';
const favoritesKey = 'servano_mobile_favorites';
function savedFavorites(): string[] {
  try { const ids = JSON.parse(localStorage.getItem(favoritesKey) || '[]'); return Array.isArray(ids) ? ids.filter((id) => typeof id === 'string') : []; }
  catch { return []; }
}

export default function App() {
  const [tab, setTab] = useState<'search' | 'favorites' | 'info'>('search');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [district, setDistrict] = useState('all');
  const [openOnly, setOpenOnly] = useState(false);
  const [apprenticesOnly, setApprenticesOnly] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [favoriteIds, setFavoriteIds] = useState<string[]>(savedFavorites);
  const [page, setPage] = useState<Page>({ businesses: [], total: 0, hasMore: false });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [detail, setDetail] = useState<Detail | null>(null);
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');

  const load = useCallback(async (offset = 0) => {
    if (tab === 'info') return;
    if (tab === 'favorites' && !favoriteIds.length) {
      setPage({ businesses: [], total: 0, hasMore: false }); setMessage(''); return;
    }
    setLoading(true); setMessage('');
    try {
      const params = new URLSearchParams({ query: tab === 'search' ? query : '', category: tab === 'search' ? category : 'all',
        district: tab === 'search' ? district : 'all', open: tab === 'search' && openOnly ? '1' : '0',
        apprentices: tab === 'search' && apprenticesOnly ? '1' : '0', offset: String(offset), limit: '12' });
      if (tab === 'favorites') params.set('favorites', favoriteIds.slice(0, 50).join(','));
      const response = await api.get(`/api/directory?${params.toString()}`);
      const result = response.data as Page;
      setPage((previous) => ({ ...result, businesses: offset ? [...previous.businesses, ...result.businesses] : result.businesses }));
    } catch { setMessage('Die Betriebe konnten nicht geladen werden. Bitte versuche es erneut.'); }
    finally { setLoading(false); }
  }, [tab, query, category, district, openOnly, apprenticesOnly, favoriteIds]);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 250); return () => window.clearTimeout(timer); }, [load]);

  function toggleFavorite(id: string) {
    setFavoriteIds((previous) => {
      const next = previous.includes(id) ? previous.filter((item) => item !== id) : [...previous, id];
      localStorage.setItem(favoritesKey, JSON.stringify(next));
      return next;
    });
  }

  async function openDetail(business: Card) {
    const id = business.id;
    setSelectedCard(business);
    setDetail(null); setDetailError(''); setDetailLoading(true);
    try { const response = await api.get(`/api/business-detail?id=${encodeURIComponent(id)}`); setDetail(response.data.business as Detail); }
    catch { setDetailError('Die Firmendetails konnten nicht geladen werden.'); }
    finally { setDetailLoading(false); }
  }

  return <div className="app-shell">
    <header className="topbar"><div className="brand-mark">S</div><span className="brand-word">SERVANO</span><span className="preview-pill">VORSCHAU</span></header>
    <main>
      {tab === 'info' ? <section className="info-screen"><div className="section-kicker">SERVANO WIEN</div><h1>Wiener Betriebe finden.</h1><p>Diese App zeigt derzeit die Servano Vorschau mit ausdrücklich gekennzeichneten Testbetrieben. Echte Firmeneinträge werden erst nach Prüfung veröffentlicht.</p><div className="info-card"><b>Für Betriebe</b><p>Firma eintragen oder Firmendaten ändern geht weiterhin über die Servano Webseite.</p><a href={`${website}/firma-eintragen`} target="_blank" rel="noreferrer">Firma eintragen <ExternalLink size={16} /></a><a href={`${website}/firmendaten-aendern`} target="_blank" rel="noreferrer">Firmendaten ändern <ExternalLink size={16} /></a></div><div className="legal-links"><a href={`${website}/impressum`} target="_blank" rel="noreferrer">Impressum</a><a href={`${website}/datenschutz`} target="_blank" rel="noreferrer">Datenschutz</a><a href={`${website}/nutzungsbedingungen`} target="_blank" rel="noreferrer">Nutzungsbedingungen</a></div></section> : <>
        <div className="intro"><span className="section-kicker">SERVANO WIEN</span><h1>{tab === 'favorites' ? 'Gemerkte Betriebe' : 'Finde den passenden Betrieb.'}</h1><p>{tab === 'favorites' ? 'Deine Favoriten sind auf diesem Gerät gespeichert.' : 'Freiwillige Einträge aus Wien, persönlich geprüft.'}</p></div>
        <div className="test-notice">Vorschau mit Testbetrieben, keine echten Firmendaten</div>
        {tab === 'search' && <section className="search-area" aria-label="Betriebssuche"><label className="search-box"><Search size={21} /><input aria-label="Betriebe suchen" type="search" placeholder="Firma, Leistung oder Bezirk" value={query} onChange={(event) => setQuery(event.target.value)} />{query && <button type="button" aria-label="Suche löschen" onClick={() => setQuery('')}><X size={18} /></button>}</label><button type="button" className={`filter-toggle ${showFilters ? 'selected' : ''}`} onClick={() => setShowFilters(!showFilters)} aria-expanded={showFilters}><SlidersHorizontal size={18} /> Filter {(openOnly || apprenticesOnly || category !== 'all' || district !== 'all') && <span className="filter-dot" />}</button>
          {showFilters && <div className="filters"><label>Kategorie<select value={category} onChange={(event) => setCategory(event.target.value)}><option value="all">Alle Kategorien</option>{Object.entries(categoryLabels).map(([id, label]) => <option value={id} key={id}>{label}</option>)}</select></label><label>Bezirk<select value={district} onChange={(event) => setDistrict(event.target.value)}><option value="all">Ganz Wien</option>{Array.from({ length: 23 }, (_, index) => { const code = `${1010 + index * 10}`; return <option value={code} key={code}>{index + 1}. Bezirk, {code}</option>; })}</select></label><label className="check"><input type="checkbox" checked={openOnly} onChange={(event) => setOpenOnly(event.target.checked)} /> Jetzt geöffnet</label><label className="check"><input type="checkbox" checked={apprenticesOnly} onChange={(event) => setApprenticesOnly(event.target.checked)} /> Bildet Lehrlinge aus</label></div>}
        </section>}
        <div className="result-heading"><h2>{loading && !page.businesses.length ? 'Betriebe laden' : `${page.total} ${page.total === 1 ? 'Betrieb' : 'Betriebe'}`}</h2>{tab === 'search' && <span>Wien</span>}</div>
        {message && <div className="error-panel" role="alert">{message}<button onClick={() => void load()}>Erneut versuchen</button></div>}
        {!loading && !message && !page.businesses.length && <div className="empty-state"><Bookmark size={30} /><h2>{tab === 'favorites' ? 'Noch keine Favoriten' : 'Keine Treffer'}</h2><p>{tab === 'favorites' ? 'Tippe bei einem Betrieb auf das Herz, um ihn zu merken.' : 'Versuche einen anderen Suchbegriff oder ändere die Filter.'}</p></div>}
        <div className="cards">{page.businesses.map((business) => <article className="business-card" key={business.id}><div className="card-top"><span className="category-label">{categoryLabels[business.category] || business.category}</span><button type="button" className={`heart ${favoriteIds.includes(business.id) ? 'active' : ''}`} aria-label={favoriteIds.includes(business.id) ? 'Aus Favoriten entfernen' : 'Als Favorit merken'} onClick={() => toggleFavorite(business.id)}><Heart size={22} fill={favoriteIds.includes(business.id) ? 'currentColor' : 'none'} /></button></div><button type="button" className="card-main" onClick={() => void openDetail(business)}><h3>{business.name}</h3><span className="address"><MapPin size={15} />{business.address}</span><span className="status"><Clock3 size={15} />{business.openingStatus.label}</span>{business.offerings?.length > 0 && <span className="offering">{business.offerings.slice(0, 2).map((item) => item.name).join(' · ')}</span>}{business.trainsApprentices && <span className="apprentice">Bildet Lehrlinge aus</span>}<span className="details-link">Details ansehen <ArrowUpRight size={17} /></span></button></article>)}</div>
        {page.hasMore && !message && <button className="more-button" disabled={loading} onClick={() => void load(page.businesses.length)}>{loading ? 'Lädt …' : 'Mehr Betriebe anzeigen'}</button>}
      </>}
    </main>
    <nav className="bottom-nav" aria-label="Hauptnavigation"><button className={tab === 'search' ? 'current' : ''} onClick={() => setTab('search')}><Compass size={22} />Entdecken</button><button className={tab === 'favorites' ? 'current' : ''} onClick={() => setTab('favorites')}><Heart size={22} />Merkliste</button><button className={tab === 'info' ? 'current' : ''} onClick={() => setTab('info')}><BriefcaseBusiness size={22} />Über Servano</button></nav>
    {(detailLoading || detail || detailError) && <div className="modal-backdrop" role="presentation" onClick={() => { setDetail(null); setDetailLoading(false); setDetailError(''); }}><section className="detail-sheet" role="dialog" aria-modal="true" aria-label="Firmendetails" onClick={(event) => event.stopPropagation()}><button className="back-button" onClick={() => { setDetail(null); setDetailLoading(false); setDetailError(''); }}><ArrowLeft size={20} /> Zurück</button>{detailLoading && <p>Firmendetails laden …</p>}{detailError && <p role="alert">{detailError}</p>}{detail && <><span className="category-label">{categoryLabels[detail.category] || detail.category}</span><h2>{detail.name}</h2>{detail.isTestData && <p className="detail-test">Testfirma, keine echte Firma</p>}<p className="detail-address"><MapPin size={17} /> {detail.address}</p><p className="detail-status"><Clock3 size={17} /> {selectedCard?.openingStatus.label || 'Zeiten unbekannt'}</p>{detail.trainsApprentices && <p className="apprentice">Bildet Lehrlinge aus</p>}<h3>Leistungen und Preise</h3>{selectedCard?.offerings?.length ? <div className="offerings">{selectedCard.offerings.map((item, index) => <div key={`${item.name}-${index}`}><span>{item.name}</span><b>{item.priceLabel}</b></div>)}</div> : <p>Keine Leistungen angegeben.</p>}<div className="detail-actions">{selectedCard?.routeUrl && !detail.isTestData && <a href={selectedCard.routeUrl} target="_blank" rel="noreferrer"><MapPin size={17} />Route</a>}{detail.publicEmailAllowed && detail.email && <a href={`mailto:${detail.email}`}>E Mail</a>}{detail.publicWebsiteAllowed && detail.website && <a href={detail.website} target="_blank" rel="noreferrer">Webseite <ExternalLink size={16} /></a>}</div></>}</section></div>}
  </div>;
}
