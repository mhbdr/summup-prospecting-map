import React, { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CircleMarker, MapContainer, TileLayer, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import './api-demo.css';
import {
  buildAddressSearchUrl,
  buildAlgoliaQueryUrl,
  normalizeAddressResults,
  normalizeAlgoliaResults,
} from './lib/apiDemo.js';

const OSM_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

function MapFocus({ result }) {
  const map = useMap();
  React.useEffect(() => {
    if (result && Number.isFinite(result.lat) && Number.isFinite(result.lon)) {
      map.flyTo([result.lat, result.lon], 16, { duration: 0.7 });
    }
  }, [map, result]);
  return null;
}

function ResultCard({ result, active, onSelect }) {
  return (
    <button className={`demo-result${active ? ' is-active' : ''}`} onClick={() => onSelect(result)} type="button">
      <span className="demo-result-source">{result.source}</span>
      <strong>{result.title}</strong>
      {result.subtitle && <span className="demo-result-subtitle">{result.subtitle}</span>}
      {result.lat == null && result.source === 'Algolia' && <span className="demo-result-subtitle">Aucune coordonnée géographique</span>}
    </button>
  );
}

function SearchPanel({ queryId, title, source, value, onValueChange, onSubmit, status, results, selected, onSelect, children, placeholder }) {
  return (
    <section className="demo-panel">
      <div className="demo-panel-heading">
        <span className="demo-source-tag">{source}</span>
        <h2>{title}</h2>
      </div>
      {children}
      <form className="demo-search-form" onSubmit={onSubmit}>
        <label className="visually-hidden" htmlFor={queryId}>{title}</label>
        <input
          autoComplete="off"
          id={queryId}
          onChange={(event) => onValueChange(event.target.value)}
          placeholder={placeholder}
          value={value}
        />
        <button className="demo-submit" disabled={status === 'loading'} type="submit">
          {status === 'loading' ? 'Recherche…' : 'Rechercher'}
        </button>
      </form>
      <div aria-live="polite" className={`demo-status ${status === 'error' ? 'is-error' : ''}`}>
        {status === 'loading' && 'Recherche en cours…'}
        {status === 'error' && 'La recherche a échoué. Vérifiez la configuration ou réessayez.'}
        {status === 'empty' && 'Aucun résultat trouvé.'}
        {status === 'success' && `${results.length} résultat${results.length > 1 ? 's' : ''} · source : ${source}`}
      </div>
      {status === 'success' && (
        <div className="demo-results">
          {results.map((result) => (
            <ResultCard
              active={selected?.id === result.id && selected?.source === result.source}
              key={`${result.source}-${result.id}`}
              onSelect={onSelect}
              result={result}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function App() {
  const [addressQuery, setAddressQuery] = useState('');
  const [addressResults, setAddressResults] = useState([]);
  const [addressStatus, setAddressStatus] = useState('idle');
  const [algoliaQuery, setAlgoliaQuery] = useState('');
  const [algoliaResults, setAlgoliaResults] = useState([]);
  const [algoliaStatus, setAlgoliaStatus] = useState('idle');
  const [applicationId, setApplicationId] = useState('');
  const [searchOnlyKey, setSearchOnlyKey] = useState('');
  const [indexName, setIndexName] = useState('');
  const [mapTilerKey, setMapTilerKey] = useState('');
  const [selected, setSelected] = useState(null);
  const addressRequest = useRef(null);
  const algoliaRequest = useRef(null);

  async function searchAddress(event) {
    event.preventDefault();
    if (!addressQuery.trim()) return;
    addressRequest.current?.abort();
    const controller = new AbortController();
    addressRequest.current = controller;
    setAddressStatus('loading');
    setAddressResults([]);
    try {
      const response = await fetch(buildAddressSearchUrl(addressQuery), { signal: controller.signal });
      if (!response.ok) throw new Error(`Address API returned ${response.status}`);
      const results = normalizeAddressResults(await response.json());
      setAddressResults(results);
      setAddressStatus(results.length ? 'success' : 'empty');
    } catch (error) {
      if (error.name !== 'AbortError') setAddressStatus('error');
    }
  }

  async function searchAlgolia(event) {
    event.preventDefault();
    if (!applicationId.trim() || !searchOnlyKey.trim() || !indexName.trim()) {
      setAlgoliaStatus('setup');
      setAlgoliaResults([]);
      return;
    }
    if (!algoliaQuery.trim()) return;

    algoliaRequest.current?.abort();
    const controller = new AbortController();
    algoliaRequest.current = controller;
    setAlgoliaStatus('loading');
    setAlgoliaResults([]);
    try {
      const response = await fetch(buildAlgoliaQueryUrl(applicationId.trim(), indexName), {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-algolia-application-id': applicationId.trim(),
          'x-algolia-api-key': searchOnlyKey.trim(),
        },
        body: JSON.stringify({ query: algoliaQuery.trim(), hitsPerPage: 6 }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Algolia returned ${response.status}`);
      const results = normalizeAlgoliaResults(await response.json());
      setAlgoliaResults(results);
      setAlgoliaStatus(results.length ? 'success' : 'empty');
    } catch (error) {
      if (error.name !== 'AbortError') setAlgoliaStatus('error');
    }
  }

  const tileUrl = mapTilerKey.trim()
    ? `https://api.maptiler.com/maps/streets-v2/{z}/{x}/{y}.png?key=${encodeURIComponent(mapTilerKey.trim())}`
    : OSM_TILE_URL;

  return (
    <main className="api-demo">
      <header className="demo-topbar">
        <a className="demo-brand" href="./" aria-label="Retour à Field Finder">
          <span className="demo-brand-mark">F</span>
          <span>Field Finder <small>API EXPLORER</small></span>
        </a>
        <a className="demo-back-link" href="./">← Retour à la carte</a>
      </header>
      <div className="demo-intro">
        <p className="demo-eyebrow">DÉMO INDÉPENDANTE</p>
        <h1>Comparez les APIs, en direct.</h1>
        <p>Testez la recherche d’adresses française, votre index Algolia et les fonds de carte MapTiler. Chaque résultat indique sa source.</p>
      </div>
      <div className="demo-workspace">
        <aside aria-label="Comparaison des APIs" className="demo-sidebar">
          <SearchPanel
            queryId="address-query"
            onSelect={setSelected}
            onSubmit={searchAddress}
            onValueChange={setAddressQuery}
            placeholder="Ex. 20 avenue de Ségur, Paris"
            results={addressResults}
            selected={selected}
            source="API Adresse"
            status={addressStatus}
            title="Recherche d’adresse"
            value={addressQuery}
          >
            <p className="demo-help">API publique française · aucun compte requis · résultats centrés sur la France.</p>
          </SearchPanel>
          <SearchPanel
            queryId="algolia-query"
            onSelect={setSelected}
            onSubmit={searchAlgolia}
            onValueChange={setAlgoliaQuery}
            placeholder="Requête dans votre index"
            results={algoliaResults}
            selected={selected}
            source="Algolia"
            status={algoliaStatus}
            title="Votre index Algolia"
            value={algoliaQuery}
          >
            <p className="demo-help">Utilisez uniquement votre clé Search-only et un index configuré.</p>
            <div className="demo-credentials">
              <label htmlFor="algolia-app-id">Application ID</label>
              <input autoComplete="off" id="algolia-app-id" onChange={(e) => setApplicationId(e.target.value)} spellCheck="false" value={applicationId} />
              <label htmlFor="algolia-search-key">Search-only API key</label>
              <input autoComplete="new-password" id="algolia-search-key" onChange={(e) => setSearchOnlyKey(e.target.value)} type="password" value={searchOnlyKey} />
              <label htmlFor="algolia-index">Nom de l’index</label>
              <input autoComplete="off" id="algolia-index" onChange={(e) => setIndexName(e.target.value)} value={indexName} />
            </div>
            {algoliaStatus === 'setup' && <p className="demo-setup" role="status">Configuration requise : renseignez les trois champs et votre index Algolia.</p>}
          </SearchPanel>
          <section className="demo-panel demo-map-setup">
            <div className="demo-panel-heading">
              <span className="demo-source-tag">MapTiler</span>
              <h2>Fond de carte</h2>
            </div>
            <label htmlFor="maptiler-key">Clé API MapTiler (facultative)</label>
            <input
              autoComplete="new-password"
              id="maptiler-key"
              onChange={(event) => setMapTilerKey(event.target.value)}
              placeholder="Saisissez votre clé pour activer MapTiler"
              type="password"
              value={mapTilerKey}
            />
            <p className="demo-help">
              {mapTilerKey.trim()
                ? 'Fond MapTiler activé avec votre clé.'
                : 'Sans clé, la carte utilise OpenStreetMap. La clé reste en mémoire dans cette page et est envoyée à MapTiler pour charger les tuiles.'}
            </p>
          </section>
        </aside>
        <section aria-label="Aperçu cartographique" className="demo-map">
          <MapContainer center={[46.8, 2.4]} className="demo-map-canvas" zoom={6} scrollWheelZoom>
            <TileLayer
              attribution={mapTilerKey.trim()
                ? '&copy; <a href="https://www.maptiler.com/copyright/">MapTiler</a> &copy; OpenStreetMap contributors'
                : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}
              url={tileUrl}
            />
            <MapFocus result={selected} />
            {selected && Number.isFinite(selected.lat) && Number.isFinite(selected.lon) && (
              <CircleMarker center={[selected.lat, selected.lon]} pathOptions={{ color: '#1769aa', fillColor: '#2685d0', fillOpacity: 0.9 }} radius={10} />
            )}
          </MapContainer>
          <span className="demo-map-badge">{mapTilerKey.trim() ? 'Fond : MapTiler' : 'Fond : OpenStreetMap'}</span>
          <div className="demo-map-note">Sélectionnez un résultat pour le localiser.</div>
        </section>
      </div>
      <footer className="demo-footer">API Adresse : api-adresse.data.gouv.fr · Recherche Algolia : vos identifiants et votre index · Carte : {mapTilerKey.trim() ? 'MapTiler' : 'OpenStreetMap'}. Les données SIRENE du projet Field Finder ne sont pas utilisées sur cette page.</footer>
    </main>
  );
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
