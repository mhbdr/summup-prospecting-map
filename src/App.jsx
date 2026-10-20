import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer } from 'react-leaflet';
import ClusterLayer from './components/ClusterLayer.jsx';
import BusinessList from './components/BusinessList.jsx';
import BusinessDialog from './components/BusinessDialog.jsx';
import { AreaOutline, MapEvents, UserLocation } from './components/MapBits.jsx';
import { useDebounced } from './hooks.js';
import { QUICK_PICKS, resolveQuery } from './lib/categories.js';
import { ARRONDISSEMENTS, getArrondissement, inBounds, matchesArrondissement } from './lib/arrondissements.js';
import { DEPARTMENTS, IDF_BOUNDS, PARIS_BOUNDS, getDepartment, registryDepartments } from './lib/departments.js';
import { distanceMeters } from './lib/format.js';
import { boundsContain, fetchBusinesses, snapBounds } from './lib/overpass.js';
import { DEFAULT_RECORD, buildCsv, downloadCsv, loadRecords, saveRecords } from './lib/records.js';
import { fetchParisPartners, normalizeBusiness, searchCompanies } from './lib/sources.js';

const PARIS_CENTER = [48.8566, 2.3522];
const MIN_ZOOM_TO_LOAD = 13;
const MAX_STORED_ITEMS = 3000;
const MAX_LIST_ROWS = 400;
const MAX_BOUNDS = [
  [47.9, 1.2],
  [49.5, 3.9],
];
const TILE_URL = import.meta.env.VITE_TILE_URL || 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTRIBUTION =
  import.meta.env.VITE_TILE_ATTRIBUTION || '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

const toLeafletBounds = ([s, w, n, e]) => [
  [s, w],
  [n, e],
];

function areaBounds(area) {
  if (area === 'idf') return IDF_BOUNDS;
  if (area === 'paris') return PARIS_BOUNDS;
  if (area.startsWith('arr-')) return getArrondissement(area.slice(4))?.bounds ?? null;
  if (area.startsWith('dep-')) return getDepartment(area.slice(4))?.bounds ?? null;
  return null;
}

export default function App() {
  // ----- search + filters -----
  const [text, setText] = useState('bakery');
  const [committed, setCommitted] = useState('bakery');
  const debouncedText = useDebounced(text, 600);
  useEffect(() => setCommitted(debouncedText), [debouncedText]);
  const search = useMemo(() => resolveQuery(committed), [committed]);
  const [area, setArea] = useState('paris');
  const arrondissement = area.startsWith('arr-') ? getArrondissement(area.slice(4)) : null;
  const outlineBounds = area.startsWith('arr-') || area.startsWith('dep-') ? areaBounds(area) : null;

  // ----- map state -----
  const mapRef = useRef(null);
  const clusterController = useRef(null);
  const [viewport, setViewport] = useState(null); // { bounds: [s,w,n,e], zoom }
  const debouncedViewport = useDebounced(viewport, 700);

  // ----- data -----
  const [osm, setOsm] = useState({ queryKey: null, items: new Map() });
  const [status, setStatus] = useState({ loading: false, error: '', truncated: false });
  const [companyItems, setCompanyItems] = useState(() => new Map());
  const [companyQuery, setCompanyQuery] = useState('');
  const [companyBusy, setCompanyBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [showPartners, setShowPartners] = useState(false);
  const [partners, setPartners] = useState([]);
  const coverage = useRef({ key: null, rects: [] });
  const companyController = useRef(null);

  // ----- interaction -----
  const [selectedKey, setSelectedKey] = useState(null);
  const [detailKey, setDetailKey] = useState(null);
  const [userPos, setUserPos] = useState(null);
  const [locating, setLocating] = useState(false);
  const [toast, setToast] = useState('');
  const toastTimer = useRef(null);

  // ----- visit records (browser storage) -----
  const [records, setRecords] = useState(loadRecords);
  const recordsDirty = useRef(false);

  const showToast = useCallback((message) => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 3500);
  }, []);

  useEffect(() => {
    if (!recordsDirty.current) return;
    if (!saveRecords(records)) showToast('Could not save changes on this device. Check browser storage settings.');
  }, [records, showToast]);

  useEffect(
    () => () => {
      clearTimeout(toastTimer.current);
      companyController.current?.abort();
    },
    []
  );

  // ----- fetch businesses from Overpass for the visible bounds -----
  // A new search replaces the previous results...
  useEffect(() => {
    coverage.current = { key: search?.key ?? null, rects: [] };
    setOsm({ queryKey: search?.key ?? null, items: new Map() });
    setStatus({ loading: false, error: '', truncated: false });
  }, [search?.key]);

  // ...and panning/zooming adds results for the new area (debounced, cached, throttled).
  useEffect(() => {
    if (!search || !debouncedViewport) return undefined;
    if (debouncedViewport.zoom < MIN_ZOOM_TO_LOAD) {
      setStatus((s) => ({ ...s, loading: false, error: '' }));
      return undefined;
    }
    const visibleBounds = debouncedViewport.bounds;
    if (coverage.current.rects.some((rect) => boundsContain(rect, visibleBounds))) return undefined; // already loaded

    const snapped = snapBounds(visibleBounds);
    const controller = new AbortController();
    const searchKey = search.key;
    setStatus((s) => ({ ...s, loading: true, error: '' }));

    fetchBusinesses(search, snapped, { signal: controller.signal })
      .then(({ items, truncated }) => {
        if (coverage.current.key !== searchKey) return;
        if (!truncated) coverage.current.rects.push(snapped);
        setOsm((prev) => {
          const next = new Map(prev.queryKey === searchKey ? prev.items : []);
          for (const item of items) next.set(item.key, item);
          while (next.size > MAX_STORED_ITEMS) next.delete(next.keys().next().value);
          return { queryKey: searchKey, items: next };
        });
        setStatus({ loading: false, error: '', truncated });
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        setStatus({ loading: false, error: err.message, truncated: false });
      });

    return () => controller.abort();
  }, [search, debouncedViewport]);

  // Eau de Paris partner shops (optional layer).
  useEffect(() => {
    if (!showPartners || partners.length) return undefined;
    const controller = new AbortController();
    fetchParisPartners(controller.signal)
      .then(setPartners)
      .catch((err) => {
        if (err.name === 'AbortError') return;
        setShowPartners(false);
        showToast(`Paris Open Data is unavailable (${err.message})`);
      });
    return () => controller.abort();
  }, [showPartners, partners.length, showToast]);

  // ----- derived lists -----
  const allItems = useMemo(() => {
    const out = [];
    const add = (item) => {
      if (matchesArrondissement(item, arrondissement)) out.push(item);
    };
    osm.items.forEach(add);
    companyItems.forEach(add);
    if (showPartners) partners.forEach(add);
    return out;
  }, [osm, companyItems, partners, showPartners, arrondissement]);

  const itemsByKey = useMemo(() => new Map(allItems.map((i) => [i.key, i])), [allItems]);

  const { rows, distances, totalInView } = useMemo(() => {
    if (!viewport) return { rows: [], distances: null, totalInView: 0 };
    const inView = allItems.filter((i) => inBounds(i.lat, i.lon, viewport.bounds));
    let dist = null;
    if (userPos) {
      dist = new Map(inView.map((i) => [i.key, distanceMeters(userPos.lat, userPos.lng, i.lat, i.lon)]));
      inView.sort((a, b) => dist.get(a.key) - dist.get(b.key));
    } else {
      inView.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    }
    return { rows: inView.slice(0, MAX_LIST_ROWS), distances: dist, totalInView: inView.length };
  }, [allItems, viewport, userPos]);

  const detailItem = detailKey ? itemsByKey.get(detailKey) ?? normalizeBusiness(records[detailKey]?.business) : null;

  // ----- actions -----
  const pickFromList = useCallback((key) => {
    setSelectedKey(key);
    clusterController.current?.focus(key);
  }, []);

  const onAreaChange = (value) => {
    setArea(value);
    setSelectedKey(null);
    const bounds = areaBounds(value);
    if (bounds && mapRef.current) mapRef.current.flyToBounds(toLeafletBounds(bounds), { padding: [16, 16], duration: 0.8 });
  };

  const locate = () => {
    if (!navigator.geolocation) {
      showToast('Location is not available in this browser.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const next = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy };
        setUserPos(next);
        setLocating(false);
        mapRef.current?.flyTo([next.lat, next.lng], 16, { duration: 0.8 });
      },
      (err) => {
        setLocating(false);
        showToast(
          err.code === err.PERMISSION_DENIED
            ? 'Location permission was denied. You can still move the map manually.'
            : 'Could not determine your location. Try again or move the map manually.'
        );
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  };

  const updateRecord = useCallback(
    (patch) => {
      if (!detailItem) return;
      recordsDirty.current = true;
      setRecords((prev) => ({
        ...prev,
        [detailItem.key]: {
          ...DEFAULT_RECORD,
          ...prev[detailItem.key],
          business: detailItem,
          ...patch,
          updatedAt: new Date().toISOString(),
        },
      }));
    },
    [detailItem]
  );

  const exportLeads = () => {
    const csv = buildCsv(records, itemsByKey);
    if (!csv) showToast('There are no saved visit records to export yet.');
    else downloadCsv(csv);
  };

  const runCompanySearch = async (event) => {
    event.preventDefault();
    const query = companyQuery.trim();
    if (!query) {
      showToast('Enter a business or activity keyword, such as “boulangerie”.');
      return;
    }
    if (!viewport) return;
    companyController.current?.abort();
    const controller = new AbortController();
    companyController.current = controller;
    setCompanyBusy(true);
    setNotice(`Searching the French company register for “${query}”…`);
    try {
      const [s, w, n, e] = viewport.bounds;
      const department = registryDepartments(area, [(s + n) / 2, (w + e) / 2]);
      const found = await searchCompanies(query, department, viewport.bounds, controller.signal);
      setCompanyItems((prev) => {
        const next = new Map(prev);
        found.forEach((item) => next.set(item.key, item));
        return next;
      });
      setNotice(
        found.length
          ? `${found.length} active establishment${found.length === 1 ? '' : 's'} matched “${query}” in this map area (the API returns up to 25 companies per search).`
          : `No matching active establishments for “${query}” in this map area. Try another keyword or move the map.`
      );
    } catch (err) {
      if (companyController.current !== controller) return; // superseded by a newer search
      setNotice(err.name === 'AbortError' ? 'The company-search request timed out. Please try again.' : err.message);
    } finally {
      if (companyController.current === controller) {
        companyController.current = null;
        setCompanyBusy(false);
      }
    }
  };

  // ----- status line -----
  let message;
  if (!search) message = 'Type a business type (bakery, pharmacy, café…) to search the map.';
  else if (viewport && viewport.zoom < MIN_ZOOM_TO_LOAD) message = `Zoom in to street level (zoom ${MIN_ZOOM_TO_LOAD}+) to load ${search.label.toLowerCase()} results.`;
  else if (status.error) message = status.error;
  else if (status.loading) message = `Loading ${search.label.toLowerCase()} in this area…`;
  else if (totalInView === 0) message = 'No businesses found in this view. Move the map or try another search.';
  else
    message =
      `${totalInView} result${totalInView === 1 ? '' : 's'} in view` +
      (totalInView > MAX_LIST_ROWS ? ` (list shows the first ${MAX_LIST_ROWS}; zoom in for the rest)` : '') +
      (status.truncated ? '. OpenStreetMap results were capped at 300 for this area: zoom in for more.' : '.');

  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" href="#" aria-label="Field finder home" onClick={(e) => e.preventDefault()}>
          <span className="brand-mark" aria-hidden="true">
            S
          </span>
          <span>
            Field finder <small>Paris · Île-de-France</small>
          </span>
        </a>
        <div className="topbar-actions">
          <span className="save-indicator">Visit notes stay on this device</span>
          <button type="button" className="button button-secondary" onClick={exportLeads}>
            Export leads
          </button>
        </div>
      </header>

      <main className="workspace">
        <aside className="sidebar">
          <section className="search-panel" aria-label="Search controls">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setCommitted(text);
              }}
            >
              <label htmlFor="search">Business type</label>
              <input
                id="search"
                className="text-input"
                type="search"
                value={text}
                maxLength={40}
                autoComplete="off"
                placeholder="bakery, pharmacy, café, or a shop name"
                onChange={(e) => setText(e.target.value)}
              />
              <div className="chips" role="group" aria-label="Quick picks">
                {QUICK_PICKS.map((pick) => (
                  <button
                    key={pick.label}
                    type="button"
                    className={`chip${search?.label === pick.label ? ' is-on' : ''}`}
                    onClick={() => {
                      setText(pick.query);
                      setCommitted(pick.query);
                    }}
                  >
                    {pick.label}
                  </button>
                ))}
              </div>

              <label htmlFor="area">Area</label>
              <div className="search-buttons">
                <select id="area" value={area} onChange={(e) => onAreaChange(e.target.value)}>
                  <optgroup label="Paris">
                    <option value="paris">All Paris</option>
                    {ARRONDISSEMENTS.map((a) => (
                      <option key={a.number} value={`arr-${a.number}`}>
                        {a.label}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Île-de-France">
                    <option value="idf">All Île-de-France</option>
                    {DEPARTMENTS.map((d) => (
                      <option key={d.code} value={`dep-${d.code}`}>
                        {d.code} · {d.name}
                      </option>
                    ))}
                  </optgroup>
                </select>
                <button
                  type="button"
                  className="button button-icon"
                  onClick={locate}
                  disabled={locating}
                  aria-label="Near me"
                  title="Near me"
                >
                  {locating ? '…' : '◎'}
                </button>
              </div>
            </form>

            <label className="check">
              <input type="checkbox" checked={showPartners} onChange={(e) => setShowPartners(e.target.checked)} />
              Show Eau de Paris water-refill partners
            </label>

            <details className="registry">
              <summary>Search the French company register</summary>
              <form onSubmit={runCompanySearch}>
                <input
                  className="text-input"
                  type="search"
                  value={companyQuery}
                  maxLength={100}
                  placeholder="e.g. boulangerie, restaurant"
                  onChange={(e) => setCompanyQuery(e.target.value)}
                />
                <button type="submit" className="button button-secondary" disabled={companyBusy}>
                  {companyBusy ? 'Searching…' : 'Add company results'}
                </button>
                <p className="search-hint">
                  Active establishments matching the keyword inside the visible map (up to 25 companies per query). Not a full shop directory.
                </p>
              </form>
            </details>
          </section>

          <section className="results-section" aria-live="polite">
            <div className="results-heading">
              <h2>{search ? search.label : 'Businesses'}</h2>
              <span className="result-count">{totalInView}</span>
            </div>
            <p className={`result-message${status.error ? ' is-error' : ''}`}>{message}</p>
            {notice && <p className="result-message">{notice}</p>}
            <BusinessList items={rows} selectedKey={selectedKey} records={records} distances={distances} onPick={pickFromList} />
          </section>

          <footer className="sidebar-footer">
            Sources: OpenStreetMap (Overpass API), Paris Open Data, and the French company-search API. Payment methods are never guessed:
            every business starts as “Not verified”.
          </footer>
        </aside>

        <section className="map-panel" aria-label="Business map">
          <MapContainer
            center={PARIS_CENTER}
            zoom={14}
            minZoom={9}
            maxBounds={MAX_BOUNDS}
            maxBoundsViscosity={0.8}
            className="map"
          >
            <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} maxZoom={19} />
            <MapEvents onViewport={setViewport} mapRef={mapRef} />
            <AreaOutline bounds={outlineBounds} />
            <ClusterLayer
              items={allItems}
              selectedKey={selectedKey}
              records={records}
              onSelect={setSelectedKey}
              onDetails={setDetailKey}
              controller={clusterController}
            />
            <UserLocation position={userPos} />
          </MapContainer>
          {status.loading && <div className="map-badge">Loading…</div>}
        </section>
      </main>

      <BusinessDialog
        key={detailKey ?? 'none'}
        item={detailItem}
        record={detailKey ? records[detailKey] : null}
        onChange={updateRecord}
        onClose={() => setDetailKey(null)}
      />
      <div className={`toast${toast ? ' is-visible' : ''}`} role="status" aria-live="polite">
        {toast}
      </div>
    </div>
  );
}
