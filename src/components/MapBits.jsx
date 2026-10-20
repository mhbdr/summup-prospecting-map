import { useEffect } from 'react';
import { Circle, CircleMarker, Rectangle, Tooltip, useMap, useMapEvents } from 'react-leaflet';

/** Reports the visible bounds + zoom to the app whenever the map settles, and exposes the map instance. */
export function MapEvents({ onViewport, mapRef }) {
  const map = useMap();
  const report = () => {
    const b = map.getBounds();
    onViewport({ bounds: [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()], zoom: map.getZoom() });
  };
  useMapEvents({ moveend: report });
  useEffect(() => {
    mapRef.current = map;
    report();
    return () => {
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);
  return null;
}

/** Blue dot + accuracy circle for the "Near me" feature. */
export function UserLocation({ position }) {
  if (!position) return null;
  const center = [position.lat, position.lng];
  return (
    <>
      <Circle
        center={center}
        radius={Math.min(position.accuracy || 0, 500)}
        pathOptions={{ color: '#3278bd', weight: 1, fillColor: '#3278bd', fillOpacity: 0.12 }}
        interactive={false}
      />
      <CircleMarker
        center={center}
        radius={8}
        pathOptions={{ color: '#ffffff', weight: 3, fillColor: '#3278bd', fillOpacity: 1 }}
      >
        <Tooltip direction="top" offset={[0, -6]}>
          You are here
        </Tooltip>
      </CircleMarker>
    </>
  );
}

/** Dashed outline of the selected arrondissement. */
export function AreaOutline({ bounds }) {
  if (!bounds) return null;
  const [s, w, n, e] = bounds;
  return (
    <Rectangle
      bounds={[
        [s, w],
        [n, e],
      ]}
      pathOptions={{ color: '#2e6b50', weight: 2, dashArray: '6 6', fill: false }}
      interactive={false}
    />
  );
}
