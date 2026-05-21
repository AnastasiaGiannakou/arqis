const form = document.querySelector(".controls");
const fields = [...form.querySelectorAll("input, select")];
const planFile = document.querySelector("#planFile");
const planPreviewBody = document.querySelector("#planPreviewBody");
const fileStatus = document.querySelector("#fileStatus");
const clearPlanBtn = document.querySelector("#clearPlanBtn");
const enterAppBtn = document.querySelector("#enterAppBtn");
const sampleDxfBtn = document.querySelector("#sampleDxfBtn");
const cadStatus = document.querySelector("#cadStatus");
const cadMessage = document.querySelector("#cadMessage");
const cadShapeCount = document.querySelector("#cadShapeCount");
const cadLargestArea = document.querySelector("#cadLargestArea");
const cadTotalArea = document.querySelector("#cadTotalArea");
const cadTotalFeet = document.querySelector("#cadTotalFeet");
const cadUnits = document.querySelector("#cadUnits");
const roomTabs = document.querySelector("#roomTabs");
const roomOutline = document.querySelector("#roomOutline");
const selectedRoomName = document.querySelector("#selectedRoomName");
const selectedRoomArea = document.querySelector("#selectedRoomArea");
const selectedRoomFeet = document.querySelector("#selectedRoomFeet");
const roomTitle = document.querySelector("#roomTitle");

const money = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 });
let planObjectUrl = "";
let lastDxfText = "";
let detectedRooms = [];

function enterApp() {
  document.body.classList.add("entered");
}

function numberValue(id) {
  return Number(document.querySelector(`#${id}`).value) || 0;
}

function activeMode() {
  return document.querySelector("input[name='tileMode']:checked").value;
}

function productDetails() {
  const [price, boxCoverage, name] = document.querySelector("#product").value.split("|");
  return { price: Number(price), boxCoverage: Number(boxCoverage), name };
}

function getTileHeight(roomHeight) {
  const mode = activeMode();
  if (mode === "half") return Math.min(1.2, roomHeight);
  if (mode === "custom") return Math.min(numberValue("tileHeight"), roomHeight);
  return roomHeight;
}

function calculate() {
  const length = numberValue("length");
  const width = numberValue("width");
  const height = numberValue("height");
  const waste = numberValue("waste") / 100;
  const doors = numberValue("doors");
  const doorArea = numberValue("doorArea");
  const windows = numberValue("windows");
  const windowArea = numberValue("windowArea");
  const labourRate = numberValue("labour");
  const extras = numberValue("extras");
  const includeFloor = document.querySelector("#tileFloor").checked;
  const includeWalls = document.querySelector("#tileWalls").checked;
  const product = productDetails();

  const floorArea = length * width;
  const tileHeight = getTileHeight(height);
  const perimeter = (length + width) * 2;
  const openingDeductions = (doors * doorArea) + (windows * windowArea);
  const wallArea = includeWalls ? Math.max(0, (perimeter * tileHeight) - openingDeductions) : 0;
  const selectedFloorArea = includeFloor ? floorArea : 0;
  const totalArea = selectedFloorArea + wallArea;
  const totalWithWaste = totalArea * (1 + waste);
  const boxes = product.boxCoverage > 0 ? Math.ceil(totalWithWaste / product.boxCoverage) : 0;
  const materialCost = totalWithWaste * product.price;
  const labourCost = totalArea * labourRate;
  const totalCost = materialCost + labourCost + extras;

  document.querySelector("#floorArea").textContent = `${floorArea.toFixed(2)} m²`;
  document.querySelector("#wallArea").textContent = `${wallArea.toFixed(2)} m²`;
  document.querySelector("#totalArea").textContent = `${totalWithWaste.toFixed(2)} m²`;
  document.querySelector("#boxes").textContent = `${boxes}`;
  document.querySelector("#materialCost").textContent = money.format(materialCost);
  document.querySelector("#labourCost").textContent = money.format(labourCost);
  document.querySelector("#extrasCost").textContent = money.format(extras);
  document.querySelector("#totalCost").textContent = money.format(totalCost);
  document.querySelector("#tileHeight").disabled = activeMode() !== "custom";

  const roomLabel = selectedRoomName.textContent === "No room selected" ? "the current manual dimensions" : selectedRoomName.textContent;
  const modeText = activeMode() === "full" ? "floor-to-ceiling" : activeMode() === "half" ? "half-height" : `${tileHeight.toFixed(2)}m high`;
  document.querySelector("#summaryText").textContent = `${product.name} selected for ${roomLabel}. The estimate uses ${modeText} wall tiling, ${Math.round(waste * 100)}% waste, ${boxes} boxes, materials, labour, and listed extras.`;
}

function cadUnitFactor() {
  return { mm: 0.001, cm: 0.01, m: 1, ft: 0.3048, in: 0.0254 }[cadUnits.value] || 1;
}

function polygonArea(points) {
  if (points.length < 3) return 0;
  let sum = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    sum += (current.x * next.y) - (next.x * current.y);
  }
  return Math.abs(sum) / 2;
}

function roomName(index) {
  return ["Bathroom 1", "Kitchen", "Bedroom 1", "Bedroom 2", "Hall", "Room"][index] || `Room ${index + 1}`;
}

function normalisePoints(points) {
  const width = 420;
  const height = 280;
  const padding = 28;
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = Math.max(1, maxX - minX);
  const spanY = Math.max(1, maxY - minY);
  const scale = Math.min((width - padding * 2) / spanX, (height - padding * 2) / spanY);
  const offsetX = (width - spanX * scale) / 2;
  const offsetY = (height - spanY * scale) / 2;

  return points.map((point) => ({
    x: offsetX + (point.x - minX) * scale,
    y: height - (offsetY + (point.y - minY) * scale)
  }));
}

function renderEmptyRoomState(label = "No rooms extracted") {
  detectedRooms = [];
  roomTabs.replaceChildren();
  const tab = document.createElement("button");
  tab.className = "room-tab active";
  tab.type = "button";
  tab.textContent = label;
  roomTabs.append(tab);

  const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
  text.setAttribute("x", "210");
  text.setAttribute("y", "140");
  text.setAttribute("text-anchor", "middle");
  text.setAttribute("fill", "#65736c");
  text.setAttribute("font-size", "16");
  text.setAttribute("font-weight", "700");
  text.textContent = "Room outline will appear here";
  roomOutline.replaceChildren(text);

  selectedRoomName.textContent = "No room selected";
  selectedRoomArea.textContent = "--";
  selectedRoomFeet.textContent = "--";
  roomTitle.textContent = "Plan preview";
  calculate();
}

function renderRoom(index = 0) {
  const room = detectedRooms[index];
  if (!room) return;

  roomTabs.querySelectorAll(".room-tab").forEach((tab, tabIndex) => {
    tab.classList.toggle("active", tabIndex === index);
  });

  const points = normalisePoints(room.points);
  const polygon = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
  polygon.setAttribute("points", points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" "));
  roomOutline.replaceChildren(polygon);

  selectedRoomName.textContent = room.name;
  selectedRoomArea.textContent = `${room.areaM2.toFixed(2)} m²`;
  selectedRoomFeet.textContent = `${(room.areaM2 * 10.7639).toFixed(2)} ft²`;
  roomTitle.textContent = room.name;

  const xs = room.points.map((point) => point.x);
  const ys = room.points.map((point) => point.y);
  const factor = cadUnitFactor();
  document.querySelector("#length").value = ((Math.max(...xs) - Math.min(...xs)) * factor).toFixed(2);
  document.querySelector("#width").value = ((Math.max(...ys) - Math.min(...ys)) * factor).toFixed(2);
  calculate();
}

function renderRooms(shapes) {
  const factor = cadUnitFactor();
  detectedRooms = shapes
    .map((shape, index) => ({ name: roomName(index), points: shape.points, areaM2: shape.rawArea * factor * factor }))
    .filter((room) => Number.isFinite(room.areaM2) && room.areaM2 > 0);

  if (!detectedRooms.length) {
    renderEmptyRoomState();
    return;
  }

  roomTabs.replaceChildren();
  detectedRooms.forEach((room, index) => {
    const tab = document.createElement("button");
    tab.className = `room-tab${index === 0 ? " active" : ""}`;
    tab.type = "button";
    tab.textContent = room.name;
    tab.addEventListener("click", () => renderRoom(index));
    roomTabs.append(tab);
  });
  renderRoom(0);
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
        if (lines[index] === "70") flags = Number(lines[index + 1]) || 0;
        if (lines[index] === "10") currentX = Number(lines[index + 1]);
        if (lines[index] === "20" && currentX !== null) {
          points.push({ x: currentX, y: Number(lines[index + 1]) });
          currentX = null;
        }
        index += 2;
      }
      if ((flags & 1) === 1 && points.length >= 3) shapes.push({ points, rawArea: polygonArea(points) });
      index -= 2;
    }
  }

  return shapes.filter((shape) => shape.rawArea > 0);
}

function showCadAnalysis({ status, message, shapes = [] }) {
  const factor = cadUnitFactor();
  const areas = shapes.map((shape) => shape.rawArea * factor * factor).filter((area) => area > 0).sort((a, b) => b - a);
  const total = areas.reduce((sum, area) => sum + area, 0);

  cadStatus.textContent = status;
  cadMessage.textContent = message;
  cadShapeCount.textContent = `${areas.length}`;
  cadLargestArea.textContent = `${(areas[0] || 0).toFixed(2)} m²`;
  cadTotalArea.textContent = `${total.toFixed(2)} m²`;
  cadTotalFeet.textContent = `${(total * 10.7639).toFixed(2)} ft²`;
  renderRooms(shapes);
}

function analyseDxfText(text) {
  lastDxfText = text;
  const shapes = parseDxfPolylines(text);
  if (!shapes.length) {
    showCadAnalysis({ status: "DXF read, no closed rooms found", message: "Arqis could read the DXF file, but it did not find closed room outlines yet.", shapes: [] });
    return;
  }
  showCadAnalysis({ status: "DXF rooms detected", message: "Each closed CAD outline is now shown as a room tab. Click a tab to see that room outline and size.", shapes });
}

function sampleDxf() {
  return `0
SECTION
2
ENTITIES
0
LWPOLYLINE
90
4
70
1
10
0
20
0
10
3200
20
0
10
3200
20
2400
10
0
20
2400
0
LWPOLYLINE
90
4
70
1
10
4200
20
0
10
9200
20
0
10
9200
20
3600
10
4200
20
3600
0
LWPOLYLINE
90
4
70
1
10
0
20
4600
10
4200
20
4600
10
4200
20
8100
10
0
20
8100
0
ENDSEC
0
EOF`;
}

function loadSampleDxf() {
  clearPlan(false);
  fileStatus.textContent = "Sample DXF rooms loaded";
  cadUnits.value = "mm";
  analyseDxfText(sampleDxf());
  planPreviewBody.innerHTML = `<div class="plan-file-card"><strong>Sample DXF rooms</strong><span>Bathroom 1, Kitchen, and Bedroom 1 are closed CAD room outlines.</span><span>Click each room tab to see the outline and size.</span></div>`;
}

function findEmbeddedPng(buffer) {
  const bytes = new Uint8Array(buffer);
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  const ending = [73, 69, 78, 68, 174, 66, 96, 130];
  for (let index = 0; index < bytes.length - signature.length; index += 1) {
    if (!signature.every((value, offset) => bytes[index + offset] === value)) continue;
    for (let end = index + signature.length; end < bytes.length - ending.length; end += 1) {
      if (ending.every((value, offset) => bytes[end + offset] === value)) return bytes.slice(index, end + ending.length);
    }
  }
  return null;
}

async function showPlan(file) {
  if (!file) return;
  if (planObjectUrl) URL.revokeObjectURL(planObjectUrl);

  const extension = file.name.split(".").pop().toLowerCase();
  fileStatus.textContent = `${file.name} selected (${(file.size / 1024 / 1024).toFixed(2)} MB)`;
  planPreviewBody.replaceChildren();

  if (extension === "dxf") {
    analyseDxfText(await file.text());
    planPreviewBody.innerHTML = `<div class="plan-file-card"><strong>${file.name}</strong><span>DXF uploaded and checked for closed room outlines.</span></div>`;
    return;
  }

  if (file.type.startsWith("image/")) {
    planObjectUrl = URL.createObjectURL(file);
    planPreviewBody.innerHTML = "";
    const image = document.createElement("img");
    image.src = planObjectUrl;
    image.alt = "Uploaded architectural plan preview";
    planPreviewBody.append(image);
    showCadAnalysis({ status: "Plan image previewed", message: "Images can be used as visual references. Automatic measuring is currently working first from DXF closed room outlines.", shapes: [] });
    return;
  }

  if (extension === "dwg") {
    const embeddedPng = findEmbeddedPng(await file.arrayBuffer());
    if (embeddedPng) {
      const blob = new Blob([embeddedPng], { type: "image/png" });
      planObjectUrl = URL.createObjectURL(blob);
      const image = document.createElement("img");
      image.src = planObjectUrl;
      image.alt = "Embedded DWG drawing preview";
      planPreviewBody.append(image);
    } else {
      planPreviewBody.innerHTML = `<div class="plan-file-card"><strong>${file.name}</strong><span>DWG uploaded.</span></div>`;
    }
    showCadAnalysis({ status: "DWG preview loaded", message: "Arqis has the DWG preview. Room-by-room extraction needs the backend DWG conversion stage, so no room areas are calculated from this DWG yet.", shapes: [] });
    return;
  }

  planPreviewBody.innerHTML = `<div class="plan-file-card"><strong>${file.name}</strong><span>${extension.toUpperCase()} uploaded for measurement reference.</span></div>`;
  showCadAnalysis({ status: `${extension.toUpperCase()} uploaded`, message: "This file can be stored as a plan reference. Automatic room extraction is currently working first from DXF files.", shapes: [] });
}

function clearPlan(resetText = true) {
  if (planObjectUrl) URL.revokeObjectURL(planObjectUrl);
  planObjectUrl = "";
  planFile.value = "";
  lastDxfText = "";
  if (resetText) fileStatus.textContent = "No plan uploaded yet";
  planPreviewBody.innerHTML = "<p>Upload a plan or use the sample room file.</p>";
  showCadAnalysis({ status: "Upload a CAD file to begin", message: "Arqis will show each closed CAD room outline as a tab and calculate the areas.", shapes: [] });
}

fields.forEach((field) => {
  field.addEventListener("input", calculate);
  field.addEventListener("change", calculate);
});

document.querySelector("#printBtn").addEventListener("click", () => window.print());
planFile.addEventListener("change", () => showPlan(planFile.files[0]));
clearPlanBtn.addEventListener("click", clearPlan);
enterAppBtn.addEventListener("click", enterApp);
sampleDxfBtn.addEventListener("click", loadSampleDxf);
cadUnits.addEventListener("change", () => {
  if (lastDxfText) analyseDxfText(lastDxfText);
});

showCadAnalysis({ status: "Upload a CAD file to begin", message: "Arqis will show each closed CAD room outline as a tab and calculate the areas.", shapes: [] });
