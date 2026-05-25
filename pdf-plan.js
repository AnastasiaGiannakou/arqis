const pdfPlanFile = document.querySelector("#planFile");
const pdfPlanPreviewBody = document.querySelector("#planPreviewBody");
const pdfFileStatus = document.querySelector("#fileStatus");
const pdfRoomTabs = document.querySelector("#roomTabs");
const pdfRoomOutline = document.querySelector("#roomOutline");
const pdfRoomOutlineCard = document.querySelector(".room-outline-card");
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
let activePdfMainCanvas = null;

if (window.pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
}

const pdfStyle = document.createElement("style");
pdfStyle.textContent = `
  .pdf-plan-canvas,
  .pdf-main-canvas {
    display: block;
    width: 100%;
    height: auto;
    border: 1px solid var(--line, #d7ded8);
    border-radius: 6px;
    background: white;
  }

  .pdf-plan-canvas {
    max-height: 360px;
    object-fit: contain;
  }

  .pdf-main-canvas {
    max-height: min(620px, 62vh);
    object-fit: contain;
  }

  .pdf-plan-caption {
    color: var(--muted, #65736c);
    font-size: 12px;
    font-weight: 800;
    text-transform: uppercase;
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
  activePdfMainCanvas?.remove();
  activePdfMainCanvas = null;
  if (pdfRoomOutline) pdfRoomOutline.hidden = false;
}

function setPdfMetrics(status, message) {
  pdfCadStatus.textContent = status;
  pdfCadMessage.textContent = message;
  pdfCadShapeCount.textContent = "0";
  pdfCadLargestArea.textContent = "0.00 m²";
  pdfCadTotalArea.textContent = "0.00 m²";
  pdfCadTotalFeet.textContent = "0.00 ft²";
}

function setPdfRoomState(pageNumber) {
  pdfSelectedRoomName.textContent = `Floor ${pageNumber}`;
  pdfSelectedRoomArea.textContent = "--";
  pdfSelectedRoomFeet.textContent = "--";
  pdfRoomTitle.textContent = `Floor ${pageNumber}`;
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

  pdfRoomTabs.querySelectorAll(".room-tab").forEach((button, index) => {
    button.classList.toggle("active", index + 1 === pageNumber);
  });

  pdfPlanPreviewBody.replaceChildren();
  const previewCanvas = document.createElement("canvas");
  previewCanvas.className = "pdf-plan-canvas";
  const caption = document.createElement("p");
  caption.className = "pdf-plan-caption";
  caption.textContent = `Floor ${pageNumber} PDF plan`;
  pdfPlanPreviewBody.append(previewCanvas, caption);

  activePdfMainCanvas?.remove();
  activePdfMainCanvas = document.createElement("canvas");
  activePdfMainCanvas.className = "pdf-main-canvas";
  pdfRoomOutline.hidden = true;
  pdfRoomOutline.before(activePdfMainCanvas);
  setPdfRoomState(pageNumber);

  await Promise.all([
    renderPdfPage(pageNumber, previewCanvas, 520),
    renderPdfPage(pageNumber, activePdfMainCanvas, 980)
  ]);
}

async function loadPdfPlan(file) {
  if (!window.pdfjsLib) {
    throw new Error("PDF rendering is still loading. Please try again in a moment.");
  }

  clearPdfViewer();
  pdfFileStatus.textContent = `Rendering ${file.name}...`;
  pdfPlanPreviewBody.innerHTML = `<div class="plan-file-card"><strong>${file.name}</strong><span>Reading PDF pages as floor plans.</span></div>`;

  const buffer = await file.arrayBuffer();
  activePdfDocument = await pdfjsLib.getDocument({ data: buffer }).promise;

  pdfRoomTabs.replaceChildren();
  for (let pageNumber = 1; pageNumber <= activePdfDocument.numPages; pageNumber += 1) {
    const tab = document.createElement("button");
    tab.className = `room-tab${pageNumber === 1 ? " active" : ""}`;
    tab.type = "button";
    tab.textContent = `Floor ${pageNumber}`;
    tab.addEventListener("click", () => showPdfFloor(pageNumber));
    pdfRoomTabs.append(tab);
  }

  setPdfMetrics(
    "PDF floor plan loaded",
    `Arqis rendered ${activePdfDocument.numPages} PDF page${activePdfDocument.numPages === 1 ? "" : "s"} as floor plan views. The next step is tracing rooms on top of the plan and calibrating scale for measurements.`
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
