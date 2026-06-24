(function () {
  const FLOOR_LABEL_RE = /^(pdf plan|ground floor|loft|floor\s+\d+|page\s+\d+)$/i;
  const ROOM_LIST_ID = "arqisRoomListPanel";
  let refreshQueued = false;
  let lastRoomSignature = "";
  let lastPdfSurface = null;

  const style = document.createElement("style");
  style.textContent = `
    body.arqis-workspace-v2 .topbar,
    body.arqis-workspace-v2 .preview-grid,
    body.arqis-workspace-v2 .cad-analysis,
    body.arqis-workspace-v2 .results,
    body.arqis-workspace-v2 .quote {
      max-width: 1120px;
      margin-left: 0;
      margin-right: auto;
    }

    body.entered.arqis-workspace-v2 .app {
      grid-template-columns: minmax(260px, 320px) minmax(0, 1fr);
    }

    body.arqis-workspace-v2 .controls {
      gap: 10px;
      padding: 14px;
    }

    body.arqis-workspace-v2 .brand {
      gap: 10px;
      margin-bottom: 2px;
    }

    body.arqis-workspace-v2 .brand span {
      width: 34px;
      height: 34px;
      border-radius: 7px;
      font-size: 14px;
    }

    body.arqis-workspace-v2 .brand h1 {
      font-size: 20px;
    }

    body.arqis-workspace-v2 .brand p {
      font-size: 13px;
      line-height: 1.2;
    }

    body.arqis-workspace-v2 .panel {
      gap: 8px;
      padding-bottom: 10px;
    }

    body.arqis-workspace-v2 .panel h2 {
      font-size: 13px;
    }

    body.arqis-workspace-v2 label {
      gap: 4px;
      font-size: 12px;
    }

    body.arqis-workspace-v2 input,
    body.arqis-workspace-v2 select {
      min-height: 34px;
      padding: 6px 8px;
      border-radius: 5px;
      font-size: 12px;
    }

    body.arqis-workspace-v2 .upload-box {
      min-height: 76px;
      padding: 10px;
    }

    body.arqis-workspace-v2 .upload-box small,
    body.arqis-workspace-v2 .status {
      font-size: 11px;
      line-height: 1.35;
    }

    body.arqis-workspace-v2 .secondary,
    body.arqis-workspace-v2 #printBtn,
    body.arqis-workspace-v2 #clearPlanBtn {
      min-height: 32px;
      font-size: 12px;
    }

    body.arqis-workspace-v2 .stage {
      gap: 10px;
      padding: 18px;
    }

    body.arqis-workspace-v2 .topbar h2 {
      font-size: 24px;
      line-height: 1.1;
    }

    body.arqis-workspace-v2 .eyebrow {
      margin-bottom: 2px;
      font-size: 10px;
    }

    body.arqis-workspace-v2 .preview-grid {
      grid-template-columns: minmax(0, 1fr);
    }

    body.arqis-workspace-v2 .preview-grid > .plan-preview {
      display: none;
    }

    body.arqis-workspace-v2 .room-browser {
      gap: 8px;
    }

    body.arqis-workspace-v2 .room-outline-card {
      padding: 8px;
    }

    body.arqis-workspace-v2 .pdf-main-wrap {
      max-width: min(900px, 100%);
      max-height: min(48vh, 520px);
    }

    body.arqis-workspace-v2 .pdf-main-frame {
      min-height: min(440px, 46vh);
    }

    body.arqis-workspace-v2 .pdf-tools,
    body.arqis-workspace-v2 #roomTabs,
    body.arqis-workspace-v2 .pdf-set-floor-tabs {
      gap: 5px;
    }

    body.arqis-workspace-v2 .pdf-tool-btn,
    body.arqis-workspace-v2 .pdf-zoom-label,
    body.arqis-workspace-v2 .room-tab {
      min-height: 30px;
      padding: 0 9px;
      border-radius: 5px;
      font-size: 12px;
    }

    body.arqis-workspace-v2 .pdf-zoom-label {
      min-width: 52px;
    }

    body.arqis-workspace-v2 .pdf-room-label,
    body.arqis-workspace-v2 .lasso-room-label {
      font-size: 1.1px;
    }

    body.arqis-workspace-v2 .room-size-strip article,
    body.arqis-workspace-v2 .metrics article,
    body.arqis-workspace-v2 .results article {
      padding: 10px;
    }

    body.arqis-workspace-v2 .room-size-strip strong,
    body.arqis-workspace-v2 .metrics strong {
      font-size: 15px;
    }

    body.arqis-workspace-v2 .results strong {
      font-size: 18px;
    }

    body.arqis-workspace-v2 #roomTabs .arqis-hidden-room-tab {
      display: none;
    }

    .arqis-room-list-panel {
      display: grid;
      gap: 6px;
      padding: 8px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.72);
    }

    .arqis-room-list-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      color: var(--muted);
      font-size: 10px;
      font-weight: 850;
      text-transform: uppercase;
    }

    .arqis-room-list {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      min-height: 30px;
    }

    .arqis-room-pill {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      min-height: 30px;
      padding: 0 5px 0 8px;
      border: 1px solid var(--line);
      border-radius: 6px;
      background: var(--paper);
      color: var(--ink);
      font-size: 12px;
      font-weight: 850;
    }

    .arqis-room-pill.active {
      border-color: var(--green-dark);
      background: var(--green-dark);
      color: white;
    }

    .arqis-room-pill-name {
      max-width: min(220px, 42vw);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .arqis-room-pill button {
      min-width: 24px;
      min-height: 24px;
      border: 1px solid rgba(24, 32, 29, 0.18);
      border-radius: 5px;
      background: rgba(255, 255, 255, 0.9);
      color: var(--ink);
      font-size: 11px;
      font-weight: 850;
      line-height: 1;
    }

    .arqis-room-pill.active button {
      border-color: rgba(255, 255, 255, 0.38);
    }

    .arqis-room-empty {
      display: grid;
      place-items: center;
      min-height: 38px;
      color: var(--muted);
      font-size: 13px;
      font-weight: 700;
    }
  `;
  document.head.append(style);

  function globalValue(name, fallback) {
    try {
      if (name === "lassoState" && typeof lassoState !== "undefined") return lassoState;
      if (name === "pdfRooms" && typeof pdfRooms !== "undefined") return pdfRooms;
      if (name === "activePdfPage" && typeof activePdfPage !== "undefined") return activePdfPage;
    } catch {
      return fallback;
    }
    return fallback;
  }

  function globalFunction(name) {
    try {
      if (name === "lassoSelectRoom" && typeof lassoSelectRoom === "function") return lassoSelectRoom;
      if (name === "lassoDeleteRoom" && typeof lassoDeleteRoom === "function") return lassoDeleteRoom;
      if (name === "lassoSave" && typeof lassoSave === "function") return lassoSave;
      if (name === "lassoRenderTabs" && typeof lassoRenderTabs === "function") return lassoRenderTabs;
      if (name === "lassoDrawRooms" && typeof lassoDrawRooms === "function") return lassoDrawRooms;
      if (name === "selectPdfRoom" && typeof selectPdfRoom === "function") return selectPdfRoom;
      if (name === "deletePdfRoom" && typeof deletePdfRoom === "function") return deletePdfRoom;
      if (name === "applyPdfZoom" && typeof applyPdfZoom === "function") return applyPdfZoom;
    } catch {
      return null;
    }
    return typeof window[name] === "function" ? window[name] : null;
  }

  function setGlobalValue(name, value) {
    try {
      if (name === "pdfZoom" && typeof pdfZoom !== "undefined") {
        pdfZoom = value;
        return true;
      }
    } catch {
      return false;
    }
    return false;
  }

  function activePage() {
    const page = Number(globalValue("activePdfPage", 1));
    return Number.isFinite(page) && page > 0 ? page : 1;
  }

  function currentLassoRooms() {
    const state = window.arqisLassoState || window.lassoState || globalValue("lassoState", null);
    const rooms = Array.isArray(state?.rooms) ? state.rooms : [];
    return rooms.map((room) => ({
      id: room.id,
      name: room.name || "Room",
      source: "lasso",
      active: state.activeRoomId === room.id,
      raw: room
    }));
  }

  function currentPdfRooms() {
    const rooms = globalValue("pdfRooms", []);
    if (!Array.isArray(rooms)) return [];
    const page = activePage();
    return rooms
      .filter((room) => !room.page || room.page === page)
      .map((room) => ({
        id: room.id,
        name: room.name || "Room",
        source: "pdf",
        active: Boolean(room.active),
        raw: room
      }));
  }

  function currentRooms() {
    const lassoRooms = currentLassoRooms();
    return lassoRooms.length ? lassoRooms : currentPdfRooms();
  }

  function ensurePanel() {
    const tabs = document.querySelector("#roomTabs");
    if (!tabs) return null;
    let panel = document.querySelector(`#${ROOM_LIST_ID}`);
    if (!panel) {
      panel = document.createElement("section");
      panel.id = ROOM_LIST_ID;
      panel.className = "arqis-room-list-panel";
      panel.innerHTML = `
        <div class="arqis-room-list-head">
          <span>Rooms on this floor</span>
          <span class="arqis-room-count">0 rooms</span>
        </div>
        <div class="arqis-room-list" id="arqisRoomList"></div>
      `;
      tabs.after(panel);
    }
    return panel;
  }

  function isFloorOrToolTab(button) {
    const text = button.textContent.trim();
    return FLOOR_LABEL_RE.test(text) || button.id || button.classList.contains("pdf-tool-btn");
  }

  function tidyLegacyTabs() {
    document.querySelectorAll("#roomTabs .room-tab").forEach((button) => {
      button.classList.toggle("arqis-hidden-room-tab", !isFloorOrToolTab(button));
    });
  }

  function selectRoom(room) {
    const lassoSelect = globalFunction("lassoSelectRoom");
    const pdfSelect = globalFunction("selectPdfRoom");
    if (room.source === "lasso" && lassoSelect) {
      lassoSelect(room.id);
    } else if (room.source === "pdf" && pdfSelect) {
      pdfSelect(room.id);
    } else {
      document.querySelector("#selectedRoomName").textContent = room.name;
      document.querySelector("#roomTitle").textContent = room.name;
    }
    queueRefresh();
  }

  function renameRoom(room) {
    const next = window.prompt("Room name", room.name);
    if (!next || !next.trim()) return;
    room.raw.name = next.trim();
    const state = window.arqisLassoState || window.lassoState || globalValue("lassoState", null);
    const lassoSave = globalFunction("lassoSave");
    const lassoRenderTabs = globalFunction("lassoRenderTabs");
    const lassoSelect = globalFunction("lassoSelectRoom");
    if (room.source === "lasso" && lassoSave) lassoSave();
    if (room.source === "lasso" && lassoRenderTabs) lassoRenderTabs();
    if (room.source === "lasso" && state?.activeRoomId === room.id && lassoSelect) {
      lassoSelect(room.id);
    }
    queueRefresh();
  }

  function deleteRoom(room) {
    const lassoDelete = globalFunction("lassoDeleteRoom");
    const pdfDelete = globalFunction("deletePdfRoom");
    if (room.source === "lasso" && lassoDelete) {
      lassoDelete(room.id);
    } else if (room.source === "pdf" && pdfDelete) {
      pdfDelete(room.id);
    }
    queueRefresh();
  }

  function syncActiveRoom(rooms) {
    if (!rooms.length) return;
    const title = document.querySelector("#roomTitle")?.textContent?.trim() || "";
    const selectedName = document.querySelector("#selectedRoomName")?.textContent?.trim() || "";
    const knownNames = new Set(rooms.map((room) => room.name));
    const hasActive = rooms.some((room) => room.active);
    if (hasActive && (knownNames.has(title) || knownNames.has(selectedName))) return;

    const firstRoom = rooms[0];
    const state = window.arqisLassoState || window.lassoState || globalValue("lassoState", null);
    if (firstRoom.source === "lasso" && state) state.activeRoomId = firstRoom.id;

    const lassoDrawRooms = globalFunction("lassoDrawRooms");
    if (firstRoom.source === "lasso" && lassoDrawRooms) lassoDrawRooms();
    selectRoom(firstRoom);
  }

  function compactPdfView() {
    const surface = document.querySelector(".pdf-zoom-surface");
    if (!surface || surface === lastPdfSurface) return;
    lastPdfSurface = surface;
    setGlobalValue("pdfZoom", 0.55);
    const applyPdfZoom = globalFunction("applyPdfZoom");
    if (applyPdfZoom) {
      applyPdfZoom();
    } else {
      surface.style.width = "55%";
      const label = document.querySelector("#pdfZoomLabel");
      if (label) label.textContent = "55%";
    }
  }

  function renderRoomList() {
    document.body.classList.add("arqis-workspace-v2");
    const panel = ensurePanel();
    if (!panel) return;

    tidyLegacyTabs();

    const rooms = currentRooms();
    compactPdfView();
    syncActiveRoom(rooms);
    const signature = rooms
      .map((room) => `${room.source}:${room.id}:${room.name}:${room.active ? "1" : "0"}`)
      .join("|");
    if (signature === lastRoomSignature && panel.dataset.rendered === "true") return;
    lastRoomSignature = signature;
    panel.dataset.rendered = "true";

    const list = panel.querySelector("#arqisRoomList");
    const count = panel.querySelector(".arqis-room-count");
    count.textContent = `${rooms.length} room${rooms.length === 1 ? "" : "s"}`;
    list.replaceChildren();

    if (!rooms.length) {
      const empty = document.createElement("div");
      empty.className = "arqis-room-empty";
      empty.textContent = "No rooms marked on this floor yet";
      list.append(empty);
      return;
    }

    rooms.forEach((room) => {
      const pill = document.createElement("div");
      pill.className = `arqis-room-pill${room.active ? " active" : ""}`;

      const name = document.createElement("button");
      name.type = "button";
      name.className = "arqis-room-pill-name";
      name.textContent = room.name;
      name.title = `Open ${room.name}`;
      name.addEventListener("click", () => selectRoom(room));

      const rename = document.createElement("button");
      rename.type = "button";
      rename.textContent = "Edit";
      rename.title = `Rename ${room.name}`;
      rename.addEventListener("click", () => renameRoom(room));

      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "Del";
      remove.title = `Delete ${room.name}`;
      remove.addEventListener("click", () => deleteRoom(room));

      pill.append(name, rename, remove);
      list.append(pill);
    });
  }

  function queueRefresh() {
    if (refreshQueued) return;
    refreshQueued = true;
    window.requestAnimationFrame(() => {
      refreshQueued = false;
      renderRoomList();
    });
  }

  document.addEventListener("click", queueRefresh, true);
  document.addEventListener("input", queueRefresh, true);
  document.addEventListener("change", queueRefresh, true);
  window.addEventListener("arqis:rooms-changed", queueRefresh);
  window.addEventListener("arqis:project-loaded", queueRefresh);

  new MutationObserver(queueRefresh).observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", queueRefresh);
  } else {
    queueRefresh();
  }
})();
