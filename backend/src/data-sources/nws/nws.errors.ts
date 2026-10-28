export type NwsErrorCode =
  | 'unsupported-marine-point' | 'not-found' | 'rate-limited' | 'upstream-unavailable'
  | 'http-error' | 'network' | 'timeout' | 'invalid-response' | 'invalid-coordinates' | 'invalid-zone';

export class NwsError extends Error {
  readonly fallbackEligible: boolean = false;

  constructor(
    readonly code: NwsErrorCode,
    message: string,
    readonly sourceUrl?: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** Potential eligibility only: a reviewed registry match is still required. */
export class NwsMarinePointError extends NwsError {
  override readonly fallbackEligible: boolean = true;

  constructor(
    readonly marineZone: string,
    readonly latitude: number,
    readonly longitude: number,
    sourceUrl: string,
  ) {
    super('unsupported-marine-point', `NWS point response has no Puerto Rico forecast zone (marine zone ${marineZone})`, sourceUrl);
  }
}

export class NwsHttpError extends NwsError {
  readonly retryable: boolean;

  constructor(readonly status: number, label: string, sourceUrl: string) {
    super(status === 404 ? 'not-found' : status === 429 ? 'rate-limited'
      : status >= 500 && status <= 599 ? 'upstream-unavailable' : 'http-error',
    `NWS ${label} returned HTTP ${status}`, sourceUrl);
    this.retryable = status === 429 || (status >= 500 && status <= 599);
  }
}

export class NwsTransportError extends NwsError {
  constructor(code: 'network' | 'timeout', label: string, sourceUrl: string) {
    super(code, `Unable to retrieve NWS ${label}`, sourceUrl);
  }
}

export class NwsInvalidResponseError extends NwsError {
  constructor(message: string, sourceUrl: string) {
    super('invalid-response', message, sourceUrl);
  }
}

export class NwsInvalidCoordinatesError extends NwsError {
  constructor(readonly latitude: number, readonly longitude: number) {
    super('invalid-coordinates', 'Invalid coordinates for NWS point lookup');
  }
}

export class NwsInvalidZoneError extends NwsError {
  constructor(readonly zoneId: string) {
    super('invalid-zone', `Invalid NWS Puerto Rico forecast zone: ${zoneId}`);
  }
}
