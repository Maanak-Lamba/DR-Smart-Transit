import { useState, useCallback, useEffect, useRef } from 'react';
import { Bus, Menu, Wifi, WifiOff } from 'lucide-react';
import TransitMap from '@/components/transit/TransitMap';
import SearchPanel from '@/components/transit/SearchPanel';
import RouteResults from '@/components/transit/RouteResults';
import LiveTripCard from '@/components/transit/LiveTripCard';
import ProfileModal from '@/components/transit/ProfileModal';
import { mockStops, type RouteResult } from '@/data/mockTransitData';
import { useRealtimeBuses } from '@/hooks/useRealtimeBuses';
import { useGeolocation, isNearStop } from '@/hooks/useGeolocation';
import { toast } from 'sonner';
import { fetchPlan } from '@/services/transitApi';

interface UserProfile {
  birthYear: number;
  birthMonth: number;
  hasDisability: boolean;
}

// Decode Google-style encoded polyline into [lat, lng] pairs
function decodePolyline(encoded: string): [number, number][] {
  const points: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    shift = 0;
    result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    points.push([lat / 1e5, lng / 1e5]);
  }
  return points;
}

async function geocode(query: string): Promise<{ lat: number; lng: number; display: string } | null> {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query + ' Durham Region Ontario')}&format=json&limit=1`;
  const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
  const data = await res.json();
  if (!data.length) return null;
  return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), display: data[0].display_name };
}

// Calculate total walk distance in meters from a polyline
function polylineDistanceMeters(polyline: [number, number][]): number {
  if (polyline.length < 2) return 0;
  const toRad = (v: number) => (v * Math.PI) / 180;
  const R = 6371000;
  let total = 0;
  for (let i = 0; i < polyline.length - 1; i++) {
    const [lat1, lng1] = polyline[i];
    const [lat2, lng2] = polyline[i + 1];
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    total += R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
  return total;
}

// Parse departure time string like "04:35 a.m." into a Date object
function parseDepartureTime(timeStr: string): Date {
  const cleaned = timeStr.toLowerCase().replace(/\./g, '');
  const [timePart, period] = cleaned.split(' ');
  const [hours, minutes] = timePart.split(':').map(Number);
  const now = new Date();
  const dep = new Date();
  let h = hours;
  if (period === 'pm' && hours !== 12) h = hours + 12;
  if (period === 'am' && hours === 12) h = 0;
  dep.setHours(h, minutes, 0, 0);
  if (dep.getTime() < now.getTime() - 60000) dep.setDate(dep.getDate() + 1);
  return dep;
}

const Index = () => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [showProfile, setShowProfile] = useState(true);
  const [routes, setRoutes] = useState<RouteResult[]>([]);
  const [selectedRoute, setSelectedRoute] = useState<RouteResult | null>(null);
  const [scheduledTrip, setScheduledTrip] = useState<RouteResult | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);

  const { buses: realtimeBuses, error: busesError } = useRealtimeBuses(10000);
  const { lat: userLat, lng: userLng } = useGeolocation();

  // Track which notifications have already fired
  const notifiedEarlyRef = useRef(false);
  const notifiedUrgentRef = useRef(false);

  // Reset notification flags when trip changes
  useEffect(() => {
    notifiedEarlyRef.current = false;
    notifiedUrgentRef.current = false;
  }, [scheduledTrip?.id]);

  // Walk-time-based departure notifications
  useEffect(() => {
    if (!scheduledTrip) return;

    // Calculate walk time in minutes from walkToStop polyline
    const walkDistanceM = polylineDistanceMeters(scheduledTrip.walkToStop ?? []);
    // Average walking speed ~83m/min (5km/h)
    const walkTimeMin = Math.ceil(walkDistanceM / 83);
    // Add 2 minute buffer
    const walkTimePlusBuffer = walkTimeMin + 2;

    const interval = setInterval(() => {
      try {
        const dep = parseDepartureTime(scheduledTrip.departureTime);
        const now = new Date();
        const diffMin = (dep.getTime() - now.getTime()) / 60000;

        // Early reminder: when time left = walk time + 2 min buffer (fire once)
        if (!notifiedEarlyRef.current && diffMin <= walkTimePlusBuffer && diffMin > walkTimeMin) {
          notifiedEarlyRef.current = true;
          toast.info(`🚶 Time to head to the stop!`, {
            description: `Your bus departs in ${Math.round(diffMin)} min — walk takes ~${walkTimeMin} min.`,
            duration: 8000,
          });
        }

        // Urgent reminder: when time left = walk time (leave NOW)
        if (!notifiedUrgentRef.current && diffMin <= walkTimeMin && diffMin > 0) {
          notifiedUrgentRef.current = true;
          toast.warning(`🏃 Leave now!`, {
            description: `Bus departs in ${Math.round(diffMin)} min — you need to leave immediately!`,
            duration: 10000,
          });
        }

        // Clear interval after bus has departed
        if (diffMin <= 0) clearInterval(interval);

      } catch (e) {
        clearInterval(interval);
      }
    }, 15000); // check every 15 seconds

    return () => clearInterval(interval);
  }, [scheduledTrip]);

  const handleProfileComplete = useCallback((p: UserProfile) => {
    setProfile(p);
    setShowProfile(false);
    const age = new Date().getFullYear() - p.birthYear;
    toast.success(`Welcome! ${age >= 65 || p.hasDisability ? 'Accessibility features enabled.' : 'Your profile is set up.'}`);
  }, []);

  const handleSearch = useCallback(async (from: string, to: string) => {
    setIsSearching(true);
    setRoutes([]);

    const [fromCoord, toCoord] = await Promise.all([geocode(from), geocode(to)]);

    if (!fromCoord) { toast.error(`Location not found: "${from}"`); setIsSearching(false); return; }
    if (!toCoord) { toast.error(`Location not found: "${to}"`); setIsSearching(false); return; }

    try {
      const planData = await fetchPlan(fromCoord.lat, fromCoord.lng, toCoord.lat, toCoord.lng);
      const results = planData.results || [];

      if (results.length === 0) {
        toast.info('No routes found for that trip');
        setIsSearching(false);
        return;
      }

      const realRoutes: RouteResult[] = results.map((result: any, idx: number) => {
        const legs = result.legs ?? [];

        const transitLegs = legs.filter((l: any) => l.leg_mode === 'transit');
        const firstWalkLeg = legs[0]?.leg_mode === 'walk' ? legs[0] : null;

        const durationMin = Math.round(result.duration / 60);
        const depTime = new Date(result.start_time * 1000);
        const arrTime = new Date(result.end_time * 1000);
        const transfers = Math.max(0, transitLegs.length - 1);

        const firstTransitLeg = transitLegs[0];
        const firstRoute = firstTransitLeg?.routes?.[0];
        const routeNumber = firstRoute?.route_short_name ?? '?';
        const routeName = firstRoute?.route_long_name ?? routeNumber;

        const firstDeparture = firstTransitLeg?.departures?.[0];
        const delayMinutes = firstDeparture?.is_real_time
          ? Math.round((firstDeparture.departure_time - firstDeparture.scheduled_departure_time) / 60)
          : 0;

        const stops: { name: string; time: string; routeId?: string }[] = [];
        transitLegs.forEach((leg: any) => {
          const route = leg.routes?.[0];
          const itinerary = route?.itineraries?.[0];
          const legStops = itinerary?.stops ?? [];
          const planDetails = itinerary?.plan_details;
          const startOffset = planDetails?.start_stop_offset ?? 0;
          const endOffset = planDetails?.end_stop_offset ?? legStops.length - 1;
          const relevantStops = legStops.slice(startOffset, endOffset + 1);
          const departure = leg.departures?.[0];

          relevantStops.forEach((stop: any, stopIdx: number) => {
            const schedItem = departure?.plan_details?.stop_schedule_items?.find(
              (s: any) => s.global_stop_id === stop.global_stop_id
            );
            const time = schedItem
              ? new Date(schedItem.departure_time * 1000).toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' })
              : new Date((leg.start_time + stopIdx * 60) * 1000).toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' });

            if (stops.length === 0 || stops[stops.length - 1].name !== stop.stop_name) {
              stops.push({ name: stop.stop_name, time, routeId: route?.route_short_name });
            }
          });
        });

        if (stops.length > 0 && stops[stops.length - 1].name !== to) {
          stops.push({
            name: to,
            time: arrTime.toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' }),
          });
        }

        const routeLegs: { routeNumber: string; routeName: string; polyline: [number, number][] }[] = transitLegs.map((leg: any) => {
          const route = leg.routes?.[0];
          const itinerary = route?.itineraries?.[0];
          const shape = itinerary?.plan_details?.plan_shape ?? leg.polyline ?? '';
          return {
            routeNumber: route?.route_short_name ?? '?',
            routeName: route?.route_long_name ?? route?.route_short_name ?? '?',
            polyline: shape ? decodePolyline(shape) : [] as [number, number][],
          };
        });

        const busPolyline: [number, number][] = routeLegs.flatMap((l) => l.polyline);

        const walkToStop: [number, number][] = firstWalkLeg?.polyline
          ? decodePolyline(firstWalkLeg.polyline)
          : [];

        const transferPoints: { lat: number; lng: number; nextRoute: string }[] = [];
        for (let i = 0; i < transitLegs.length - 1; i++) {
          const currentLeg = transitLegs[i];
          const nextLeg = transitLegs[i + 1];
          const nextRoute = nextLeg?.routes?.[0]?.route_short_name ?? 'Next Bus';
          const itinerary = currentLeg.routes?.[0]?.itineraries?.[0];
          const legStops = itinerary?.stops ?? [];
          const endOffset = itinerary?.plan_details?.end_stop_offset ?? legStops.length - 1;
          const transferStop = legStops[endOffset];
          if (transferStop) {
            transferPoints.push({ lat: transferStop.stop_lat, lng: transferStop.stop_lon, nextRoute });
          }
        }

        const firstTransitItinerary = firstTransitLeg?.routes?.[0]?.itineraries?.[0];
        const firstLegStops = firstTransitItinerary?.stops ?? [];
        const startOffset = firstTransitItinerary?.plan_details?.start_stop_offset ?? 0;
        const boardingStop = firstLegStops[startOffset];

        return {
          id: `plan-${idx}-${result.start_time}`,
          routeName,
          routeNumber,
          departureTime: depTime.toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' }),
          arrivalTime: arrTime.toLocaleTimeString('en-CA', { hour: '2-digit', minute: '2-digit' }),
          duration: `~${durationMin} min`,
          transfers,
          transferPoints,
          status: delayMinutes > 1 ? ('delayed' as const) : ('on-time' as const),
          delayMinutes: delayMinutes > 0 ? delayMinutes : undefined,
          stops,
          polyline: busPolyline,
          legs: routeLegs,
          walkToStop,
          walkFromStop: [],
          boardingStopLat: boardingStop?.stop_lat ?? null,
          boardingStopLng: boardingStop?.stop_lon ?? null,
        };
      });

      setRoutes(realRoutes);
      toast.info(`${realRoutes.length} route(s) found`);
    } catch (err) {
      toast.error('Failed to fetch routes — check your proxy server');
      console.error(err);
    }

    setIsSearching(false);
  }, [userLat, userLng]);

  const handleScheduleTrip = useCallback((route: RouteResult) => {
    setScheduledTrip(route);

    // Calculate walk time for the confirmation message
    const walkDistanceM = polylineDistanceMeters(route.walkToStop ?? []);
    const walkTimeMin = Math.ceil(walkDistanceM / 83);

    toast.success(`Trip scheduled on Route ${route.routeNumber}`, {
      description: walkTimeMin > 0
        ? `Walk to stop takes ~${walkTimeMin} min. You'll be notified when it's time to leave!`
        : 'You will receive notifications before departure.',
    });
  }, []);

  const handleCheckIn = useCallback(() => {
    toast.success('Checked in successfully!', {
      description: 'The driver has been notified.',
    });
  }, []);

  const handleHalt = useCallback(() => {
    toast.success('Halt request sent!', {
      description: 'The bus will wait at your stop.',
    });
  }, []);

  const busArrivingSoon = scheduledTrip
    ? (() => {
      try {
        const dep = parseDepartureTime(scheduledTrip.departureTime);
        const diffMs = dep.getTime() - new Date().getTime();
        return diffMs >= 0 && diffMs <= 3 * 60 * 1000;
      } catch { return false; }
    })()
    : false;

  const isEligibleForHalt = profile
    ? new Date().getFullYear() - profile.birthYear >= 65 || profile.hasDisability
    : false;

  const isNearBoardingStop =
    scheduledTrip && userLat != null && userLng != null &&
    scheduledTrip.boardingStopLat != null && scheduledTrip.boardingStopLng != null
      ? isNearStop(userLat, userLng, scheduledTrip.boardingStopLat, scheduledTrip.boardingStopLng, 150)
      : false;

  const isVeryNearBoardingStop =
    scheduledTrip && userLat != null && userLng != null &&
    scheduledTrip.boardingStopLat != null && scheduledTrip.boardingStopLng != null
      ? isNearStop(userLat, userLng, scheduledTrip.boardingStopLat, scheduledTrip.boardingStopLng, 30)
      : false;

  return (
    <div className="h-screen w-screen overflow-hidden relative">
      <div className="absolute inset-0">
        <TransitMap
          stops={mockStops}
          buses={realtimeBuses}
          selectedRoute={selectedRoute}
          userLat={userLat}
          userLng={userLng}
        />
      </div>

      <div className="absolute top-0 left-0 right-0 z-10 p-3">
        <div className="flex items-center gap-2 max-w-lg">
          <div className="transit-panel px-3 py-2 flex items-center gap-2">
            <Bus className="w-5 h-5 text-primary" />
            <span className="font-bold text-foreground text-sm">DRT Smart Transit</span>
          </div>
          <div className="transit-panel px-2 py-2 flex items-center gap-1">
            {busesError ? (
              <WifiOff className="w-4 h-4 text-destructive" />
            ) : (
              <Wifi className="w-4 h-4 text-success" />
            )}
            <span className="font-mono text-xs text-muted-foreground">
              {realtimeBuses.length} buses
            </span>
          </div>
          <button
            onClick={() => setPanelOpen(!panelOpen)}
            className="transit-panel p-2 lg:hidden"
          >
            <Menu className="w-5 h-5 text-foreground" />
          </button>
        </div>
      </div>

      <div className={`absolute top-0 left-0 bottom-0 z-20 w-full max-w-[400px] transition-transform duration-300 ${
        panelOpen ? 'translate-x-0' : '-translate-x-full'
      }`}>
        <div className="h-full overflow-y-auto p-3 pt-16 pb-32 space-y-3">
          <SearchPanel onSearch={handleSearch} isSearching={isSearching} locationReady={userLat != null && userLng != null} />
          <RouteResults
            routes={routes}
            selectedRoute={selectedRoute}
            onSelectRoute={setSelectedRoute}
            onScheduleTrip={handleScheduleTrip}
          />
        </div>
      </div>

      {scheduledTrip && (
        <LiveTripCard
          route={scheduledTrip}
          canCheckIn={isNearBoardingStop && busArrivingSoon}
          canHalt={isEligibleForHalt && isVeryNearBoardingStop && busArrivingSoon}
          busArrivingSoon={busArrivingSoon}
          onCheckIn={handleCheckIn}
          onHalt={handleHalt}
          onCancel={() => setScheduledTrip(null)}
        />
      )}

      <ProfileModal open={showProfile} onComplete={handleProfileComplete} />
    </div>
  );
};

export default Index;