// Additional data sources carried over from the original Field Finder app.
import { inBounds } from './arrondissements.js';

const PARIS_PARTNERS_API =
  'https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/commerces-eau-de-paris/exports/json';
const COMPANY_SEARCH_API = 'https://recherche-entreprises.api.gouv.fr/search';
const TIMEOUT_MS = 25000;

function withTimeout(signal) {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  return {
    signal: controller.signal,
    done() {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    },
  };
}

let partnersCache = null;

/** Eau de Paris water-refill partner shops (City of Paris open data). Downloaded once per session. */
export async function fetchParisPartners(signal) {
  if (!partnersCache) {
    const t = withTimeout(signal);
    try {
      const res = await fetch(PARIS_PARTNERS_API, { signal: t.signal });
      if (!res.ok) throw new Error(`Paris Open Data returned ${res.status}.`);
      const payload = await res.json();
      if (!Array.isArray(payload)) throw new Error('Paris Open Data returned an unexpected format.');
      partnersCache = payload
        .map((r) => ({
          key: `paris/${r.id}`,
          id: String(r.id),
          type: 'paris',
          source: 'Paris Open Data',
          sourceUrl: 'https://opendata.paris.fr/explore/dataset/commerces-eau-de-paris/',
          lat: Number(r.lat),
          lon: Number(r.lon),
          name: r.nom_commerce || 'Unnamed partner',
          kind: 'Eau de Paris water-refill partner',
          housenumber: r.num_voie || '',
          street: r.nom_voie || '',
          postcode: r.code_postal && r.code_postal !== '0' ? String(r.code_postal) : '',
          city: r.nom_commune || 'Paris',
          hours: '',
          website: '',
          phone: '',
        }))
        .filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lon));
    } finally {
      t.done();
    }
  }
  return partnersCache;
}

export function partnersInBounds(partners, [s, w, n, e]) {
  return partners.filter((p) => inBounds(p.lat, p.lon, [s, w, n, e]));
}

/** French company register (API Recherche d'entreprises): active establishments inside bounds. */
export async function searchCompanies(query, department, bounds, signal) {
  const params = new URLSearchParams({
    q: query,
    departement: department,
    per_page: '25',
    page: '1',
    page_etablissements: '1',
    limite_matching_etablissements: '100',
  });
  const t = withTimeout(signal);
  try {
    const res = await fetch(`${COMPANY_SEARCH_API}?${params}`, { signal: t.signal });
    if (!res.ok) throw new Error(`The company-search API returned ${res.status}.`);
    const payload = await res.json();
    if (!Array.isArray(payload.results)) throw new Error('The company-search API returned an unexpected response.');
    const bySiret = new Map();
    for (const company of payload.results) {
      for (const est of company.matching_etablissements || []) {
        if (est.etat_administratif !== 'A' || !est.siret) continue;
        const lat = Number(est.latitude);
        const lon = Number(est.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lon) || !inBounds(lat, lon, bounds)) continue;
        const activity = est.activite_principale || company.activite_principale || '';
        bySiret.set(est.siret, {
          key: `company/${est.siret}`,
          id: est.siret,
          type: 'company',
          source: 'API Recherche d’entreprises',
          sourceUrl: `https://annuaire-entreprises.data.gouv.fr/etablissement/${encodeURIComponent(est.siret)}`,
          lat,
          lon,
          name: est.nom_commercial || company.nom_complet || company.nom_raison_sociale || 'Unnamed establishment',
          kind: `Company · NAF ${activity || 'not listed'}`,
          fullAddress: est.adresse || '',
          housenumber: '',
          street: '',
          postcode: '',
          city: '',
          hours: '',
          website: '',
          phone: '',
        });
      }
    }
    return [...bySiret.values()];
  } finally {
    t.done();
  }
}

/**
 * Records saved by the original app store { coordinates: [lat, lon], tags: {...} }.
 * Convert any saved business snapshot to the current item shape.
 */
export function normalizeBusiness(b) {
  if (!b) return null;
  if (Number.isFinite(b.lat) && Number.isFinite(b.lon)) return b;
  if (!Array.isArray(b.coordinates)) return null;
  const t = b.tags ?? {};
  return {
    key: `${b.type}/${b.id}`,
    id: String(b.id),
    type: b.type,
    source: b.source || 'OpenStreetMap',
    sourceUrl: b.sourceUrl || '',
    lat: b.coordinates[0],
    lon: b.coordinates[1],
    name: t.name || t.brand || t.operator || 'Unnamed business',
    kind: t.shop || t.amenity || t.craft || t.office || t.activity || 'business',
    housenumber: t['addr:housenumber'] || '',
    street: t['addr:street'] || '',
    postcode: t['addr:postcode'] || '',
    city: t['addr:city'] || t['addr:town'] || '',
    fullAddress: t.fullAddress || '',
    hours: t.opening_hours || '',
    website: t.website || '',
    phone: t.phone || '',
  };
}
