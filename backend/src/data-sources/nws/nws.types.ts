// Raw NWS response types remain inside the data-sources boundary.
export interface NwsProductReference {
  id?: unknown;
  '@id'?: unknown;
  issuanceTime?: unknown;
  productCode?: unknown;
}

export interface NwsProductIndex {
  '@graph'?: unknown;
}

export interface NwsSurfForecastProduct {
  id?: unknown;
  '@id'?: unknown;
  issuingOffice?: unknown;
  issuanceTime?: unknown;
  productCode?: unknown;
  productName?: unknown;
  productText?: unknown;
}

export interface NwsAlertFeature {
  id?: unknown;
  properties?: unknown;
}

export interface NwsAlertCollection {
  type?: unknown;
  features?: unknown;
}
