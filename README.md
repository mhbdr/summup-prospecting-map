# Field Finder · Île-de-France

A lightweight local web app for discovering nearby businesses and managing in-person sales visits across Île-de-France departments **75, 77, 78, 91, 92, 93, 94, and 95**.

## Run it

Open `index.html` in a modern browser, or serve the folder locally:

```sh
python3 -m http.server 8000
```

Then visit `http://localhost:8000`. Internet access is needed for map tiles, map libraries, and the public data APIs. Browser location works on localhost or another secure context, subject to permission.

## Google Maps JavaScript API

The Google Maps JavaScript API is a Google-hosted service, not a library to download. Use **Set up Google Maps** in the app and enter a Google Maps Platform browser API key. Google requires a Cloud project, the Maps JavaScript API enabled, and billing configured. On success, the map switches to Google Maps; shop listings still come from the public data sources below.

Create a browser key in [Google Cloud credentials](https://console.cloud.google.com/google/maps-apis/credentials), then restrict it to the **Maps JavaScript API** and your site referrer. For the default local server, add `http://localhost:8765/*` (or the port you use). The key is saved in this browser's local storage and inserted into the Google script URL: **browser keys are public, not secrets**. Never use a server-side key here. You can select **Use OpenStreetMap** at any time to remove the saved key and switch back.

If Google Maps cannot load, the app keeps using the OpenStreetMap map and displays an error message. Check that the key, API restriction, allowed referrer, billing, and internet access are configured.

## Use it

1. Pick a department or all Île-de-France. This moves the map to an approximate department view; it does not set an exact administrative boundary.
2. Zoom in to a few streets (usually around zoom 17) and click **Search this map area**. Results cover the current visible map bounds.
3. In Paris, map searches also include the City of Paris open-data dataset of Eau de Paris water-refill partner businesses.
4. Enter a keyword such as `boulangerie` or `restaurant` and click **Add company results** to search active establishments in the French company register. Registry establishments are limited to the current map bounds and selected department.
5. Open a business to get directions, record the payment method after asking, track the visit, and save notes.
6. Export saved records as CSV to use them outside the browser.

## Business data sources and limits

- **OpenStreetMap:** the app requests map data for the visible small area and displays tagged shops, food venues, crafts, and offices. To keep requests bounded and avoid the API's 50,000-node response limit, zoom in to a few streets (typically around map zoom 17). The app prompts you to zoom further when needed. Coverage depends on OSM mapping; way markers use the average of their mapped nodes.
- **Paris Open Data:** in Paris, the app adds the [Eau de Paris partner-business dataset](https://opendata.paris.fr/explore/dataset/commerces-eau-de-paris/). Its 1,500 records are shops participating in the public water-refill initiative—not a complete directory of Paris shops. The dataset is downloaded once per page session and filtered to the current map area.
- **API Recherche d'entreprises:** keyword search uses the [official public company-search API](https://recherche-entreprises.api.gouv.fr/docs/). It returns text-search matches, not a complete SIRENE export; each request shows at most 25 companies and up to 100 matching establishments per company. The app displays active establishments with coordinates inside the visible map area. Search with specific French terms and consider results a supplementary prospect list, not exhaustive coverage. Results can be sparse if the API's first matching companies do not have locations in the current map view.

Payment methods are not provided reliably by these sources. **They are never inferred from missing listing data.** Every business starts as “Not verified”; only a user-entered selection is labelled verified.

Visit records are stored in the current browser's local storage on this device. They are not synced or backed up. Export CSV periodically if you need a separate copy. CSV exports include the source and record ID so a business can still be identified later, even if it is no longer in the current search results.

Map tiles and OSM business data are provided by OpenStreetMap contributors under the ODbL. The additional sources carry their own licenses and terms. Searches are initiated by the user; use public services considerately and follow their usage policies and attribution requirements.
