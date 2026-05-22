const MAX_FILE_BYTES = 8 * 1024 * 1024;
const DEFAULT_DWG_CONVERTER_URL = "https://arqis-converter.onrender.com/convert";
const MAX_ROOM_SEGMENTS = 3200;

function send(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > MAX_FILE_BYTES * 1.4) {
        req.destroy();
        reject(new Error("The uploaded file is too large for this prototype endpoint."));
      }
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch (error) {
        reject(new Error("The upload could not be read."));
      }
    });
    req.on("error", reject);
  });
}

function polygonArea(points) {
  if (points.length < 3) return 0;
  let sum = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    sum += current.x * next.y - next.x * current.y;
  }
  return Math.abs(sum) / 2;
}

function signedPolygonArea(points) {
  if (points.length < 3) return 0;
  let sum = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    sum += current.x * next.y - next.x * current.y;
  }
  return sum / 2;
}

function dxfPairs(text) {
  const lines = text.replace(/\r/g, "").split("\n").map((line) => line.trim());
  const pairs = [];
  for (let index = 0; index < lines.length - 1; index += 2) {
    pairs.push([lines[index], lines[index + 1]]);
  }
  return pairs;
}

function readEntity(pairs, startIndex) {
  const type = pairs[startIndex][1];
  const groups = [];
  let index = startIndex + 1;
  while (index < pairs.length && pairs[index][0] !== "0") {
    groups.push(pairs[index]);
    index += 1;
  }
  return { type, groups, nextIndex: index };
}

function groupValue(groups, code, fallback = "") {
  const pair = groups.find(([group]) => group === code);
  return pair ? pair[1] : fallback;
}

function parseLightPolyline(groups) {
  const points = [];
  let currentX = null;
  groups.forEach(([group, value]) => {
    if (group === "10") currentX = Number(value);
    if (group === "20" && currentX !== null) {
      points.push({ x: currentX, y: Number(value) });
      currentX = null;
    }
  });
  return {
    layer: groupValue(groups, "8"),
    points,
    closed: ((Number(groupValue(groups, "70", "0")) || 0) & 1) === 1
  };
}

function parseLine(groups) {
  const point = (xCode, yCode) => ({
    x: Number(groupValue(groups, xCode, "NaN")),
    y: Number(groupValue(groups, yCode, "NaN"))
  });
  const points = [point("10", "20"), point("11", "21")];
  return {
    layer: groupValue(groups, "8"),
    points,
    closed: false
  };
}

function parseDxfGeometry(text) {
  const pairs = dxfPairs(text);
  const polylines = [];
  const lines = [];

  for (let index = 0; index < pairs.length;) {
    if (pairs[index][0] !== "0") {
      index += 1;
      continue;
    }

    const entity = readEntity(pairs, index);
    if (entity.type === "LWPOLYLINE") {
      const polyline = parseLightPolyline(entity.groups);
      if (polyline.points.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y))) {
        polylines.push(polyline);
      }
    }
    if (entity.type === "LINE") {
      const line = parseLine(entity.groups);
      if (line.points.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y))) {
        lines.push(line);
      }
    }
    index = Math.max(entity.nextIndex, index + 1);
  }

  return { polylines, lines };
}

function parseDxfPolylines(text) {
  return parseDxfGeometry(text).polylines
    .filter((polyline) => polyline.closed && polyline.points.length >= 3)
    .map((polyline) => ({
      layer: polyline.layer,
      points: polyline.points,
      rawArea: polygonArea(polyline.points)
    }))
    .filter((shape) => shape.rawArea > 0);
}

function roomLayerScore(layer = "") {
  const name = layer.toLowerCase();
  if (/(room|rooms|area|areas|floor|floors|boundary|boundaries|space|spaces|χωρ|δωμ)/.test(name)) return 2;
  if (/(wall|walls|partition|outline)/.test(name)) return 1;
  return 0;
}

function dwgRoomCandidates(shapes) {
  return shapes.filter((shape) => roomLayerScore(shape.layer) >= 2);
}

function excludeRoomLineLayer(layer = "") {
  return /(dimension|dim|text|note|door|opening|window|symbol|furniture|fixture|hatch|level|dash|provol)/i.test(layer);
}

function segmentLength(segment) {
  return Math.hypot(segment.b.x - segment.a.x, segment.b.y - segment.a.y);
}

function geometrySegments(geometry, wallLayersOnly) {
  const segments = [];
  const addPolylineSegments = (polyline) => {
    for (let index = 1; index < polyline.points.length; index += 1) {
      segments.push({ a: polyline.points[index - 1], b: polyline.points[index], layer: polyline.layer });
    }
    if (polyline.closed && polyline.points.length > 2) {
      segments.push({ a: polyline.points[polyline.points.length - 1], b: polyline.points[0], layer: polyline.layer });
    }
  };
  const layerAccepted = (layer) => !excludeRoomLineLayer(layer) && (!wallLayersOnly || roomLayerScore(layer) >= 1);

  geometry.lines.filter((line) => layerAccepted(line.layer)).forEach((line) => {
    segments.push({ a: line.points[0], b: line.points[1], layer: line.layer });
  });
  geometry.polylines.filter((polyline) => layerAccepted(polyline.layer)).forEach(addPolylineSegments);

  return segments.filter((segment) => segmentLength(segment) > 1e-7).slice(0, MAX_ROOM_SEGMENTS);
}

function segmentIntersection(left, right) {
  const rx = left.b.x - left.a.x;
  const ry = left.b.y - left.a.y;
  const sx = right.b.x - right.a.x;
  const sy = right.b.y - right.a.y;
  const denominator = rx * sy - ry * sx;
  if (Math.abs(denominator) < 1e-9) return null;

  const qx = right.a.x - left.a.x;
  const qy = right.a.y - left.a.y;
  const leftT = (qx * sy - qy * sx) / denominator;
  const rightT = (qx * ry - qy * rx) / denominator;
  const epsilon = 1e-8;
  if (leftT < -epsilon || leftT > 1 + epsilon || rightT < -epsilon || rightT > 1 + epsilon) return null;
  return {
    leftT: Math.max(0, Math.min(1, leftT)),
    rightT: Math.max(0, Math.min(1, rightT))
  };
}

function splitSegmentsAtCrossings(segments) {
  const splits = segments.map(() => [0, 1]);

  for (let leftIndex = 0; leftIndex < segments.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < segments.length; rightIndex += 1) {
      const intersection = segmentIntersection(segments[leftIndex], segments[rightIndex]);
      if (!intersection) continue;
      splits[leftIndex].push(intersection.leftT);
      splits[rightIndex].push(intersection.rightT);
    }
  }

  return segments.flatMap((segment, index) => {
    const positions = [...new Set(splits[index].map((value) => Math.round(value * 1e8) / 1e8))].sort((a, b) => a - b);
    const pieces = [];
    for (let positionIndex = 1; positionIndex < positions.length; positionIndex += 1) {
      const start = positions[positionIndex - 1];
      const end = positions[positionIndex];
      if (end - start < 1e-7) continue;
      pieces.push({
        a: {
          x: segment.a.x + (segment.b.x - segment.a.x) * start,
          y: segment.a.y + (segment.b.y - segment.a.y) * start
        },
        b: {
          x: segment.a.x + (segment.b.x - segment.a.x) * end,
          y: segment.a.y + (segment.b.y - segment.a.y) * end
        }
      });
    }
    return pieces;
  });
}

function graphFaces(segments) {
  const scale = 1e5;
  const nodes = new Map();
  const neighbours = new Map();
  const visited = new Set();
  const pointKey = (point) => `${Math.round(point.x * scale)},${Math.round(point.y * scale)}`;
  const ensureNode = (point) => {
    const key = pointKey(point);
    if (!nodes.has(key)) {
      nodes.set(key, { x: point.x, y: point.y, key });
      neighbours.set(key, new Set());
    }
    return key;
  };

  segments.forEach((segment) => {
    const a = ensureNode(segment.a);
    const b = ensureNode(segment.b);
    if (a === b) return;
    neighbours.get(a).add(b);
    neighbours.get(b).add(a);
  });

  const orderedNeighbours = new Map();
  neighbours.forEach((values, key) => {
    const origin = nodes.get(key);
    orderedNeighbours.set(key, [...values].sort((left, right) => {
      const leftPoint = nodes.get(left);
      const rightPoint = nodes.get(right);
      return Math.atan2(leftPoint.y - origin.y, leftPoint.x - origin.x)
        - Math.atan2(rightPoint.y - origin.y, rightPoint.x - origin.x);
    }));
  });

  const faces = [];
  orderedNeighbours.forEach((destinations, start) => {
    destinations.forEach((firstDestination) => {
      const firstEdge = `${start}>${firstDestination}`;
      if (visited.has(firstEdge)) return;

      let from = start;
      let to = firstDestination;
      const points = [];
      for (let guard = 0; guard < 900; guard += 1) {
        visited.add(`${from}>${to}`);
        points.push(nodes.get(from));
        const nextOptions = orderedNeighbours.get(to) || [];
        const returnIndex = nextOptions.indexOf(from);
        if (returnIndex === -1 || !nextOptions.length) break;
        const next = nextOptions[(returnIndex - 1 + nextOptions.length) % nextOptions.length];
        from = to;
        to = next;
        if (from === start && to === firstDestination) break;
      }

      const rawArea = signedPolygonArea(points);
      if (rawArea > 0 && points.length >= 3 && points.length < 900) {
        faces.push({ points: points.map(({ x, y }) => ({ x, y })), rawArea });
      }
    });
  });

  return faces;
}

function shapeBounds(shape) {
  const xs = shape.points.map((point) => point.x);
  const ys = shape.points.map((point) => point.y);
  const width = Math.max(...xs) - Math.min(...xs);
  const height = Math.max(...ys) - Math.min(...ys);
  return { width, height, area: width * height };
}

function geometryBoundsArea(segments) {
  if (!segments.length) return 0;
  const points = segments.flatMap((segment) => [segment.a, segment.b]);
  const width = Math.max(...points.map((point) => point.x)) - Math.min(...points.map((point) => point.x));
  const height = Math.max(...points.map((point) => point.y)) - Math.min(...points.map((point) => point.y));
  return width * height;
}

function percentile(values, ratio) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor((sorted.length - 1) * ratio)];
}

function dedupeRoomFaces(shapes) {
  const seen = new Set();
  return shapes.filter((shape) => {
    const bounds = shapeBounds(shape);
    const centreX = shape.points.reduce((sum, point) => sum + point.x, 0) / shape.points.length;
    const centreY = shape.points.reduce((sum, point) => sum + point.y, 0) / shape.points.length;
    const key = [
      Math.round(centreX * 100),
      Math.round(centreY * 100),
      Math.round(bounds.width * 100),
      Math.round(bounds.height * 100),
      Math.round(shape.rawArea * 100)
    ].join(":");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function likelyRoomFaces(segments) {
  if (segments.length < 3) return [];
  const splitSegments = splitSegmentsAtCrossings(segments);
  const footprintArea = geometryBoundsArea(splitSegments);
  if (!footprintArea) return [];
  const longWallScale = percentile(segments.map(segmentLength), 0.95);
  const roomScaleArea = longWallScale ? longWallScale * longWallScale * 4 : footprintArea * 0.2;

  const candidates = graphFaces(splitSegments).filter((shape) => {
    const bounds = shapeBounds(shape);
    const smallestSide = Math.min(bounds.width, bounds.height);
    const aspectRatio = Math.max(bounds.width, bounds.height) / Math.max(smallestSide, 1e-9);
    const fillRatio = shape.rawArea / Math.max(bounds.area, 1e-9);
    return shape.rawArea > footprintArea * 0.00005
      && shape.rawArea < Math.min(footprintArea * 0.2, roomScaleArea)
      && smallestSide > 0
      && aspectRatio < 12
      && fillRatio > 0.08
      && shape.points.length <= 180;
  });

  return dedupeRoomFaces(candidates)
    .sort((left, right) => right.rawArea - left.rawArea)
    .slice(0, 16)
    .map((shape) => ({ ...shape, source: "wall-lines" }));
}

function detectWallLineRooms(dxfText) {
  const geometry = parseDxfGeometry(dxfText);
  const wallSegments = geometrySegments(geometry, true);
  const wallFaces = likelyRoomFaces(wallSegments);
  if (wallFaces.length) return wallFaces;
  return likelyRoomFaces(geometrySegments(geometry, false));
}

function findEmbeddedPng(buffer) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ending = Buffer.from([73, 69, 78, 68, 174, 66, 96, 130]);
  const start = buffer.indexOf(signature);
  if (start === -1) return "";
  const end = buffer.indexOf(ending, start + signature.length);
  if (end === -1) return "";
  const png = buffer.subarray(start, end + ending.length);
  return `data:image/png;base64,${png.toString("base64")}`;
}

async function convertDwgViaService({ fileName, base64 }) {
  const converterUrl = (typeof process !== "undefined" && process.env && process.env.DWG_CONVERTER_URL)
    || DEFAULT_DWG_CONVERTER_URL;
  const response = await fetch(converterUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileName, base64, output: "dxf" })
  });

  if (!response.ok) {
    throw new Error("The DWG converter service did not accept the file.");
  }

  const result = await response.json();
  return result.dxfText || "";
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    send(res, 405, { ok: false, message: "Use POST to analyse a plan." });
    return;
  }

  try {
    const { fileName = "plan", extension = "", base64 = "" } = await readJsonBody(req);
    const cleanExtension = extension.toLowerCase().replace(/^\./, "");
    const buffer = Buffer.from(base64, "base64");

    if (!buffer.length) {
      send(res, 400, { ok: false, message: "No file data was received." });
      return;
    }

    if (buffer.length > MAX_FILE_BYTES) {
      send(res, 413, { ok: false, message: "This file is too large for the current prototype upload limit." });
      return;
    }

    if (cleanExtension === "dxf") {
      const dxfText = buffer.toString("utf8");
      const outlines = parseDxfPolylines(dxfText);
      const shapes = outlines.length ? outlines : detectWallLineRooms(dxfText);
      const wallRooms = !outlines.length && shapes.length;
      send(res, 200, {
        ok: true,
        fileType: "dxf",
        status: shapes.length ? (wallRooms ? "DXF wall-line room candidates detected" : "DXF rooms detected") : "DXF read, no closed rooms found",
        message: shapes.length
          ? (wallRooms
            ? "Arqis found enclosed spaces from DXF wall linework. Check the tabs and ignore any symbol space that is not a room yet."
            : "The backend found closed CAD room outlines and returned them to the room tabs.")
          : "The backend could read the DXF, but did not find closed room outlines yet.",
        shapes
      });
      return;
    }

    if (cleanExtension === "dwg") {
      const previewDataUrl = findEmbeddedPng(buffer);
      const convertedDxf = await convertDwgViaService({ fileName, base64 });
      const convertedOutlines = convertedDxf ? parseDxfPolylines(convertedDxf) : [];
      const boundaryShapes = dwgRoomCandidates(convertedOutlines);
      const shapes = boundaryShapes.length ? boundaryShapes : detectWallLineRooms(convertedDxf);
      const wallRooms = !boundaryShapes.length && shapes.length;

      send(res, 200, {
        ok: true,
        fileType: "dwg",
        status: shapes.length ? (wallRooms ? "DWG wall-line room candidates detected" : "DWG room boundaries detected") : "DWG converted, room detection needed",
        message: shapes.length
          ? (wallRooms
            ? `LibreDWG converted the DWG and Arqis inferred ${shapes.length} enclosed wall-line spaces for the room tabs. These are first-pass room candidates.`
            : "LibreDWG converted the DWG and Arqis found likely room-boundary layers to inspect.")
          : `LibreDWG converted the DWG and found ${convertedOutlines.length} closed CAD outlines, but it could not infer room spaces from the wall lines yet.`,
        previewDataUrl,
        closedOutlineCount: convertedOutlines.length,
        needsRoomDetection: !shapes.length,
        shapes
      });
      return;
    }

    send(res, 200, {
      ok: true,
      fileType: cleanExtension || "unknown",
      status: `${(cleanExtension || "file").toUpperCase()} uploaded`,
      message: "This file was received by the backend. Automatic room extraction currently supports DXF and DWG conversion through LibreDWG.",
      shapes: []
    });
  } catch (error) {
    send(res, 500, { ok: false, message: error.message || "The plan could not be analysed." });
  }
}
