// Raw DRNA formats must remain inside the data-sources boundary.
export interface DrnaMonitoringRecord {
  date: string | null;
  beachId: string | null;
  beachName: string | null;
  samplingType: string | null;
  enterococcus: string | null;
  temperatureCelsius: string | null;
  ph: string | null;
  observations: string | null;
}

export interface DrnaMapperInput {
  record: DrnaMonitoringRecord;
  sourceUrl: string;
  retrievedAt: string;
}
