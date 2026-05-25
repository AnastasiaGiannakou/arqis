const pdfFixStyle = document.createElement("style");
pdfFixStyle.textContent = `
  .pdf-room-label {
    font-size: 2.2px !important;
    stroke-width: 0.45px !important;
    letter-spacing: 0 !important;
  }

  .pdf-room-rect,
  .pdf-room-draft {
    stroke-width: 1.4px !important;
    vector-effect: non-scaling-stroke;
  }

  .pdf-room-rect.active {
    stroke-width: 1.8px !important;
  }

  .clean-room-outline {
    fill: rgba(29, 107, 79, 0.10);
    stroke: #164c3a;
    stroke-width: 5px;
  }

  .clean-room-dimension {
    stroke: #164c3a;
    stroke-width: 2px;
    marker-start: url(#dimension-dot);
    marker-end: url(#dimension-dot);
  }

  .clean-room-dimension-text,
  .clean-room-name {
    fill: #164c3a;
    font-weight: 850;
    paint-order: stroke;
    stroke: #fff;
    stroke-width: 4px;
  }

  .clean-room-dimension-text {
    font-size: 15px;
  }

  .clean-room-name {
    font-size: 18px;
  }
`;
document.head.append(pdfFixStyle);

const cleanOutlineSvg = document.querySelector("#roomOutline");
const cleanRoomName = document.querySelector("#selectedRoomName");
const cleanRoomArea = document.querySelector("#selectedRoomArea");
const cleanLengthInput = document.querySelector("#length");
const cleanWidthInput = document.querySelector("#width");
let cleanOutlineQueued = false;
let cleanOutlineDrawing = false;

function cleanNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function createSvgElement(name, attributes = {}) {
  const element = document.createElementNS("http://www.w3.org/2000/svg", name);
  Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, String(value)));
  return element;
}

function drawCleanRoomOutline() {
  if (!cleanOutlineSvg || cleanOutlineDrawing) return;
  const roomName = cleanRoomName?.textContent?.trim() || "Room";
  const hasMarkedPdfRoom = cleanRoomArea?.textContent?.trim() === "Marked";
  if (!hasMarkedPdfRoom) return;

  cleanOutlineDrawing = true;
  const length = cleanNumber(cleanLengthInput?.value, 3.2);
  const width = cleanNumber(cleanWidthInput?.value, 2.4);
  const svgWidth = 420;
  const svgHeight = 280;
  const paddingX = 76;
  const paddingY = 62;
  const usableWidth = svgWidth - paddingX * 2;
  const usableHeight = svgHeight - paddingY * 2;
  const aspect = Math.max(length / Math.max(width, 0.1), 0.2);
  let rectWidth = usableWidth;
  let rectHeight = rectWidth / aspect;
  if (rectHeight > usableHeight) {
    rectHeight = usableHeight;
    rectWidth = rectHeight * aspect;
  }
  const x = (svgWidth - rectWidth) / 2;
  const y = (svgHeight - rectHeight) / 2;
  const midX = x + rectWidth / 2;
  const midY = y + rectHeight / 2;

  cleanOutlineSvg.replaceChildren();
  const defs = createSvgElement("defs");
  const marker = createSvgElement("marker", {
    id: "dimension-dot",
    markerWidth: 4,
    markerHeight: 4,
    refX: 2,
    refY: 2
  });
  marker.append(createSvgElement("circle", { cx: 2, cy: 2, r: 2, fill: "#164c3a" }));
  defs.append(marker);

  const room = createSvgElement("rect", {
    x: x.toFixed(1),
    y: y.toFixed(1),
    width: rectWidth.toFixed(1),
    height: rectHeight.toFixed(1),
    rx: 4,
    class: "clean-room-outline"
  });
  const horizontalLine = createSvgElement("line", {
    x1: x.toFixed(1),
    y1: (y + rectHeight + 24).toFixed(1),
    x2: (x + rectWidth).toFixed(1),
    y2: (y + rectHeight + 24).toFixed(1),
    class: "clean-room-dimension"
  });
  const verticalLine = createSvgElement("line", {
    x1: (x - 24).toFixed(1),
    y1: y.toFixed(1),
    x2: (x - 24).toFixed(1),
    y2: (y + rectHeight).toFixed(1),
    class: "clean-room-dimension"
  });
  const name = createSvgElement("text", {
    x: midX.toFixed(1),
    y: midY.toFixed(1),
    "text-anchor": "middle",
    "dominant-baseline": "middle",
    class: "clean-room-name"
  });
  name.textContent = roomName;
  const lengthLabel = createSvgElement("text", {
    x: midX.toFixed(1),
    y: (y + rectHeight + 47).toFixed(1),
    "text-anchor": "middle",
    class: "clean-room-dimension-text"
  });
  lengthLabel.textContent = `${length.toFixed(2)} m`;
  const widthLabel = createSvgElement("text", {
    x: (x - 42).toFixed(1),
    y: midY.toFixed(1),
    "text-anchor": "middle",
    "dominant-baseline": "middle",
    transform: `rotate(-90 ${(x - 42).toFixed(1)} ${midY.toFixed(1)})`,
    class: "clean-room-dimension-text"
  });
  widthLabel.textContent = `${width.toFixed(2)} m`;

  cleanOutlineSvg.append(defs, room, horizontalLine, verticalLine, name, lengthLabel, widthLabel);
  cleanOutlineDrawing = false;
}

function queueCleanRoomOutline() {
  if (cleanOutlineQueued) return;
  cleanOutlineQueued = true;
  requestAnimationFrame(() => {
    cleanOutlineQueued = false;
    drawCleanRoomOutline();
  });
}

[cleanRoomName, cleanRoomArea, cleanLengthInput, cleanWidthInput].forEach((element) => {
  element?.addEventListener("input", queueCleanRoomOutline);
  element?.addEventListener("change", queueCleanRoomOutline);
});

if (cleanOutlineSvg) {
  new MutationObserver(queueCleanRoomOutline).observe(cleanOutlineSvg, { childList: true, subtree: true });
}
if (cleanRoomName) {
  new MutationObserver(queueCleanRoomOutline).observe(cleanRoomName, { childList: true, characterData: true, subtree: true });
}
if (cleanRoomArea) {
  new MutationObserver(queueCleanRoomOutline).observe(cleanRoomArea, { childList: true, characterData: true, subtree: true });
}
queueCleanRoomOutline();
