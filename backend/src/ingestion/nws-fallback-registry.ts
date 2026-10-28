/** Reviewed manual GIS evidence; runtime performs no polygon calculations or evidence-file reads. */
export const NWS_FALLBACK_REGISTRY_VERSION = '2026-10-27.v2';
export const NWS_FALLBACK_VERIFICATION = {
  csv: 'docs/architecture/nws-fallback-verification.csv',
  document: 'docs/architecture/nws-fallback-verification.md',
  script: 'backend/scripts/verify-nws-fallbacks.py',
  sourceUrl: 'https://www.weather.gov/source/gis/Shapefiles/WSOM/z_16ap26.zip',
  sourceEffectiveDate: '2026-04-16',
  sourceSha256: '010dc5eab64b6e326c969e252bd016f56a037b0444df8303658707bca4cc7fd8',
  geographicCrs: 'EPSG:4326', distanceCrs: 'EPSG:32620', reviewedOn: '2026-10-27',
} as const;
export interface FallbackEvidence {
  readonly stationId: string;
  readonly verificationCsv: string;
  readonly verificationDocument: string;
  readonly insidePolygon: boolean;
  readonly nearestPolygonMetres: number;
  readonly secondNearestZone: string;
  readonly secondNearestPolygonMetres: number;
}
interface ReviewedStation {
  readonly stationId: string;
  readonly beachName: string;
  readonly municipality: string;
  readonly reviewedCoordinates: { readonly latitude: number; readonly longitude: number };
  readonly originalMarineZone: string;
  readonly mappingMethod: 'reviewed-polygon-containment' | 'reviewed-polygon-adjacency';
  readonly reviewedOn: string;
  readonly evidence: FallbackEvidence;
}
export type NwsFallbackReview = ReviewedStation & (
  | { readonly status: 'verified'; readonly fallbackForecastZone: string; readonly candidateForecastZone?: never; readonly reason?: never }
  | { readonly status: 'unresolved'; readonly candidateForecastZone: string; readonly reason: string; readonly fallbackForecastZone?: never }
);
export const NWS_FALLBACK_REVIEWS: readonly NwsFallbackReview[] = [
  {
    "stationId": "RW-12B",
    "beachName": "Playa el Combate",
    "municipality": "Cabo Rojo",
    "status": "verified",
    "reviewedCoordinates": {
      "latitude": 17.9747944,
      "longitude": -67.2129056
    },
    "originalMarineZone": "AMZ745",
    "fallbackForecastZone": "PRZ011",
    "mappingMethod": "reviewed-polygon-adjacency",
    "reviewedOn": "2026-10-27",
    "evidence": {
      "stationId": "RW-12B",
      "verificationCsv": "docs/architecture/nws-fallback-verification.csv",
      "verificationDocument": "docs/architecture/nws-fallback-verification.md",
      "insidePolygon": false,
      "nearestPolygonMetres": 15.1,
      "secondNearestZone": "PRZ010",
      "secondNearestPolygonMetres": 14307.3
    }
  },
  {
    "stationId": "RW-13",
    "beachName": "Balneario de Boquerón",
    "municipality": "Cabo Rojo",
    "status": "verified",
    "reviewedCoordinates": {
      "latitude": 18.0194417,
      "longitude": -67.1722444
    },
    "originalMarineZone": "AMZ745",
    "fallbackForecastZone": "PRZ011",
    "mappingMethod": "reviewed-polygon-adjacency",
    "reviewedOn": "2026-10-27",
    "evidence": {
      "stationId": "RW-13",
      "verificationCsv": "docs/architecture/nws-fallback-verification.csv",
      "verificationDocument": "docs/architecture/nws-fallback-verification.md",
      "insidePolygon": false,
      "nearestPolygonMetres": 19.8,
      "secondNearestZone": "PRZ010",
      "secondNearestPolygonMetres": 7912
    }
  },
  {
    "stationId": "RW-14A",
    "beachName": "Playa Moja Casabe",
    "municipality": "Cabo Rojo",
    "status": "verified",
    "reviewedCoordinates": {
      "latitude": 17.98581,
      "longitude": -67.21459
    },
    "originalMarineZone": "AMZ745",
    "fallbackForecastZone": "PRZ011",
    "mappingMethod": "reviewed-polygon-adjacency",
    "reviewedOn": "2026-10-27",
    "evidence": {
      "stationId": "RW-14A",
      "verificationCsv": "docs/architecture/nws-fallback-verification.csv",
      "verificationDocument": "docs/architecture/nws-fallback-verification.md",
      "insidePolygon": false,
      "nearestPolygonMetres": 36.5,
      "secondNearestZone": "PRZ010",
      "secondNearestPolygonMetres": 13714.6
    }
  },
  {
    "stationId": "RW-19",
    "beachName": "Balneario Punta Salinas",
    "municipality": "Toa Baja",
    "status": "verified",
    "reviewedCoordinates": {
      "latitude": 18.4716583,
      "longitude": -66.1859944
    },
    "originalMarineZone": "AMZ712",
    "fallbackForecastZone": "PRZ001",
    "mappingMethod": "reviewed-polygon-adjacency",
    "reviewedOn": "2026-10-27",
    "evidence": {
      "stationId": "RW-19",
      "verificationCsv": "docs/architecture/nws-fallback-verification.csv",
      "verificationDocument": "docs/architecture/nws-fallback-verification.md",
      "insidePolygon": false,
      "nearestPolygonMetres": 6.4,
      "secondNearestZone": "PRZ005",
      "secondNearestPolygonMetres": 2382.5
    }
  },
  {
    "stationId": "RW-1A",
    "beachName": "Balneario La Monserrate",
    "municipality": "Luquillo",
    "status": "verified",
    "reviewedCoordinates": {
      "latitude": 18.3855917,
      "longitude": -65.7294722
    },
    "originalMarineZone": "AMZ712",
    "fallbackForecastZone": "PRZ002",
    "mappingMethod": "reviewed-polygon-containment",
    "reviewedOn": "2026-10-27",
    "evidence": {
      "stationId": "RW-1A",
      "verificationCsv": "docs/architecture/nws-fallback-verification.csv",
      "verificationDocument": "docs/architecture/nws-fallback-verification.md",
      "insidePolygon": true,
      "nearestPolygonMetres": 0,
      "secondNearestZone": "PRZ004",
      "secondNearestPolygonMetres": 16083.6
    }
  },
  {
    "stationId": "RW-21C",
    "beachName": "Balneario de Carolina",
    "municipality": "Carolina",
    "status": "verified",
    "reviewedCoordinates": {
      "latitude": 18.4459889,
      "longitude": -66.0035722
    },
    "originalMarineZone": "AMZ712",
    "fallbackForecastZone": "PRZ001",
    "mappingMethod": "reviewed-polygon-adjacency",
    "reviewedOn": "2026-10-27",
    "evidence": {
      "stationId": "RW-21C",
      "verificationCsv": "docs/architecture/nws-fallback-verification.csv",
      "verificationDocument": "docs/architecture/nws-fallback-verification.md",
      "insidePolygon": false,
      "nearestPolygonMetres": 29,
      "secondNearestZone": "PRZ002",
      "secondNearestPolygonMetres": 1741.8
    }
  },
  {
    "stationId": "RW-23",
    "beachName": "Balneario de Puerto Nuevo",
    "municipality": "Vega Baja",
    "status": "verified",
    "reviewedCoordinates": {
      "latitude": 18.4913667,
      "longitude": -66.3990444
    },
    "originalMarineZone": "AMZ712",
    "fallbackForecastZone": "PRZ005",
    "mappingMethod": "reviewed-polygon-adjacency",
    "reviewedOn": "2026-10-27",
    "evidence": {
      "stationId": "RW-23",
      "verificationCsv": "docs/architecture/nws-fallback-verification.csv",
      "verificationDocument": "docs/architecture/nws-fallback-verification.md",
      "insidePolygon": false,
      "nearestPolygonMetres": 22.5,
      "secondNearestZone": "PRZ006",
      "secondNearestPolygonMetres": 12785
    }
  },
  {
    "stationId": "RW-28",
    "beachName": "Playa El Alambique",
    "municipality": "Carolina",
    "status": "verified",
    "reviewedCoordinates": {
      "latitude": 18.4440917,
      "longitude": -66.02215
    },
    "originalMarineZone": "AMZ712",
    "fallbackForecastZone": "PRZ001",
    "mappingMethod": "reviewed-polygon-adjacency",
    "reviewedOn": "2026-10-27",
    "evidence": {
      "stationId": "RW-28",
      "verificationCsv": "docs/architecture/nws-fallback-verification.csv",
      "verificationDocument": "docs/architecture/nws-fallback-verification.md",
      "insidePolygon": false,
      "nearestPolygonMetres": 20.1,
      "secondNearestZone": "PRZ002",
      "secondNearestPolygonMetres": 3469.5
    }
  },
  {
    "stationId": "RW-29",
    "beachName": "Vacía Talega",
    "municipality": "Loíza",
    "status": "verified",
    "reviewedCoordinates": {
      "latitude": 18.4478583,
      "longitude": -65.9062306
    },
    "originalMarineZone": "AMZ712",
    "fallbackForecastZone": "PRZ002",
    "mappingMethod": "reviewed-polygon-adjacency",
    "reviewedOn": "2026-10-27",
    "evidence": {
      "stationId": "RW-29",
      "verificationCsv": "docs/architecture/nws-fallback-verification.csv",
      "verificationDocument": "docs/architecture/nws-fallback-verification.md",
      "insidePolygon": false,
      "nearestPolygonMetres": 9.8,
      "secondNearestZone": "PRZ001",
      "secondNearestPolygonMetres": 3423.3
    }
  },
  {
    "stationId": "RW-31",
    "beachName": "Tropical Beach",
    "municipality": "Naguabo",
    "status": "verified",
    "reviewedCoordinates": {
      "latitude": 18.1869278,
      "longitude": -65.7259667
    },
    "originalMarineZone": "AMZ726",
    "fallbackForecastZone": "PRZ002",
    "mappingMethod": "reviewed-polygon-adjacency",
    "reviewedOn": "2026-10-27",
    "evidence": {
      "stationId": "RW-31",
      "verificationCsv": "docs/architecture/nws-fallback-verification.csv",
      "verificationDocument": "docs/architecture/nws-fallback-verification.md",
      "insidePolygon": false,
      "nearestPolygonMetres": 32.8,
      "secondNearestZone": "PRZ004",
      "secondNearestPolygonMetres": 10575.3
    }
  },
  {
    "stationId": "RW-32",
    "beachName": "Playa Azul",
    "municipality": "Luquillo",
    "status": "verified",
    "reviewedCoordinates": {
      "latitude": 18.3818667,
      "longitude": -65.7184583
    },
    "originalMarineZone": "AMZ712",
    "fallbackForecastZone": "PRZ002",
    "mappingMethod": "reviewed-polygon-adjacency",
    "reviewedOn": "2026-10-27",
    "evidence": {
      "stationId": "RW-32",
      "verificationCsv": "docs/architecture/nws-fallback-verification.csv",
      "verificationDocument": "docs/architecture/nws-fallback-verification.md",
      "insidePolygon": false,
      "nearestPolygonMetres": 24.9,
      "secondNearestZone": "PRZ004",
      "secondNearestPolygonMetres": 16544.3
    }
  },
  {
    "stationId": "RW-37",
    "beachName": "Villa Lamela",
    "municipality": "Cabo Rojo",
    "status": "verified",
    "reviewedCoordinates": {
      "latitude": 18.0645333,
      "longitude": -67.1975278
    },
    "originalMarineZone": "AMZ745",
    "fallbackForecastZone": "PRZ011",
    "mappingMethod": "reviewed-polygon-adjacency",
    "reviewedOn": "2026-10-27",
    "evidence": {
      "stationId": "RW-37",
      "verificationCsv": "docs/architecture/nws-fallback-verification.csv",
      "verificationDocument": "docs/architecture/nws-fallback-verification.md",
      "insidePolygon": false,
      "nearestPolygonMetres": 19.3,
      "secondNearestZone": "PRZ010",
      "secondNearestPolygonMetres": 9367.4
    }
  },
  {
    "stationId": "RW-38",
    "beachName": "Muelle de Arecibo",
    "municipality": "Arecibo",
    "status": "verified",
    "reviewedCoordinates": {
      "latitude": 18.4792583,
      "longitude": -66.7004667
    },
    "originalMarineZone": "AMZ712",
    "fallbackForecastZone": "PRZ005",
    "mappingMethod": "reviewed-polygon-adjacency",
    "reviewedOn": "2026-10-27",
    "evidence": {
      "stationId": "RW-38",
      "verificationCsv": "docs/architecture/nws-fallback-verification.csv",
      "verificationDocument": "docs/architecture/nws-fallback-verification.md",
      "insidePolygon": false,
      "nearestPolygonMetres": 31.9,
      "secondNearestZone": "PRZ008",
      "secondNearestPolygonMetres": 6808.8
    }
  },
  {
    "stationId": "RW-4",
    "beachName": "Balneario Punta Santiago",
    "municipality": "Humacao",
    "status": "verified",
    "reviewedCoordinates": {
      "latitude": 18.1584139,
      "longitude": -65.7551861
    },
    "originalMarineZone": "AMZ726",
    "fallbackForecastZone": "PRZ002",
    "mappingMethod": "reviewed-polygon-adjacency",
    "reviewedOn": "2026-10-27",
    "evidence": {
      "stationId": "RW-4",
      "verificationCsv": "docs/architecture/nws-fallback-verification.csv",
      "verificationDocument": "docs/architecture/nws-fallback-verification.md",
      "insidePolygon": false,
      "nearestPolygonMetres": 17.1,
      "secondNearestZone": "PRZ004",
      "secondNearestPolygonMetres": 8345.9
    }
  },
  {
    "stationId": "RW-8",
    "beachName": "Playa Buyé",
    "municipality": "Cabo Rojo",
    "status": "verified",
    "reviewedCoordinates": {
      "latitude": 18.0488722,
      "longitude": -67.198625
    },
    "originalMarineZone": "AMZ745",
    "fallbackForecastZone": "PRZ011",
    "mappingMethod": "reviewed-polygon-adjacency",
    "reviewedOn": "2026-10-27",
    "evidence": {
      "stationId": "RW-8",
      "verificationCsv": "docs/architecture/nws-fallback-verification.csv",
      "verificationDocument": "docs/architecture/nws-fallback-verification.md",
      "insidePolygon": false,
      "nearestPolygonMetres": 15.7,
      "secondNearestZone": "PRZ010",
      "secondNearestPolygonMetres": 9607.1
    }
  }
];
