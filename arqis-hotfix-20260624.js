(function () {
  const style = document.createElement("style");
  style.textContent = `
    body.arqis-workspace-v2 .saved-plan-wrap,
    body.arqis-workspace-v2 .pdf-main-wrap {
      width: min(760px, 100%) !important;
      max-width: min(760px, 100%) !important;
      max-height: min(46vh, 430px) !important;
    }

    body.arqis-workspace-v2 .saved-plan-stage {
      min-width: 0 !important;
    }

    body.arqis-workspace-v2 .room-outline-card {
      width: min(760px, 100%) !important;
      max-width: min(760px, 100%) !important;
    }

    body.arqis-workspace-v2 .room-outline {
      max-height: 300px !important;
    }
  `;
  document.head.append(style);

  function globalFunction(name) {
    try {
      if (name === "lassoDrawRooms" && typeof lassoDrawRooms === "function") return lassoDrawRooms;
      if (name === "arqisSetSavedFloorZoom" && typeof arqisSetSavedFloorZoom === "function") return arqisSetSavedFloorZoom;
    } catch {
      return null;
    }
    return typeof window[name] === "function" ? window[name] : null;
  }

  function state() {
    try {
      if (typeof lassoState !== "undefined") return lassoState;
    } catch {
      return null;
    }
    return window.arqisLassoState || window.lassoState || null;
  }

  function roomListNames() {
    return [...document.querySelectorAll("#arqisRoomList .arqis-room-pill-name")]
      .map((button) => button.textContent.trim())
      .filter(Boolean);
  }

  function pruneGenericStaleRooms() {
    const lasso = state();
    const names = roomListNames();
    if (!lasso?.rooms?.length || !names.length) return false;
    const visibleNames = new Set(names);
    const nextRooms = lasso.rooms.filter((room) => {
      const name = String(room.name || "").trim();
      return visibleNames.has(name) || !/^Room\s+\d+$/i.test(name);
    });
    if (nextRooms.length === lasso.rooms.length) return false;
    lasso.rooms = nextRooms;
    if (!lasso.rooms.some((room) => room.id === lasso.activeRoomId)) {
      lasso.activeRoomId = lasso.rooms[0]?.id || "";
    }
    window.lassoState = lasso;
    window.arqisLassoState = lasso;
    window.arqisMarkedRooms = lasso.rooms;
    return true;
  }

  function cleanDrawRooms() {
    document.querySelectorAll(".lasso-room-polygon,.lasso-room-label,.lasso-corner-handle").forEach((node) => node.remove());
    const draw = globalFunction("lassoDrawRooms");
    if (draw && draw !== cleanDrawRooms) draw();
  }

  function installCleanDrawPatch() {
    const draw = globalFunction("lassoDrawRooms");
    if (!draw || draw.__arqisCleanPatched) return;
    const patched = function () {
      document.querySelectorAll(".lasso-room-polygon,.lasso-room-label,.lasso-corner-handle").forEach((node) => node.remove());
      return draw.apply(this, arguments);
    };
    patched.__arqisCleanPatched = true;
    window.lassoDrawRooms = patched;
    try {
      lassoDrawRooms = patched;
    } catch {
      // The window-level patch is enough when the binding is not writable.
    }
  }

  function compactSavedFloor() {
    const setZoom = globalFunction("arqisSetSavedFloorZoom");
    if (setZoom && document.querySelector(".saved-plan-stage")) setZoom(0.55);
    const label = document.querySelector("#savedZoomLabel");
    if (label && label.textContent === "100%") label.textContent = "55%";
  }

  function refresh() {
    installCleanDrawPatch();
    const pruned = pruneGenericStaleRooms();
    if (pruned) cleanDrawRooms();
    compactSavedFloor();
  }

  document.addEventListener("click", () => window.setTimeout(refresh, 0), true);
  window.addEventListener("arqis:project-loaded", refresh);
  window.addEventListener("arqis:rooms-changed", refresh);
  window.addEventListener("load", refresh);
  new MutationObserver(() => window.requestAnimationFrame(refresh)).observe(document.body, {
    childList: true,
    subtree: true
  });
  refresh();
})();
