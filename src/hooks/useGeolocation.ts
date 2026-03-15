import { useState, useEffect, useCallback } from 'react';

export interface GeolocationState {
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  loading: boolean;
  error: string | null;
}

const DEFAULT_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,  // GPS-level accuracy for real-time tracking
  maximumAge: 10000,         // Accept cached position up to 10s old
  timeout: 10000,            // Fail if no position within 10s
};

// Returns true if user is within `thresholdMeters` of a given stop
export function isNearStop(
  userLat: number,
  userLng: number,
  stopLat: number,
  stopLng: number,
  thresholdMeters: number = 150
): boolean {
  const toRad = (val: number) => (val * Math.PI) / 180;
  const R = 6371000; // Earth radius in meters

  const dLat = toRad(stopLat - userLat);
  const dLng = toRad(stopLng - userLng);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(userLat)) *
      Math.cos(toRad(stopLat)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;

  return distance <= thresholdMeters;
}

export function useGeolocation(options: PositionOptions = DEFAULT_OPTIONS) {
  const [state, setState] = useState<GeolocationState>({
    lat: null,
    lng: null,
    accuracy: null,
    loading: true,
    error: null,
  });

  // One-time location fetch (e.g. for initial nearby stops load)
  const fetchOnce = useCallback(() => {
    if (!navigator.geolocation) {
      setState(prev => ({ ...prev, loading: false, error: 'Geolocation is not supported by your browser.' }));
      return;
    }

    setState(prev => ({ ...prev, loading: true, error: null }));

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setState({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
          loading: false,
          error: null,
        });
      },
      (err) => {
        setState(prev => ({
          ...prev,
          loading: false,
          error: err.message,
        }));
      },
      options
    );
  }, [options]);

  // Real-time tracking — updates state as user moves
  useEffect(() => {
    if (!navigator.geolocation) {
      setState(prev => ({ ...prev, loading: false, error: 'Geolocation is not supported by your browser.' }));
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setState({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
          loading: false,
          error: null,
        });
      },
      (err) => {
        setState(prev => ({
          ...prev,
          loading: false,
          error: err.message,
        }));
      },
      options
    );

    // Cleanup watcher when component unmounts
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  return { ...state, fetchOnce };
}
