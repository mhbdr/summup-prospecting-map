import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer } from 'react-leaflet';
import ClusterLayer from './components/ClusterLayer.jsx';
import BusinessList from './components/BusinessList.jsx';
import BusinessDialog from './components/BusinessDialog.jsx';
import { AreaOutline, MapEvents, UserLocation } from './components/MapBits.jsx';
import { ARRONDISSEMENTS, getArrondissement, inBounds, matchesArrondissement } from './lib/arrondissements.js';
import { DEPARTMENTS, IDF_BOUNDS, PARIS_BOUNDS, getDepartment, registryDepartments } from './lib/departments.js';
import { distanceMeters } from './lib/format.js';
import { DEFAULT_RECORD, buildCsv, downloadCsv, loadRecords, saveRecords } from './lib/records.js';
import { BUSINESS_TYPES } from './lib/businessTypes.js';
import { normalizeBusiness, searchCompanies, searchNearbyBusinesses } from './lib/sources.js';
import {
  addBusinessesWithoutDuplicates,
  isParisSourceApplicable,
  PARIS_OPEN_DATA_SOURCES,
  searchParisOpenData,
} from './lib/parisOpenData.js';

const PARIS_CENTER = [48.8566, 2.3522];
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
  // ----- area filters -----
  const [area, setArea] = useState('paris');
  const [businessType, setBusinessType] = useState('all');
  const arrondissement = area.startsWith('arr-') ? getArrondissement(area.slice(4)) : null;
  const outlineBounds = area.startsWith('arr-') || area.startsWith('dep-') ? areaBounds(area) : null;

  // ----- map state -----
  const mapRef = useRef(null);
  const clusterController = useRef(null);
  const [viewport, setViewport] = useState(null); // { bounds: [s,w,n,e], zoom }

  // ----- data -----
  const [companyItems, setCompanyItems] = useState(() => new Map());
  const [companyQuery, setCompanyQuery] = useState('');
  const [companyBusy, setCompanyBusy] = useState(false);
  const [nearbyBusy, setNearbyBusy] = useState(false);
  const [nearbyPage, setNearbyPage] = useState(0);
  const [nearbyTotalPages, setNearbyTotalPages] = useState(0);
  const [nearbyType, setNearbyType] = useState('all');
  const [nearbyBounds, setNearbyBounds] = useState(null);
  const [parisSources, setParisSources] = useState({ terraces: true, waterPartners: true });
  const [parisSourceStatus, setParisSourceStatus] = useState({});
  const [notice, setNotice] = useState('');
  const companyController = useRef(null);
  const nearbyController = useRef(null);

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
      nearbyController.current?.abort();
    },
    []
  );

  // ----- derived lists -----
  const allItems = useMemo(() => {
    const out = [];
    const add = (item) => {
      if (matchesArrondissement(item, arrondissement)) out.push(item);
    };
    companyItems.forEach(add);
    return out;
  }, [companyItems, arrondissement]);

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
    nearbyController.current?.abort();
    nearbyController.current = null;
    companyController.current?.abort();
    companyController.current = null;
    setCompanyBusy(false);
    setNearbyBusy(false);
    setNearbyPage(0);
    setNearbyTotalPages(0);
    setParisSourceStatus({});
    setCompanyItems(new Map());
    const bounds = areaBounds(value);
    if (bounds && mapRef.current) mapRef.current.flyToBounds(toLeafletBounds(bounds), { padding: [16, 16], duration: 0.8 });
  };

  const onBusinessTypeChange = (value) => {
    setBusinessType(value);
    nearbyController.current?.abort();
    nearbyController.current = null;
    companyController.current?.abort();
    companyController.current = null;
    setCompanyBusy(false);
    setNearbyBusy(false);
    setNearbyPage(0);
    setNearbyTotalPages(0);
    setParisSourceStatus({});
    setCompanyItems(new Map());
    setSelectedKey(null);
    setNotice('Business type changed. Search again to load matching results.');
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
      setCompanyItems((prev) => addBusinessesWithoutDuplicates(prev, found));
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

  const runNearbySearch = async (page = 1, bounds = viewport?.bounds, typeId = businessType) => {
    if (!bounds) return;
    const sourceIds = page === 1
      ? Object.entries(parisSources).filter(([, enabled]) => enabled).map(([id]) => id)
      : [];
    if (page === 1) {
      setNearbyBounds(bounds);
      setNearbyPage(0);
      setNearbyTotalPages(0);
      setNearbyType(typeId);
      setParisSourceStatus(
        Object.fromEntries(
          PARIS_OPEN_DATA_SOURCES.map(({ id }) => [
            id,
            sourceIds.includes(id)
              ? isParisSourceApplicable(id, typeId)
                ? { status: 'loading' }
                : { status: 'not-applicable' }
              : { status: 'idle' },
          ])
        )
      );
      setCompanyItems(new Map());
    }
    nearbyController.current?.abort();
    const controller = new AbortController();
    nearbyController.current = controller;
    setNearbyBusy(true);
    setNotice(page === 1 ? 'Searching official open business data for this map area…' : `Loading more official results (page ${page})…`);
    try {
      const tasks = [{ id: 'sirene', run: () => searchNearbyBusinesses(bounds, page, controller.signal, typeId) }];
    if (page === 1) {
      sourceIds.filter((sourceId) => isParisSourceApplicable(sourceId, typeId)).forEach((sourceId) => {
          tasks.push({
            id: sourceId,
            run: async () => {
              const [result] = await searchParisOpenData(bounds, [sourceId], typeId, controller.signal);
              return result;
            },
          });
        });
      }
      const outcomes = await Promise.allSettled(tasks.map((task) => task.run()));
      if (nearbyController.current !== controller) return;
      const additions = [];
      const errors = [];
      const completed = {};
      outcomes.forEach((outcome, index) => {
        const { id } = tasks[index];
        if (outcome.status === 'rejected') {
          const sourceLabel = id === 'sirene' ? 'SIRENE' : PARIS_OPEN_DATA_SOURCES.find((source) => source.id === id)?.label;
          errors.push(`${sourceLabel}: ${outcome.reason?.message || 'request failed'}`);
          if (id !== 'sirene') completed[id] = { status: 'error', error: outcome.reason?.message || 'Request failed.' };
          return;
        }
        const result = outcome.value;
        additions.push(...result.items);
        if (id === 'sirene') {
          setNearbyPage(result.page);
          setNearbyTotalPages(result.totalPages);
          setNearbyBounds(bounds);
        } else {
          completed[id] = {
            status: 'loaded',
            count: result.items.length,
            limited: result.capped,
          };
        }
      });
      setParisSourceStatus((previous) => ({ ...previous, ...completed }));
      if (page === 1 && !outcomes.some((outcome, index) => tasks[index].id === 'sirene' && outcome.status === 'fulfilled')) {
        setNearbyPage(0);
        setNearbyTotalPages(0);
      }
      setCompanyItems((previous) => addBusinessesWithoutDuplicates(previous, additions));
      const typeLabel = BUSINESS_TYPES.find((type) => type.id === typeId)?.label.toLowerCase() ?? 'businesses';
      const sireneResult = outcomes.find((outcome, index) => tasks[index].id === 'sirene');
      const sourceResults = outcomes.flatMap((outcome, index) =>
        outcome.status === 'fulfilled' && tasks[index].id !== 'sirene' ? [outcome.value] : []
      );
      const summary = [];
      if (sireneResult?.status === 'fulfilled') {
        const result = sireneResult.value;
        summary.push(
          `${result.items.length} geolocated active ${typeLabel} from SIRENE (page ${result.page}; ${result.radius} km search radius)` +
            (result.coversBounds ? '' : '; this view exceeds the API radius limit')
        );
      }
      sourceResults.forEach((result) => {
        summary.push(
          `${result.items.length} ${result.label} record${result.items.length === 1 ? '' : 's'}` +
            (result.capped ? ' shown (500-record source limit reached)' : '')
        );
      });
      if (errors.length) summary.push(`Some sources failed: ${errors.join(' · ')}`);
      if (!summary.length) summary.push('No source returned results. Check the source error and try again.');
      setNotice(`${summary.join('. ')}. Paris Open Data records are supplementary and may overlap SIRENE.`);
    } catch (error) {
      if (nearbyController.current !== controller) return;
      setNotice(error.name === 'AbortError' ? 'The open-data search timed out. Please try again.' : error.message);
    } finally {
      if (nearbyController.current === controller) {
        nearbyController.current = null;
        setNearbyBusy(false);
      }
    }
  };

  // ----- status line -----
  const message = totalInView
    ? `${totalInView} result${totalInView === 1 ? '' : 's'} in view` +
      (totalInView > MAX_LIST_ROWS ? ` (list shows the first ${MAX_LIST_ROWS}; zoom in for the rest)` : '') +
      '.'
    : 'Click “Find shops in this map area” to load geolocated retail and food-service businesses from official French open data.';

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
            <div>
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
            </div>

            <label htmlFor="business-type">Business type</label>
            <select
              id="business-type"
              value={businessType}
              disabled={nearbyBusy}
              onChange={(event) => onBusinessTypeChange(event.target.value)}
            >
              {BUSINESS_TYPES.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="button button-primary nearby-search-button"
              disabled={!viewport || nearbyBusy}
              onClick={() => runNearbySearch(1, viewport?.bounds, businessType)}
            >
              {nearbyBusy && nearbyPage === 0 ? 'Searching open data…' : 'Find businesses in this map area'}
            </button>
            <p className="search-hint">
              Official French SIRENE open data: active businesses with published coordinates. Choose a type, then search.
              Searches run only when you click; move the map and search again to cover another area.
            </p>
            <details className="source-controls">
              <summary>
                Supplement with Paris Open Data ({Object.values(parisSources).filter(Boolean).length} enabled)
              </summary>
              <div className="source-options">
                {PARIS_OPEN_DATA_SOURCES.map((source) => (
                  <label key={source.id} className="source-option">
                    <input
                      type="checkbox"
                      checked={parisSources[source.id]}
                      disabled={nearbyBusy}
                      onChange={(event) => setParisSources((previous) => ({ ...previous, [source.id]: event.target.checked }))}
                    />
                    <span>
                      <strong>{source.label}</strong>
                      <small>
                        {parisSourceStatus[source.id]?.status === 'loading'
                          ? 'Loading…'
                          : parisSourceStatus[source.id]?.status === 'error'
                            ? `Error: ${parisSourceStatus[source.id].error}`
                            : parisSourceStatus[source.id]?.status === 'not-applicable'
                              ? 'Not available for this business type'
                              : parisSourceStatus[source.id]?.status === 'loaded'
                                ? `${parisSourceStatus[source.id].count} located records${parisSourceStatus[source.id].limited ? ' · 500-record limit reached' : ''}`
                                : source.id === 'terraces'
                                  ? 'Ville de Paris · ODbL · Paris only'
                                  : 'Eau de Paris · ODbL · Paris only'}
                      </small>
                    </span>
                  </label>
                ))}
              </div>
              <p className="search-hint">
                Loaded only when you search. Terrace/retail permits and partner listings can be stale or duplicate a SIRENE business; verify leads before visiting.
              </p>
              <p className="restricted-source">
                <strong>TheFork & MICHELIN Guide:</strong> not loaded. Their listing data is not available here under a public reuse licence or documented public search API. Integration requires written partner/API authorization and licensed access; do not put private credentials in this static app.
              </p>
            </details>
            {nearbyPage > 0 && nearbyPage < nearbyTotalPages && (
              <button
                type="button"
                className="button button-secondary load-more-button"
                disabled={nearbyBusy}
                onClick={() => runNearbySearch(nearbyPage + 1, nearbyBounds, nearbyType)}
              >
                {nearbyBusy ? 'Loading…' : `Load more businesses (${nearbyPage + 1} of ${nearbyTotalPages})`}
              </button>
            )}

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
                  Active establishments matching the keyword inside the visible map (up to 25 results per search). Not a full shop directory.
                </p>
              </form>
            </details>
          </section>

          <section className="results-section" aria-live="polite">
            <div className="results-heading">
              <h2>Businesses</h2>
              <span className="result-count">{totalInView}</span>
            </div>
            <p className="result-message">{message}</p>
            {notice && <p className="result-message">{notice}</p>}
            <BusinessList items={rows} selectedKey={selectedKey} records={records} distances={distances} onPick={pickFromList} />
          </section>

          <footer className="sidebar-footer">
            Sources: French SIRENE and optional Ville de Paris/Eau de Paris Open Data (ODbL). TheFork and MICHELIN listings require licensed partner access. OpenStreetMap is used for map tiles only. Payment methods are never guessed: every business starts as “Not verified”.
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
