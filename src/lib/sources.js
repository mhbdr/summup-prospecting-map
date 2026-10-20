// Open-data sources used by Field Finder.
import { inBounds } from './arrondissements.js';
import { getBusinessType } from './businessTypes.js';

const COMPANY_SEARCH_API = 'https://recherche-entreprises.api.gouv.fr/search';
const NEARBY_COMPANIES_API = 'https://recherche-entreprises.api.gouv.fr/near_point';
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

export function boundsSearchPoint([south, west, north, east]) {
  if (![south, west, north, east].every(Number.isFinite) || south >= north || west >= east) {
    throw new Error('The map bounds are invalid.');
  }
  const lat = (south + north) / 2;
  const lon = (west + east) / 2;
  const distanceKm = (cornerLat, cornerLon) => {
    const toRadians = (value) => (value * Math.PI) / 180;
    const deltaLat = toRadians(cornerLat - lat);
    const deltaLon = toRadians(cornerLon - lon);
    const a =
      Math.sin(deltaLat / 2) ** 2 +
      Math.cos(toRadians(lat)) * Math.cos(toRadians(cornerLat)) * Math.sin(deltaLon / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };
  const maxDistance = Math.max(
    distanceKm(south, west),
    distanceKm(south, east),
    distanceKm(north, west),
    distanceKm(north, east)
  );
  const radius = Math.min(50, Math.max(1, Math.ceil(maxDistance)));
  return { lat, lon, radius, coversBounds: maxDistance <= 50 };
}

function normalizeEstablishments(companies, bounds, source, businessType = null) {
  const activityCodes = businessType?.activityCodes;
  const sections = businessType?.sections;
  const bySiret = new Map();
  for (const company of companies) {
    for (const establishment of company.matching_etablissements || []) {
      if (establishment.etat_administratif !== 'A' || !establishment.siret) continue;
      const activity = establishment.activite_principale || company.activite_principale || '';
      if (activityCodes && !activityCodes.includes(activity)) continue;
      if (
        sections &&
        !sections.some((section) => {
          const code = activity.slice(0, 2);
          return section === 'G'
            ? code === '45' || code === '46' || code === '47'
            : section === 'I' && (code === '55' || code === '56');
        })
      ) {
        continue;
      }
      const lat = Number(establishment.latitude);
      const lon = Number(establishment.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || !inBounds(lat, lon, bounds)) continue;
      bySiret.set(establishment.siret, {
        key: `company/${establishment.siret}`,
        id: establishment.siret,
        type: 'company',
        source,
        sourceUrl: `https://annuaire-entreprises.data.gouv.fr/etablissement/${encodeURIComponent(establishment.siret)}`,
        lat,
        lon,
        name:
          establishment.nom_commercial ||
          establishment.liste_enseignes?.[0] ||
          company.nom_complet ||
          company.nom_raison_sociale ||
          'Unnamed establishment',
        kind:
          businessType && businessType.id !== 'all'
            ? businessType.label
            : `Company · NAF ${activity || 'not listed'}`,
        fullAddress: establishment.adresse || '',
        housenumber: '',
        street: '',
        postcode: establishment.code_postal || '',
        city: establishment.libelle_commune || '',
        hours: '',
        website: '',
        phone: '',
      });
    }
  }
  return [...bySiret.values()];
}

/** Active establishments matching a selected business type in the current map area, from SIRENE. */
export async function searchNearbyBusinesses(bounds, page = 1, signal, businessTypeId = 'all') {
  const point = boundsSearchPoint(bounds);
  const businessType = getBusinessType(businessTypeId);
  if (!businessType) throw new Error(`Unknown business type: ${businessTypeId}`);
  const params = new URLSearchParams({
    lat: String(point.lat),
    long: String(point.lon),
    radius: String(point.radius),
    per_page: '25',
    page: String(page),
    page_etablissements: '1',
    limite_matching_etablissements: '100',
  });
  if (businessType.activityCodes) {
    params.set('activite_principale', businessType.activityCodes.join(','));
  } else {
    params.set('section_activite_principale', businessType.sections.join(','));
  }
  const t = withTimeout(signal);
  try {
    const res = await fetch(`${NEARBY_COMPANIES_API}?${params}`, { signal: t.signal });
    if (!res.ok) throw new Error(`The French company-search API returned ${res.status}.`);
    const payload = await res.json();
    if (!Array.isArray(payload.results)) throw new Error('The French company-search API returned an unexpected response.');
    return {
      items: normalizeEstablishments(payload.results, bounds, 'API Recherche d’entreprises · SIRENE', businessType),
      page: payload.page || page,
      totalPages: payload.total_pages || 1,
      totalCompanies: payload.total_results || 0,
      radius: point.radius,
      coversBounds: point.coversBounds,
    };
  } finally {
    t.done();
  }
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
    return normalizeEstablishments(payload.results, bounds, 'API Recherche d’entreprises · SIRENE');
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
