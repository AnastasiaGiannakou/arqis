const directDwgFile = document.querySelector("#planFile");
const directDwgFileStatus = document.querySelector("#fileStatus");
const directDwgPreviewBody = document.querySelector("#planPreviewBody");
const directDwgRoomTabs = document.querySelector("#roomTabs");
const VERCEL_DWG_FILE_LIMIT = 3 * 1024 * 1024;
const DIRECT_CONVERTER_URL = "https://arqis-converter.onrender.com/convert";
let directFloorBrowser = null;
let directActiveFloor = null;
let directCadEntities = [];

function directDwgExtension(file) {
  return file.name.split(".").pop().toLowerCase();
}

function directDwgCard(file, lines) {
  directDwgPreviewBody.innerHTML = `
    <div class="plan-file-card">
      <strong>${file.name}</strong>
      ${lines.map((line) => `<span>${line}</span>`).join("")}
    </div>
  `;
}

function directShapeBounds(shape) {
  const xs = shape.points.map((point) => point.x);
  const ys = shape.points.map((point) => point.y);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys)
  };
}

function directBoundsGap(left, right) {
  const xGap = Math.max(0, left.minX - right.maxX, right.minX - left.maxX);
  const yGap = Math.max(0, left.minY - right.maxY, right.minY - left.maxY);
  return Math.hypot(xGap, yGap);
}

function directMergeBounds(left, right) {
  return {
    minX: Math.min(left.minX, right.minX),
    maxX: Math.max(left.maxX, right.maxX),
    minY: Math.min(left.minY, right.minY),
    maxY: Math.max(left.maxY, right.maxY)
  };
}

function directPercentile(values, ratio) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor((sorted.length - 1) * ratio)];
}

function directFloorCandidates(shapes) {
  if (!shapes.length) return [];
  const measured = shapes.map((shape) => ({ shape, bounds: directShapeBounds(shape) }));
  const floorGap = Math.max(
    directPercentile(measured.map(({ bounds }) => Math.max(bounds.width, bounds.height)), 0.5) * 1.8,
    1e-6
  );
  const groups = measured.map(({ shape, bounds }) => ({ shapes: [shape], bounds }));

  for (let leftIndex = 0; leftIndex < groups.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < groups.length;) {
      if (directBoundsGap(groups[leftIndex].bounds, groups[rightIndex].bounds) > floorGap) {
        rightIndex += 1;
        continue;
      }
      groups[leftIndex].shapes.push(...groups[rightIndex].shapes);
      groups[leftIndex].bounds = directMergeBounds(groups[leftIndex].bounds, groups[rightIndex].bounds);
      groups.splice(rightIndex, 1);
    }
  }

  return groups
    .sort((left, right) => right.bounds.maxY - left.bounds.maxY || left.bounds.minX - right.bounds.minX)
    .map((group, index) => ({
      name: groups.length === 1 ? "Plan floor" : `Floor ${index + 1}`,
      shapes: group.shapes
    }));
}

function directSvgPoint(point, bounds) {
  const width = 360;
  const height = 460;
  const padding = 22;
  const spanX = Math.max(bounds.maxX - bounds.minX, 1e-6);
  const spanY = Math.max(bounds.maxY - bounds.minY, 1e-6);
  const scale = Math.min((width - padding * 2) / spanX, (height - padding * 2) / spanY);
  const offsetX = (width - spanX * scale) / 2;
  const offsetY = (height - spanY * scale) / 2;
  return {
    x: offsetX + (point.x - bounds.minX) * scale,
    y: height - (offsetY + (point.y - bounds.minY) * scale)
  };
}

function directDxfPairs(text) {
  const lines = text.replace(/\r/g, "").split("\n").map((line) => line.trim());
  const pairs = [];
  for (let index = 0; index < lines.length - 1; index += 2) {
    pairs.push([lines[index], lines[index + 1]]);
  }
  return pairs;
}

function directCadGeometry(text) {
  const pairs = directDxfPairs(text);
  const entities = [];

  for (let index = 0; index < pairs.length;) {
    if (pairs[index][0] !== "0" || !["LINE", "LWPOLYLINE"].includes(pairs[index][1])) {
      index += 1;
      continue;
    }

    const type = pairs[index][1];
    const points = [];
    let currentX = null;
    index += 1;
    while (index < pairs.length && pairs[index][0] !== "0") {
      const [code, value] = pairs[index];
      if (code === "10" || code === "11") currentX = Number(value);
      if ((code === "20" || code === "21") && currentX !== null) {
        points.push({ x: currentX, y: Number(value) });
        currentX = null;
      }
      index += 1;
    }

    if (points.length >= 2 && points.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y))) {
      entities.push({ type, points, bounds: directShapeBounds({ points }) });
    }
  }

  return entities;
}

function directFloorBounds(shapes) {
  return shapes.map(directShapeBounds).reduce((bounds, next) => directMergeBounds(bounds, next));
}

function directExpandBounds(bounds, ratio = 0.9) {
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  const padding = Math.max(width, height, 1) * ratio;
  return {
    minX: bounds.minX - padding,
    maxX: bounds.maxX + padding,
    minY: bounds.minY - padding,
    maxY: bounds.maxY + padding,
    width: width + padding * 2,
    height: height + padding * 2
  };
}

function directBoundsOverlap(left, right) {
  return left.minX <= right.maxX
    && left.maxX >= right.minX
    && left.minY <= right.maxY
    && left.maxY >= right.minY;
}

function directPlanEntities(floorBounds) {
  const crop = directExpandBounds(floorBounds);
  return directCadEntities
    .filter((entity) => directBoundsOverlap(crop, entity.bounds))
    .slice(0, 2600);
}

function directLineworkBounds(entities, fallback) {
  if (!entities.length) return fallback;
  return entities.map((entity) => entity.bounds).reduce((bounds, next) => directMergeBounds(bounds, next), fallback);
}

function directFloorOverview(floor, roomIndex = 0) {
  if (!floor?.shapes?.length) return;
  directActiveFloor = floor;
  const floorBounds = directFloorBounds(floor.shapes);
  const planEntities = directPlanEntities(floorBounds);
  const bounds = directLineworkBounds(planEntities, floorBounds);
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.classList.add("floor-plan-preview");
  svg.setAttribute("viewBox", "0 0 360 460");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", `${floor.name} overview`);
  svg.style.cssText = "width:100%;height:min(460px,54vh);border:1px solid #d7ded8;border-radius:6px;background:#f9fbf7";

  planEntities.forEach((entity) => {
    const linework = document.createElementNS("http://www.w3.org/2000/svg", entity.type === "LINE" ? "line" : "polyline");
    const points = entity.points.map((point) => directSvgPoint(point, bounds));
    if (entity.type === "LINE") {
      linework.setAttribute("x1", points[0].x.toFixed(1));
      linework.setAttribute("y1", points[0].y.toFixed(1));
      linework.setAttribute("x2", points[1].x.toFixed(1));
      linework.setAttribute("y2", points[1].y.toFixed(1));
    } else {
      linework.setAttribute("points", points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" "));
    }
    linework.setAttribute("fill", "none");
    linework.setAttribute("stroke", "#46544e");
    linework.setAttribute("stroke-width", entity.type === "LINE" ? "1.2" : "1.6");
    linework.setAttribute("stroke-linecap", "round");
    linework.setAttribute("stroke-linejoin", "round");
    svg.append(linework);
  });

  floor.shapes.forEach((shape, index) => {
    const polygon = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
    polygon.setAttribute("points", shape.points.map((point) => {
      const next = directSvgPoint(point, bounds);
      return `${next.x.toFixed(1)},${next.y.toFixed(1)}`;
    }).join(" "));
    polygon.classList.toggle("active", index === roomIndex);
    polygon.setAttribute("fill", index === roomIndex ? "rgba(29,107,79,0.34)" : "rgba(24,32,29,0.06)");
    polygon.setAttribute("stroke", index === roomIndex ? "#164c3a" : "#65736c");
    polygon.setAttribute("stroke-width", index === roomIndex ? "4" : "2");
    svg.append(polygon);
  });

  const caption = document.createElement("p");
  caption.className = "floor-plan-caption";
  caption.style.cssText = "color:#65736c;font-size:12px;font-weight:800;text-transform:uppercase";
  caption.textContent = `${floor.name} generated plan`;
  directDwgPreviewBody.replaceChildren(svg, caption);
}

function directHighlightRoom(roomIndex) {
  if (!directActiveFloor) return;
  directFloorOverview(directActiveFloor, roomIndex);
}

function directRemoveFloors() {
  directFloorBrowser?.remove();
  directFloorBrowser = null;
  directActiveFloor = null;
}

function directRenderFloors(status, message, floors) {
  directRemoveFloors();
  if (floors.length < 2 || !directDwgRoomTabs) return false;

  directFloorBrowser = document.createElement("div");
  directFloorBrowser.className = "room-tabs";
  directFloorBrowser.setAttribute("role", "tablist");
  directFloorBrowser.setAttribute("aria-label", "Detected floors");
  directDwgRoomTabs.before(directFloorBrowser);

  floors.forEach((floor, index) => {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = `room-tab${index === 0 ? " active" : ""}`;
    tab.textContent = floor.name;
    tab.addEventListener("click", () => {
      directFloorBrowser.querySelectorAll(".room-tab").forEach((button, buttonIndex) => {
        button.classList.toggle("active", buttonIndex === index);
      });
      showCadAnalysis({
        status: `${status} - ${floor.name}`,
        message: `${message} Choose a floor first, then check its room tabs.`,
        shapes: floor.shapes
      });
      directFloorOverview(floor);
    });
    directFloorBrowser.append(tab);
  });

  showCadAnalysis({
    status: `${status} - ${floors[0].name}`,
    message: `${message} Choose a floor first, then check its room tabs.`,
    shapes: floors[0].shapes
  });
  directFloorOverview(floors[0]);
  return true;
}

function directDwgAnalysis(status, message, shapes = [], floors = []) {
  if (typeof showCadAnalysis === "function") {
    const floorCandidates = floors.length ? floors : directFloorCandidates(shapes);
    if (!directRenderFloors(status, message, floorCandidates)) {
      directRemoveFloors();
      showCadAnalysis({ status, message, shapes, floors });
    }
  }
}

async function directJson(response, fallback) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(fallback);
  }
}

function directTextBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function directDwgErrorMessage(error) {
  if (!error?.message || error.message === "Failed to fetch") {
    return "The converter could not complete this large DWG yet. Arqis kept the file on the large-drawing route so we can inspect the converter result.";
  }
  return error.message;
}

async function convertLargeDwg(file) {
  directCadEntities = [];
  directDwgFileStatus.textContent = `Sending ${file.name} to the DWG converter...`;
  directDwgCard(file, [
    "Large DWG received.",
    "Arqis is converting it outside the small website upload route."
  ]);
  directDwgAnalysis(
    "Large DWG conversion running",
    "This CAD file is too large for the small Vercel analysis upload. Arqis is sending it directly to the DWG converter first."
  );

  const conversionResponse = await fetch(`${DIRECT_CONVERTER_URL}?fileName=${encodeURIComponent(file.name)}`, {
    method: "POST",
    headers: { "Content-Type": "application/octet-stream" },
    body: file
  });
  const conversion = await directJson(
    conversionResponse,
    "The DWG converter did not return a usable CAD result for this large drawing."
  );
  if (!conversionResponse.ok || !conversion.ok || !conversion.dxfText) {
    throw new Error(conversion.message || "The DWG converter could not process this drawing yet.");
  }
  directCadEntities = directCadGeometry(conversion.dxfText);

  directDwgFileStatus.textContent = `Checking converted geometry from ${file.name}...`;
  const analysisResponse = await fetch("/api/analyse-plan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileName: conversion.outputFileName || `${file.name}.dxf`,
      extension: "dxf",
      base64: directTextBase64(conversion.dxfText)
    })
  });
  const analysis = await directJson(
    analysisResponse,
    "The converted CAD geometry is still too large for the current room analysis step."
  );
  if (!analysisResponse.ok || !analysis.ok) {
    throw new Error(analysis.message || "The converted CAD geometry could not be analysed.");
  }

  directDwgFileStatus.textContent = `${file.name} converted and checked`;
  directDwgCard(file, [
    "Large DWG converted outside Vercel.",
    "Arqis is checking the extracted CAD geometry for floors and rooms."
  ]);
  directDwgAnalysis(
    analysis.status || "Converted CAD geometry checked",
    analysis.message || "Arqis checked the converted CAD geometry.",
    analysis.shapes || [],
    analysis.floors || []
  );
}

async function onLargeDwgChange(event) {
  const file = directDwgFile.files[0];
  if (!file || directDwgExtension(file) !== "dwg" || file.size <= VERCEL_DWG_FILE_LIMIT) return;

  event.stopImmediatePropagation();

  try {
    await convertLargeDwg(file);
  } catch (error) {
    directDwgFileStatus.textContent = `${file.name} needs another converter pass`;
    directDwgCard(file, [
      "The large DWG did not complete through the converter.",
      "Arqis kept it on the large-drawing route so the converter result can be inspected."
    ]);
    directDwgAnalysis(
      "Large DWG conversion not complete",
      directDwgErrorMessage(error)
    );
  }
}

directDwgFile.addEventListener("change", onLargeDwgChange, { capture: true });
directDwgRoomTabs?.addEventListener("click", (event) => {
  const roomTab = event.target.closest(".room-tab");
  if (!roomTab || !directActiveFloor) return;
  const tabs = [...directDwgRoomTabs.querySelectorAll(".room-tab")];
  const roomIndex = tabs.indexOf(roomTab);
  if (roomIndex >= 0) directHighlightRoom(roomIndex);
});
