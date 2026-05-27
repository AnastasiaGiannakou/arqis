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

  if (typeof arqisEnsureSavedEditTools === "function") arqisEnsureSavedEditTools();

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
