const form = document.querySelector("#estimateForm");
const fields = [...form.querySelectorAll("input, select")];
const planFile = document.querySelector("#planFile");
const planPreview = document.querySelector("#planPreview");
const planPreviewBody = document.querySelector("#planPreviewBody");
const fileStatus = document.querySelector("#fileStatus");
const clearPlanBtn = document.querySelector("#clearPlanBtn");
const enterAppBtn = document.querySelector("#enterAppBtn");
const money = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0
});
let planObjectUrl = "";

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
      return;
    }
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

calculate();
