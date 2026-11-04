// Raw DRNA formats must remain inside the data-sources boundary.
export interface DrnaMonitoringRecord {
  date: string | null;
  beachId: string | null;
  beachName: string | null;
  latitude: string | null;
  longitude: string | null;
  samplingRoute: string | null;
  samplingType: string | null;
  enterococcus: string | null;
  temperatureCelsius: string | null;
  ph: string | null;
  observations: string | null;
}

export interface DrnaBeachStation {
  stationId: string;
  name: string;
  municipality: string;
  latitude: number | null;
  longitude: number | null;
}

export interface DrnaCatalog {
  stations: DrnaBeachStation[];
  observations: import('../../types/domain').WaterQualityObservation[];
  rejectedRows: number;
  sourceRows: number;
}

export interface DrnaMapperInput {
  record: DrnaMonitoringRecord;
  sourceUrl: string;
  retrievedAt: string;
}
