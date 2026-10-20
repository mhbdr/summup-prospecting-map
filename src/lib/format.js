/** Street address from OSM-style fields. */
export function formatAddress({ fullAddress, housenumber, street, postcode, city }) {
  if (fullAddress) return fullAddress;
  const line1 = [housenumber, street].filter(Boolean).join(' ');
  const line2 = [postcode, city].filter(Boolean).join(' ');
  return [line1, line2].filter(Boolean).join(', ');
}

/**
 * Only allow http(s) links. OSM data is user-generated, so a "website" tag could contain
 * a javascript: URL. Returns a safe absolute URL or null.
 */
export function safeUrl(raw) {
  if (!raw) return null;
  let value = String(raw).trim();
  if (!value) return null;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(value)) value = 'https://' + value;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

export function hoursLines(raw) {
  if (!raw) return [];
  return String(raw)
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Haversine distance in metres. */
export function distanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function formatDistance(m) {
  if (m == null || Number.isNaN(m)) return '';
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`;
}

export function prettyKind(kind) {
  return String(kind ?? '').replace(/_/g, ' ');
}
