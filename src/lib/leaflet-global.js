// leaflet.markercluster is a UMD plugin that expects a global `L`. Leaflet's ESM build does not
// create one, so we expose it here. Import this module BEFORE 'leaflet.markercluster'.
import L from 'leaflet';

if (typeof window !== 'undefined') window.L = L;

export default L;
