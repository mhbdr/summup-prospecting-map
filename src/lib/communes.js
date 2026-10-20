const API_URL = 'https://geo.api.gouv.fr/communes';
const cache = new Map();

export function normalizeCommuneName(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('fr');
}

export function parseCommunes(payload) {
  if (!Array.isArray(payload)) throw new Error('The French communes API returned an unexpected response.');
  return payload
    .map((commune) => {
      const [lon, lat] = commune.centre?.coordinates ?? [];
      if (!commune.code || !commune.nom || !Number.isFinite(lon) || !Number.isFinite(lat)) return null;
      return {
        code: commune.code,
        name: commune.nom,
        postcodes: Array.isArray(commune.codesPostaux) ? commune.codesPostaux : [],
        lat,
        lon,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}

export function matchCommune(query, communes) {
  const normalizedQuery = normalizeCommuneName(query);
  if (!normalizedQuery) return null;
  return communes.find((commune) => normalizeCommuneName(commune.name) === normalizedQuery) ?? null;
}

export async function fetchCommunes(departmentCode, signal) {
  if (cache.has(departmentCode)) return cache.get(departmentCode);
  const params = new URLSearchParams({
    codeDepartement: departmentCode,
    fields: 'nom,code,codesPostaux,centre',
    format: 'json',
    geometry: 'centre',
  });
  const response = await fetch(`${API_URL}?${params}`, { signal });
  if (!response.ok) throw new Error(`The French communes API returned ${response.status}.`);
  const communes = parseCommunes(await response.json());
  cache.set(departmentCode, communes);
  return communes;
}
