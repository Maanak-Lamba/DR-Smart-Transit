import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { DURHAM_CENTER, type BusStop, type RouteResult } from '@/data/mockTransitData';
import type { RealtimeBus } from '@/services/transitApi';

interface TransitMapProps {
  stops: BusStop[];
  buses: RealtimeBus[];
  selectedRoute: RouteResult | null;
  userLat?: number | null;
  userLng?: number | null;
}

// Distinct colors for each transit leg
const LEG_COLORS = ['#006747', '#2563eb', '#dc2626', '#7c3aed', '#0891b2'];

export default function TransitMap({ stops, buses, selectedRoute, userLat, userLng }: TransitMapProps) {
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const stopsLayerRef = useRef<L.LayerGroup | null>(null);
  const busesLayerRef = useRef<L.LayerGroup | null>(null);
  const routeLayersRef = useRef<L.Layer[]>([]);
  const userMarkerRef = useRef<L.Marker | null>(null);

  // Initialize map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: DURHAM_CENTER,
      zoom: 12,
      zoomControl: true,
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);

    mapRef.current = map;
    stopsLayerRef.current = L.layerGroup().addTo(map);
    busesLayerRef.current = L.layerGroup().addTo(map);

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update user location marker
  useEffect(() => {
    if (!mapRef.current || userLat == null || userLng == null) return;

    const userIcon = L.divIcon({
      className: '',
      html: `
        <div style="position:relative;width:22px;height:22px;">
          <div style="
            position:absolute;inset:0;
            background:rgba(59,130,246,0.25);
            border-radius:50%;
            animation:pulse 2s ease-out infinite;
          "></div>
          <div style="
            position:absolute;top:50%;left:50%;
            transform:translate(-50%,-50%);
            width:14px;height:14px;
            background:#3b82f6;
            border:3px solid white;
            border-radius:50%;
            box-shadow:0 2px 6px rgba(59,130,246,0.6);
          "></div>
        </div>
        <style>
          @keyframes pulse {
            0% { transform: scale(0.8); opacity: 1; }
            100% { transform: scale(2.5); opacity: 0; }
          }
        </style>
      `,
      iconSize: [22, 22],
      iconAnchor: [11, 11],
    });

    if (userMarkerRef.current) {
      userMarkerRef.current.setLatLng([userLat, userLng]);
    } else {
      userMarkerRef.current = L.marker([userLat, userLng], { icon: userIcon, zIndexOffset: 1000 })
        .bindPopup('<strong>You are here</strong>')
        .addTo(mapRef.current);
    }
  }, [userLat, userLng]);

  // Update stops
  useEffect(() => {
    if (!stopsLayerRef.current) return;
    stopsLayerRef.current.clearLayers();

    stops.forEach(stop => {
      const icon = L.divIcon({
        className: 'stop-marker',
        html: `<div style="width:10px;height:10px;background:#006747;border:2px solid white;border-radius:50%;box-shadow:0 1px 3px rgba(0,0,0,0.3);"></div>`,
        iconSize: [10, 10],
        iconAnchor: [5, 5],
      });

      L.marker([stop.lat, stop.lng], { icon })
        .bindPopup(`<strong>${stop.name}</strong><br/><span style="font-size:12px;color:#64748B">Routes: ${stop.routes.join(', ')}</span>`)
        .addTo(stopsLayerRef.current!);
    });
  }, [stops]);

  // Update buses
  useEffect(() => {
    if (!busesLayerRef.current) return;
    busesLayerRef.current.clearLayers();

    buses.forEach(bus => {
      const icon = L.divIcon({
        className: 'bus-marker',
        html: `<div style="background:#006747;color:white;font-family:'Roboto Mono',monospace;font-size:10px;font-weight:700;padding:3px 6px;border-radius:4px;white-space:nowrap;box-shadow:0 2px 4px rgba(0,0,0,0.3);border:2px solid white;line-height:1;">${bus.label}</div>`,
        iconSize: [36, 20],
        iconAnchor: [18, 10],
      });

      L.marker([bus.lat, bus.lng], { icon })
        .bindPopup(`<strong>Route ${bus.label}</strong><br/><span style="font-family:'Roboto Mono';font-size:12px">ID: ${bus.id}</span>`)
        .addTo(busesLayerRef.current!);
    });
  }, [buses]);

  // Update selected route
  useEffect(() => {
    if (!mapRef.current) return;

    // Clear all previous route layers
    routeLayersRef.current.forEach(layer => layer.remove());
    routeLayersRef.current = [];

    if (!selectedRoute) return;

    const allPoints: [number, number][] = [];

    // Draw each transit leg in its own color
    if (selectedRoute.legs && selectedRoute.legs.length > 0) {
      selectedRoute.legs.forEach((leg, idx) => {
        if (leg.polyline.length === 0) return;
        const color = LEG_COLORS[idx % LEG_COLORS.length];
        const polyline = L.polyline(leg.polyline, {
          color,
          weight: 5,
          opacity: 0.85,
        }).addTo(mapRef.current!);

        // Route label tooltip on the line
        polyline.bindTooltip(
          `<span style="font-weight:700;font-size:12px">${leg.routeNumber}</span>`,
          { permanent: false, sticky: true }
        );

        routeLayersRef.current.push(polyline);
        allPoints.push(...leg.polyline);
      });
    } else if (selectedRoute.polyline.length > 0) {
      // Fallback: single polyline
      const polyline = L.polyline(selectedRoute.polyline, {
        color: LEG_COLORS[0],
        weight: 5,
        opacity: 0.85,
      }).addTo(mapRef.current!);
      routeLayersRef.current.push(polyline);
      allPoints.push(...selectedRoute.polyline);
    }

    // Draw walking leg
    if (selectedRoute.walkToStop && selectedRoute.walkToStop.length > 0) {
      const walkLine = L.polyline(selectedRoute.walkToStop, {
        color: '#3b82f6',
        weight: 3,
        opacity: 0.7,
        dashArray: '6, 8',
      }).addTo(mapRef.current!);
      routeLayersRef.current.push(walkLine);
      allPoints.push(...selectedRoute.walkToStop);
    }

    // Start marker
    const firstPoint = selectedRoute.walkToStop?.length
      ? selectedRoute.walkToStop[0]
      : allPoints[0];

    if (firstPoint) {
      const startIcon = L.divIcon({
        className: '',
        html: `<div style="width:14px;height:14px;background:#22c55e;border:3px solid white;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.4);"></div>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      });
      const m = L.marker([firstPoint[0], firstPoint[1]], { icon: startIcon })
        .bindPopup(`<strong>Start:</strong> ${selectedRoute.stops[0]?.name ?? 'Origin'}`)
        .addTo(mapRef.current!);
      routeLayersRef.current.push(m);
    }

    // End marker — use last point of the combined polyline, not allPoints
    // (allPoints may include walk leg points added before transit points)
    const lastPoint = selectedRoute.polyline.length > 0
    ? selectedRoute.polyline[selectedRoute.polyline.length - 1]
    : allPoints[allPoints.length - 1];
    if (lastPoint) {
      const endIcon = L.divIcon({
        className: '',
        html: `<div style="width:14px;height:14px;background:#ef4444;border:3px solid white;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.4);"></div>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      });
      const m = L.marker([lastPoint[0], lastPoint[1]], { icon: endIcon })
        .bindPopup(`<strong>End:</strong> ${selectedRoute.stops[selectedRoute.stops.length - 1]?.name ?? 'Destination'}`)
        .addTo(mapRef.current!);
      routeLayersRef.current.push(m);
    }

    // Transfer markers
    (selectedRoute.transferPoints ?? []).forEach(tp => {
      const transferIcon = L.divIcon({
        className: '',
        html: `<div style="background:#f59e0b;color:white;font-size:9px;font-weight:700;padding:2px 5px;border-radius:4px;white-space:nowrap;border:2px solid white;box-shadow:0 2px 4px rgba(0,0,0,0.3);">Transfer → ${tp.nextRoute}</div>`,
        iconSize: [80, 18],
        iconAnchor: [40, 9],
      });
      const m = L.marker([tp.lat, tp.lng], { icon: transferIcon })
        .bindPopup(`<strong>Transfer here</strong><br/>Board Route <strong>${tp.nextRoute}</strong>`)
        .addTo(mapRef.current!);
      routeLayersRef.current.push(m);
    });

    // Fit bounds to all points
    if (allPoints.length > 0) {
      const bounds = L.latLngBounds(allPoints.map(p => L.latLng(p[0], p[1])));
      mapRef.current.fitBounds(bounds, { padding: [60, 60] });
    }
  }, [selectedRoute]);

  return <div ref={containerRef} className="w-full h-full" />;
}