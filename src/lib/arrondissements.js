// Approximate bounding boxes [south, west, north, east] of the 20 Paris arrondissements.
// They are used to zoom the map and as a fallback filter; when an OSM object has a
// postcode (75001-75020, plus 75116) that postcode is used instead, which is exact.
const BOXES = [
  [48.858, 2.32, 48.87, 2.348],
  [48.8639, 2.3375, 48.871, 2.356],
  [48.857, 2.349, 48.868, 2.368],
  [48.846, 2.348, 48.863, 2.372],
  [48.833, 2.338, 48.8545, 2.368],
  [48.839, 2.319, 48.857, 2.342],
  [48.843, 2.29, 48.865, 2.333],
  [48.862, 2.298, 48.882, 2.325],
  [48.87, 2.328, 48.884, 2.355],
  [48.864, 2.344, 48.885, 2.372],
  [48.847, 2.36, 48.87, 2.401],
  [48.82, 2.375, 48.859, 2.469],
  [48.81, 2.338, 48.846, 2.4],
  [48.812, 2.288, 48.845, 2.348],
  [48.82, 2.25, 48.853, 2.32],
  [48.826, 2.22, 48.88, 2.285],
  [48.874, 2.285, 48.896, 2.33],
  [48.88, 2.32, 48.902, 2.378],
  [48.878, 2.37, 48.91, 2.415],
  [48.84, 2.385, 48.878, 2.415],
];

const ordinal = (n) => (n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`);

export const ARRONDISSEMENTS = BOXES.map((bounds, i) => ({
  number: i + 1,
  label: `${ordinal(i + 1)} arrondissement`,
  bounds, // [s, w, n, e]
}));

export function getArrondissement(number) {
  return ARRONDISSEMENTS.find((a) => a.number === Number(number)) ?? null;
}

export function inBounds(lat, lon, [s, w, n, e]) {
  return lat >= s && lat <= n && lon >= w && lon <= e;
}

/** Does this business belong to the given arrondissement? */
export function matchesArrondissement(item, arr) {
  if (!arr) return true;
  const pc = Number(String(item.postcode ?? '').replace(/\s/g, ''));
  if (pc >= 75001 && pc <= 75020) return pc === 75000 + arr.number;
  if (pc === 75116) return arr.number === 16;
  return inBounds(item.lat, item.lon, arr.bounds);
}
