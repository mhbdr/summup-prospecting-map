# Field Finder · Paris business map (Vite + React + react-leaflet)

Interactive map of Paris and Île-de-France for finding local businesses and tracking sales visits.
This is the React rewrite of the original static *Field Finder* app and keeps its features
(visit notes, CSV export, Eau de Paris partners, company-register search).

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
| Business-type search | Type `bakery`, `boulangerie`, `pharmacie`, `café`… (English and French aliases, accents ignored) or any shop name. Quick-pick chips included. |
| Arrondissement filter | "Area" menu: All Paris, the 20 arrondissements, or another Île-de-France department. Uses each business's postcode (75001–75020) and falls back to an approximate bounding box. |
| Data | OpenStreetMap **Overpass API**, requested for the map's visible bounds. |
| Markers + clustering | `leaflet.markercluster`. Popups show name, address, opening hours, website (and phone). |
| Side list | Shows the businesses in the current view. Click one to zoom to its marker and open the popup. Selecting a marker highlights its row. |
| Near me | Browser geolocation: flies to you, draws an accuracy circle, sorts the list by distance. |
| Rate-limit friendly | Requests are debounced (700 ms), spaced at least 1.1 s apart, de-duplicated, cancelled when the map moves on, retried on a mirror server, and cached (memory + localStorage, 30 min). Areas already loaded are not requested again. |
| Visit tracking | Payment method, visit status and notes per business, saved **in this browser only** (same storage key as the old app, so existing notes carry over). Export to CSV. |

Results load from zoom 13 upward. If OpenStreetMap returns more than 300 businesses for an area, the app says so: zoom in for the rest.

## API keys

No API keys are required for the default OpenStreetMap tiles, OpenStreetMap business search, Paris Open Data, or French company search. This ZIP version uses Leaflet/OpenStreetMap rather than the optional Google Maps mode from the previous version. If you later use a keyed tile provider, put the configuration in `.env` (`VITE_TILE_URL=…`). `.env` is git-ignored; only `.env.example` is committed. Vite exposes `VITE_*` variables to the browser, so restrict any key by HTTP referrer in the provider's dashboard.

## Differences from the previous version

- Google Maps mode is not included in this ZIP version; it uses React-Leaflet and OpenStreetMap tiles without an API key.
- The "Department" menu and "Search this map area" button are replaced by the **Area** menu and automatic loading as you move the map.
- The business-type dropdown is replaced by free-text search, French/English category aliases, and quick-pick chips.

## Data sources and licences

Map tiles and business data © OpenStreetMap contributors (ODbL). Eau de Paris partners: City of Paris open data.
Company register: API Recherche d'entreprises (data.gouv.fr). Use public services considerately and follow their terms.
