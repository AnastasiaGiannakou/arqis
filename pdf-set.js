const pdfSetInput = document.querySelector("#planFile");
const pdfSetRoomTabs = document.querySelector("#roomTabs");
const pdfSetFileStatus = document.querySelector("#fileStatus");

const pdfSetState = {
  files: [],
  activeIndex: 0,
  tabs: null,
  opening: false
};

function pdfSetIsPdf(file) {
  return file && (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"));
}

function pdfSetFileKey(file) {
  return `${file.name}:${file.size}:${file.lastModified || 0}`;
}

function pdfSetSortFiles(files) {
  return [...files].sort((left, right) => left.name.localeCompare(right.name));
}

function pdfSetMergeFiles(nextFiles) {
  const filesByKey = new Map(pdfSetState.files.map((file) => [pdfSetFileKey(file), file]));
  let firstAddedKey = "";

  nextFiles.forEach((file) => {
    const key = pdfSetFileKey(file);
    if (!filesByKey.has(key)) {
      if (!firstAddedKey) firstAddedKey = key;
      filesByKey.set(key, file);
    }
  });

  pdfSetState.files = pdfSetSortFiles([...filesByKey.values()]);

  if (firstAddedKey) {
    const nextIndex = pdfSetState.files.findIndex((file) => pdfSetFileKey(file) === firstAddedKey);
    if (nextIndex >= 0) pdfSetState.activeIndex = nextIndex;
  }

  return Boolean(firstAddedKey);
}

function pdfSetFloorLabel(file, index) {
  const name = file.name.toLowerCase();
  if (name.includes("a002")) return "Ground floor";
  if (name.includes("a003")) return "Floor 1";
  if (name.includes("a004")) return "Floor 2";
  if (name.includes("a005")) return "Floor 3";
  if (name.includes("a006")) return "Loft";
  return `Floor ${index + 1}`;
}

function pdfSetRemoveTabs() {
  pdfSetState.tabs?.remove();
  pdfSetState.tabs = null;
}

function pdfSetEnsureTabs() {
  if (!pdfSetRoomTabs || pdfSetState.files.length < 1) return;
  if (!pdfSetState.tabs) {
    pdfSetState.tabs = document.createElement("div");
    pdfSetState.tabs.className = "room-tabs pdf-set-floor-tabs";
    pdfSetState.tabs.setAttribute("role", "tablist");
    pdfSetState.tabs.setAttribute("aria-label", "Uploaded PDF floors");
    pdfSetRoomTabs.before(pdfSetState.tabs);
  }

  pdfSetState.tabs.replaceChildren();
  pdfSetState.files.forEach((file, index) => {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = `room-tab${index === pdfSetState.activeIndex ? " active" : ""}`;
    tab.textContent = pdfSetFloorLabel(file, index);
    tab.title = file.name;
    tab.addEventListener("click", () => pdfSetOpenFloor(index));
    pdfSetState.tabs.append(tab);
  });
}

async function pdfSetOpenFloor(index) {
  if (pdfSetState.opening || !pdfSetState.files[index] || typeof loadPdfPlan !== "function") return;
  pdfSetState.opening = true;
  pdfSetState.activeIndex = index;
  pdfSetEnsureTabs();

  try {
    await loadPdfPlan(pdfSetState.files[index]);
    pdfSetEnsureTabs();
    if (pdfSetFileStatus) {
      const countLabel = pdfSetState.files.length === 1 ? "1 PDF floor plan" : `${pdfSetState.files.length} PDF floor plans`;
      pdfSetFileStatus.textContent = `${pdfSetFloorLabel(pdfSetState.files[index], index)} loaded from ${countLabel}`;
    }
  } finally {
    pdfSetState.opening = false;
  }
}

function pdfSetHandleChange(event) {
  const files = [...(event.target?.files || [])];
  if (!files.length) return;

  const pdfFiles = files.filter(pdfSetIsPdf);
  if (!pdfFiles.length || pdfFiles.length !== files.length) return;

  event.preventDefault();
  event.stopImmediatePropagation();
  event.stopPropagation();

  const previousCount = pdfSetState.files.length;
  const added = pdfSetMergeFiles(pdfFiles);

  if (!added && pdfFiles[0]) {
    const selectedKey = pdfSetFileKey(pdfFiles[0]);
    const selectedIndex = pdfSetState.files.findIndex((file) => pdfSetFileKey(file) === selectedKey);
    if (selectedIndex >= 0) pdfSetState.activeIndex = selectedIndex;
  }

  pdfSetOpenFloor(pdfSetState.activeIndex).then(() => {
    if (pdfSetFileStatus && added) {
      const addedCount = pdfSetState.files.length - previousCount;
      const addedLabel = addedCount === 1 ? "1 PDF floor" : `${addedCount} PDF floors`;
      pdfSetFileStatus.textContent = `Added ${addedLabel}. ${pdfSetState.files.length} floors in this project.`;
    }
  }).catch((error) => {
    pdfSetRemoveTabs();
    if (pdfSetFileStatus) pdfSetFileStatus.textContent = "The PDF floor set could not be opened";
    if (typeof setPdfMetrics === "function") {
      setPdfMetrics("PDF floor set failed", error.message || "The PDF floor set could not be rendered yet.");
    }
  }).finally(() => {
    if (pdfSetInput) pdfSetInput.value = "";
  });
}

document.addEventListener("change", (event) => {
  if (event.target === pdfSetInput) pdfSetHandleChange(event);
}, true);

document.querySelector("#clearPlanBtn")?.addEventListener("click", () => {
  pdfSetState.files = [];
  pdfSetState.activeIndex = 0;
  pdfSetRemoveTabs();
}, true);

window.arqisPdfSet = pdfSetState;
