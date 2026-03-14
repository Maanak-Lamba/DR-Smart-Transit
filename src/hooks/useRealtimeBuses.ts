import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchRealtimeVehicles, type RealtimeBus } from '@/services/transitApi';

export function useRealtimeBuses(pollInterval = 10000) {
  const [buses, setBuses] = useState<RealtimeBus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchBuses = useCallback(async () => {
    try {
      const vehicles = await fetchRealtimeVehicles();
      setBuses(vehicles);
      setError(null);
    } catch (e) {
      setError('Failed to fetch bus positions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBuses();
    intervalRef.current = setInterval(fetchBuses, pollInterval);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchBuses, pollInterval]);

  return { buses, loading, error, refetch: fetchBuses };
}
