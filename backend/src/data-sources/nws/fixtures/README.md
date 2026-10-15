# NWS test fixtures

These are manually trimmed samples of official NWS API responses retrieved on October 14, 2026. They retain only fields needed to validate the source contract and future parser behavior.

- `surf-forecast-success.json`: San Juan `SRF` product metadata and two representative Puerto Rico forecast-zone sections.
- `alerts-active-success.json`: one real Puerto Rico alert with its essential CAP/GeoJSON fields.
- `alerts-active-empty.json`: successful active-alert response with no matching alerts.
- `malformed-response.json`: syntactically valid JSON with an invalid `features` shape.
- `service-unavailable.json`: representative NWS API problem response for HTTP 503 handling.

Sources:

- <https://api.weather.gov/products/types/SRF/locations/SJU>
- <https://api.weather.gov/products/02f99345-ccbf-4d88-94da-7e6aee5521da>
- <https://api.weather.gov/alerts?area=PR&limit=1>
- <https://api.weather.gov/alerts/active?area=PR>

Fixtures must remain deterministic. When NWS changes a response format, add a new fixture instead of silently rewriting evidence of the previous format.
