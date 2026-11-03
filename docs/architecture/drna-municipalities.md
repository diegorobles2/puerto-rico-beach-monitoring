# Offline DRNA station municipalities

`station-municipalities.ts` resolves exact station IDs without external requests during ingestion. This fills fresh imports and lets subsequent refreshes repair stored `Unavailable` values. Valid incoming municipalities can update existing records; missing/blank incoming values cannot erase a stored municipality. Unknown IDs remain unavailable unless their source row identifies a municipality; regional routes are not municipality assignments.

Reviewed November 3, 2026. Sources:

- [DRNA station identification table](https://www.drna.pr.gov/wp-content/uploads/2020/06/Tabla-playas.pdf) supplies historical IDs and named municipality locations, including RW-1, RW-12, RW-14, and RW-20.
- [Official Water Quality Portal PR_BEACH_WQX station index](https://www.waterqualitydata.us/provider/STORET/PR_BEACH_WQX/) supplies exact suffixed station IDs and municipality-bearing names. Only IDs explicitly listed are included; suffixes are not generated automatically.
- Individual WQP station records clarify otherwise ambiguous names: [RW-22 / Aguada](https://www.waterqualitydata.us/provider/STORET/PR_BEACH_WQX/PR_BEACH_WQX-RW-22/), [RW-17 / Vega Alta](https://www.waterqualitydata.us/provider/STORET/PR_BEACH_WQX/PR_BEACH_WQX-RW-17/), [RW-24A / Vieques](https://www.waterqualitydata.us/provider/STORET/PR_BEACH_WQX/PR_BEACH_WQX-RW-24A/), [RW-3B / Culebra](https://www.waterqualitydata.us/provider/STORET/PR_BEACH_WQX/PR_BEACH_WQX-RW-3B/), [RW-37 / Cabo Rojo](https://www.waterqualitydata.us/provider/STORET/PR_BEACH_WQX/PR_BEACH_WQX-RW-37/), and [RW-39 / Manatí](https://www.waterqualitydata.us/provider/STORET/PR_BEACH_WQX/PR_BEACH_WQX-RW-39/).

The registry does not create stations, alter coordinates, or determine water-quality status. It enriches stations already discovered in DRNA results. Verify identity and municipality against official metadata before adding/changing an entry; review this lookup if a station is relocated or renamed. A normal ingestion run repairs missing stored municipalities; no schema migration or manual production update is required.
