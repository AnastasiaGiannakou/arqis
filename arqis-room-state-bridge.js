function arqisRoomBridgeState() {
  return window.arqisLassoState
    || window.lassoState
    || (typeof lassoState !== "undefined" ? lassoState : null);
}

function arqisRoomBridgePublish() {
  const state = arqisRoomBridgeState();
  if (!state) return null;
  window.lassoState = state;
  window.arqisLassoState = state;
  window.arqisMarkedRooms = Array.isArray(state.rooms) ? state.rooms : [];
  return state;
}

function arqisRoomBridgeNumber(selector, fallback = null) {
  const value = Number(document.querySelector(selector)?.value);
  return Number.isFinite(value) ? value : fallback;
}

function arqisRoomBridgeArea(room) {
  if (typeof lassoRoomArea === "function" && Array.isArray(room.points)) return lassoRoomArea(room);
  if (Number.isFinite(Number(room.area_m2))) return Number(room.area_m2);
  if (Number.isFinite(Number(room.areaM2))) return Number(room.areaM2);
  if (Number.isFinite(Number(room.floor_area_m2))) return Number(room.floor_area_m2);
  const length = arqisRoomBridgeNumber("#length", 0);
  const width = arqisRoomBridgeNumber("#width", 0);
  return length && width ? length * width : null;
}

function arqisRoomBridgePolygon(room) {
  if (typeof arqisRoomPolygon === "function") return arqisRoomPolygon(room);
  if (Array.isArray(room.points)) return room.points;
  if (Array.isArray(room.polygon)) return room.polygon;
  return [];
}

function arqisRoomBridgeCollectRooms() {
  const state = arqisRoomBridgePublish();
  const lassoRooms = state && Array.isArray(state.rooms) ? state.rooms : [];
  const pdfMarkedRooms = typeof pdfRooms !== "undefined" && Array.isArray(pdfRooms) ? pdfRooms : [];
  const cadRooms = typeof detectedRooms !== "undefined" && Array.isArray(detectedRooms) ? detectedRooms : [];
  const sourceRooms = lassoRooms.length ? lassoRooms : pdfMarkedRooms.length ? pdfMarkedRooms : cadRooms;

  return sourceRooms.map((room) => {
    const polygon = arqisRoomBridgePolygon(room);
    const area = arqisRoomBridgeArea(room);
    const height = Number.isFinite(Number(room.height_m || room.ceiling_height_m))
      ? Number(room.height_m || room.ceiling_height_m)
      : arqisRoomBridgeNumber("#height");
    const length = Number.isFinite(Number(room.length_m)) ? Number(room.length_m) : arqisRoomBridgeNumber("#length");
    const width = Number.isFinite(Number(room.width_m)) ? Number(room.width_m) : arqisRoomBridgeNumber("#width");
    const wallLengths = typeof lassoRoomPerimeter === "function" && Array.isArray(room.points)
      ? [Number(lassoRoomPerimeter(room).toFixed(3))]
      : Array.isArray(room.wall_lengths) ? room.wall_lengths : [];

    return {
      name: room.name || "Room",
      room_type: room.room_type || null,
      area_m2: area,
      floor_area_m2: area,
      height_m: height,
      ceiling_height_m: height,
      length_m: length,
      width_m: width,
      wall_lengths: wallLengths,
      polygon,
      costing: {
        product: document.querySelector("#product")?.selectedOptions?.[0]?.textContent || null,
        waste_percent: arqisRoomBridgeNumber("#waste"),
        tile_mode: document.querySelector("input[name='tileMode']:checked")?.value || null,
        tile_height_m: arqisRoomBridgeNumber("#tileHeight"),
        include_floor_tiling: Boolean(document.querySelector("#tileFloor")?.checked),
        include_wall_tiling: Boolean(document.querySelector("#tileWalls")?.checked)
      },
      measured_dimensions: {
        source: lassoRooms.length ? "pdf_lasso" : pdfMarkedRooms.length ? "pdf_rectangle" : "cad_detected",
        page: room.page || null,
        raw: room
      }
    };
  });
}

function arqisRoomBridgeInstallCollector() {
  window.arqisCollectRooms = arqisRoomBridgeCollectRooms;
  try {
    arqisCollectRooms = arqisRoomBridgeCollectRooms;
  } catch {
    // Keep the window function available when a browser keeps the global binding fixed.
  }
}

function arqisRoomBridgeSyncTabs() {
  const state = arqisRoomBridgePublish();
  if (!state?.rooms?.length) return;
  const tabs = document.querySelector("#roomTabs");
  if (!tabs) return;
  const tabCount = tabs.querySelectorAll(".lasso-room-tab").length;
  if (tabCount !== state.rooms.length && typeof lassoRenderTabs === "function") {
    lassoRenderTabs();
  }
}

function arqisRoomBridgeRefreshActiveRoom() {
  const state = arqisRoomBridgePublish();
  if (!state?.activeRoomId) return;
  const room = state.rooms?.find((item) => item.id === state.activeRoomId);
  if (!room) return;
  room.height_m = arqisRoomBridgeNumber("#height", room.height_m || 2.4);
  room.ceiling_height_m = room.height_m;
  room.length_m = arqisRoomBridgeNumber("#length", room.length_m || 3.2);
  room.width_m = arqisRoomBridgeNumber("#width", room.width_m || 2.4);
  if (typeof lassoRefreshSelectedRoomEstimate === "function") lassoRefreshSelectedRoomEstimate();
  arqisRoomBridgePublish();
}

arqisRoomBridgeInstallCollector();

["#height", "#length", "#width", "#tileHeight", "#waste", "#doors", "#doorArea", "#windows", "#windowArea", "#labour", "#extras", "#product", "#tileFloor", "#tileWalls", "input[name='tileMode']"].forEach((selector) => {
  document.querySelectorAll(selector).forEach((element) => {
    element.addEventListener("input", arqisRoomBridgeRefreshActiveRoom);
    element.addEventListener("change", arqisRoomBridgeRefreshActiveRoom);
  });
});

document.addEventListener("click", () => {
  arqisRoomBridgePublish();
  window.setTimeout(arqisRoomBridgeSyncTabs, 0);
}, true);

new MutationObserver(() => {
  window.requestAnimationFrame(arqisRoomBridgeSyncTabs);
}).observe(document.body, { childList: true, subtree: true });

window.addEventListener("load", () => {
  arqisRoomBridgeInstallCollector();
  arqisRoomBridgePublish();
  arqisRoomBridgeSyncTabs();
});
