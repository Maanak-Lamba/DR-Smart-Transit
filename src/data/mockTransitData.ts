export interface BusStop {
  id: string;
  name: string;
  lat: number;
  lng: number;
  routes: string[];
}

export interface BusPosition {
  id: string;
  routeId: string;
  lat: number;
  lng: number;
  heading: number;
  speed: number;
  delay: number;
  tripId: string;
  label: string;
}

export interface TransferPoint {
  lat: number;
  lng: number;
  nextRoute: string;
}

export interface RouteStop {
  name: string;
  time: string;
  routeId?: string;
}

// Individual transit leg with its own polyline and route info
export interface RouteLeg {
  routeNumber: string;
  routeName: string;
  polyline: [number, number][];
}

export interface RouteResult {
  id: string;
  routeName: string;
  routeNumber: string;
  departureTime: string;
  arrivalTime: string;
  duration: string;
  transfers: number;
  status: 'on-time' | 'delayed';
  delayMinutes?: number;
  stops: RouteStop[];
  polyline: [number, number][]; // combined polyline (fallback)
  legs?: RouteLeg[];             // per-leg polylines for multi-color rendering

  // Walking legs
  walkToStop?: [number, number][];
  walkFromStop?: [number, number][];

  // Transfer info
  transferPoints?: TransferPoint[];

  // Boarding stop coords for proximity check
  boardingStopLat?: number | null;
  boardingStopLng?: number | null;
}

export const DURHAM_CENTER: [number, number] = [43.8971, -78.8658];

export const mockStops: BusStop[] = [
  { id: 's1', name: 'Oshawa Centre Terminal', lat: 43.8975, lng: -78.8570, routes: ['401', '910'] },
  { id: 's2', name: 'Whitby Station', lat: 43.8679, lng: -78.9420, routes: ['910', '302'] },
  { id: 's3', name: 'Ajax Station', lat: 43.8484, lng: -79.0260, routes: ['910', '115'] },
  { id: 's4', name: 'Pickering Town Centre', lat: 43.8385, lng: -79.0870, routes: ['110', '115'] },
  { id: 's5', name: 'UOIT/Durham College', lat: 43.9456, lng: -78.8968, routes: ['401', '915'] },
  { id: 's6', name: 'Harmony Terminal', lat: 43.9070, lng: -78.8220, routes: ['401', '407'] },
  { id: 's7', name: 'Simcoe St & King St', lat: 43.8997, lng: -78.8658, routes: ['401', '302'] },
  { id: 's8', name: 'Taunton Rd & Thickson Rd', lat: 43.9180, lng: -78.8800, routes: ['407', '915'] },
  { id: 's9', name: 'Dundas St & Brock St', lat: 43.8930, lng: -78.8610, routes: ['302', '110'] },
  { id: 's10', name: 'Courtice Rd & Durham Hwy 2', lat: 43.8815, lng: -78.7900, routes: ['407'] },
];

export const mockBuses: BusPosition[] = [
  { id: 'b1', routeId: '401', lat: 43.9010, lng: -78.8600, heading: 45, speed: 35, delay: 0, tripId: 't1', label: '401' },
  { id: 'b2', routeId: '910', lat: 43.8750, lng: -78.9100, heading: 270, speed: 40, delay: 120, tripId: 't2', label: '910' },
  { id: 'b3', routeId: '302', lat: 43.8900, lng: -78.8700, heading: 180, speed: 25, delay: -30, tripId: 't3', label: '302' },
  { id: 'b4', routeId: '115', lat: 43.8500, lng: -79.0400, heading: 90, speed: 45, delay: 0, tripId: 't4', label: '115' },
  { id: 'b5', routeId: '407', lat: 43.9120, lng: -78.8400, heading: 315, speed: 30, delay: 300, tripId: 't5', label: '407' },
];

export const mockRouteResults: RouteResult[] = [
  {
    id: 'r1',
    routeName: 'Simcoe Express',
    routeNumber: '401',
    departureTime: '10:15 AM',
    arrivalTime: '10:48 AM',
    duration: '33 min',
    transfers: 0,
    status: 'on-time',
    stops: [
      { name: 'Oshawa Centre Terminal', time: '10:15 AM' },
      { name: 'Simcoe St & King St', time: '10:22 AM' },
      { name: 'UOIT/Durham College', time: '10:35 AM' },
      { name: 'Harmony Terminal', time: '10:48 AM' },
    ],
    polyline: [
      [43.8975, -78.8570],
      [43.8997, -78.8658],
      [43.9200, -78.8800],
      [43.9456, -78.8968],
      [43.9070, -78.8220],
    ],
    walkToStop: [],
    walkFromStop: [],
    transferPoints: [],
    boardingStopLat: 43.8975,
    boardingStopLng: -78.8570,
  },
];