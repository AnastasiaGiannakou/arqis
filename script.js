const form = document.querySelector("#estimateForm");
const fields = [...form.querySelectorAll("input, select")];
const planFile = document.querySelector("#planFile");
const planPreview = document.querySelector("#planPreview");
const planPreviewBody = document.querySelector("#planPreviewBody");
const fileStatus = document.querySelector("#fileStatus");
const clearPlanBtn = document.querySelector("#clearPlanBtn");
const enterAppBtn = document.querySelector("#enterAppBtn");
const sampleDxfBtn = document.querySelector("#sampleDxfBtn");
const cadAnalysis = document.querySelector("#cadAnalysis");
const cadStatus = document.querySelector("#cadStatus");
const cadMessage = document.querySelector("#cadMessage");
const cadShapeCount = document.querySelector("#cadShapeCount");
const cadLargestArea = document.querySelector("#cadLargestArea");
const cadTotalArea = document.querySelector("#cadTotalArea");
const cadTotalFeet = document.querySelector("#cadTotalFeet");
const cadUnits = document.querySelector("#cadUnits");
const money = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0
});
let planObjectUrl = "";
let lastDxfText = "";

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
  const [price, boxCoverage, name, colour] = document.querySelector("#product").value.split("|");
  return {
    price: Number(price),
    boxCoverage: Number(boxCoverage),
    name,
    colour
  };
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
  const rawWallArea = Math.max(0, (perimeter * tileHeight) - openingDeductions);
  const selectedFloorArea = includeFloor ? floorArea : 0;
  const selectedWallArea = includeWalls ? rawWallArea : 0;
  const totalArea = selectedFloorArea + selectedWallArea;
  const totalWithWaste = totalArea * (1 + waste);
  const boxes = product.boxCoverage > 0 ? Math.ceil(totalWithWaste / product.boxCoverage) : 0;
  const materialCost = totalWithWaste * product.price;
  const labourCost = totalArea * labourRate;
  const totalCost = materialCost + labourCost + extras;

  document.querySelector("#floorArea").textContent = `${floorArea.toFixed(2)} m²`;
  document.querySelector("#wallArea").textContent = `${selectedWallArea.toFixed(2)} m²`;
  document.querySelector("#totalArea").textContent = `${totalWithWaste.toFixed(2)} m²`;
  document.querySelector("#boxes").textContent = `${boxes}`;
  document.querySelector("#materialCost").textContent = money.format(materialCost);
  document.querySelector("#labourCost").textContent = money.format(labourCost);
  document.querySelector("#extrasCost").textContent = money.format(extras);
  document.querySelector("#totalCost").textContent = money.format(totalCost);

  const modeText = activeMode() === "full"
    ? "full-height wall tiling"
    : activeMode() === "half"
      ? "half-height wall tiling"
      : `${tileHeight.toFixed(2)}m custom-height wall tiling`;

  document.querySelector("#summaryText").textContent =
    `${product.name} selected for a ${length.toFixed(1)}m by ${width.toFixed(1)}m bathroom with ${modeText}. ` +
    `The estimate includes ${Math.round(waste * 100)}% waste, ${boxes} boxes, materials, labour, and listed extras.`;

  document.documentElement.style.setProperty("--tile", product.colour);
  document.querySelector("#tileHeight").disabled = activeMode() !== "custom";

  const wallPercent = includeWalls ? Math.max(0, Math.min(100, (tileHeight / height) * 100)) : 0;
  document.querySelector(".wall-back").style.background =
    `linear-gradient(to bottom, rgba(255,255,255,0.7), rgba(255,255,255,0.2)),
     linear-gradient(to top, var(--tile) 0 ${wallPercent}%, #eef0ea ${wallPercent}% 100%),
     repeating-linear-gradient(90deg, transparent 0 48px, rgba(24,32,29,0.09) 48px 50px),
     repeating-linear-gradient(0deg, transparent 0 32px, rgba(255,255,255,0.5) 32px 34px)`;
  document.querySelector(".floor").style.opacity = includeFloor ? "1" : "0.28";
}

fields.forEach((field) => {
  field.addEventListener("input", calculate);
  field.addEventListener("change", calculate);
});

document.querySelector("#printBtn").addEventListener("click", () => window.print());

function clearPlan() {
  if (planObjectUrl) {
    URL.revokeObjectURL(planObjectUrl);
    planObjectUrl = "";
  }
  planFile.value = "";
  planPreview.hidden = true;
  planPreviewBody.replaceChildren();
  fileStatus.textContent = "No plan uploaded yet";
  lastDxfText = "";
  showCadAnalysis({
    status: "Upload a CAD file to begin",
    message: "Arqis will preview uploaded plans and calculate areas from DXF files that contain closed room outlines.",
    shapes: []
  });
}

function findEmbeddedPng(buffer) {
  const bytes = new Uint8Array(buffer);
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  const ending = [73, 69, 78, 68, 174, 66, 96, 130];

  for (let index = 0; index < bytes.length - signature.length; index += 1) {
    const startsPng = signature.every((value, offset) => bytes[index + offset] === value);
    if (!startsPng) continue;

    for (let end = index + signature.length; end < bytes.length - ending.length; end += 1) {
      const endsPng = ending.every((value, offset) => bytes[end + offset] === value);
      if (endsPng) {
        return bytes.slice(index, end + ending.length);
      }
    }
  }

  return null;
}

function cadUnitFactor() {
  return {
    mm: 0.001,
    cm: 0.01,
    m: 1,
    ft: 0.3048,
    in: 0.0254
  }[cadUnits.value] || 1;
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

      while (index < lines.length - 1 && !(lines[index] === "0")) {
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

    if (code === "0" && value === "POLYLINE") {
      const points = [];
      let closed = false;
      index += 2;

      while (index < lines.length - 1 && !(lines[index] === "0" && lines[index + 1] === "SEQEND")) {
        if (lines[index] === "70") closed = ((Number(lines[index + 1]) || 0) & 1) === 1;
        if (lines[index] === "0" && lines[index + 1] === "VERTEX") {
          let x = null;
          let y = null;
          index += 2;
          while (index < lines.length - 1 && lines[index] !== "0") {
            if (lines[index] === "10") x = Number(lines[index + 1]);
            if (lines[index] === "20") y = Number(lines[index + 1]);
            index += 2;
          }
          if (x !== null && y !== null) points.push({ x, y });
          index -= 2;
        }
        index += 2;
      }

      if (closed && points.length >= 3) {
        shapes.push({ points, rawArea: polygonArea(points) });
      }
    }
  }

  return shapes.filter((shape) => shape.rawArea > 0);
}

function showCadAnalysis({ status, message, shapes = [] }) {
  const factor = cadUnitFactor();
  const areas = shapes
    .map((shape) => shape.rawArea * factor * factor)
    .filter((area) => Number.isFinite(area) && area > 0)
    .sort((a, b) => b - a);
  const total = areas.reduce((sum, area) => sum + area, 0);
  const largest = areas[0] || 0;

  cadAnalysis.hidden = false;
  cadStatus.textContent = status;
  cadMessage.textContent = message;
  cadShapeCount.textContent = `${areas.length}`;
  cadLargestArea.textContent = `${largest.toFixed(2)} m²`;
  cadTotalArea.textContent = `${total.toFixed(2)} m²`;
  cadTotalFeet.textContent = `${(total * 10.7639).toFixed(2)} ft²`;
}

function analyseDxfText(text) {
  lastDxfText = text;
  const shapes = parseDxfPolylines(text);
  if (!shapes.length) {
    showCadAnalysis({
      status: "DXF read, no closed room shapes found",
      message: "Arqis could read the DXF file, but it did not find closed polylines yet. Closed room outlines are needed for automatic area calculation.",
      shapes: []
    });
    return;
  }

  showCadAnalysis({
    status: "DXF areas detected",
    message: "Arqis found closed CAD shapes and calculated their areas using the selected drawing units. This is the first measurement pass and should be checked against the plan scale.",
    shapes
  });
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
ENDSEC
0
EOF`;
}

function loadSampleDxf() {
  clearPlan();
  fileStatus.textContent = "Sample DXF room loaded (3.2m x 2.4m)";
  cadUnits.value = "mm";
  analyseDxfText(sampleDxf());
  planPreview.hidden = false;
  planPreviewBody.replaceChildren();
  const card = document.createElement("div");
  card.className = "plan-file-card";
  card.innerHTML = `
    <strong>Sample DXF room</strong>
    <span>Closed CAD polyline: 3.2m by 2.4m.</span>
    <span>Arqis has calculated this from CAD geometry.</span>
  `;
  planPreviewBody.append(card);
}

async function showPlan(file) {
  if (!file) return;
  if (planObjectUrl) URL.revokeObjectURL(planObjectUrl);

  const sizeMb = file.size / 1024 / 1024;
  const extension = file.name.split(".").pop().toLowerCase();
  fileStatus.textContent = `${file.name} selected (${sizeMb.toFixed(2)} MB)`;
  planPreview.hidden = false;
  planPreviewBody.replaceChildren();

  if (file.type.startsWith("image/")) {
    planObjectUrl = URL.createObjectURL(file);
    const image = document.createElement("img");
    image.src = planObjectUrl;
    image.alt = "Uploaded architectural plan preview";
    planPreviewBody.append(image);
    showCadAnalysis({
      status: "Plan image previewed",
      message: "This image can be used as a visual reference. The next image/PDF stage will let you trace room outlines so Arqis can calculate areas from the traced shape.",
      shapes: []
    });
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
      showCadAnalysis({
        status: "DWG preview extracted",
        message: "Arqis can show the embedded AutoCAD preview. To calculate areas from DWG files, the next backend stage will convert DWG to DXF and read the CAD geometry.",
        shapes: []
      });
      return;
    }
    showCadAnalysis({
      status: "DWG uploaded",
      message: "Arqis received the AutoCAD file, but this DWG does not expose a usable embedded preview in the browser. Automatic DWG area calculation needs the backend conversion stage from DWG to DXF.",
      shapes: []
    });
  }

  if (extension === "dxf") {
    analyseDxfText(await file.text());
  } else {
    showCadAnalysis({
      status: `${extension.toUpperCase()} measurement pending`,
      message: "This file is uploaded as a plan reference. Automatic area extraction is currently being built first for DXF files.",
      shapes: []
    });
  }

  const card = document.createElement("div");
  card.className = "plan-file-card";
  card.innerHTML = `
    <strong>${file.name}</strong>
    <span>${file.name.split(".").pop().toUpperCase()} uploaded for measurement reference.</span>
    <span>Automatic CAD/PDF measuring would be the next build stage.</span>
  `;
  planPreviewBody.append(card);
}

planFile.addEventListener("change", () => showPlan(planFile.files[0]));
clearPlanBtn.addEventListener("click", clearPlan);
enterAppBtn.addEventListener("click", enterApp);
sampleDxfBtn.addEventListener("click", loadSampleDxf);
cadUnits.addEventListener("change", () => {
  if (lastDxfText) analyseDxfText(lastDxfText);
});

calculate();
