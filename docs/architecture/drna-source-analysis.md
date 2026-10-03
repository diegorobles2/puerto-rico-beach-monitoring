# DRNA Source Analysis

## Authoritative sources

The authoritative publisher is the Puerto Rico Department of Natural and Environmental Resources (DRNA), through its Beach Monitoring and Public Notification Program.

### Notification archive

- URL: <https://www.drna.pr.gov/cat/programas-y-proyectos/monitoria-de-playas/notificaciones-ambientales/>
- Purpose: lists official environmental notifications in reverse chronological order.
- Format: HTML.
- Use: discover the newest beach-monitoring notification.

### Individual notification

- Example: <https://www.drna.pr.gov/programas-y-proyectos/monitoria-de-playas/notificaciones-ambientales/notificacion-monitoria-de-playas-269/>
- Publication date: September 25, 2026.
- Sampling date: September 21, 2026.
- Format: HTML with links to supporting PDF documents.
- Use: obtain the official advisory wording, publication date, sampling date, affected station IDs, beach names, and municipalities.

### Detailed monitoring results

- Example: <https://www.drna.pr.gov/wp-content/uploads/2026/09/Monitoria-de-playas-25-de-Septiembre-de-2026.pdf>
- Format: PDF containing cumulative monitoring results.
- Use: obtain measurements and station metadata.
- Note: the link label may identify the source as an XLSX file even though the published resource is a PDF.

### Program description

- URL: <https://www.drna.pr.gov/programas-y-proyectos/monitoria-de-playas/programa-de-monitoria-de-playas/>
- Use: establish the program's authority, purpose, and contact information.

### Station reference

- URL: <https://www.drna.pr.gov/wp-content/uploads/2020/06/Tabla-playas.pdf>
- Use: reference the monitored beach stations.

## Available fields

| DRNA field | Example | Intended internal field |
| --- | --- | --- |
| Date | `21-Sep-2026` | `sampledAt` |
| Beach ID | `RW-22` | `sourceStationId` |
| Beach Name | `Pico de Piedra` | `beachName` |
| Municipality | `Aguada` | `municipality` |
| Latitude | `18.3843639` | `latitude` |
| Longitude | `-67.2129889` | `longitude` |
| Sampling Route | `Route 5: Añasco - Aguadilla` | Provider metadata only |
| Sampling Type | `Routine` or `Re-Sampling` | `sampleType` |
| Enterococcus | `20` or `<10` | `enterococcusValue` and `enterococcusQualifier` |
| Temperature | `25.3` | `waterTemperatureCelsius` |
| pH | `8.26` | `ph` |
| Observations | `Re-sampling` | `notes` |

The notification page also provides the publication timestamp, source URL, official advisory language, and municipality. Retrieval time must be recorded by our application.

## Status interpretation

DRNA notifications use a Beach Action Value (BAV) of 70 Enterococcus colonies per 100 mL. A notification may:

- list stations that are not suitable for bathers because the BAV was exceeded;
- state that monitored beaches are suitable for bathers; or
- include an additional precautionary note that does not follow the normal table format.

The application must preserve the official advisory separately from the numeric measurement. It must not assume that an unlisted beach is safe unless the publication explicitly supports that conclusion.

## Update pattern

DRNA publishes new notification pages and date-specific attachment URLs. Recent publications appear periodically, but no guaranteed machine-readable schedule or stable latest-results URL was found. The ingestion process should discover the newest notification from the archive instead of hard-coding a dated notification or PDF URL.

No documented official JSON or CSV API was found during this review.

## Parsing risks

- Results are published as long, cumulative PDFs rather than a structured API response.
- PDF tables may split rows across pages or omit repeated values on resampling rows.
- Values such as `<10` contain both a numeric value and a qualifier; parsing them as plain integers would lose information.
- Routine samples and resamples must remain distinguishable.
- Beach names and station labels may vary between publications.
- Some records may omit coordinates, pH, temperature, or observations.
- Publication time, sample time, and application retrieval time are different values and must not be conflated.
- The HTML notification is authoritative for advisory language; the linked PDF is authoritative for detailed measurements.

## Recommended ingestion approach

1. Read the official notification archive.
2. Select the newest beach-monitoring notification.
3. Record its URL, publication timestamp, sampling date, and advisory language.
4. Follow its detailed-results link.
5. Extract the latest applicable measurement for each station.
6. Convert provider-specific fields inside `backend/src/data-sources/drna/` into normalized application types.
7. Preserve the source URL and retrieval timestamp with every normalized record.

## Open questions

- Does DRNA offer a documented machine-readable feed that is not linked publicly?
- Is the 70 colonies/100 mL BAV universal for every record published by this program?
- How should a later resampling result supersede an earlier routine sample?
- Can station coordinates be treated as stable, or must each publication be allowed to update them?
- How should the application distinguish an all-clear notice from missing station data?
