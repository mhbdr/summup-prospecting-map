// OpenStreetMap Overpass API client: query building, parsing, throttling, retries and caching.

const DEFAULT_ENDPOINT = 'https://overpass-api.de/api/interpreter';
const FALLBACK_ENDPOINT = 'https://overpass.kumi.systems/api/interpreter';

export const RESULT_LIMIT = 300;
const REQUEST_TIMEOUT_MS = 30000;
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const CACHE_MAX_ENTRIES = 15;
const CACHE_STORAGE_KEY = 'paris-map.overpass-cache.v1';
const SNAP_STEP = 0.005; // ~500 m grid: nearby viewports share one cache entry

const config = { minGapMs: 1100 };
/** Test hook. */
export function __setMinGap(ms) {
  config.minGapMs = ms;
}

export function endpoints() {
  const custom = import.meta.env?.VITE_OVERPASS_URL;
  const list = [custom || DEFAULT_ENDPOINT, FALLBACK_ENDPOINT];
  return [...new Set(list)];
}

// ---------- geometry helpers ----------

/** Expand [s,w,n,e] outward to a coarse grid so small pans reuse cached data. */
export function snapBounds([s, w, n, e], step = SNAP_STEP) {
  const r = (v) => Math.round(v * 1e6) / 1e6;
  return [
    r(Math.floor(s / step) * step),
    r(Math.floor(w / step) * step),
    r(Math.ceil(n / step) * step),
    r(Math.ceil(e / step) * step),
  ];
}

export function boundsContain(outer, inner) {
  return inner[0] >= outer[0] && inner[1] >= outer[1] && inner[2] <= outer[2] && inner[3] <= outer[3];
}

// ---------- query building ----------

function overpassString(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function regexEscape(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function buildQuery(search, bounds, limit = RESULT_LIMIT) {
  const [s, w, n, e] = bounds;
  const bbox = `(${s},${w},${n},${e})`;
  let body;
  if (search.kind === 'category') {
    body = search.filters.map(([k, v]) => `  nwr["${overpassString(k)}"="${overpassString(v)}"]["name"]${bbox};`).join('\n');
  } else {
    const term = overpassString(regexEscape(search.term));
    body = ['shop', 'amenity', 'craft', 'office']
      .map((k) => `  nwr["name"~"${term}",i]["${k}"]${bbox};`)
      .join('\n');
  }
  return `[out:json][timeout:25];\n(\n${body}\n);\nout center tags ${limit};`;
}

// ---------- parsing ----------

export function parseElements(json) {
  const out = new Map();
  for (const el of json?.elements ?? []) {
    const t = el.tags ?? {};
    const name = t.name || t.brand || t.operator;
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (!name || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const key = `${el.type}/${el.id}`;
    if (out.has(key)) continue;
    out.set(key, {
      key,
      id: String(el.id),
      type: el.type,
      source: 'OpenStreetMap',
      sourceUrl: `https://www.openstreetmap.org/${el.type}/${el.id}`,
      lat,
      lon,
      name,
      kind: t.shop || t.amenity || t.craft || t.office || t.tourism || t.leisure || 'business',
      housenumber: t['addr:housenumber'] || '',
      street: t['addr:street'] || '',
      postcode: t['addr:postcode'] || '',
      city: t['addr:city'] || t['addr:town'] || '',
      hours: t.opening_hours || '',
      website: t.website || t['contact:website'] || t.url || '',
      phone: t.phone || t['contact:phone'] || '',
    });
  }
  return [...out.values()];
}

// ---------- cache ----------

const memory = new Map(); // key -> { t, data }
let storageLoaded = false;

function loadStorage() {
  if (storageLoaded) return;
  storageLoaded = true;
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(CACHE_STORAGE_KEY) : null;
    if (!raw) return;
    for (const [k, v] of Object.entries(JSON.parse(raw))) memory.set(k, v);
  } catch {
    /* corrupted or unavailable storage: ignore */
  }
}

function persistStorage() {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(Object.fromEntries(memory)));
  } catch {
    /* quota exceeded: keep the in-memory cache only */
  }
}

export function cacheKey(search, bounds) {
  return `${search.key}@${bounds.join(',')}`;
}

function cacheGet(key) {
  loadStorage();
  const hit = memory.get(key);
  if (!hit) return null;
  if (Date.now() - hit.t > CACHE_TTL_MS) {
    memory.delete(key);
    return null;
  }
  return hit.data;
}

function cacheSet(key, data) {
  loadStorage();
  memory.delete(key);
  memory.set(key, { t: Date.now(), data });
  while (memory.size > CACHE_MAX_ENTRIES) memory.delete(memory.keys().next().value);
  persistStorage();
}

export function __clearCache() {
  memory.clear();
  storageLoaded = true;
}

// ---------- network ----------

function abortError() {
  const err = new Error('Aborted');
  err.name = 'AbortError';
  return err;
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError());
    const id = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(id);
        reject(abortError());
      },
      { once: true }
    );
  });
}

let lastRequestAt = 0;
async function throttle(signal) {
  const wait = Math.max(0, config.minGapMs - (Date.now() - lastRequestAt));
  if (wait) await sleep(wait, signal);
  lastRequestAt = Date.now();
}

async function postQuery(url, query, signal) {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: 'data=' + encodeURIComponent(query),
      signal: controller.signal,
    });
    if (!res.ok) {
      const err = new Error(`Overpass returned ${res.status}`);
      err.status = res.status;
      throw err;
    }
    const json = await res.json();
    if (json.remark && !(json.elements?.length > 0)) throw new Error(`Overpass: ${json.remark}`);
    return json;
  } catch (err) {
    if (signal?.aborted) throw abortError();
    if (err.name === 'AbortError') throw new Error('Overpass request timed out');
    throw err;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

const inflight = new Map(); // cache key -> { promise, signal }

function fetchShared(search, bounds, signal) {
  const key = cacheKey(search, bounds);
  const cached = cacheGet(key);
  if (cached) return Promise.resolve({ ...cached, fromCache: true });
  const existing = inflight.get(key);
  if (existing && !existing.signal?.aborted) return existing.promise;

  const promise = (async () => {
    const query = buildQuery(search, bounds);
    let lastError;
    for (const url of endpoints()) {
      try {
        await throttle(signal);
        const json = await postQuery(url, query, signal);
        const items = parseElements(json);
        const data = { items, truncated: (json.elements?.length ?? 0) >= RESULT_LIMIT };
        cacheSet(key, data);
        return { ...data, fromCache: false };
      } catch (err) {
        if (err.name === 'AbortError') throw err;
        lastError = err; // 429 / 5xx / network: try the next mirror
      }
    }
    throw new Error(
      lastError?.status === 429
        ? 'Overpass is rate-limiting requests. Wait a few seconds and try again.'
        : `Could not load businesses (${lastError?.message ?? 'network error'}).`
    );
  })();

  const entry = { promise, signal };
  inflight.set(key, entry);
  const cleanup = () => {
    if (inflight.get(key) === entry) inflight.delete(key);
  };
  promise.then(cleanup, cleanup);
  return promise;
}

/**
 * Fetch businesses for a search inside the given (already snapped) bounds.
 * Resolves to { items, truncated, fromCache }. Identical concurrent requests share one network call.
 */
export async function fetchBusinesses(search, bounds, { signal } = {}) {
  try {
    return await fetchShared(search, bounds, signal);
  } catch (err) {
    // We joined a request that someone else cancelled, but we did not cancel: try again ourselves.
    if (err.name === 'AbortError' && !signal?.aborted) return fetchShared(search, bounds, signal);
    throw err;
  }
}
