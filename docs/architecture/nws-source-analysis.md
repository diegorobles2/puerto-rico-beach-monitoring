# NWS source validation

Validated against the official NWS documentation and live API on October 14, 2026.

## Selected official sources

### Rip-current risk

Use the NWS San Juan Surf Forecast (`SRF`) text product:

1. `GET https://api.weather.gov/products/types/SRF/locations/SJU`
2. Select the entry with the newest `issuanceTime`.
3. Follow its `@id`, or request `GET https://api.weather.gov/products/{id}`.

The product response identifies the issuing office (`TJSJ`), issuance time, product code, and complete `productText`. Inside each Puerto Rico forecast-zone section, the exact line `Rip Current Risk*...........Low|Moderate|High.` is the authoritative risk value for a forecast period.

Do not derive rip-current risk from wind, surf height, the generic `/points` forecast, or an active alert. Those values may provide context but are not equivalent to the risk category published in the SRF product. Any absent or unrecognized category must remain `unknown`.

### Active alerts

Use the NWS alerts API:

- Puerto Rico ingestion: `GET https://api.weather.gov/alerts/active?area=PR`
- Point validation when needed: `GET https://api.weather.gov/alerts/active?point={latitude},{longitude}`
- Zone validation when needed: `GET https://api.weather.gov/alerts/active?zone={zoneId}`

The response is a GeoJSON `FeatureCollection`. Preserve alert `id`, `affectedZones`, `sent`, `effective`, `onset`, `expires`, `ends`, `status`, `messageType`, `severity`, `certainty`, `urgency`, `event`, `headline`, `description`, `instruction`, and sender name. An HTTP 200 response with an empty `features` array means there are currently no matching alerts; it is not a source outage.

## Request contract

Every request must send:

```http
User-Agent: puerto-rico-beach-monitoring-capstone (github.com/diegorobles2/puerto-rico-beach-monitoring)
Accept: application/geo+json
```

NWS currently requires an identifying `User-Agent` but no API key. Keep the application identifier configurable only if deployment needs a different contact value; no secret belongs in the header.

The alerts service recommends polling no more frequently than every 30 seconds. The capstone's planned 30-minute NWS refresh is safely below that ceiling. Handle rate limiting and temporary failures as unavailable refresh attempts rather than deleting last-known data.

## Time and provenance fields

| Application meaning | NWS field |
| --- | --- |
| Forecast source time | SRF `issuanceTime` |
| Alert publication time | alert `sent` |
| Alert validity start | alert `effective`, then `onset` when present |
| Alert validity end | alert `ends`, otherwise `expires` |
| Retrieval time | application timestamp recorded after a successful response |
| Source link | exact NWS API product or alert URL |

NWS API times are ISO 8601 values with offsets. Store normalized instants without discarding the source value needed for fixture comparison.

## Geographic coverage and limitations

- The SRF product is issued for coastal forecast zones, not individual beaches. Issue #21 must map each beach to the appropriate published zone and must not infer a beach-specific forecast beyond that zone.
- The October 14 sample includes Puerto Rico zones `PRZ001`, `PRZ002`, `PRZ003`, `PRZ005`, `PRZ007`, `PRZ008`, `PRZ010`, `PRZ011`, `PRZ012`, and `PRZ013`. This list is evidence from one publication, not a permanent allowlist.
- `area=PR` may return inland or non-beach hazards. The adapter must associate alerts using affected zones or point coverage rather than treating every Puerto Rico alert as applicable to every beach.
- Alert geometry may be `null`; `affectedZones` and UGC codes remain important matching fields.
- Forecast-zone boundaries and point-to-grid mappings can change. NWS recommends periodically refreshing point metadata rather than treating it as permanent.
- A low rip-current category does not mean a beach is safe. NWS states that life-threatening rip currents can still occur near structures and reefs.

## Update and failure behavior

- Choose the latest SRF product by parsed `issuanceTime`, not array position.
- Treat an empty product list, missing zone section, unknown risk word, malformed JSON/text, timeout, non-2xx response, or required-field loss as unavailable/unknown.
- A failed refresh must not replace valid last-known data with a fabricated current value.
- Alerts that are cancelled, updated, expired, or replaced must be handled using their identifiers, message type, references, and validity timestamps in the implementation issues.

## Official references

- [NWS API Web Service](https://www.weather.gov/documentation/services-web-api)
- [NWS OpenAPI specification](https://api.weather.gov/openapi.json)
- [NWS Alerts Web Service](https://www.weather.gov/documentation/services-web-alerts)
- [NWS alert geolocation primer](https://www.weather.gov/media/documentation/docs/NWS_Geolocation.pdf)
- [Live San Juan SRF product index](https://api.weather.gov/products/types/SRF/locations/SJU)
- [Active Puerto Rico alerts](https://api.weather.gov/alerts/active?area=PR)
