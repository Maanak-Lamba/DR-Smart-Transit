import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GTFS_VEHICLE_POSITIONS_URL = 'https://drtonline.durhamregiontransit.com/gtfsrealtime/VehiclePositions';
const GTFS_TRIP_UPDATES_URL = 'https://drtonline.durhamregiontransit.com/gtfsrealtime/TripUpdates';

// Minimal protobuf decoder for GTFS-RT
// GTFS-RT uses protobuf wire format. We decode the essential fields.
function decodeVarint(buf: Uint8Array, offset: number): [number, number] {
  let result = 0;
  let shift = 0;
  let pos = offset;
  while (pos < buf.length) {
    const b = buf[pos];
    result |= (b & 0x7f) << shift;
    pos++;
    if ((b & 0x80) === 0) break;
    shift += 7;
  }
  return [result, pos];
}

function decodeFixed32(buf: Uint8Array, offset: number): number {
  return buf[offset] | (buf[offset + 1] << 8) | (buf[offset + 2] << 16) | (buf[offset + 3] << 24);
}

function decodeFixed64AsFloat(buf: Uint8Array, offset: number): number {
  // Read as float64 (double)
  const view = new DataView(buf.buffer, buf.byteOffset + offset, 8);
  return view.getFloat64(0, true);
}

interface ProtoField {
  fieldNum: number;
  wireType: number;
  value: Uint8Array | number | bigint;
}

function decodeMessage(buf: Uint8Array): ProtoField[] {
  const fields: ProtoField[] = [];
  let offset = 0;
  while (offset < buf.length) {
    const [tag, newOffset] = decodeVarint(buf, offset);
    offset = newOffset;
    const fieldNum = tag >> 3;
    const wireType = tag & 0x7;

    if (wireType === 0) {
      // Varint
      const [value, nextOffset] = decodeVarint(buf, offset);
      fields.push({ fieldNum, wireType, value });
      offset = nextOffset;
    } else if (wireType === 1) {
      // 64-bit
      const value = decodeFixed64AsFloat(buf, offset);
      fields.push({ fieldNum, wireType, value });
      offset += 8;
    } else if (wireType === 2) {
      // Length-delimited
      const [length, nextOffset] = decodeVarint(buf, offset);
      offset = nextOffset;
      const value = buf.slice(offset, offset + length);
      fields.push({ fieldNum, wireType, value });
      offset += length;
    } else if (wireType === 5) {
      // 32-bit
      const value = decodeFixed32(buf, offset);
      fields.push({ fieldNum, wireType, value });
      offset += 4;
    } else {
      break; // Unknown wire type
    }
  }
  return fields;
}

function decodeString(buf: Uint8Array): string {
  return new TextDecoder().decode(buf);
}

function float32FromFixed(n: number): number {
  const buf = new ArrayBuffer(4);
  new DataView(buf).setInt32(0, n, true);
  return new DataView(buf).getFloat32(0, true);
}

interface VehicleData {
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

function parseGtfsVehiclePositions(buf: Uint8Array): VehicleData[] {
  const vehicles: VehicleData[] = [];

  try {
    // FeedMessage: field 2 = entity (repeated)
    const feedFields = decodeMessage(buf);

    for (const field of feedFields) {
      if (field.fieldNum === 2 && field.wireType === 2) {
        // FeedEntity
        const entityBuf = field.value as Uint8Array;
        const entityFields = decodeMessage(entityBuf);

        let entityId = '';
        const vehicle: VehicleData = {
          id: '', tripId: '', routeId: '', lat: 0, lng: 0,
          bearing: 0, speed: 0, label: '', timestamp: 0,
        };

        for (const ef of entityFields) {
          if (ef.fieldNum === 1 && ef.wireType === 2) {
            entityId = decodeString(ef.value as Uint8Array);
            vehicle.id = entityId;
          }
          if (ef.fieldNum === 4 && ef.wireType === 2) {
            // VehiclePosition message
            const vpFields = decodeMessage(ef.value as Uint8Array);
            for (const vpf of vpFields) {
              if (vpf.fieldNum === 1 && vpf.wireType === 2) {
                // TripDescriptor
                const tripFields = decodeMessage(vpf.value as Uint8Array);
                for (const tf of tripFields) {
                  if (tf.fieldNum === 1 && tf.wireType === 2) vehicle.tripId = decodeString(tf.value as Uint8Array);
                  if (tf.fieldNum === 5 && tf.wireType === 2) vehicle.routeId = decodeString(tf.value as Uint8Array);
                }
              }
              if (vpf.fieldNum === 2 && vpf.wireType === 2) {
                // Position
                const posFields = decodeMessage(vpf.value as Uint8Array);
                for (const pf of posFields) {
                  if (pf.fieldNum === 1 && pf.wireType === 5) vehicle.lat = float32FromFixed(pf.value as number);
                  if (pf.fieldNum === 2 && pf.wireType === 5) vehicle.lng = float32FromFixed(pf.value as number);
                  if (pf.fieldNum === 3 && pf.wireType === 5) vehicle.bearing = float32FromFixed(pf.value as number);
                  if (pf.fieldNum === 4 && pf.wireType === 5) vehicle.speed = float32FromFixed(pf.value as number);
                }
              }
              if (vpf.fieldNum === 5 && vpf.wireType === 0) {
                vehicle.timestamp = vpf.value as number;
              }
              if (vpf.fieldNum === 8 && vpf.wireType === 2) {
                // VehicleDescriptor
                const vdFields = decodeMessage(vpf.value as Uint8Array);
                for (const vdf of vdFields) {
                  if (vdf.fieldNum === 1 && vdf.wireType === 2) vehicle.id = decodeString(vdf.value as Uint8Array);
                  if (vdf.fieldNum === 2 && vdf.wireType === 2) vehicle.label = decodeString(vdf.value as Uint8Array);
                }
              }
            }
          }
        }

        if (vehicle.lat !== 0 && vehicle.lng !== 0) {
          if (!vehicle.label) vehicle.label = vehicle.routeId || vehicle.id;
          vehicles.push(vehicle);
        }
      }
    }
  } catch (e) {
    console.error('Protobuf parse error:', e);
  }

  return vehicles;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const feed = url.searchParams.get('feed') || 'vehicles';

    if (feed === 'vehicles') {
      const response = await fetch(GTFS_VEHICLE_POSITIONS_URL);

      if (!response.ok) {
        return new Response(JSON.stringify({ error: 'GTFS feed unavailable', status: response.status }), {
          status: 502,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const buffer = await response.arrayBuffer();
      const buf = new Uint8Array(buffer);
      const vehicles = parseGtfsVehiclePositions(buf);

      return new Response(JSON.stringify({ vehicles, count: vehicles.length, timestamp: Date.now() }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } else if (feed === 'trips') {
      const response = await fetch(GTFS_TRIP_UPDATES_URL);

      if (!response.ok) {
        return new Response(JSON.stringify({ error: 'GTFS trip updates unavailable', status: response.status }), {
          status: 502,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // For trip updates, return raw protobuf info for now
      // Full trip update parsing can be added similarly
      const buffer = await response.arrayBuffer();
      const buf = new Uint8Array(buffer);
      
      // Parse trip updates similarly to vehicles
      const updates: any[] = [];
      const feedFields = decodeMessage(buf);
      
      for (const field of feedFields) {
        if (field.fieldNum === 2 && field.wireType === 2) {
          const entityBuf = field.value as Uint8Array;
          const entityFields = decodeMessage(entityBuf);
          
          const update: any = { id: '', tripId: '', routeId: '', stopUpdates: [] };
          
          for (const ef of entityFields) {
            if (ef.fieldNum === 1 && ef.wireType === 2) {
              update.id = decodeString(ef.value as Uint8Array);
            }
            if (ef.fieldNum === 3 && ef.wireType === 2) {
              // TripUpdate message
              const tuFields = decodeMessage(ef.value as Uint8Array);
              for (const tuf of tuFields) {
                if (tuf.fieldNum === 1 && tuf.wireType === 2) {
                  const tripFields = decodeMessage(tuf.value as Uint8Array);
                  for (const tf of tripFields) {
                    if (tf.fieldNum === 1 && tf.wireType === 2) update.tripId = decodeString(tf.value as Uint8Array);
                    if (tf.fieldNum === 5 && tf.wireType === 2) update.routeId = decodeString(tf.value as Uint8Array);
                  }
                }
                if (tuf.fieldNum === 2 && tuf.wireType === 2) {
                  // StopTimeUpdate
                  const stuFields = decodeMessage(tuf.value as Uint8Array);
                  const stopUpdate: any = { stopId: '', arrivalDelay: 0, departureDelay: 0 };
                  for (const stuf of stuFields) {
                    if (stuf.fieldNum === 4 && stuf.wireType === 2) stopUpdate.stopId = decodeString(stuf.value as Uint8Array);
                    if (stuf.fieldNum === 2 && stuf.wireType === 2) {
                      // arrival StopTimeEvent
                      const arrFields = decodeMessage(stuf.value as Uint8Array);
                      for (const af of arrFields) {
                        if (af.fieldNum === 1 && af.wireType === 0) stopUpdate.arrivalDelay = af.value as number;
                      }
                    }
                    if (stuf.fieldNum === 3 && stuf.wireType === 2) {
                      const depFields = decodeMessage(stuf.value as Uint8Array);
                      for (const df of depFields) {
                        if (df.fieldNum === 1 && df.wireType === 0) stopUpdate.departureDelay = df.value as number;
                      }
                    }
                  }
                  update.stopUpdates.push(stopUpdate);
                }
              }
            }
          }
          
          if (update.tripId) updates.push(update);
        }
      }

      return new Response(JSON.stringify({ updates, count: updates.length, timestamp: Date.now() }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } else {
      return new Response(JSON.stringify({ error: 'Invalid feed. Use "vehicles" or "trips".' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  } catch (error: unknown) {
    console.error('GTFS realtime error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
