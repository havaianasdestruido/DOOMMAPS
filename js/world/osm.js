// ============================================================
// DOOMMAPS — OSM source: fetch real-world geography via Overpass
// (streets, buildings, parks, water) and normalize to meters.
// ============================================================
import { API, latLngToMeters } from "../config.js";

const ROAD_WIDTHS = {
  motorway: 16, trunk: 14, primary: 12, secondary: 10, tertiary: 9,
  residential: 7, unclassified: 6, service: 5, living_street: 6,
  pedestrian: 6, footway: 3, path: 3, cycleway: 3, track: 4, steps: 3,
};

function keyDoorFor(tags) {
  const a = tags.amenity || "", b = tags.building || "", o = tags.office || "", shop = tags.shop || "", t = tags.tourism || "";
  if (a === "townhall" || a === "courthouse" || a === "public_building" || o === "government" || b === "civic") return "red";
  if (a === "hospital" || a === "clinic" || b === "hospital" || t === "hotel") return "blue";
  if (shop === "mall" || shop === "department_store" || b === "retail" || b === "commercial" || b === "supermarket") return "yellow";
  return null;
}

/**
 * Fetch OSM data around a point.
 * @returns {Promise<{roads:Array, buildings:Array, waters:Array, parks:Array, pois:Array} | null>}
 */
export async function fetchOSM(lat, lng, radius) {
  const q = `[out:json][timeout:30];
(
  way["highway"]["area"!~"yes"](around:${radius},${lat},${lng});
  way["building"](around:${radius},${lat},${lng});
  way["leisure"~"park|garden|common|playground"](around:${radius},${lat},${lng});
  way["natural"~"water|wood"](around:${radius},${lat},${lng});
  way["waterway"](around:${radius},${lat},${lng});
  way["landuse"~"grass|recreation_ground|village_green|cemetery"](around:${radius},${lat},${lng});
  way["amenity"~"townhall|courthouse|hospital|clinic|theatre|place_of_worship"](around:${radius},${lat},${lng});
);
out geom tags;`;

  let lastErr = null;
  for (const endpoint of API.OVERPASS) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 35000);
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "data=" + encodeURIComponent(q),
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error("HTTP " + res.status);
      const json = await res.json();
      const out = normalize(json.elements || [], lat, lng);
      if (out.roads.length === 0 && out.buildings.length === 0) return emptyResult();
      return out;
    } catch (e) {
      lastErr = e;
      console.warn("Overpass failed:", endpoint, e.message);
    }
  }
  console.warn("All Overpass mirrors failed:", lastErr && lastErr.message);
  return null;
}

function emptyResult() {
  return { roads: [], buildings: [], waters: [], parks: [], pois: [] };
}

function normalize(elements, lat0, lng0) {
  const roads = [], buildings = [], waters = [], parks = [], pois = [];
  for (const el of elements) {
    if (el.type !== "way" || !el.geometry || el.geometry.length < 2) continue;
    const tags = el.tags || {};
    const pts = el.geometry.map(g => latLngToMeters(g.lat, g.lon, lat0, lng0));

    if (tags.highway) {
      const kind = tags.highway;
      roads.push({
        pts,
        width: ROAD_WIDTHS[kind] || 5,
        kind,
        name: tags.name || null,
      });
    } else if (tags.building || (tags.amenity && !tags.natural)) {
      const levels = parseFloat(tags["building:levels"]) || 0;
      const h = parseFloat(tags.height) || (levels ? levels * 3.2 : 0);
      buildings.push({
        pts, name: tags.name || null,
        height: h,
        keyDoor: keyDoorFor(tags),
        tags,
      });
      if (tags.name && (tags.amenity || tags.historic || tags.tourism)) {
        const c = centroid(pts);
        pois.push({ name: tags.name, x: c.x, y: c.y });
      }
    } else if (tags.natural === "water" || tags.waterway) {
      waters.push({ pts, isLine: !!tags.waterway });
    } else if (tags.leisure || tags.landuse || tags.natural === "wood") {
      parks.push({ pts });
    }
  }
  return { roads, buildings, waters, parks, pois };
}

function centroid(pts) {
  let x = 0, y = 0;
  for (const p of pts) { x += p.x; y += p.y; }
  return { x: x / pts.length, y: y / pts.length };
}
