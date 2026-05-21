const MAX_FILE_BYTES = 8 * 1024 * 1024;
const DEFAULT_DWG_CONVERTER_URL = "https://arqis-converter.onrender.com/convert";

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

function parseDxfPolylines(text) {
  const lines = text.replace(/\r/g, "").split("\n").map((line) => line.trim());
  const shapes = [];

  for (let index = 0; index < lines.length - 1; index += 2) {
    const code = lines[index];
    const value = lines[index + 1];

    if (code === "0" && value === "LWPOLYLINE") {
      const points = [];
      let flags = 0;
      let currentX = null;
      index += 2;

      while (index < lines.length - 1 && lines[index] !== "0") {
        const group = lines[index];
        const item = lines[index + 1];
        if (group === "70") flags = Number(item) || 0;
        if (group === "10") currentX = Number(item);
        if (group === "20" && currentX !== null) {
          points.push({ x: currentX, y: Number(item) });
          currentX = null;
        }
        index += 2;
      }

      if ((flags & 1) === 1 && points.length >= 3) {
        shapes.push({ points, rawArea: polygonArea(points) });
      }
      index -= 2;
    }
  }

  return shapes.filter((shape) => shape.rawArea > 0);
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
  const converterUrl = process.env.DWG_CONVERTER_URL || DEFAULT_DWG_CONVERTER_URL;
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
      const shapes = parseDxfPolylines(dxfText);
      send(res, 200, {
        ok: true,
        fileType: "dxf",
        status: shapes.length ? "DXF rooms detected" : "DXF read, no closed rooms found",
        message: shapes.length
          ? "The backend found closed CAD room outlines and returned them to the room tabs."
          : "The backend could read the DXF, but did not find closed room outlines yet.",
        shapes
      });
      return;
    }

    if (cleanExtension === "dwg") {
      const previewDataUrl = findEmbeddedPng(buffer);
      const convertedDxf = await convertDwgViaService({ fileName, base64 });
      const shapes = convertedDxf ? parseDxfPolylines(convertedDxf) : [];

      send(res, 200, {
        ok: true,
        fileType: "dwg",
        status: shapes.length ? "DWG converted and outlines detected" : "DWG converted, no closed outlines found",
        message: shapes.length
          ? "LibreDWG converted the DWG and Arqis found closed outlines to inspect in the room tabs."
          : "LibreDWG converted the DWG, but Arqis did not find closed room outlines in the converted geometry yet.",
        previewDataUrl,
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
