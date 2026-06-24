(function () {
  const FLOOR_LABEL_RE = /^(pdf plan|ground floor|loft|floor\s+\d+|page\s+\d+)$/i;
  const ROOM_LIST_ID = "arqisRoomListPanel";
  let refreshQueued = false;
  let lastRoomSignature = "";

  const style = document.createElement("style");
  style.textContent = `
    body.arqis-workspace-v2 .topbar,
    body.arqis-workspace-v2 .preview-grid,
    body.arqis-workspace-v2 .cad-analysis,
    body.arqis-workspace-v2 .results,
    body.arqis-workspace-v2 .quote {
      max-width: 1320px;
    }

    body.arqis-workspace-v2 .preview-grid {
      grid-template-columns: minmax(0, 1fr);
    }

    body.arqis-workspace-v2 .preview-grid > .plan-preview {
      display: none;
    }

    body.arqis-workspace-v2 .room-browser {
      gap: 10px;
    }

    body.arqis-workspace-v2 .room-outline-card {
      padding: 12px;
    }

    body.arqis-workspace-v2 .pdf-main-wrap {
      max-height: min(78vh, 860px);
    }

    body.arqis-workspace-v2 #roomTabs .arqis-hidden-room-tab {
      display: none;
    }

    .arqis-room-list-panel {
      display: grid;
      gap: 8px;
      padding: 10px;
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
      font-size: 12px;
      font-weight: 850;
      text-transform: uppercase;
    }

    .arqis-room-list {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      min-height: 38px;
    }

    .arqis-room-pill {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      min-height: 38px;
      padding: 0 8px 0 12px;
      border: 1px solid var(--line);
      border-radius: 6px;
      background: var(--paper);
      color: var(--ink);
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
      min-width: 30px;
      min-height: 28px;
      border: 1px solid rgba(24, 32, 29, 0.18);
      border-radius: 5px;
      background: rgba(255, 255, 255, 0.9);
      color: var(--ink);
      font-size: 12px;
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
    if (room.source === "lasso" && typeof window.lassoSelectRoom === "function") {
      window.lassoSelectRoom(room.id);
    } else if (room.source === "pdf" && typeof window.selectPdfRoom === "function") {
      window.selectPdfRoom(room.id);
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
    if (room.source === "lasso" && typeof window.lassoSave === "function") window.lassoSave();
    if (room.source === "lasso" && typeof window.lassoRenderTabs === "function") window.lassoRenderTabs();
    if (room.source === "lasso" && state?.activeRoomId === room.id && typeof window.lassoSelectRoom === "function") {
      window.lassoSelectRoom(room.id);
    }
    queueRefresh();
  }

  function deleteRoom(room) {
    if (room.source === "lasso" && typeof window.lassoDeleteRoom === "function") {
      window.lassoDeleteRoom(room.id);
    } else if (room.source === "pdf" && typeof window.deletePdfRoom === "function") {
      window.deletePdfRoom(room.id);
    }
    queueRefresh();
  }

  function renderRoomList() {
    document.body.classList.add("arqis-workspace-v2");
    const panel = ensurePanel();
    if (!panel) return;

    tidyLegacyTabs();

    const rooms = currentRooms();
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
