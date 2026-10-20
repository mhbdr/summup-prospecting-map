export const ADDRESS_SEARCH_ENDPOINT = 'https://api-adresse.data.gouv.fr/search/';

export function buildAddressSearchUrl(query) {
  const url = new URL(ADDRESS_SEARCH_ENDPOINT);
  url.searchParams.set('q', query.trim());
  url.searchParams.set('limit', '6');
  return url.toString();
}

export function normalizeAddressResults(payload) {
  if (!Array.isArray(payload?.features)) return [];

  return payload.features.flatMap((feature, index) => {
    const coordinates = feature?.geometry?.coordinates;
    const [lon, lat] = coordinates ?? [];
    const properties = feature?.properties ?? {};
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return [];

    return [{
      id: properties.id ?? `${lat},${lon},${index}`,
      title: properties.label ?? properties.name ?? 'Adresse sans nom',
      subtitle: [properties.postcode, properties.city].filter(Boolean).join(' '),
      lat,
      lon,
      source: 'api-adresse.data.gouv.fr',
    }];
  });
}

export function buildAlgoliaQueryUrl(applicationId, indexName) {
  if (!/^[A-Za-z0-9]+$/.test(applicationId)) {
    throw new Error('Application ID Algolia invalide.');
  }
  if (!indexName.trim()) throw new Error('Nom d’index Algolia manquant.');

  return `https://${applicationId}-dsn.algolia.net/1/indexes/${encodeURIComponent(indexName.trim())}/query`;
}

export function normalizeAlgoliaResults(payload) {
  if (!Array.isArray(payload?.hits)) return [];

  return payload.hits.map((hit, index) => {
    const coordinates = hit?._geoloc ?? hit?.location ?? {};
    const lat = Number(coordinates.lat);
    const lon = Number(coordinates.lng ?? coordinates.lon);
    const title = hit?.name ?? hit?.title ?? hit?.label ?? hit?.objectID ?? `Résultat ${index + 1}`;
    const subtitle = hit?.address ?? hit?.formatted_address ?? hit?.description ?? '';

    return {
      id: hit?.objectID ?? `algolia-${index}`,
      title: String(title),
      subtitle: String(subtitle),
      lat: Number.isFinite(lat) ? lat : null,
      lon: Number.isFinite(lon) ? lon : null,
      source: 'Algolia',
    };
  });
}
