import { supabase } from '@/integrations/supabase/client';

export interface RealtimeBus {
  id: string;
  tripId: string;
  routeId: string;
  lat: number;
  lng: number;
  bearing: number;
  speed: number;
  label: string;
  timestamp: number;
}

export interface NearbyStop {
  global_stop_id: string;
  stop_name: string;
  stop_lat: number;
  stop_lon: number;
  stop_code: string;
  distance: number;
  wheelchair_boarding: number;
}

// Fetch realtime vehicle positions
export async function fetchRealtimeVehicles(): Promise<RealtimeBus[]> {
  try {
    const { data, error } = await supabase.functions.invoke('gtfs-realtime?feed=vehicles');
    if (error) throw error;
    return data?.vehicles || [];
  } catch (e) {
    console.error('Error fetching realtime vehicles:', e);
    return [];
  }
}

// Fetch nearby stops via Transit API
export async function fetchNearbyStops(lat: number, lng: number, maxDistance = 500): Promise<NearbyStop[]> {
  try {
    const { data, error } = await supabase.functions.invoke(
      `transit-proxy?endpoint=/v3/public/nearby_stops&lat=${lat}&lon=${lng}&max_distance=${maxDistance}`
    );
    if (error) throw error;
    return data?.stops || [];
  } catch (e) {
    console.error('Error fetching nearby stops:', e);
    return [];
  }
}

// Fetch stop departures
export async function fetchStopDepartures(globalStopId: string) {
  try {
    const { data, error } = await supabase.functions.invoke(
      `transit-proxy?endpoint=/v3/public/stop_departures&global_stop_id=${globalStopId}`
    );
    if (error) throw error;
    return data;
  } catch (e) {
    console.error('Error fetching stop departures:', e);
    return null;
  }
}
