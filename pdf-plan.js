const pdfPlanFile = document.querySelector("#planFile");
const pdfPlanPreviewBody = document.querySelector("#planPreviewBody");
const pdfFileStatus = document.querySelector("#fileStatus");
const pdfRoomTabs = document.querySelector("#roomTabs");
const pdfRoomOutline = document.querySelector("#roomOutline");
const pdfSelectedRoomName = document.querySelector("#selectedRoomName");
const pdfSelectedRoomArea = document.querySelector("#selectedRoomArea");
const pdfSelectedRoomFeet = document.querySelector("#selectedRoomFeet");
const pdfRoomTitle = document.querySelector("#roomTitle");
const pdfCadStatus = document.querySelector("#cadStatus");
const pdfCadMessage = document.querySelector("#cadMessage");
const pdfCadShapeCount = document.querySelector("#cadShapeCount");
const pdfCadLargestArea = document.querySelector("#cadLargestArea");
const pdfCadTotalArea = document.querySelector("#cadTotalArea");
const pdfCadTotalFeet = document.querySelector("#cadTotalFeet");
const pdfClearPlanBtn = document.querySelector("#clearPlanBtn");

let activePdfDocument = null;
let activePdfRender = null;
let activePdfMainElement = null;
let activePdfObjectUrl = "";
let activePdfPage = 1;
let pdfRooms = [];
let pdfRoomCounter = 0;
let pdfMarking = false;
let pdfDragStart = null;
let pdfDraftRect = null;
let pdfOverlay = null;
let pdfTools = null;

if (window.pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
}

const pdfStyle = document.createElement("style");
pdfStyle.textContent = `
  .pdf-plan-canvas,
  .pdf-main-canvas,
  .pdf-main-frame {
    display: block;
    width: 100%;
    border: 1px solid var(--line, #d7ded8);
    border-radius: 6px;
    background: white;
  }

  .pdf-plan-canvas {
    height: auto;
    max-height: 360px;
    object-fit: contain;
  }

  .pdf-main-wrap {
    position: relative;
    width: 100%;
  }

  .pdf-main-canvas {
    height: auto;
    max-height: min(620px, 62vh);
    object-fit: contain;
  }

  .pdf-main-frame {
    min-height: min(720px, 68vh);
  }

  .pdf-room-overlay {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    touch-action: none;
  }

  .pdf-room-overlay.marking {
    cursor: crosshair;
    pointer-events: auto;
  }

  .pdf-room-rect {
    fill: rgba(29, 107, 79, 0.16);
    stroke: #164c3a;
    stroke-width: 2.5;
    pointer-events: auto;
  }

  .pdf-room-rect.active {
    fill: rgba(184, 95, 56, 0.24);
    stroke: #b85f38;
    stroke-width: 4;
  }

  .pdf-room-draft {
    fill: rgba(29, 107, 79, 0.18);
    stroke: #1d6b4f;
    stroke-width: 3;
    stroke-dasharray: 7 5;
  }

  .pdf-room-label {
    fill: #164c3a;
    font-size: 13px;
    font-weight: 850;
    paint-order: stroke;
    stroke: white;
    stroke-width: 4px;
    pointer-events: none;
  }

  .pdf-plan-caption {
    color: var(--muted, #65736c);
    font-size: 12px;
    font-weight: 800;
    text-transform: uppercase;
  }

  .pdf-tools {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    align-items: center;
  }

  .pdf-tool-btn {
    min-height: 34px;
    padding: 0 12px;
    border: 1px solid var(--line, #d7ded8);
    border-radius: 6px;
    background: white;
    color: var(--ink, #18201d);
    font-weight: 800;
  }

  .pdf-tool-btn.active {
    background: var(--green-dark, #164c3a);
    color: white;
  }
`;
document.head.append(pdfStyle);

function isPdfFile(file) {
  return file && (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"));
}

function clearPdfViewer() {
  if (activePdfRender) {
    activePdfRender.cancel();
    activePdfRender = null;
  }
  activePdfDocument = null;
  activePdfMainElement?.remove();
  activePdfMainElement = null;
  pdfOverlay = null;
  pdfDraftRect = null;
  pdfDragStart = null;
  pdfMarking = false;
  pdfRooms = [];
  pdfRoomCounter = 0;
  pdfTools?.remove();
  pdfTools = null;
  if (activePdfObjectUrl) {
    URL.revokeObjectURL(activePdfObjectUrl);
    activePdfObjectUrl = "";
  }
  if (pdfRoomOutline) pdfRoomOutline.hidden = false;
}

function setPdfMetrics(status, message) {
  pdfCadStatus.textContent = status;
  pdfCadMessage.textContent = message;
  pdfCadShapeCount.textContent = `${pdfRooms.length}`;
  pdfCadLargestArea.textContent = "--";
  pdfCadTotalArea.textContent = "--";
  pdfCadTotalFeet.textContent = "--";
}

function setPdfRoomState(label, room = null) {
  pdfSelectedRoomName.textContent = label;
  pdfSelectedRoomArea.textContent = room ? "Marked" : "--";
  pdfSelectedRoomFeet.textContent = room ? "Trace" : "--";
  pdfRoomTitle.textContent = label;
}

function ensurePdfTools() {
  if (pdfTools) return;
  pdfTools = document.createElement("div");
  pdfTools.className = "pdf-tools";
  pdfTools.innerHTML = `
    <button class="pdf-tool-btn" id="pdfMarkRoomBtn" type="button">Mark room</button>
    <button class="pdf-tool-btn" id="pdfClearRoomsBtn" type="button">Clear rooms</button>
  `;
  pdfRoomTabs.before(pdfTools);
  pdfTools.querySelector("#pdfMarkRoomBtn").addEventListener("click", () => setPdfMarking(!pdfMarking));
  pdfTools.querySelector("#pdfClearRoomsBtn").addEventListener("click", () => {
    pdfRooms = [];
    pdfRoomCounter = 0;
    renderPdfTabs(activePdfDocument?.numPages || 1, activePdfDocument ? showPdfFloor : () => {});
    renderPdfRoomMarks();
    setPdfRoomState(activePdfDocument ? `Floor ${activePdfPage}` : "PDF plan");
    setPdfMetrics("PDF plan loaded", "Mark rooms on top of the PDF plan, then use those room tabs as the first room schedule.");
  });
}

function setPdfMarking(enabled) {
  pdfMarking = enabled;
  pdfOverlay?.classList.toggle("marking", enabled);
  pdfTools?.querySelector("#pdfMarkRoomBtn")?.classList.toggle("active", enabled);
  if (enabled) {
    setPdfMetrics("Room marking active", "Drag around a room on the PDF plan. Arqis will add it as a room tab so we can distinguish spaces before measuring them.");
  }
}

function renderPdfTabs(pageCount, onClick) {
  pdfRoomTabs.replaceChildren();
  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    const tab = document.createElement("button");
    tab.className = `room-tab${pageNumber === activePdfPage ? " active" : ""}`;
    tab.type = "button";
    tab.textContent = pageCount === 1 ? "PDF plan" : `Floor ${pageNumber}`;
    tab.addEventListener("click", () => onClick(pageNumber));
    pdfRoomTabs.append(tab);
  }

  pdfRooms.forEach((room) => {
    const tab = document.createElement("button");
    tab.className = "room-tab";
    tab.type = "button";
    tab.textContent = room.name;
    tab.addEventListener("click", () => selectPdfRoom(room.id));
    pdfRoomTabs.append(tab);
  });
}

function activatePdfTab(pageNumber) {
  pdfRoomTabs.querySelectorAll(".room-tab").forEach((button, index) => {
    button.classList.toggle("active", index + 1 === pageNumber);
  });
}

function pdfOverlayPoint(event) {
  const bounds = pdfOverlay.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
    y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height))
  };
}

function rectFromPoints(start, end) {
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  return {
    x,
    y,
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y)
  };
}

function drawRectAttributes(element, room) {
  element.setAttribute("x", `${room.x * 100}%`);
  element.setAttribute("y", `${room.y * 100}%`);
  element.setAttribute("width", `${room.width * 100}%`);
  element.setAttribute("height", `${room.height * 100}%`);
}

function renderPdfRoomMarks(activeRoomId = null) {
  if (!pdfOverlay) return;
  pdfOverlay.querySelectorAll(".pdf-room-rect,.pdf-room-label").forEach((node) => node.remove());
  pdfRooms.forEach((room) => {
    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    rect.classList.add("pdf-room-rect");
    rect.classList.toggle("active", room.id === activeRoomId);
    drawRectAttributes(rect, room);
    rect.addEventListener("click", (event) => {
      event.stopPropagation();
      selectPdfRoom(room.id);
    });

    const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
    label.classList.add("pdf-room-label");
    label.setAttribute("x", `${(room.x + 0.012) * 100}%`);
    label.setAttribute("y", `${(room.y + 0.035) * 100}%`);
    label.textContent = room.name;
    pdfOverlay.append(rect, label);
  });
}

function selectPdfRoom(roomId) {
  const room = pdfRooms.find((item) => item.id === roomId);
  if (!room) return;
  setPdfMarking(false);
  renderPdfRoomMarks(room.id);
  pdfRoomTabs.querySelectorAll(".room-tab").forEach((button) => {
    button.classList.toggle("active", button.textContent === room.name);
  });
  setPdfRoomState(room.name, room);
  setPdfMetrics("PDF room marked", `${room.name} is now distinguished on the PDF. Area calculation comes next with scale calibration.`);
}

function nameNewPdfRoom() {
  pdfRoomCounter += 1;
  const proposed = `Room ${pdfRoomCounter}`;
  const name = window.prompt("Room name", proposed);
  return (name || proposed).trim() || proposed;
}

function createPdfOverlay(wrapper) {
  pdfOverlay = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  pdfOverlay.classList.add("pdf-room-overlay");
  pdfOverlay.setAttribute("viewBox", "0 0 100 100");
  pdfOverlay.setAttribute("preserveAspectRatio", "none");

  pdfOverlay.addEventListener("pointerdown", (event) => {
    if (!pdfMarking) return;
    pdfDragStart = pdfOverlayPoint(event);
    pdfDraftRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    pdfDraftRect.classList.add("pdf-room-draft");
    pdfOverlay.append(pdfDraftRect);
    pdfOverlay.setPointerCapture(event.pointerId);
  });

  pdfOverlay.addEventListener("pointermove", (event) => {
    if (!pdfMarking || !pdfDragStart || !pdfDraftRect) return;
    drawRectAttributes(pdfDraftRect, rectFromPoints(pdfDragStart, pdfOverlayPoint(event)));
  });

  pdfOverlay.addEventListener("pointerup", (event) => {
    if (!pdfMarking || !pdfDragStart) return;
    const rect = rectFromPoints(pdfDragStart, pdfOverlayPoint(event));
    pdfDraftRect?.remove();
    pdfDraftRect = null;
    pdfDragStart = null;
    if (rect.width < 0.015 || rect.height < 0.015) return;

    const room = {
      id: crypto.randomUUID ? crypto.randomUUID() : `room-${Date.now()}`,
      name: nameNewPdfRoom(),
      page: activePdfPage,
      ...rect
    };
    pdfRooms.push(room);
    renderPdfTabs(activePdfDocument?.numPages || 1, activePdfDocument ? showPdfFloor : () => {});
    selectPdfRoom(room.id);
  });

  wrapper.append(pdfOverlay);
}

function wrapPdfElement(element) {
  const wrapper = document.createElement("div");
  wrapper.className = "pdf-main-wrap";
  wrapper.append(element);
  createPdfOverlay(wrapper);
  return wrapper;
}

async function renderPdfPage(pageNumber, canvas, maxWidth) {
  const page = await activePdfDocument.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 1 });
  const scale = Math.min(maxWidth / viewport.width, 2.4);
  const scaledViewport = page.getViewport({ scale });
  const context = canvas.getContext("2d");

  canvas.width = Math.floor(scaledViewport.width);
  canvas.height = Math.floor(scaledViewport.height);
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);

  const renderTask = page.render({ canvasContext: context, viewport: scaledViewport });
  activePdfRender = renderTask;
  await renderTask.promise;
  if (activePdfRender === renderTask) activePdfRender = null;
}

async function showPdfFloor(pageNumber) {
  if (!activePdfDocument) return;

  activePdfPage = pageNumber;
  activatePdfTab(pageNumber);
  pdfPlanPreviewBody.replaceChildren();
  const previewCanvas = document.createElement("canvas");
  previewCanvas.className = "pdf-plan-canvas";
  const caption = document.createElement("p");
  caption.className = "pdf-plan-caption";
  caption.textContent = `Floor ${pageNumber} PDF plan`;
  pdfPlanPreviewBody.append(previewCanvas, caption);

  activePdfMainElement?.remove();
  const mainCanvas = document.createElement("canvas");
  mainCanvas.className = "pdf-main-canvas";
  activePdfMainElement = wrapPdfElement(mainCanvas);
  pdfRoomOutline.hidden = true;
  pdfRoomOutline.before(activePdfMainElement);
  setPdfRoomState(`Floor ${pageNumber}`);

  await Promise.all([
    renderPdfPage(pageNumber, previewCanvas, 520),
    renderPdfPage(pageNumber, mainCanvas, 980)
  ]);
  renderPdfRoomMarks();
}

function loadPdfEmbed(file) {
  clearPdfViewer();
  ensurePdfTools();
  activePdfPage = 1;
  activePdfObjectUrl = URL.createObjectURL(file);
  renderPdfTabs(1, () => {});

  pdfPlanPreviewBody.innerHTML = `
    <div class="plan-file-card">
      <strong>${file.name}</strong>
      <span>PDF opened in Arqis using the browser viewer.</span>
      <span>Click Mark room, then drag boxes around the rooms on the plan.</span>
    </div>
  `;

  const frame = document.createElement("iframe");
  frame.className = "pdf-main-frame";
  frame.src = activePdfObjectUrl;
  frame.title = `${file.name} preview`;
  activePdfMainElement = wrapPdfElement(frame);
  pdfRoomOutline.hidden = true;
  pdfRoomOutline.before(activePdfMainElement);

  setPdfRoomState("PDF plan");
  setPdfMetrics(
    "PDF plan loaded",
    "Click Mark room, then drag around each room on the PDF. Arqis will create room tabs so the building can be separated room by room."
  );
  pdfFileStatus.textContent = `${file.name} opened as a PDF plan`;
}

async function loadPdfPlan(file) {
  clearPdfViewer();
  ensurePdfTools();

  if (!window.pdfjsLib) {
    loadPdfEmbed(file);
    return;
  }

  pdfFileStatus.textContent = `Rendering ${file.name}...`;
  pdfPlanPreviewBody.innerHTML = `<div class="plan-file-card"><strong>${file.name}</strong><span>Reading PDF pages as floor plans.</span></div>`;

  const buffer = await file.arrayBuffer();
  activePdfDocument = await pdfjsLib.getDocument({ data: buffer }).promise;
  activePdfPage = 1;
  renderPdfTabs(activePdfDocument.numPages, showPdfFloor);

  setPdfMetrics(
    "PDF floor plan loaded",
    `Arqis rendered ${activePdfDocument.numPages} PDF page${activePdfDocument.numPages === 1 ? "" : "s"} as floor plan views. Click Mark room, then drag around each room to distinguish it.`
  );
  pdfFileStatus.textContent = `${file.name} rendered as ${activePdfDocument.numPages} floor page${activePdfDocument.numPages === 1 ? "" : "s"}`;
  await showPdfFloor(1);
}

pdfPlanFile?.addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  if (!isPdfFile(file)) {
    clearPdfViewer();
    return;
  }

  event.preventDefault();
  event.stopImmediatePropagation();
  loadPdfPlan(file).catch((error) => {
    clearPdfViewer();
    pdfFileStatus.textContent = `${file.name} could not be rendered`;
    pdfPlanPreviewBody.innerHTML = `<div class="plan-file-card"><strong>${file.name}</strong><span>The PDF was uploaded, but the preview did not complete.</span></div>`;
    setPdfMetrics("PDF preview failed", error.message || "This PDF could not be rendered yet.");
  });
}, true);

pdfClearPlanBtn?.addEventListener("click", clearPdfViewer);
