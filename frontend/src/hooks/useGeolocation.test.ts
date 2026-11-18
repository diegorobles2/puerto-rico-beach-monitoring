import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GEOLOCATION_TIMEOUT_MS, useGeolocation } from './useGeolocation';

type Success = (position: { coords: { latitude: number; longitude: number } }) => void;
type Failure = (error: { code: number }) => void;

function stubGeolocation(respond: (success: Success, failure: Failure) => void) {
  const getCurrentPosition = vi.fn((success: Success, failure: Failure, _options?: PositionOptions) => respond(success, failure));
  vi.stubGlobal('navigator', { ...navigator, geolocation: { getCurrentPosition } });
  return getCurrentPosition;
}

describe('useGeolocation', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('does not request location until asked', () => {
    const getCurrentPosition = stubGeolocation(() => {});
    const { result } = renderHook(() => useGeolocation());

    expect(result.current.status).toBe('idle');
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });

  it('keeps the position in memory on success', () => {
    const getCurrentPosition = stubGeolocation((success) => success({ coords: { latitude: 18.4, longitude: -66.1 } }));
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const { result } = renderHook(() => useGeolocation());

    act(() => result.current.request());

    expect(result.current.status).toBe('success');
    expect(result.current.location).toEqual({ latitude: 18.4, longitude: -66.1 });
    expect(getCurrentPosition.mock.calls[0][2]).toMatchObject({ timeout: GEOLOCATION_TIMEOUT_MS });
    expect(setItem).not.toHaveBeenCalled();
    setItem.mockRestore();
  });

  it('reports locating while waiting for the browser', () => {
    stubGeolocation(() => {});
    const { result } = renderHook(() => useGeolocation());

    act(() => result.current.request());

    expect(result.current.status).toBe('locating');
  });

  it.each([
    [1, 'denied'],
    [2, 'unavailable'],
    [3, 'timeout'],
  ])('maps error code %s to %s with no location', (code, status) => {
    stubGeolocation((_, failure) => failure({ code }));
    const { result } = renderHook(() => useGeolocation());

    act(() => result.current.request());

    expect(result.current.status).toBe(status);
    expect(result.current.location).toBeNull();
  });

  it('reports unsupported browsers without throwing', () => {
    vi.stubGlobal('navigator', { ...navigator, geolocation: undefined });
    const { result } = renderHook(() => useGeolocation());

    act(() => result.current.request());

    expect(result.current.status).toBe('unsupported');
  });

  it('forgets the location when cleared', () => {
    stubGeolocation((success) => success({ coords: { latitude: 18.4, longitude: -66.1 } }));
    const { result } = renderHook(() => useGeolocation());

    act(() => result.current.request());
    act(() => result.current.clear());

    expect(result.current).toMatchObject({ status: 'idle', location: null });
  });
});
