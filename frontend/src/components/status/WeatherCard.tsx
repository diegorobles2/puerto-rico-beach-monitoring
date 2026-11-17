import type { WeatherResponse } from '../../types';
import { useEffect, useState } from 'react';
import { NwsProvenance } from '../common/NwsProvenance';

export function WeatherCard({ condition, loading = false, error }: {
  condition?: WeatherResponse; loading?: boolean; error?: string;
}) {
  const [, refreshClock] = useState(0);
  useEffect(() => {
    if (!condition?.forecast) return;
    const deadline = Math.min(Date.parse(condition.forecast.validTo),
      Date.parse(condition.observedAt ?? '') + 24 * 60 * 60 * 1000,
      Date.parse(condition.retrievedAt ?? '') + 6 * 60 * 60 * 1000);
    const remaining = deadline - Date.now();
    if (!Number.isFinite(remaining) || remaining <= 0) return;
    const timer = setTimeout(() => refreshClock(value => value + 1), Math.min(remaining + 1, 2147483647));
    return () => clearTimeout(timer);
  }, [condition]);
  const forecast = condition?.forecast;
  const now = Date.now();
  const issued = Date.parse(condition?.observedAt ?? '');
  const retrieved = Date.parse(condition?.retrievedAt ?? '');
  // Keep the same conservative forecast-age policy as the weather API, including older API responses.
  const fresh = forecast && issued <= now && now - issued <= 24 * 60 * 60 * 1000
    && retrieved <= now && now - retrieved <= 6 * 60 * 60 * 1000
    && Date.parse(forecast.validFrom) <= now && now < Date.parse(forecast.validTo);
  const historical = loading || !!error || condition?.availability === 'stale' || !fresh;
  return <article aria-label="Weather" aria-busy={loading} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
    <h2 className="text-lg font-semibold text-slate-900">Weather</h2>
    {loading && <p role="status">Loading weather forecast...</p>}
    {error && <p role="status">{error}. Current forecast could not be verified.</p>}
    {!loading && (!forecast || condition?.availability === 'unavailable') && <p>
      Weather unavailable. {condition?.unavailableReason === 'unsupported-location'
        ? 'NWS has no supported forecast mapping for these coordinates.' : 'No usable weather forecast is available.'}
    </p>}
    {forecast && condition?.availability !== 'unavailable' && <>
      {historical && <p role="status">Stale data: current weather forecast is unknown. Last-known forecast (historical).</p>}
      <p className="mt-3 font-semibold">{forecast.name}: {forecast.shortForecast}</p>
      <dl className="mt-3 space-y-1">
        <div><dt>Air temperature (forecast)</dt><dd>{forecast.temperature}°{forecast.temperatureUnit}</dd></div>
        <div><dt>Wind (forecast)</dt><dd>{forecast.windSpeed} {forecast.windDirection}</dd></div>
        <div><dt>Precipitation probability</dt><dd>{forecast.precipitationProbabilityPercent == null ? 'Not reported' : `${forecast.precipitationProbabilityPercent}%`}</dd></div>
        <div><dt>Forecast valid from</dt><dd><time dateTime={forecast.validFrom}>{forecast.validFrom}</time></dd></div>
        <div><dt>Forecast valid until</dt><dd><time dateTime={forecast.validTo}>{forecast.validTo}</time></dd></div>
      </dl>
      <p className="mt-3">{forecast.detailedForecast}</p>
    </>}
    {condition && <NwsProvenance {...condition} />}
    <p className="mt-3 text-sm">Weather forecasts are not live observations or a swimming-safety assessment. Check water quality, ocean risk, and official alerts separately.</p>
  </article>;
}
