import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from '../lib/leaflet-global.js'; // must come before the plugin import (it needs window.L)
import 'leaflet.markercluster';
import { formatAddress, hoursLines, prettyKind, safeUrl } from '../lib/format.js';
import { paymentLabel, visitLabel } from '../lib/records.js';

function pinIcon(active, visit) {
  const cls = ['pin', active ? 'pin--active' : '', `pin--${visit || 'not-visited'}`].filter(Boolean).join(' ');
  return L.divIcon({
    className: 'pin-wrap',
    html: `<div class="${cls}"><span></span></div>`,
    iconSize: [30, 36],
    iconAnchor: [15, 34],
    popupAnchor: [0, -30],
  });
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

// Popup content is built with DOM APIs + textContent: business data comes from OpenStreetMap
// contributors, so it is never injected as HTML.
function buildPopup(item, record, onDetails) {
  const root = el('div', 'popup');
  root.append(el('p', 'popup-title', item.name));
  root.append(el('p', 'popup-sub', `${prettyKind(item.kind)} · ${item.source}`));

  const address = formatAddress(item);
  const rows = [['Address', address || 'Not listed']];
  for (const [label, value] of rows) {
    const row = el('p', 'popup-row');
    row.append(el('span', 'popup-label', label), document.createTextNode(value));
    root.append(row);
  }

  const lines = hoursLines(item.hours);
  const hoursRow = el('div', 'popup-row');
  hoursRow.append(el('span', 'popup-label', 'Opening hours'));
  if (lines.length) {
    const list = el('ul', 'popup-hours');
    lines.forEach((l) => list.append(el('li', null, l)));
    hoursRow.append(list);
  } else {
    hoursRow.append(document.createTextNode('Not listed'));
  }
  root.append(hoursRow);

  const websiteRow = el('p', 'popup-row');
  websiteRow.append(el('span', 'popup-label', 'Website'));
  const url = safeUrl(item.website);
  if (url) {
    const a = el('a', 'popup-link', url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, ''));
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    websiteRow.append(a);
  } else {
    websiteRow.append(document.createTextNode('Not listed'));
  }
  root.append(websiteRow);

  if (item.phone) {
    const phoneRow = el('p', 'popup-row');
    phoneRow.append(el('span', 'popup-label', 'Phone'), document.createTextNode(item.phone));
    root.append(phoneRow);
  }

  root.append(el('p', 'popup-status', `${visitLabel(record?.visit)} · ${paymentLabel(record?.payment)}`));

  const button = el('button', 'popup-button', 'Plan visit & notes');
  button.type = 'button';
  button.addEventListener('click', () => onDetails(item.key));
  root.append(button);
  return root;
}

/**
 * Clustered markers for all businesses. Markers are diffed by key, so panning and
 * loading more results never rebuilds existing markers (open popups stay open).
 * `controller` is a ref that receives { focus(key) } for the side list.
 */
export default function ClusterLayer({ items, selectedKey, records, onSelect, onDetails, controller }) {
  const map = useMap();
  const groupRef = useRef(null);
  const markersRef = useRef(new Map());
  const latest = useRef({ records, onSelect, onDetails });
  latest.current = { records, onSelect, onDetails };

  // Create the cluster group once per map.
  useEffect(() => {
    const group = L.markerClusterGroup({
      chunkedLoading: true,
      showCoverageOnHover: false,
      maxClusterRadius: 45,
      spiderfyOnMaxZoom: true,
    });
    map.addLayer(group);
    groupRef.current = group;
    const markers = markersRef.current;

    controller.current = {
      focus(key) {
        const marker = markers.get(key);
        if (!marker) return;
        const target = marker.getLatLng();
        let done = false;
        let timer;
        const reveal = () => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          map.off('moveend', reveal);
          group.zoomToShowLayer(marker, () => marker.openPopup());
        };
        map.on('moveend', reveal);
        timer = setTimeout(reveal, 1500); // safety net if the map was already there (no moveend)
        map.flyTo(target, Math.max(map.getZoom(), 17), { duration: 0.6 });
      },
    };

    return () => {
      map.removeLayer(group);
      groupRef.current = null;
      markers.clear();
      controller.current = null;
    };
  }, [map, controller]);

  // Add / remove markers to match `items`.
  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    const markers = markersRef.current;
    const wanted = new Set(items.map((i) => i.key));

    const stale = [];
    for (const [key, marker] of markers) {
      if (!wanted.has(key)) {
        stale.push(marker);
        markers.delete(key);
      }
    }
    if (stale.length) group.removeLayers(stale);

    const fresh = [];
    for (const item of items) {
      if (markers.has(item.key)) continue;
      const marker = L.marker([item.lat, item.lon], { icon: pinIcon(false, 'not-visited'), title: item.name });
      marker._sig = 'init';
      marker.bindPopup(
        () => buildPopup(item, latest.current.records[item.key], (key) => latest.current.onDetails(key)),
        { maxWidth: 290, minWidth: 220 }
      );
      marker.on('popupopen', () => latest.current.onSelect(item.key));
      markers.set(item.key, marker);
      fresh.push(marker);
    }
    if (fresh.length) group.addLayers(fresh);
  }, [items, map]);

  // Refresh pin colour / highlight when selection or visit status changes.
  useEffect(() => {
    for (const [key, marker] of markersRef.current) {
      const visit = records[key]?.visit || 'not-visited';
      const sig = `${key === selectedKey ? 1 : 0}|${visit}`;
      if (marker._sig !== sig) {
        marker._sig = sig;
        marker.setIcon(pinIcon(key === selectedKey, visit));
      }
    }
  }, [items, selectedKey, records]);

  return null;
}
