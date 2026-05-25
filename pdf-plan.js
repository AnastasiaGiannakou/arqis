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
let activePdfSurface = null;
let activePdfObjectUrl = "";
let activePdfPage = 1;
let pdfRooms = [];
let pdfRoomCounter = 0;
let pdfMarking = false;
let pdfDragStart = null;
let pdfDraftRect = null;
let pdfOverlay = null;
let pdfTools = null;
let pdfZoom = 1;
let activePdfProjectKey = "";

function getPdfProjectKey(file) {
  return `arqis-pdf-project:${file.name}:${file.size}`;
}

function savePdfProject(silent = false) {
  if (!activePdfProjectKey) return;
  const payload = {
    rooms: pdfRooms,
    roomCounter: pdfRoomCounter,
    activePage: activePdfPage,
    zoom: pdfZoom,
    savedAt: new Date().toISOString()
  };
  localStorage.setItem(activePdfProjectKey, JSON.stringify(payload));
  if (!silent) {
    setPdfMetrics(
      "PDF floor saved",
      "This floor and its marked rooms are saved in this browser. Re-upload the same PDF later and Arqis will restore them."
    );
  }
}

function restorePdfProject(file) {
  activePdfProjectKey = getPdfProjectKey(file);
  const saved = localStorage.getItem(activePdfProjectKey);
  if (!saved) return false;
  try {
    const payload = JSON.parse(saved);
    pdfRooms = Array.isArray(payload.rooms) ? payload.rooms : [];
    pdfRoomCounter = Number(payload.roomCounter) || pdfRooms.length;
    activePdfPage = Number(payload.activePage) || 1;
    pdfZoom = Number(payload.zoom) || 1;
    return pdfRooms.length > 0;
  } catch {
    return false;
  }
}

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
    max-height: min(760px, 72vh);
    overflow: auto;
    border: 1px solid var(--line, #d7ded8);
    border-radius: 6px;
    background: #eef2ed;
  }

  .pdf-zoom-surface {
    position: relative;
    width: 100%;
    min-width: 100%;
    margin: 0 auto;
  }

  .pdf-main-canvas {
    height: auto;
    max-height: none;
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
    fill: rgba(29, 107, 79, 0.10);
    stroke: #164c3a;
    stroke-width: 2px;
    vector-effect: non-scaling-stroke;
    pointer-events: auto;
  }

  .pdf-room-rect.active {
    fill: rgba(184, 95, 56, 0.16);
    stroke: #b85f38;
    stroke-width: 2.5px;
    vector-effect: non-scaling-stroke;
  }

  .pdf-room-draft {
    fill: rgba(29, 107, 79, 0.10);
    stroke: #1d6b4f;
    stroke-width: 2px;
    stroke-dasharray: 7 5;
    vector-effect: non-scaling-stroke;
  }

  .pdf-room-label {
    fill: #164c3a;
    font-size: 12px;
    font-weight: 850;
    paint-order: stroke;
    stroke: white;
    stroke-width: 3px;
    pointer-events: none;
  }

  .pdf-selected-room-outline {
    fill: rgba(29, 107, 79, 0.12);
    stroke: #164c3a;
    stroke-width: 5px;
  }

  .pdf-selected-room-label,
  .room-outline-empty {
    fill: #5f6f67;
    font-size: 16px;
    font-weight: 850;
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

  .pdf-tool-btn,
  .pdf-zoom-label {
    min-height: 34px;
    padding: 0 12px;
    border: 1px solid var(--line, #d7ded8);
    border-radius: 6px;
    background: white;
    color: var(--ink, #18201d);
    font-weight: 800;
  }

  .pdf-zoom-label {
    display: inline-grid;
    place-items: center;
    min-width: 70px;
    color: var(--muted, #65736c);
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
  activePdfSurface = null;
  pdfOverlay = null;
  pdfDraftRect = null;
  pdfDragStart = null;
  pdfMarking = false;
  pdfRooms = [];
  pdfRoomCounter = 0;
  pdfZoom = 1;
  activePdfProjectKey = "";
  pdfTools?.remove();
  pdfTools = null;
  if (activePdfObjectUrl) {
    URL.revokeObjectURL(activePdfObjectUrl);
    activePdfObjectUrl = "";
  }
  if (pdfRoomOutline) pdfRoomOutline.hidden = false;
}

function setPdfMetrics(status, message) {
  const pageRooms = pdfRooms.filter((room) => room.page === activePdfPage);
  pdfCadStatus.textContent = status;
  pdfCadMessage.textContent = message;
  pdfCadShapeCount.textContent = `${pageRooms.length}`;
  pdfCadLargestArea.textContent = "--";
  pdfCadTotalArea.textContent = "--";
  pdfCadTotalFeet.textContent = "--";
}

function renderPdfSelectedRoomOutline(room = null) {
  if (!pdfRoomOutline) return;
  pdfRoomOutline.hidden = false;
  pdfRoomOutline.replaceChildren();

  if (!room) {
    const message = document.createElementNS("http://www.w3.org/2000/svg", "text");
    message.setAttribute("x", "210");
    message.setAttribute("y", "144");
    message.setAttribute("text-anchor", "middle");
    message.setAttribute("class", "room-outline-empty");
    message.textContent = "Select a marked room";
    pdfRoomOutline.append(message);
    return;
  }

  const padding = 38;
  const width = 420;
  const height = 280;
  const availableWidth = width - padding * 2;
  const availableHeight = height - padding * 2;
  const aspect = Math.max(room.width / Math.max(room.height, 0.001), 0.08);
  let rectWidth = availableWidth;
  let rectHeight = rectWidth / aspect;
  if (rectHeight > availableHeight) {
    rectHeight = availableHeight;
    rectWidth = rectHeight * aspect;
  }
  const x = (width - rectWidth) / 2;
  const y = (height - rectHeight) / 2;

  const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  rect.setAttribute("x", x.toFixed(1));
  rect.setAttribute("y", y.toFixed(1));
  rect.setAttribute("width", rectWidth.toFixed(1));
  rect.setAttribute("height", rectHeight.toFixed(1));
  rect.setAttribute("rx", "4");
  rect.setAttribute("class", "pdf-selected-room-outline");

  const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
  label.setAttribute("x", "210");
  label.setAttribute("y", Math.max(24, y - 10).toFixed(1));
  label.setAttribute("text-anchor", "middle");
  label.setAttribute("class", "pdf-selected-room-label");
  label.textContent = room.name;

  pdfRoomOutline.append(rect, label);
}

function setPdfRoomState(label, room = null) {
  pdfSelectedRoomName.textContent = label;
  pdfSelectedRoomArea.textContent = room ? "Marked" : "--";
  pdfSelectedRoomFeet.textContent = room ? "Trace" : "--";
  pdfRoomTitle.textContent = label;
  renderPdfSelectedRoomOutline(room);
}

function updatePdfZoomLabel() {
  const label = pdfTools?.querySelector("#pdfZoomLabel");
  if (label) label.textContent = `${Math.round(pdfZoom * 100)}%`;
}

function applyPdfZoom() {
  if (activePdfSurface) activePdfSurface.style.width = `${Math.round(pdfZoom * 100)}%`;
  updatePdfZoomLabel();
}

function changePdfZoom(delta) {
  pdfZoom = Math.max(0.7, Math.min(3, Number((pdfZoom + delta).toFixed(2))));
  applyPdfZoom();
  savePdfProject(true);
}

function resetPdfZoom() {
  pdfZoom = 1;
  applyPdfZoom();
  savePdfProject(true);
}

function ensurePdfTools() {
  if (pdfTools) return;
  pdfTools = document.createElement("div");
  pdfTools.className = "pdf-tools";
  pdfTools.innerHTML = `
    <button class="pdf-tool-btn" id="pdfMarkRoomBtn" type="button">Mark room</button>
    <button class="pdf-tool-btn" id="pdfZoomOutBtn" type="button">Zoom out</button>
    <span class="pdf-zoom-label" id="pdfZoomLabel">100%</span>
    <button class="pdf-tool-btn" id="pdfZoomInBtn" type="button">Zoom in</button>
    <button class="pdf-tool-btn" id="pdfZoomResetBtn" type="button">Fit</button>
    <button class="pdf-tool-btn" id="pdfSaveProjectBtn" type="button">Save floor</button>
    <button class="pdf-tool-btn" id="pdfClearRoomsBtn" type="button">Clear all rooms</button>
  `;
  pdfRoomTabs.before(pdfTools);
  pdfTools.querySelector("#pdfMarkRoomBtn").addEventListener("click", () => setPdfMarking(!pdfMarking));
  pdfTools.querySelector("#pdfZoomOutBtn").addEventListener("click", () => changePdfZoom(-0.25));
  pdfTools.querySelector("#pdfZoomInBtn").addEventListener("click", () => changePdfZoom(0.25));
  pdfTools.querySelector("#pdfZoomResetBtn").addEventListener("click", resetPdfZoom);
  pdfTools.querySelector("#pdfSaveProjectBtn").addEventListener("click", () => savePdfProject());
  pdfTools.querySelector("#pdfClearRoomsBtn").addEventListener("click", () => {
    if (pdfRooms.length && !window.confirm("Clear all marked rooms?")) return;
    pdfRooms = [];
    pdfRoomCounter = 0;
    savePdfProject(true);
    renderPdfTabs(activePdfDocument?.numPages || 1, activePdfDocument ? showPdfFloor : () => {});
    renderPdfRoomMarks();
    setPdfRoomState(activePdfDocument ? `Floor ${activePdfPage}` : "PDF plan");
    setPdfMetrics("PDF rooms cleared", "All marked rooms were cleared for this floor. The PDF plan is still loaded.");
  });
}

function setPdfMarking(enabled) {
  pdfMarking = enabled;
  pdfOverlay?.classList.toggle("marking", enabled);
  pdfTools?.querySelector("#pdfMarkRoomBtn")?.classList.toggle("active", enabled);
  if (enabled) {
    setPdfMetrics("Room marking active", "Drag around a room on the PDF plan. Right-click a marked room or its tab to clear just that one room.");
  }
}

function pageLabel(pageNumber, pageCount) {
  return pageCount === 1 ? "PDF plan" : `Floor ${pageNumber}`;
}

function renderPdfTabs(pageCount, onClick) {
  pdfRoomTabs.replaceChildren();
  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    const tab = document.createElement("button");
    tab.className = `room-tab${pageNumber === activePdfPage ? " active" : ""}`;
    tab.type = "button";
    tab.textContent = pageLabel(pageNumber, pageCount);
    tab.addEventListener("click", () => onClick(pageNumber));
    pdfRoomTabs.append(tab);
  }

  pdfRooms.filter((room) => room.page === activePdfPage).forEach((room) => {
    const tab = document.createElement("button");
    tab.className = "room-tab";
    tab.type = "button";
    tab.textContent = room.name;
    tab.title = "Right-click to clear this room";
    tab.addEventListener("click", () => selectPdfRoom(room.id));
    tab.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      deletePdfRoom(room.id);
    });
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
  pdfRooms.filter((room) => room.page === activePdfPage).forEach((room) => {
    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    rect.classList.add("pdf-room-rect");
    rect.classList.toggle("active", room.id === activeRoomId);
    drawRectAttributes(rect, room);
    rect.addEventListener("click", (event) => {
      event.stopPropagation();
      selectPdfRoom(room.id);
    });
    rect.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      deletePdfRoom(room.id);
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
  if (room.page !== activePdfPage) activePdfPage = room.page;
  setPdfMarking(false);
  renderPdfTabs(activePdfDocument?.numPages || 1, activePdfDocument ? showPdfFloor : () => {});
  renderPdfRoomMarks(room.id);
  pdfRoomTabs.querySelectorAll(".room-tab").forEach((button) => {
    button.classList.toggle("active", button.textContent === room.name);
  });
  setPdfRoomState(room.name, room);
  setPdfMetrics("PDF room marked", `${room.name} is now distinguished on the PDF. Right-click it if you need to clear just this room.`);
}

function deletePdfRoom(roomId) {
  const room = pdfRooms.find((item) => item.id === roomId);
  if (!room) return;
  if (!window.confirm(`Clear ${room.name}?`)) return;
  pdfRooms = pdfRooms.filter((item) => item.id !== roomId);
  savePdfProject(true);
  renderPdfTabs(activePdfDocument?.numPages || 1, activePdfDocument ? showPdfFloor : () => {});
  renderPdfRoomMarks();
  setPdfRoomState(activePdfDocument ? `Floor ${activePdfPage}` : "PDF plan");
  setPdfMetrics("PDF room cleared", `${room.name} was removed. The other marked rooms were kept.`);
}

function nameNewPdfRoom() {
  pdfRoomCounter += 1;
  const proposed = `Room ${pdfRoomCounter}`;
  const name = window.prompt("Room name", proposed);
  return (name || proposed).trim() || proposed;
}

function createPdfOverlay(surface) {
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
    savePdfProject(true);
    renderPdfTabs(activePdfDocument?.numPages || 1, activePdfDocument ? showPdfFloor : () => {});
    selectPdfRoom(room.id);
  });

  surface.append(pdfOverlay);
}

function wrapPdfElement(element) {
  const wrapper = document.createElement("div");
  wrapper.className = "pdf-main-wrap";
  activePdfSurface = document.createElement("div");
  activePdfSurface.className = "pdf-zoom-surface";
  activePdfSurface.append(element);
  wrapper.append(activePdfSurface);
  createPdfOverlay(activePdfSurface);
  applyPdfZoom();
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
  renderPdfTabs(activePdfDocument.numPages, showPdfFloor);
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
  pdfRoomOutline.hidden = false;
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
  const restored = restorePdfProject(file);
  renderPdfTabs(1, () => {});

  pdfPlanPreviewBody.innerHTML = `
    <div class="plan-file-card">
      <strong>${file.name}</strong>
      <span>PDF opened in Arqis using the browser viewer.</span>
      <span>Zoom in, click Mark room, then drag boxes around the rooms on the plan.</span>
    </div>
  `;

  const frame = document.createElement("iframe");
  frame.className = "pdf-main-frame";
  frame.src = activePdfObjectUrl;
  frame.title = `${file.name} preview`;
  activePdfMainElement = wrapPdfElement(frame);
  pdfRoomOutline.hidden = false;
  pdfRoomOutline.before(activePdfMainElement);

  renderPdfRoomMarks();
  if (restored) {
    const firstRoom = pdfRooms[0];
    if (firstRoom) selectPdfRoom(firstRoom.id);
    setPdfMetrics("PDF project restored", `${pdfRooms.length} marked room${pdfRooms.length === 1 ? "" : "s"} restored from this browser.`);
  } else {
    setPdfRoomState("PDF plan");
    setPdfMetrics(
      "PDF plan loaded",
      "Use Zoom in to work close-up. Click Mark room and drag around each room. Right-click a room mark or tab to clear just that room."
    );
  }
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
  const restored = restorePdfProject(file);
  if (!restored) activePdfPage = 1;
  renderPdfTabs(activePdfDocument.numPages, showPdfFloor);

  setPdfMetrics(
    "PDF floor plan loaded",
    `Arqis rendered ${activePdfDocument.numPages} PDF page${activePdfDocument.numPages === 1 ? "" : "s"} as floor plan views. Zoom in, click Mark room, then drag around each room to distinguish it.`
  );
  pdfFileStatus.textContent = `${file.name} rendered as ${activePdfDocument.numPages} floor page${activePdfDocument.numPages === 1 ? "" : "s"}`;
  await showPdfFloor(activePdfPage);
  if (restored && pdfRooms.length) {
    const room = pdfRooms.find((item) => item.page === activePdfPage) || pdfRooms[0];
    selectPdfRoom(room.id);
    setPdfMetrics("PDF project restored", `${pdfRooms.length} marked room${pdfRooms.length === 1 ? "" : "s"} restored from this browser.`);
  }
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
