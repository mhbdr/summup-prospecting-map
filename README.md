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

## API comparison demo

The standalone [API Explorer demo](https://mhbdr.github.io/summup-api-explorer/api-demo.html) compares the French address search API, a user-configured Algolia index, and MapTiler tiles. The existing business map remains available at the URL above.

- French address search uses the public `https://api-adresse.data.gouv.fr/search/` endpoint and works without credentials. Select a result to center the map.
- MapTiler requires your own API key. Enter it in the demo to switch the map tiles; without a key, the map uses OpenStreetMap.
- Algolia requires your own Application ID, Search-only API key, and configured index. Until all three are supplied, the demo shows a setup-needed state rather than sample results.
- Entered credentials are held in page memory only and are not saved in local storage or the page URL. The MapTiler key is sent to MapTiler as part of its tile requests; Algolia credentials are sent to Algolia for searches.

To run the demo locally, use `npm install` and `npm run dev`, then open `/api-demo.html`.

## What it does

| Feature | How |
|---|---|
| Shop discovery | Choose a business type (restaurants, clothing, bakeries, groceries, pharmacies, cafés, florists, bookshops, hairdressers, or all shops), then click **Find businesses in this map area**. The official French SIRENE index is always searched; optional Paris Open Data layers can supplement it. Continue through SIRENE result pages to discover more. |
| Paris Open Data | The expandable source controls enable **Terraces & storefront permits** and **Eau de Paris partner businesses**. These sources are queried only after an explicit search, for the current map area. Each is paged up to 2,000 records per search; a cap warning is shown when applicable. Only Paris locations are covered. |
| Arrondissement filter | "Area" menu: All Paris, the 20 arrondissements, or another Île-de-France department. Uses each business's postcode (75001–75020) and falls back to an approximate bounding box. |
| Map | OpenStreetMap tiles only; no OpenStreetMap business data is requested. |
| Markers + clustering | `leaflet.markercluster`. Popups show name, address, opening hours, website (and phone). |
| Side list | Shows the businesses in the current view. Click one to zoom to its marker and open the popup. Selecting a marker highlights its row. |
| Near me | Browser geolocation: flies to you, draws an accuracy circle, sorts the list by distance. |
| Visit tracking | Payment method, visit status and notes per business, saved **in this browser only** (same storage key as the old app, so existing notes carry over). Export to CSV. |

The SIRENE open-data API returns up to 25 companies per page and matches active establishments in a radius of up to 50 km around the map center. Use **Load all remaining pages** to retrieve all pages for that search (up to 400 pages / 10,000 companies, loaded with at most three requests in parallel). The API caps results at 10,000 companies; if it reaches that cap, narrow the business type or search smaller map areas to reveal more. Results from repeated searches accumulate for the current area and business type, so pan or zoom across Paris and search each map section. Changing area or business type starts a fresh result set. Business-type options are based on French NAF activity codes. Only entries with public coordinates are shown. This is a government register, not a promise of every open shop: coverage depends on registration, geocoding, and the API's published results.

The two optional Paris datasets add different coverage: Paris lists authorized terraces and retail displays (including the permit type and, when supplied, SIRET); Eau de Paris lists participating businesses in its public drinking-water initiative. Neither is a complete/current business register, and the Eau de Paris dataset does not specify each partner's business category. Paris records with a matching SIRET reuse the SIRENE key; matching name/address records are also deduplicated while keeping the SIRENE record. A terrace permit or partner listing is a prospecting clue, not proof of current trading status. Verify details directly.

TheFork and the [MICHELIN Guide](https://guide.michelin.com/) are not queried or used to seed map results. No publicly reusable listing dataset or public search API for this prospecting use was identified. Their data requires permission and appropriate partner/API licensing from [TheFork](https://www.thefork.com/) and Michelin. The current GitHub Pages app is static, so private partner credentials must not be embedded in it; an authorized integration would need an approved server-side proxy or a specifically browser-safe partner API/key.

## API keys

No API keys are required for the default OpenStreetMap tiles, French company search, or Paris Open Data sources. This ZIP version uses Leaflet/OpenStreetMap rather than the optional Google Maps mode from the previous version. If you later use a keyed tile provider, put the configuration in `.env` (`VITE_TILE_URL=…`). `.env` is git-ignored; only `.env.example` is committed. Vite exposes `VITE_*` variables to the browser, so restrict any key by HTTP referrer in the provider's dashboard.

## Differences from the previous version

- Google Maps mode is not included in this ZIP version; it uses React-Leaflet and OpenStreetMap tiles without an API key.
- The "Department" menu and "Search this map area" button are replaced by the **Area** menu and an explicit **Find shops in this map area** action.
- OpenStreetMap provides map tiles only. Business listings come from the French SIRENE register and optional Paris Open Data layers; panning the map does not automatically request business data.

## Data sources, terms and attribution

| Source | Use and coverage | Licence / access |
|---|---|---|
| [API Recherche d'entreprises](https://recherche-entreprises.api.gouv.fr/) / French SIRENE register | Active establishments with public coordinates; query around the visible map centre (up to 50 km) and paginate 25 companies at a time. | French public business-register data; API is public and used without credentials. Attribution is shown on each result. |
| [Ville de Paris Open Data · Terrasses et étalages : Autorisations](https://opendata.paris.fr/explore/dataset/terrasses-autorisations/) | Authorized terraces and storefront displays in Paris, filtered around the visible map centre; up to 2,000 records per search. SIRET is used to deduplicate against SIRENE when available. | Open Database License (ODbL); attribute Ville de Paris Open Data. |
| [Eau de Paris Open Data · Commerces](https://opendata.paris.fr/explore/dataset/commerces-eau-de-paris/) | Participating Paris businesses in the “Ici je choisis l’Eau de Paris” initiative; up to 2,000 records per search. The dataset does not give a business category. | Open Database License (ODbL); attribute Eau de Paris / Ville de Paris Open Data. |
| TheFork and MICHELIN Guide | Not integrated. | No public-use listing dataset/API was identified for this app. Obtain written partner authorization and a suitable data/API licence before use. Do not put private credentials in a Vite `VITE_*` variable. |
| OpenStreetMap | Map tiles only, not business listings. | © OpenStreetMap contributors (ODbL). |

Sources are requested only when the user clicks search; Paris Open Data queries are spatially filtered, paged, and capped to avoid downloading entire datasets on map renders or movement. Results can overlap across sources or be outdated. SIRENE and Paris records are not guaranteed to include every business. Payment methods and whether a business is open now are not supplied by these datasets and must be verified in person. Follow each provider's current terms and attribution requirements.
