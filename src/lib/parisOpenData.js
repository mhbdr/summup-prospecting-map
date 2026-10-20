import { inBounds } from './arrondissements.js';
import { distanceMeters } from './format.js';
import { boundsSearchPoint } from './sources.js';

const API_ROOT = 'https://opendata.paris.fr/api/explore/v2.1/catalog/datasets';
const PAGE_SIZE = 100;
const MAX_RECORDS = 2000;
const TIMEOUT_MS = 25000;

export const PARIS_OPEN_DATA_SOURCES = [
  {
    id: 'terraces',
    label: 'Terraces & storefront permits',
    dataset: 'terrasses-autorisations',
    url: 'https://opendata.paris.fr/explore/dataset/terrasses-autorisations/',
    select: 'nom_enseigne,nom_societe,siret,adresse,arrondissement,typologie,geo_point_2d',
  },
  {
    id: 'waterPartners',
    label: 'Eau de Paris partner businesses',
    dataset: 'commerces-eau-de-paris',
    url: 'https://opendata.paris.fr/explore/dataset/commerces-eau-de-paris/',
    select: 'id,nom_commerce,num_voie,nom_voie,code_postal,nom_commune,geo_point_2d',
  },
];

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

function normalizedText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function businessSignature(item) {
  const name = normalizedText(item.name);
  const address = normalizedText(item.fullAddress || [item.housenumber, item.street, item.postcode, item.city].filter(Boolean).join(' '));
  return name && address ? `${name}|${address}` : null;
}

function sameLocatedBusiness(left, right) {
  return (
    normalizedText(left.name) !== '' &&
    normalizedText(left.name) === normalizedText(right.name) &&
    distanceMeters(left.lat, left.lon, right.lat, right.lon) <= 35
  );
}

/** Add source records while preserving earlier records and deduplicating shared SIRETs, addresses, and nearby names. */
export function addBusinessesWithoutDuplicates(current, incoming) {
  const next = new Map(current);
  const signatures = new Set();
  const locatedNames = new Map();
  for (const item of next.values()) {
    const signature = businessSignature(item);
    if (signature) signatures.add(signature);
    const name = normalizedText(item.name);
    if (name) locatedNames.set(name, [...(locatedNames.get(name) || []), item]);
  }
  for (const item of incoming) {
    const signature = businessSignature(item);
    const sameName = locatedNames.get(normalizedText(item.name)) || [];
    if (next.has(item.key) || (signature && signatures.has(signature)) || sameName.some((match) => sameLocatedBusiness(match, item))) continue;
    next.set(item.key, item);
    if (signature) signatures.add(signature);
    const name = normalizedText(item.name);
    if (name) locatedNames.set(name, [...(locatedNames.get(name) || []), item]);
  }
  return next;
}

function parisPoint(row) {
  const lat = Number(row.geo_point_2d?.lat);
  const lon = Number(row.geo_point_2d?.lon);
  return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
}

function stableId(sourceId, row, name, address, lat, lon) {
  const sourceRecordId = row.id;
  if (sourceRecordId != null && String(sourceRecordId).trim()) return String(sourceRecordId);
  return [sourceId, name, address, lat.toFixed(6), lon.toFixed(6)].map(normalizedText).join('-');
}

function normalizeTerrace(row, bounds, businessTypeId) {
  const point = parisPoint(row);
  const name = String(row.nom_enseigne || row.nom_societe || '').trim();
  if (!point || !inBounds(point.lat, point.lon, bounds) || !name) return null;
  if (
    (businessTypeId === 'restaurant' || businessTypeId === 'cafe') &&
    !String(row.typologie || '').toLocaleLowerCase('fr').includes('terrasse')
  ) return null;
  const siret = /^\d{14}$/.test(String(row.siret || '')) ? String(row.siret) : '';
  const address = String(row.adresse || '').trim();
  const postcode = String(row.arrondissement || '').trim();
  const id = siret || stableId('terrace', row, name, address, point.lat, point.lon);
  return {
    key: siret ? `company/${siret}` : `paris-open-data/terrace/${id}`,
    id,
    type: siret ? 'company' : 'paris-open-data',
    source: 'Ville de Paris Open Data · terrace authorization',
    sourceUrl: PARIS_OPEN_DATA_SOURCES[0].url,
    lat: point.lat,
    lon: point.lon,
    name,
    kind: `Terrace permit · ${row.typologie || 'authorized'}`,
    fullAddress: [address, postcode, 'Paris'].filter(Boolean).join(', '),
    housenumber: '',
    street: '',
    postcode,
    city: 'Paris',
    hours: '',
    website: '',
    phone: '',
  };
}

function normalizeWaterPartner(row, bounds) {
  const point = parisPoint(row);
  const name = String(row.nom_commerce || '').trim();
  if (!point || !inBounds(point.lat, point.lon, bounds) || !name) return null;
  const address = [row.num_voie, row.nom_voie].filter(Boolean).join(' ').trim();
  const postcode = /^\d{5}$/.test(String(row.code_postal || '')) ? String(row.code_postal) : '';
  const id = stableId('water-partner', row, name, address, point.lat, point.lon);
  return {
    key: `paris-open-data/water/${id}`,
    id,
    type: 'paris-open-data',
    source: 'Eau de Paris Open Data · partner business',
    sourceUrl: PARIS_OPEN_DATA_SOURCES[1].url,
    lat: point.lat,
    lon: point.lon,
    name,
    kind: 'Eau de Paris partner · category not specified',
    fullAddress: [address, postcode, row.nom_commune || 'Paris'].filter(Boolean).join(', '),
    housenumber: '',
    street: '',
    postcode,
    city: row.nom_commune || 'Paris',
    hours: '',
    website: '',
    phone: '',
  };
}

export function isParisSourceApplicable(sourceId, businessTypeId) {
  if (businessTypeId === 'all') return true;
  return sourceId === 'terraces' && (businessTypeId === 'restaurant' || businessTypeId === 'cafe');
}

function buildRecordsUrl(source, point, offset) {
  const params = new URLSearchParams({
    limit: String(PAGE_SIZE),
    offset: String(offset),
    select: source.select,
    where: `within_distance(geo_point_2d,geom'POINT(${point.lon} ${point.lat})',${point.radius * 1000})`,
  });
  return `${API_ROOT}/${source.dataset}/records?${params}`;
}

async function fetchSource(source, bounds, businessTypeId, signal) {
  const point = boundsSearchPoint(bounds);
  const timeout = withTimeout(signal);
  const normalize = source.id === 'terraces'
    ? (row) => normalizeTerrace(row, bounds, businessTypeId)
    : (row) => normalizeWaterPartner(row, bounds);
  const items = [];
  let totalCount = 0;
  try {
    for (let offset = 0; offset < MAX_RECORDS; offset += PAGE_SIZE) {
      const response = await fetch(buildRecordsUrl(source, point, offset), { signal: timeout.signal });
      if (!response.ok) throw new Error(`Paris Open Data (${source.label}) returned ${response.status}.`);
      const payload = await response.json();
      if (!Array.isArray(payload.results) || !Number.isFinite(payload.total_count)) {
        throw new Error(`Paris Open Data (${source.label}) returned an unexpected response.`);
      }
      totalCount = payload.total_count;
      items.push(...payload.results.map((row) => normalize(row, bounds)).filter(Boolean));
      if (payload.results.length < PAGE_SIZE || offset + PAGE_SIZE >= totalCount) break;
    }
    return {
      items,
      totalCount,
      capped: totalCount > MAX_RECORDS,
    };
  } finally {
    timeout.done();
  }
}

/** Search only the requested Paris open datasets, with a 2,000-record cap per source. */
export async function searchParisOpenData(bounds, sourceIds, businessTypeId, signal) {
  const requested = PARIS_OPEN_DATA_SOURCES.filter(
    (source) => sourceIds.includes(source.id) && isParisSourceApplicable(source.id, businessTypeId)
  );
  const results = await Promise.all(
    requested.map(async (source) => ({
      sourceId: source.id,
      label: source.label,
      ...(await fetchSource(source, bounds, businessTypeId, signal)),
    }))
  );
  return results;
}
