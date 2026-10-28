# NWS fallback geographic verification

Independent review reported and accepted: **2026-10-27** (America/La_Paz). Registry revision: `2026-10-27.v2`.

All **15 stations are geographically verified**, with no conflicting land-zone candidates:

| Land forecast zone | DRNA stations |
| --- | --- |
| PRZ011 | RW-12B, RW-13, RW-14A, RW-37, RW-8 |
| PRZ001 | RW-19, RW-21C, RW-28 |
| PRZ005 | RW-23, RW-38 |
| PRZ002 | RW-1A, RW-29, RW-31, RW-32, RW-4 |

The exact coordinates, beach names, containment flags and nearest/second-nearest distances are in [nws-fallback-verification.csv](nws-fallback-verification.csv). The supplied independent GeoPandas results were reproduced against the official release. All 15 coordinates and beach names were also compared directly with `public.beaches` in Supabase using SELECTs in a read-only transaction; they matched the previous registry exactly. No Supabase records were changed.

## Source and methodology

- Official source: [NWS Public Forecast Zones](https://www.weather.gov/gis/publiczones), effective **April 16, 2026**.
- Download: [z_16ap26.zip](https://www.weather.gov/source/gis/Shapefiles/WSOM/z_16ap26.zip).
- ZIP SHA-256: `010dc5eab64b6e326c969e252bd016f56a037b0444df8303658707bca4cc7fd8`.
- Published/downloaded ZIP MD5: `004dc6501dc3d50e7b36652cb9d02bd3`.
- Coordinate source: exact stored DRNA station coordinates exported from Supabase, interpreted as **EPSG:4326** longitude/latitude; no coordinates are rounded or adjusted for selection.
- GeoPandas loads the shapefile with its declared CRS, selects Puerto Rico public zones using STATE/ZONE attributes, dissolves features by zone ID, and retains all 13 PR land zones as competitors.
- Containment uses the geographic polygons. Point-to-polygon distances use geometries transformed to **EPSG:32620**, in metres. A contained point has distance **0 to the polygon**, which is different from distance to its boundary.
- The verifier sorts all zone distances to identify the nearest and second-nearest zones. Distances in the reviewed CSV are reported to one decimal place; replay compares them within **0.1 m**, an arithmetic/reporting tolerance, not a runtime coordinate tolerance.

The 14 adjacent stations are within 37 m of their nearest land polygon. The closest competing zone among the 15 reviews is over 1.7 km away. Geometry-derived membership is a reviewed geographic conclusion, not an explicit NWS assignment of a beach coordinate or a beach-specific forecast.

## RW-1A: containment and point normalization

Balneario La Monserrate's exact DRNA coordinate is **18.3855917, -65.7294722**. It is inside **PRZ002**, approximately **0.86 m** from its boundary. Its CSV nearest-polygon distance is therefore **0.0 m**.

The NWS `/points/18.3855917,-65.7294722` response normalizes its coordinate to **18.3856, -65.7295** and returns **AMZ712**. The rounded point lies outside PRZ002, approximately **2.12 m** from its boundary. This is consistent with coordinate normalization near the coastline. The script independently prints both boundary distances without calling the NWS API.

RW-1A is now a verified polygon-containment fallback for PRZ002. Runtime provenance remains **verified-fallback**, not automatic. The other 14 records use polygon-adjacency verification. Original marine classifications remain explicit registry eligibility requirements: AMZ745 for the five PRZ011 stations, AMZ726 for RW-31/RW-4, and AMZ712 for the remaining eight stations.

A successful live automatic land-zone lookup always wins. This geographic review never authorizes a fallback after a timeout, HTTP error, malformed response, different marine zone, or changed coordinates. Legacy history remains retained but non-operational until revalidated.

## Offline reproduction

Obtain the official ZIP once and keep it locally; the national shapefile is not vendored into the application repository. Alternatively supply an extracted `.shp` with its `.shx`, `.dbf` and `.prj` sidecars. The ZIP input is checked against the reviewed SHA-256; an extracted dataset must be from that verified release.

From the repository root:

```powershell
py -m pip install geopandas
py backend/scripts/verify-nws-fallbacks.py --shapefile C:\path\to\z_16ap26.zip
```

The script reads the local CSV and shapefile only. It needs neither live Supabase access nor the NWS API and performs no runtime geographic selection. GeoPandas supplies its normal Shapely/pyproj dependencies. Ordinary backend tests check CSV/registry agreement and safety independently of Python or GIS availability.

This compact package supersedes the earlier snapshot-based review. It intentionally retains the verification decision, exact coordinates, source identity and reproducible procedure rather than individual API response files. The review is dated: future coordinate or zone-boundary changes require another review and registry revision.
