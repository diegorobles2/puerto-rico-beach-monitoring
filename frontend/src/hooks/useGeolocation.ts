import { useCallback, useEffect, useRef, useState } from 'react';
import type { Coordinates } from '../utils/distance';

export type GeolocationStatus = 'idle' | 'locating' | 'success' | 'denied' | 'timeout' | 'unavailable' | 'unsupported';

export const GEOLOCATION_TIMEOUT_MS = 10_000;

/**
 * Opt-in browser location. Nothing is requested until `request` is called,
 * and the position is held in component state only (never persisted).
 */
export function useGeolocation() {
  const [status, setStatus] = useState<GeolocationStatus>('idle');
  const [location, setLocation] = useState<Coordinates | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const request = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setStatus('unsupported');
      return;
    }

    setStatus('locating');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (!mounted.current) return;
        setLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude });
        setStatus('success');
      },
      (error) => {
        if (!mounted.current) return;
        setLocation(null);
        // GeolocationPositionError codes: 1 PERMISSION_DENIED, 2 POSITION_UNAVAILABLE, 3 TIMEOUT.
        setStatus(error.code === 1 ? 'denied' : error.code === 3 ? 'timeout' : 'unavailable');
      },
      { enableHighAccuracy: false, timeout: GEOLOCATION_TIMEOUT_MS, maximumAge: 5 * 60 * 1000 },
    );
  }, []);

  const clear = useCallback(() => {
    setLocation(null);
    setStatus('idle');
  }, []);

  return { status, location, request, clear };
}
