# Field Finder · Paris business map (Vite + React + react-leaflet)

Interactive map of Paris and Île-de-France for finding businesses from the French company register and tracking sales visits.
This is the React rewrite of the original static *Field Finder* app, with visit notes, CSV export, and searches of official French business data.

## Use the downloaded ZIP on macOS

1. In Finder, open **Downloads** and double-click `paris-business-map.zip`. macOS Archive Utility extracts a `paris-business-map` folder beside it. (Or right-click the ZIP and choose **Open With → Archive Utility**.)
2. Install [Node.js LTS](https://nodejs.org/) if needed. This app uses npm to install its JavaScript packages.
3. Open Terminal and run these commands, replacing the path with the folder's actual location:

   ```sh
   cd ~/Downloads/paris-business-map
   npm install
   npm run dev
   ```

4. Open the local address printed by Vite, usually `http://localhost:5173`. Keep Terminal open while using the local app; press **Control-C** to stop it.

## Run the source in this project

From the extracted project folder:

```sh
npm install
npm run dev              # http://localhost:5173
```

You do not need to create a `.env` file for the default OpenStreetMap setup. Production build: `npm run build` (output in `dist/`, with relative paths for GitHub Pages and other static hosts).

Logic tests: `npm test`.

The public, hosted version is at <https://mhbdr.github.io/summup-prospecting-map/>.

## What it does

| Feature | How |
|---|---|
| Shop discovery | Choose a business type (restaurants, clothing, bakeries, groceries, pharmacies, cafés, florists, bookshops, hairdressers, or all shops), then click **Find businesses in this map area** to query the official SIRENE index. Continue through result pages to discover more. |
| Arrondissement filter | "Area" menu: All Paris, the 20 arrondissements, or another Île-de-France department. Uses each business's postcode (75001–75020) and falls back to an approximate bounding box. |
| Map | OpenStreetMap tiles only; no OpenStreetMap business data is requested. |
| Markers + clustering | `leaflet.markercluster`. Popups show name, address, opening hours, website (and phone). |
| Side list | Shows the businesses in the current view. Click one to zoom to its marker and open the popup. Selecting a marker highlights its row. |
| Near me | Browser geolocation: flies to you, draws an accuracy circle, sorts the list by distance. |
| Visit tracking | Payment method, visit status and notes per business, saved **in this browser only** (same storage key as the old app, so existing notes carry over). Export to CSV. |

The SIRENE open-data API returns up to 25 companies per page and matches active establishments in a radius of up to 50 km around the map center. Business-type options are based on French NAF activity codes. Only entries with public coordinates are shown; zoom in and search adjacent areas for wider coverage. This is a government register, not a promise of every open shop: coverage depends on registration, geocoding, and the API's published results.

## API keys

No API keys are required for the default OpenStreetMap tiles or French company search. This ZIP version uses Leaflet/OpenStreetMap rather than the optional Google Maps mode from the previous version. If you later use a keyed tile provider, put the configuration in `.env` (`VITE_TILE_URL=…`). `.env` is git-ignored; only `.env.example` is committed. Vite exposes `VITE_*` variables to the browser, so restrict any key by HTTP referrer in the provider's dashboard.

## Differences from the previous version

- Google Maps mode is not included in this ZIP version; it uses React-Leaflet and OpenStreetMap tiles without an API key.
- The "Department" menu and "Search this map area" button are replaced by the **Area** menu and an explicit **Find shops in this map area** action.
- OpenStreetMap provides map tiles only. Business listings come from the French SIRENE register; panning the map does not automatically request business data.

## Data sources and licences

Map tiles © OpenStreetMap contributors (ODbL). Business records: API Recherche d'entreprises backed by the French SIRENE register (data.gouv.fr). Payment methods and whether a business is open now are not supplied by SIRENE and must be verified in person. Use public services considerately and follow their terms.
