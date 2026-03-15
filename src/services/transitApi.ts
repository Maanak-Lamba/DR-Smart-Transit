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

export interface PlanLeg {
  leg_mode: 'walk' | 'transit';
  start_time: number;
  end_time: number;
  duration: number;
  distance: number;
  polyline: string; // encoded polyline string
  routes?: {
    route_short_name: string;
    route_long_name: string;
    global_route_id: string;
    route_color: string;
    itineraries?: {
      stops?: {
        stop_name: string;
        stop_lat: number;
        stop_lon: number;
        global_stop_id: string;
      }[];
      plan_details?: {
        plan_shape: string;
        start_stop_offset: number;
        end_stop_offset: number;
      };
    }[];
  }[];
  departures?: {
    departure_time: number;
    arrival_time: number;
    is_real_time: boolean;
    scheduled_departure_time: number;
    plan_details?: {
      stop_schedule_items?: {
        global_stop_id: string;
        departure_time: number;
      }[];
    };
  }[];
}

export interface PlanResult {
  duration: number;
  start_time: number;
  end_time: number;
  legs: PlanLeg[];
}

export interface PlanResponse {
  results: PlanResult[];
}

const BASE_URL = '/api';

export async function fetchNearbyRoutes(lat: number, lon: number, departureTime?: number) {
  const params = new URLSearchParams({
    lat: lat.toString(),
    lon: lon.toString(),
    max_distance: '1500',
    max_num_departures: '5',
    should_update_realtime: 'true',
    ...(departureTime ? { time: departureTime.toString() } : {}),
  });

  const res = await fetch(`${BASE_URL}/nearby_routes?${params}`);
  if (!res.ok) throw new Error(`Transit API error: ${res.status}`);
  return res.json();
}

export async function fetchNearbyStops(lat: number, lon: number): Promise<NearbyStop[]> {
  const params = new URLSearchParams({
    lat: lat.toString(),
    lon: lon.toString(),
    max_distance: '500',
  });

  const res = await fetch(`${BASE_URL}/nearby_stops?${params}`);
  if (!res.ok) throw new Error(`Transit API error: ${res.status}`);
  const data = await res.json();
  return data?.stops || [];
}

export async function fetchPlan(
  fromLat: number,
  fromLon: number,
  toLat: number,
  toLon: number,
  departureTime?: number
): Promise<PlanResponse> {
  const params = new URLSearchParams({
    from_lat: fromLat.toString(),
    from_lon: fromLon.toString(),
    to_lat: toLat.toString(),
    to_lon: toLon.toString(),
    ...(departureTime ? { time: departureTime.toString() } : {}),
  });

  const res = await fetch(`${BASE_URL}/plan?${params}`);
  if (!res.ok) throw new Error(`Plan API error: ${res.status}`);
  return res.json();
}

// Vehicle positions aren't in v3 public API — keep returning empty for now
export async function fetchRealtimeVehicles(): Promise<RealtimeBus[]> {
  return [];
}