let arqisSavedFloorZoom = 1;

function arqisEditFixNormaliseRoom(room) {
  const points = arqisRoomPolygon(room).map((point) => ({
    x: Number(point.x),
    y: Number(point.y)
  })).filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
  const bounds = points.length && typeof lassoBounds === "function" ? lassoBounds(points) : { x: 0, y: 0, width: 0, height: 0 };
  return {
    ...room,
    id: room.id || (crypto.randomUUID ? crypto.randomUUID() : `saved-${Date.now()}-${Math.random()}`),
    name: room.name || "Room",
    points,
    ...bounds
  };
}

function arqisSetSavedFloorZoom(zoom) {
  arqisSavedFloorZoom = Math.max(0.75, Math.min(3, Number(zoom.toFixed(2))));
  const stage = document.querySelector(".saved-plan-stage");
  if (stage) stage.style.width = `${Math.round(arqisSavedFloorZoom * 100)}%`;
  const label = document.querySelector("#savedZoomLabel");
  if (label) label.textContent = `${Math.round(arqisSavedFloorZoom * 100)}%`;
  if (typeof lassoDrawDraft === "function") lassoDrawDraft();
  if (typeof lassoDrawRooms === "function") lassoDrawRooms();
}

function arqisEnsureSavedEditTools() {
  const existing = document.querySelector("#savedEditTools");
  if (existing) existing.remove();

  const tabs = document.querySelector("#roomTabs");
  if (!tabs) return;
  const tools = document.createElement("div");
  tools.className = "saved-edit-tools";
  tools.id = "savedEditTools";
  tools.innerHTML = `
    <button class="pdf-tool-btn" id="savedMarkRoomBtn" type="button">Mark room</button>
    <button class="pdf-tool-btn" id="savedCompleteOutlineBtn" type="button">Complete outline</button>
    <button class="pdf-tool-btn" id="savedUndoPointBtn" type="button">Undo point</button>
    <button class="pdf-tool-btn" id="savedZoomOutBtn" type="button">Zoom out</button>
    <span class="pdf-zoom-label" id="savedZoomLabel">100%</span>
    <button class="pdf-tool-btn" id="savedZoomInBtn" type="button">Zoom in</button>
    <button class="pdf-tool-btn" id="savedZoomFitBtn" type="button">Fit</button>
    <button class="pdf-tool-btn" id="savedClearRoomsBtn" type="button">Clear all rooms</button>
  `;
  tabs.before(tools);

  tools.querySelector("#savedMarkRoomBtn").addEventListener("click", () => {
    const overlay = document.querySelector(".saved-plan-overlay");
    const active = !overlay?.classList.contains("marking");
    overlay?.classList.toggle("marking", active);
    tools.querySelector("#savedMarkRoomBtn").classList.toggle("active", active);
    document.querySelector("#cadStatus").textContent = active ? "Room marking active" : "Saved floor plan loaded";
    document.querySelector("#cadMessage").textContent = active
      ? "Click around the room boundary, then choose Complete outline. Drag white handles to amend a selected room."
      : "Select a room to edit it, or use Mark room to add another room.";
  });

  tools.querySelector("#savedCompleteOutlineBtn").addEventListener("click", () => {
    if (typeof lassoFinishRoom === "function") lassoFinishRoom();
    document.querySelector(".saved-plan-overlay")?.classList.remove("marking");
    tools.querySelector("#savedMarkRoomBtn")?.classList.remove("active");
  });

  tools.querySelector("#savedUndoPointBtn").addEventListener("click", () => {
    if (typeof lassoState !== "undefined") {
      lassoState.points.pop();
      if (typeof lassoDrawDraft === "function") lassoDrawDraft();
    }
  });

  tools.querySelector("#savedZoomOutBtn").addEventListener("click", () => arqisSetSavedFloorZoom(arqisSavedFloorZoom - 0.25));
  tools.querySelector("#savedZoomInBtn").addEventListener("click", () => arqisSetSavedFloorZoom(arqisSavedFloorZoom + 0.25));
  tools.querySelector("#savedZoomFitBtn").addEventListener("click", () => arqisSetSavedFloorZoom(1));

  tools.querySelector("#savedClearRoomsBtn").addEventListener("click", () => {
    if (typeof lassoState === "undefined") return;
    if (lassoState.rooms.length && !window.confirm("Clear all rooms on this saved floor?")) return;
    lassoState.rooms = [];
    lassoState.activeRoomId = "";
    lassoState.points = [];
    if (typeof lassoSave === "function") lassoSave();
    if (typeof lassoDrawDraft === "function") lassoDrawDraft();
    if (typeof lassoDrawRooms === "function") lassoDrawRooms();
    if (typeof lassoRenderTabs === "function") lassoRenderTabs();
    document.querySelector("#cadShapeCount").textContent = "0";
    document.querySelector("#cadLargestArea").textContent = "--";
    document.querySelector("#cadTotalArea").textContent = "--";
    document.querySelector("#cadTotalFeet").textContent = "--";
  });

  arqisSetSavedFloorZoom(arqisSavedFloorZoom);
}

function arqisInstallRoomsIntoLasso(restoredRooms) {
  if (typeof lassoState === "undefined") return;
  lassoState.points = [];
  lassoState.rooms = restoredRooms;
  lassoState.activeRoomId = restoredRooms[0]?.id || "";
  lassoState.projectKey = typeof lassoKey === "function" ? lassoKey() : `arqis-saved-floor:${document.querySelector("#arqisProjectSelect")?.value || "project"}`;
  if (typeof lassoSave === "function") lassoSave();
  if (typeof lassoDrawDraft === "function") lassoDrawDraft();
  if (typeof lassoDrawRooms === "function") lassoDrawRooms();
  if (typeof lassoRenderTabs === "function") lassoRenderTabs();
  if (lassoState.activeRoomId && typeof lassoSelectRoom === "function") lassoSelectRoom(lassoState.activeRoomId);
}

function arqisActivateSavedFloorEditing(rooms) {
  if (typeof lassoState === "undefined") return;
  const restoredRooms = (rooms || [])
    .map(arqisEditFixNormaliseRoom)
    .filter((room) => room.points.length >= 3);

  arqisSavedFloorZoom = 1;
  arqisEnsureSavedEditTools();

  const overlay = document.querySelector(".saved-plan-overlay");
  if (overlay) {
    overlay.classList.add("pdf-room-overlay");
    lassoState.overlay = null;
    if (typeof lassoAttachOverlay === "function") lassoAttachOverlay();
  }

  arqisInstallRoomsIntoLasso(restoredRooms);
}

function arqisCollectRoomsForSave() {
  const lassoRooms = typeof lassoState !== "undefined" && Array.isArray(lassoState.rooms) ? lassoState.rooms : [];
  const pdfMarkedRooms = typeof pdfRooms !== "undefined" && Array.isArray(pdfRooms) ? pdfRooms : [];
  const cadRooms = typeof detectedRooms !== "undefined" && Array.isArray(detectedRooms) ? detectedRooms : [];
  const sourceRooms = lassoRooms.length ? lassoRooms : pdfMarkedRooms.length ? pdfMarkedRooms : cadRooms;

  return sourceRooms.map((room) => {
    const polygon = arqisRoomPolygon(room);
    const area = arqisRoomArea(room);
    return {
      name: room.name || "Room",
      room_type: room.room_type || null,
      area_m2: area,
      floor_area_m2: area,
      height_m: arqisSafeNumber("#height"),
      ceiling_height_m: arqisSafeNumber("#height"),
      length_m: arqisSafeNumber("#length"),
      width_m: arqisSafeNumber("#width"),
      wall_lengths: [],
      polygon,
      costing: {
        product: document.querySelector("#product")?.selectedOptions?.[0]?.textContent || null,
        waste_percent: arqisSafeNumber("#waste"),
        tile_mode: document.querySelector("input[name='tileMode']:checked")?.value || null,
        tile_height_m: arqisSafeNumber("#tileHeight"),
        include_floor_tiling: Boolean(document.querySelector("#tileFloor")?.checked),
        include_wall_tiling: Boolean(document.querySelector("#tileWalls")?.checked)
      },
      measured_dimensions: {
        source: lassoRooms.length ? "saved_floor_lasso" : pdfMarkedRooms.length ? "pdf_rectangle" : "cad_detected",
        page: room.page || null,
        raw: room
      }
    };
  });
}

window.arqisCollectRooms = arqisCollectRoomsForSave;
