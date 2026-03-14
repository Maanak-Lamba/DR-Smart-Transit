import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { DURHAM_CENTER, type BusStop, type BusPosition, type RouteResult } from '@/data/mockTransitData';

interface TransitMapProps {
  stops: BusStop[];
  buses: BusPosition[];
  selectedRoute: RouteResult | null;
}

export default function TransitMap({ stops, buses, selectedRoute }: TransitMapProps) {
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);
  const routeLayerRef = useRef<L.Polyline | null>(null);

  // Initialize map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: DURHAM_CENTER,
      zoom: 13,
      zoomControl: true,
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);

    mapRef.current = map;
    markersRef.current = L.layerGroup().addTo(map);

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update stops and buses
  useEffect(() => {
    if (!mapRef.current || !markersRef.current) return;
    markersRef.current.clearLayers();

    // Add stops
    stops.forEach(stop => {
      const icon = L.divIcon({
        className: 'stop-marker',
        html: `<div style="width:12px;height:12px;background:#006747;border:3px solid white;border-radius:50%;box-shadow:0 2px 4px rgba(0,0,0,0.3);"></div>`,
        iconSize: [12, 12],
        iconAnchor: [6, 6],
      });

      L.marker([stop.lat, stop.lng], { icon })
        .bindPopup(`<strong>${stop.name}</strong><br/><span style="font-size:12px;color:#64748B">Routes: ${stop.routes.join(', ')}</span>`)
        .addTo(markersRef.current!);
    });

    // Add buses
    buses.forEach(bus => {
      const color = bus.delay > 60 ? '#EF4444' : '#006747';
      const icon = L.divIcon({
        className: 'bus-marker',
        html: `<div style="background:${color};color:white;font-family:'Roboto Mono',monospace;font-size:11px;font-weight:700;padding:4px 8px;border-radius:6px;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,0.3);border:2px solid white;">${bus.label}</div>`,
        iconSize: [40, 24],
        iconAnchor: [20, 12],
      });

      const statusText = bus.delay > 60 ? `Delayed ${Math.round(bus.delay / 60)} min` : 'On Time';
      const statusColor = bus.delay > 60 ? '#EF4444' : '#22C55E';

      L.marker([bus.lat, bus.lng], { icon })
        .bindPopup(`<strong>Route ${bus.label}</strong><br/><span style="font-size:12px;color:${statusColor}">${statusText}</span><br/><span style="font-family:Roboto Mono;font-size:12px">${bus.speed} km/h</span>`)
        .addTo(markersRef.current!);
    });
  }, [stops, buses]);

  // Update selected route
  useEffect(() => {
    if (!mapRef.current) return;

    if (routeLayerRef.current) {
      routeLayerRef.current.remove();
      routeLayerRef.current = null;
    }

    if (selectedRoute && selectedRoute.polyline.length > 0) {
      routeLayerRef.current = L.polyline(selectedRoute.polyline, {
        color: '#006747',
        weight: 5,
        opacity: 0.8,
      }).addTo(mapRef.current);

      const bounds = L.latLngBounds(selectedRoute.polyline.map(p => L.latLng(p[0], p[1])));
      mapRef.current.fitBounds(bounds, { padding: [60, 60] });
    }
  }, [selectedRoute]);

  return <div ref={containerRef} className="w-full h-full" />;
}
