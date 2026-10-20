"use strict";

const DEPARTMENTS = {
  all: { name: "Île-de-France", center: [48.75, 2.35], zoom: 9 },
  "75": { name: "Paris", bounds: [[48.815, 2.224], [48.902, 2.469]] },
  "77": { name: "Seine-et-Marne", bounds: [[48.12, 2.39], [49.12, 3.56]] },
  "78": { name: "Yvelines", bounds: [[48.438, 1.446], [49.10, 2.23]] },
  "91": { name: "Essonne", bounds: [[48.285, 1.91], [48.777, 2.59]] },
  "92": { name: "Hauts-de-Seine", bounds: [[48.728, 2.179], [48.95, 2.337]] },
  "93": { name: "Seine-Saint-Denis", bounds: [[48.807, 2.29], [48.972, 2.603]] },
  "94": { name: "Val-de-Marne", bounds: [[48.687, 2.316], [48.861, 2.575]] },
  "95": { name: "Val-d'Oise", bounds: [[48.91, 1.61], [49.24, 2.59]] }
};

const OSM_MAP_API = "https://api.openstreetmap.org/api/0.6/map";
const PARIS_PARTNERS_API = "https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/commerces-eau-de-paris/exports/json";
const COMPANY_SEARCH_API = "https://recherche-entreprises.api.gouv.fr/search";
const COMPANY_SEARCH_DEPARTMENTS = ["75", "77", "78", "91", "92", "93", "94", "95"];
const MAX_SEARCH_AREA_DEGREES = 0.00002;
const SEARCH_TIMEOUT_MS = 25000;
const STORAGE_KEY = "field-finder.records.v1";
const FOOD_AMENITIES = new Set(["restaurant", "cafe", "fast_food", "bar", "pub", "ice_cream", "food_court"]);

const elements = {
  department: document.querySelector("#department"),
  category: document.querySelector("#category"),
  search: document.querySelector("#search-button"),
  companyQuery: document.querySelector("#company-query"),
  companySearch: document.querySelector("#company-search-button"),
  locate: document.querySelector("#locate-button"),
  count: document.querySelector("#result-count"),
  message: document.querySelector("#result-message"),
  list: document.querySelector("#business-list"),
  dialog: document.querySelector("#business-dialog"),
  dialogName: document.querySelector("#dialog-name"),
  dialogAddress: document.querySelector("#dialog-address"),
  payment: document.querySelector("#payment-status"),
  visit: document.querySelector("#visit-status"),
  notes: document.querySelector("#business-notes"),
  directions: document.querySelector("#directions-link"),
  osm: document.querySelector("#osm-link"),
  export: document.querySelector("#export-button"),
  googleButton: document.querySelector("#google-maps-button"),
  googleDialog: document.querySelector("#google-maps-dialog"),
  googleKey: document.querySelector("#google-maps-key"),
  saveGoogleKey: document.querySelector("#save-google-key-button"),
  useOpenMap: document.querySelector("#use-open-map-button"),
  closeGoogleDialog: document.querySelector("#close-google-dialog"),
  mapNote: document.querySelector("#map-note"),
  toast: document.querySelector("#toast")
};

const GOOGLE_KEY_STORAGE = "field-finder.google-maps-key.v1";
let map;
let mapEngine = "leaflet";
let markerLayer;
let googleInfoWindow;
let businessMarkers = [];
let businesses = [];
let activeBusinessId = null;
let toastTimeout;
let requestController = null;
let companyRequestController = null;
let parisPartnersCache = null;

function initLeafletMap(center = DEPARTMENTS.all.center, zoom = DEPARTMENTS.all.zoom) {
  mapEngine = "leaflet";
  map = L.map("map", { zoomControl: false }).setView(center, zoom);
  L.control.zoom({ position: "bottomright" }).addTo(map);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);
  markerLayer = L.layerGroup().addTo(map);
}

function currentMapCenter() {
  const center = map.getCenter();
  return [typeof center.lat === "function" ? center.lat() : center.lat, typeof center.lng === "function" ? center.lng() : center.lng];
}

function setMapView(point, zoom) {
  if (mapEngine === "google") {
    map.setCenter({ lat: point[0], lng: point[1] });
    if (Number.isFinite(zoom)) map.setZoom(zoom);
  } else {
    map.setView(point, zoom);
  }
}

function getMapZoom() {
  return map.getZoom();
}

function fitMapBounds(bounds) {
  if (mapEngine === "google") {
    map.fitBounds(new google.maps.LatLngBounds(
      { lat: bounds[0][0], lng: bounds[0][1] },
      { lat: bounds[1][0], lng: bounds[1][1] }
    ), 18);
  } else {
    map.fitBounds(bounds, { padding: [18, 18] });
  }
}

function clearBusinessMarkers() {
  if (mapEngine === "google") {
    if (googleInfoWindow) googleInfoWindow.close();
    businessMarkers.forEach(marker => marker.setMap(null));
    businessMarkers = [];
  } else {
    markerLayer.clearLayers();
  }
}

function loadGoogleMapsApi(apiKey) {
  return new Promise((resolve, reject) => {
    if (window.google?.maps) {
      resolve();
      return;
    }
    window.gm_authFailure = () => {
      const message = "Google Maps authentication failed. Check your API key, billing, API restrictions, and allowed referrer.";
      elements.mapNote.textContent = message;
      showToast(message);
    };
    const callbackName = "fieldFinderGoogleMapsReady";
    const timeout = window.setTimeout(() => reject(new Error("Google Maps did not load in time. Check the API key, billing, and network connection.")), 20000);
    window[callbackName] = () => {
      window.clearTimeout(timeout);
      delete window[callbackName];
      resolve();
    };
    const script = document.createElement("script");
    script.async = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&callback=${callbackName}&loading=async&v=weekly`;
    script.onerror = () => {
      window.clearTimeout(timeout);
      delete window[callbackName];
      reject(new Error("Google Maps could not load. Check the API key and network connection."));
    };
    document.head.append(script);
  });
}

function switchToGoogleMaps() {
  const center = currentMapCenter();
  const zoom = getMapZoom();
  if (mapEngine === "leaflet") map.remove();
  document.querySelector("#map").replaceChildren();
  mapEngine = "google";
  map = new google.maps.Map(document.querySelector("#map"), {
    center: { lat: center[0], lng: center[1] },
    zoom,
    mapTypeControl: true,
    streetViewControl: false,
    fullscreenControl: true,
    clickableIcons: false
  });
  googleInfoWindow = new google.maps.InfoWindow();
  clearBusinessMarkers();
  renderBusinesses();
  elements.mapNote.textContent = "Map: Google Maps · Shop listings: OpenStreetMap contributors";
  elements.googleButton.textContent = "Google Maps active";
  elements.googleButton.disabled = false;
  window.requestAnimationFrame(invalidateMapSize);
}

function initializeMapProvider() {
  initLeafletMap();
  let apiKey = "";
  try {
    apiKey = localStorage.getItem(GOOGLE_KEY_STORAGE) || "";
  } catch (error) {
    console.error("Could not read Google Maps API key.", error);
    showToast("Browser storage is unavailable. Use OpenStreetMap or enable local storage.");
  }
  if (!apiKey) return;
  elements.googleButton.textContent = "Loading Google Maps…";
  loadGoogleMapsApi(apiKey)
    .then(switchToGoogleMaps)
    .catch(error => {
      elements.googleButton.textContent = "Set up Google Maps";
      console.error("Google Maps could not be initialized.", error);
      showToast(`${error.message} Showing OpenStreetMap instead.`);
    });
}

initializeMapProvider();

function invalidateMapSize() {
  if (!map) return;
  if (mapEngine === "google") {
    const center = currentMapCenter();
    google.maps.event.trigger(map, "resize");
    map.setCenter({ lat: center[0], lng: center[1] });
  } else {
    map.invalidateSize({ pan: false, debounceMoveend: true });
  }
}

const mapResizeObserver = new ResizeObserver(() => window.requestAnimationFrame(invalidateMapSize));
mapResizeObserver.observe(document.querySelector("#map"));
window.requestAnimationFrame(invalidateMapSize);

function readRecords() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch (error) {
    console.error("Could not read saved prospecting records.", error);
    showToast("Saved records could not be read. Your current session still works.");
    return {};
  }
}

let records = readRecords();

function saveRecords() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch (error) {
    console.error("Could not save prospecting records.", error);
    showToast("Could not save changes on this device. Check browser storage settings.");
  }
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("is-visible");
  window.clearTimeout(toastTimeout);
  toastTimeout = window.setTimeout(() => elements.toast.classList.remove("is-visible"), 3500);
}

function keyFor(business) {
  return `${business.type}/${business.id}`;
}

function businessName(business) {
  return business.tags.name || business.tags.brand || business.tags.operator || "Unnamed business";
}

function businessType(business) {
  if (business.source === "Paris Open Data") return "Eau de Paris water-refill partner";
  if (business.source === "API Recherche d’entreprises") return `Company · NAF ${business.tags.activity || "activity not listed"}`;
  const tags = business.tags;
  if (tags.shop) return `Shop · ${humanize(tags.shop)}`;
  if (tags.amenity) return humanize(tags.amenity);
  if (tags.craft) return `Craft · ${humanize(tags.craft)}`;
  if (tags.office) return `Office · ${humanize(tags.office)}`;
  return "Local business";
}

function humanize(value) {
  return String(value).replaceAll("_", " ").replace(/\b\w/g, letter => letter.toUpperCase());
}

function addressFor(business) {
  const tags = business.tags;
  if (tags.fullAddress) return tags.fullAddress;
  const street = [tags["addr:housenumber"], tags["addr:street"]].filter(Boolean).join(" ");
  const locality = [tags["addr:postcode"], tags["addr:city"] || tags["addr:town"]].filter(Boolean).join(" ");
  return [street, locality].filter(Boolean).join(", ") || "Address not listed";
}

function coordinatesFor(element) {
  if (Number.isFinite(element.lat) && Number.isFinite(element.lon)) return [element.lat, element.lon];
  if (element.center && Number.isFinite(element.center.lat) && Number.isFinite(element.center.lon)) {
    return [element.center.lat, element.center.lon];
  }
  return null;
}

function categoryMatches(business, category) {
  if (category === "all") return true;
  const tags = business.tags;
  if (business.source === "API Recherche d’entreprises") {
    const code = tags.activity || "";
    if (category === "shop") return code.startsWith("47");
    if (category === "food") return code.startsWith("55") || code.startsWith("56");
    if (category === "service") return !code.startsWith("47") && !code.startsWith("55") && !code.startsWith("56");
  }
  if (business.source === "Paris Open Data") return category === "all";
  if (category === "shop") return Boolean(tags.shop);
  if (category === "food") return FOOD_AMENITIES.has(tags.amenity) || tags.shop === "bakery" || tags.shop === "convenience" || tags.shop === "coffee";
  if (category === "service") return Boolean(tags.craft || tags.office);
  return true;
}

function paymentRecord(business) {
  return records[keyFor(business)] || { payment: "unknown", visit: "not-visited", notes: "" };
}

function paymentLabel(status) {
  return {
    unknown: "Payment unverified",
    cash: "Cash only · verified",
    card: "Card accepted · verified",
    both: "Cash + card · verified"
  }[status] || "Payment unverified";
}

function visitLabel(status) {
  return {
    "not-visited": "Not visited",
    visited: "Visited",
    interested: "Interested",
    "follow-up": "Follow-up",
    "not-interested": "Not interested"
  }[status] || "Not visited";
}

function createMarker(business) {
  const popupContent =
    `<p class="popup-title">${escapeHtml(businessName(business))}</p>` +
    `<p class="popup-detail">${escapeHtml(businessType(business))}</p>` +
    `<p class="popup-detail">${escapeHtml(business.source || "OpenStreetMap")}</p>` +
    `<p class="popup-detail">${escapeHtml(paymentLabel(paymentRecord(business).payment))}</p>` +
    `<button class="popup-button" type="button">View details &amp; plan visit</button>`;

  if (mapEngine === "google") {
    const marker = new google.maps.Marker({
      map,
      position: { lat: business.coordinates[0], lng: business.coordinates[1] },
      title: businessName(business),
      label: { text: "•", color: "#ffffff", fontSize: "18px", fontWeight: "700" },
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 10,
        fillColor: "#2e6b50",
        fillOpacity: 1,
        strokeColor: "#ffffff",
        strokeWeight: 2
      }
    });
    marker.addListener("click", () => {
      const content = document.createElement("div");
      content.innerHTML = popupContent;
      content.querySelector(".popup-button").addEventListener("click", () => openBusiness(keyFor(business)));
      googleInfoWindow.setContent(content);
      googleInfoWindow.open({ map, anchor: marker });
    });
    businessMarkers.push(marker);
    return;
  }

  const markerIcon = L.divIcon({
    className: "",
    html: '<div class="shop-marker"><span>•</span></div>',
    iconSize: [29, 29],
    iconAnchor: [14, 25]
  });
  const marker = L.marker(business.coordinates, { icon: markerIcon });
  marker.bindPopup(popupContent);
  marker.on("popupopen", event => {
    const button = event.popup.getElement().querySelector(".popup-button");
    button.addEventListener("click", () => openBusiness(keyFor(business)));
  });
  marker.addTo(markerLayer);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function renderBusinesses() {
  const category = elements.category.value;
  const visible = businesses.filter(business => categoryMatches(business, category));
  elements.count.textContent = String(visible.length);
  elements.list.replaceChildren();
  clearBusinessMarkers();

  if (businesses.length === 0) {
    return;
  }
  if (visible.length === 0) {
    elements.message.textContent = "No businesses match this type in the current map area.";
    return;
  }
  const sourceCounts = visible.reduce((counts, business) => {
    const source = business.source || "OpenStreetMap";
    counts[source] = (counts[source] || 0) + 1;
    return counts;
  }, {});
  const sourceSummary = Object.entries(sourceCounts).map(([source, count]) => `${count} ${source}`).join(" · ");
  elements.message.textContent = `${visible.length} result${visible.length === 1 ? "" : "s"} in the visible map area · ${sourceSummary}.`;

  const fragment = document.createDocumentFragment();
  visible.forEach(business => {
    const record = paymentRecord(business);
    const key = keyFor(business);
    const card = document.createElement("button");
    card.type = "button";
    card.className = `business-card${activeBusinessId === key ? " is-active" : ""}`;
    card.innerHTML =
      `<span class="card-heading"><strong>${escapeHtml(businessName(business))}</strong>` +
      `<span class="status-chip${record.payment === "unknown" ? "" : " verified"}"><span class="legend-dot"></span>${escapeHtml(record.payment === "unknown" ? "Unverified" : "Verified")}</span></span>` +
      `<span class="card-type">${escapeHtml(businessType(business))}</span>` +
      `<span class="card-source">${escapeHtml(business.source || "OpenStreetMap")}</span>` +
      `<span class="card-meta"><span>${escapeHtml(addressFor(business))}</span><span>${escapeHtml(visitLabel(record.visit))}</span></span>`;
    card.addEventListener("click", () => {
      activeBusinessId = key;
      setMapView(business.coordinates, Math.max(getMapZoom(), 16));
      renderBusinesses();
      openBusiness(key);
    });
    fragment.append(card);
    createMarker(business);
  });
  elements.list.append(fragment);
}

function openBusiness(id) {
  const business = businesses.find(item => keyFor(item) === id);
  if (!business) return;
  activeBusinessId = id;
  const record = paymentRecord(business);
  elements.dialogName.textContent = businessName(business);
  elements.dialogAddress.textContent = `${businessType(business)} · ${addressFor(business)}`;
  elements.payment.value = record.payment;
  elements.visit.value = record.visit;
  elements.notes.value = record.notes;
  elements.directions.href = `https://www.google.com/maps/dir/?api=1&destination=${business.coordinates[0]},${business.coordinates[1]}`;
  elements.osm.href = business.sourceUrl || `https://www.openstreetmap.org/${encodeURIComponent(business.type)}/${business.id}`;
  elements.dialog.dataset.businessId = id;
  elements.dialog.showModal();
  renderBusinesses();
}

function updateActiveRecord(field, value) {
  const id = elements.dialog.dataset.businessId;
  if (!id) return;
  const existing = records[id] || { payment: "unknown", visit: "not-visited", notes: "" };
  const business = businesses.find(item => keyFor(item) === id);
  records[id] = {
    ...existing,
    ...(business ? { business } : {}),
    [field]: value,
    updatedAt: new Date().toISOString()
  };
  saveRecords();
  if (field !== "notes") renderBusinesses();
}

function boundsForVisibleMap() {
  const bounds = map.getBounds();
  if (!bounds) throw new Error("The map view is not ready yet. Please try searching again.");
  let south, west, north, east;
  if (mapEngine === "google") {
    const southWest = bounds.getSouthWest();
    const northEast = bounds.getNorthEast();
    south = southWest.lat();
    west = southWest.lng();
    north = northEast.lat();
    east = northEast.lng();
  } else {
    south = bounds.getSouth();
    west = bounds.getWest();
    north = bounds.getNorth();
    east = bounds.getEast();
  }
  const area = (north - south) * (east - west);
  if (!Number.isFinite(area) || area <= 0) throw new Error("The current map area is invalid. Move or zoom the map and try again.");
  if (area > MAX_SEARCH_AREA_DEGREES) {
    throw new Error("Zoom in to a neighborhood of a few streets before searching. This keeps the OpenStreetMap request small and reliable.");
  }
  return { south, west, north, east };
}

function tagsForElement(element) {
  const tags = {};
  for (const tag of element.children) {
    if (tag.tagName === "tag") tags[tag.getAttribute("k")] = tag.getAttribute("v");
  }
  return tags;
}

function parseOsmMap(xmlText) {
  const xml = new DOMParser().parseFromString(xmlText, "application/xml");
  if (xml.querySelector("parsererror")) throw new Error("OpenStreetMap returned invalid map data.");

  const nodeCoordinates = new Map();
  for (const node of xml.getElementsByTagName("node")) {
    const lat = Number(node.getAttribute("lat"));
    const lon = Number(node.getAttribute("lon"));
    if (Number.isFinite(lat) && Number.isFinite(lon)) nodeCoordinates.set(node.getAttribute("id"), [lat, lon]);
  }

  const results = [];
  for (const element of xml.querySelectorAll("node, way")) {
    const tags = tagsForElement(element);
    if (!tags.shop && !tags.craft && !tags.office && !FOOD_AMENITIES.has(tags.amenity)) continue;

    let coordinates;
    if (element.tagName === "node") {
      coordinates = nodeCoordinates.get(element.getAttribute("id"));
    } else {
      const points = [...element.getElementsByTagName("nd")]
        .map(reference => nodeCoordinates.get(reference.getAttribute("ref")))
        .filter(Boolean);
      if (!points.length) continue;
      coordinates = [
        points.reduce((sum, point) => sum + point[0], 0) / points.length,
        points.reduce((sum, point) => sum + point[1], 0) / points.length
      ];
    }

    if (!coordinates) continue;
    results.push({
      id: element.getAttribute("id"),
      type: element.tagName,
      coordinates,
      tags,
      source: "OpenStreetMap"
    });
  }
  return results;
}

function overlapsParis(bounds) {
  const [[south, west], [north, east]] = DEPARTMENTS["75"].bounds;
  return bounds.north >= south && bounds.south <= north && bounds.east >= west && bounds.west <= east;
}

async function fetchParisPartners(signal) {
  if (!parisPartnersCache) {
    const response = await fetch(PARIS_PARTNERS_API, { signal });
    if (!response.ok) throw new Error(`Paris Open Data returned ${response.status} ${response.statusText}.`);
    const payload = await response.json();
    if (!Array.isArray(payload)) throw new Error("Paris Open Data returned an unexpected business-list format.");
    parisPartnersCache = payload.map(record => ({
      id: String(record.id),
      type: "paris",
      coordinates: [Number(record.lat), Number(record.lon)],
      source: "Paris Open Data",
      sourceUrl: "https://opendata.paris.fr/explore/dataset/commerces-eau-de-paris/",
      tags: {
        name: record.nom_commerce || "Unnamed Paris open-data partner",
        fullAddress: [record.num_voie, record.nom_voie, record.nom_commune].filter(Boolean).join(" ") || "Address not listed",
        "addr:postcode": record.code_postal && record.code_postal !== "0" ? record.code_postal : "",
        "addr:city": record.nom_commune || "Paris"
      }
    })).filter(record => record.coordinates.every(Number.isFinite));
  }
  return parisPartnersCache;
}

function inBounds(business, bounds) {
  const [lat, lon] = business.coordinates;
  return lat >= bounds.south && lat <= bounds.north && lon >= bounds.west && lon <= bounds.east;
}

function getRegistryDepartments() {
  if (elements.department.value !== "all") return elements.department.value;
  const center = currentMapCenter();
  const likelyDepartment = Object.entries(DEPARTMENTS)
    .filter(([code]) => code !== "all")
    .find(([, department]) => {
      if (!department.bounds) return false;
      const [[south, west], [north, east]] = department.bounds;
      return center[0] >= south && center[0] <= north && center[1] >= west && center[1] <= east;
    });
  return likelyDepartment ? likelyDepartment[0] : COMPANY_SEARCH_DEPARTMENTS.join(",");
}

function parseCompanySearch(payload, bounds) {
  if (!Array.isArray(payload.results)) throw new Error("The company-search API returned an unexpected response.");
  const businessesBySiret = new Map();
  for (const company of payload.results) {
    for (const establishment of company.matching_etablissements || []) {
      if (establishment.etat_administratif !== "A") continue;
      const coordinates = [Number(establishment.latitude), Number(establishment.longitude)];
      if (!coordinates.every(Number.isFinite)) continue;
      const siret = establishment.siret;
      if (!siret) continue;
      const business = {
        id: siret,
        type: "company",
        coordinates,
        source: "API Recherche d’entreprises",
        sourceUrl: `https://annuaire-entreprises.data.gouv.fr/etablissement/${encodeURIComponent(siret)}`,
        tags: {
          name: establishment.nom_commercial || company.nom_complet || company.nom_raison_sociale || "Unnamed establishment",
          fullAddress: establishment.adresse || "Address not listed",
          activity: establishment.activite_principale || company.activite_principale || "",
          siret,
          siren: company.siren || ""
        }
      };
      if (inBounds(business, bounds)) businessesBySiret.set(siret, business);
    }
  }
  return [...businessesBySiret.values()];
}

async function searchVisibleArea() {
  if (requestController) requestController.abort();
  if (companyRequestController) {
    companyRequestController.abort();
    companyRequestController = null;
    elements.companySearch.disabled = false;
    elements.companySearch.textContent = "Add company results";
  }
  const controller = new AbortController();
  requestController = controller;
  const signal = controller.signal;
  elements.search.disabled = true;
  elements.search.textContent = "Searching…";
  elements.message.textContent = "Loading local map listings and Paris open-data partners…";
  elements.list.replaceChildren();
  businesses = [];
  renderBusinesses();

  const timeout = window.setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);
  try {
    const bounds = boundsForVisibleMap();
    const params = new URLSearchParams({
      bbox: [bounds.west, bounds.south, bounds.east, bounds.north].map(value => value.toFixed(6)).join(",")
    });
    const [osmResult, parisResult] = await Promise.allSettled([
      fetch(`${OSM_MAP_API}?${params}`, { signal }).then(async response => {
        if (!response.ok) {
          if (response.status === 400) {
            throw new Error("This area has too much map detail for one search. Zoom in further and try a smaller neighborhood.");
          }
          throw new Error(`OpenStreetMap map data returned ${response.status} ${response.statusText}.`);
        }
        return parseOsmMap(await response.text());
      }),
      overlapsParis(bounds) ? fetchParisPartners(signal) : Promise.resolve([])
    ]);
    if (osmResult.status === "rejected") throw osmResult.reason;
    const parisBusinesses = parisResult.status === "fulfilled"
      ? parisResult.value.filter(business => inBounds(business, bounds))
      : [];
    businesses = [...osmResult.value.filter(business => inBounds(business, bounds)), ...parisBusinesses]
      .sort((left, right) => businessName(left).localeCompare(businessName(right)));
    if (parisResult.status === "rejected" && !signal.aborted) {
      console.error("Paris Open Data search failed.", parisResult.reason);
      showToast("Paris Open Data was unavailable; showing OpenStreetMap results.");
    }
    elements.message.textContent = businesses.length
      ? `${businesses.length} local results from the selected data sources.`
      : "No businesses were listed in this map area. Try moving the map slightly and searching again.";
    renderBusinesses();
  } catch (error) {
    if (signal.aborted) return;
    console.error("Business search failed.", error);
    const message = error.name === "AbortError"
      ? "The OpenStreetMap request timed out. Try a smaller area and search again."
      : error.message || "The OpenStreetMap data service is temporarily unavailable.";
    elements.message.textContent = message;
    showToast(message);
  } finally {
    window.clearTimeout(timeout);
    if (requestController?.signal === signal) {
      requestController = null;
      elements.search.disabled = false;
      elements.search.textContent = "Search this map area";
    }
  }
}

async function searchCompanyRegistry() {
  const query = elements.companyQuery.value.trim();
  if (!query) {
    showToast("Enter a business or activity keyword, such as “boulangerie” or “restaurant”.");
    elements.companyQuery.focus();
    return;
  }
  if (companyRequestController) companyRequestController.abort();
  const controller = new AbortController();
  companyRequestController = controller;
  const signal = controller.signal;
  elements.companySearch.disabled = true;
  elements.companySearch.textContent = "Searching…";
  elements.message.textContent = `Searching the French company register for “${query}”…`;
  let timeout;
  try {
    const bounds = boundsForVisibleMap();
    const params = new URLSearchParams({
      q: query,
      departement: getRegistryDepartments(),
      per_page: "25",
      page: "1",
      page_etablissements: "1",
      limite_matching_etablissements: "100"
    });
    timeout = window.setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);
    const response = await fetch(`${COMPANY_SEARCH_API}?${params}`, { signal });
    if (!response.ok) throw new Error(`The French company-search API returned ${response.status} ${response.statusText}.`);
    const payload = await response.json();
    const found = parseCompanySearch(payload, bounds);
    const existing = new Map(
      businesses
        .filter(business => inBounds(business, bounds))
        .map(business => [keyFor(business), business])
    );
    for (const business of found) existing.set(keyFor(business), business);
    businesses = [...existing.values()].sort((left, right) => businessName(left).localeCompare(businessName(right)));
    renderBusinesses();
    elements.message.textContent = found.length
      ? `${found.length} active establishment${found.length === 1 ? "" : "s"} matched “${query}” in this map area. The API returns up to 25 companies per search.`
      : `No matching active establishments for “${query}” were returned in this map area. Try another keyword or search a nearby area.`;
  } catch (error) {
    if (signal.aborted) return;
    console.error("Company registry search failed.", error);
    const message = error.name === "AbortError"
      ? "The company-search request timed out. Please try again."
      : error.message || "The company-search API is temporarily unavailable.";
    elements.message.textContent = message;
    showToast(message);
  } finally {
    if (timeout) window.clearTimeout(timeout);
    if (companyRequestController?.signal === signal) {
      companyRequestController = null;
      elements.companySearch.disabled = false;
      elements.companySearch.textContent = "Add company results";
    }
  }
}

function fitDepartment(value) {
  const department = DEPARTMENTS[value];
  if (!department) return;
  if (requestController) {
    requestController.abort();
    requestController = null;
    elements.search.disabled = false;
    elements.search.textContent = "Search this map area";
  }
  if (companyRequestController) {
    companyRequestController.abort();
    companyRequestController = null;
    elements.companySearch.disabled = false;
    elements.companySearch.textContent = "Add company results";
  }
  if (department.bounds) fitMapBounds(department.bounds);
  else setMapView(department.center, department.zoom);
  businesses = [];
  clearBusinessMarkers();
  elements.list.replaceChildren();
  elements.count.textContent = "0";
  elements.message.textContent = `Showing ${department.name}. Zoom into a neighborhood and search the visible map.`;
}

function locateUser() {
  if (!navigator.geolocation) {
    showToast("Location is not available in this browser.");
    return;
  }
  elements.locate.disabled = true;
  navigator.geolocation.getCurrentPosition(
    position => {
      const point = [position.coords.latitude, position.coords.longitude];
      setMapView(point, 15);
      if (mapEngine === "google") {
        new google.maps.Marker({
          map,
          position: { lat: point[0], lng: point[1] },
          title: "You are here",
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 8,
            fillColor: "#3278bd",
            fillOpacity: 1,
            strokeColor: "#ffffff",
            strokeWeight: 3
          }
        });
      } else {
        L.circleMarker(point, {
          radius: 8, color: "#fff", weight: 3, fillColor: "#3278bd", fillOpacity: 1
        }).addTo(map).bindPopup("You are here").openPopup();
      }
      elements.locate.disabled = false;
    },
    error => {
      elements.locate.disabled = false;
      showToast(error.code === error.PERMISSION_DENIED
        ? "Location permission was denied. You can still search by moving the map."
        : "Could not determine your location. Try again or move the map manually.");
    },
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
  );
}

function exportRecords() {
  const headers = ["Source", "Record type", "Record ID", "Business", "Business type", "Latitude", "Longitude", "Address", "Payment", "Visit status", "Notes", "Updated"];
  const rows = Object.entries(records).map(([key, record]) => {
    const [type, id] = key.split("/");
    const business = businesses.find(item => keyFor(item) === key) || record.business;
    const coords = business?.coordinates || ["", ""];
    return [
      business?.source || record.business?.source || "", type, id, business ? businessName(business) : "",
      business ? businessType(business) : "",
      coords[0], coords[1], business ? addressFor(business) : "",
      paymentLabel(record.payment), visitLabel(record.visit), record.notes || "", record.updatedAt || ""
    ];
  });
  if (!rows.length) {
    showToast("There are no saved visit records to export yet.");
    return;
  }
  const csv = [headers, ...rows].map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\r\n");
  const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `field-finder-leads-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function openGoogleMapsSettings() {
  try {
    elements.googleKey.value = localStorage.getItem(GOOGLE_KEY_STORAGE) || "";
  } catch (error) {
    console.error("Could not read Google Maps API key.", error);
    showToast("Could not access this browser's local storage.");
    return;
  }
  elements.googleDialog.showModal();
}

function saveGoogleMapsKey() {
  const apiKey = elements.googleKey.value.trim();
  if (!apiKey) {
    showToast("Enter a Google Maps Platform API key first.");
    elements.googleKey.focus();
    return;
  }
  try {
    localStorage.setItem(GOOGLE_KEY_STORAGE, apiKey);
  } catch (error) {
    console.error("Could not save Google Maps API key.", error);
    showToast("Could not save the API key in this browser.");
    return;
  }
  window.location.reload();
}

function useOpenStreetMap() {
  try {
    localStorage.removeItem(GOOGLE_KEY_STORAGE);
  } catch (error) {
    console.error("Could not remove Google Maps API key.", error);
    showToast("Could not remove the key from this browser's local storage.");
    return;
  }
  window.location.reload();
}

elements.department.addEventListener("change", event => fitDepartment(event.target.value));
elements.category.addEventListener("change", renderBusinesses);
elements.search.addEventListener("click", searchVisibleArea);
elements.companySearch.addEventListener("click", searchCompanyRegistry);
elements.companyQuery.addEventListener("keydown", event => {
  if (event.key === "Enter") {
    event.preventDefault();
    searchCompanyRegistry();
  }
});
elements.locate.addEventListener("click", locateUser);
elements.export.addEventListener("click", exportRecords);
elements.googleButton.addEventListener("click", openGoogleMapsSettings);
elements.saveGoogleKey.addEventListener("click", saveGoogleMapsKey);
elements.useOpenMap.addEventListener("click", useOpenStreetMap);
elements.closeGoogleDialog.addEventListener("click", () => elements.googleDialog.close());
elements.payment.addEventListener("change", event => updateActiveRecord("payment", event.target.value));
elements.visit.addEventListener("change", event => updateActiveRecord("visit", event.target.value));
elements.notes.addEventListener("input", event => updateActiveRecord("notes", event.target.value));

fitDepartment("all");
