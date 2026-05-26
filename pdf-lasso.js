const lassoState = {
  points: [],
  rooms: [],
  overlay: null,
  activeRoomId: "",
  projectKey: ""
};

const lassoStyle = document.createElement("style");
lassoStyle.textContent = `
  .lasso-room-polygon {
    fill: rgba(29, 107, 79, 0.12);
    stroke: #164c3a;
    stroke-width: 1.8px;
    vector-effect: non-scaling-stroke;
    pointer-events: auto;
  }

  .lasso-room-polygon.active {
    fill: rgba(184, 95, 56, 0.16);
    stroke: #b85f38;
    stroke-width: 2.2px;
  }

  .lasso-draft-line {
    fill: rgba(29, 107, 79, 0.08);
    stroke: #1d6b4f;
    stroke-width: 1.8px;
    stroke-dasharray: 5 4;
    vector-effect: non-scaling-stroke;
    pointer-events: none;
  }

  .lasso-point {
    fill: #1d6b4f;
    stroke: white;
    stroke-width: 0.6px;
    pointer-events: none;
  }

  .lasso-room-label {
    fill: #164c3a;
    font-size: 2.2px;
    font-weight: 850;
    paint-order: stroke;
    stroke: white;
    stroke-width: 0.45px;
    pointer-events: none;
  }
`;
document.head.append(lassoStyle);

function lassoKey() {
  const status = document.querySelector("#fileStatus")?.textContent?.trim() || "pdf-plan";
  return `arqis-pdf-lasso:${status}`;
}

function lassoSave() {
  if (!lassoState.projectKey) lassoState.projectKey = lassoKey();
  localStorage.setItem(lassoState.projectKey, JSON.stringify({ rooms: lassoState.rooms }));
}

function lassoRestore() {
  lassoState.projectKey = lassoKey();
  try {
    const saved = JSON.parse(localStorage.getItem(lassoState.projectKey) || "{}");
    lassoState.rooms = Array.isArray(saved.rooms) ? saved.rooms : [];
  } catch {
    lassoState.rooms = [];
  }
}

function lassoPointString(points) {
  return points.map((point) => `${point.x * 100},${point.y * 100}`).join(" ");
}

function lassoBounds(points) {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return {
    x,
    y,
    width: Math.max(...xs) - x,
    height: Math.max(...ys) - y
  };
}

function lassoOverlayPoint(event) {
  const bounds = lassoState.overlay.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
    y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height))
  };
}

function lassoClearDraft() {
  lassoState.points = [];
  lassoState.overlay?.querySelectorAll(".lasso-draft-line,.lasso-point").forEach((node) => node.remove());
}

function lassoDrawDraft() {
  const overlay = lassoState.overlay;
  if (!overlay) return;
  overlay.querySelectorAll(".lasso-draft-line,.lasso-point").forEach((node) => node.remove());
  if (!lassoState.points.length) return;

  const line = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
  line.classList.add("lasso-draft-line");
  line.setAttribute("points", lassoPointString(lassoState.points));
  overlay.append(line);

  lassoState.points.forEach((point) => {
    const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    dot.classList.add("lasso-point");
    dot.setAttribute("cx", `${point.x * 100}`);
    dot.setAttribute("cy", `${point.y * 100}`);
    dot.setAttribute("r", "0.9");
    overlay.append(dot);
  });
}

function lassoDrawRooms() {
  const overlay = lassoState.overlay;
  if (!overlay) return;
  overlay.querySelectorAll(".lasso-room-polygon,.lasso-room-label").forEach((node) => node.remove());

  lassoState.rooms.forEach((room) => {
    const polygon = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
    polygon.classList.add("lasso-room-polygon");
    polygon.classList.toggle("active", room.id === lassoState.activeRoomId);
    polygon.setAttribute("points", lassoPointString(room.points));
    polygon.addEventListener("click", (event) => {
      event.stopPropagation();
      lassoSelectRoom(room.id);
    });
    polygon.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      lassoDeleteRoom(room.id);
    });

    const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
    label.classList.add("lasso-room-label");
    label.setAttribute("x", `${(room.x + 0.012) * 100}%`);
    label.setAttribute("y", `${(room.y + 0.035) * 100}%`);
    label.textContent = room.name;
    overlay.append(polygon, label);
  });
}

function lassoRenderTabs() {
  const tabs = document.querySelector("#roomTabs");
  if (!tabs) return;
  tabs.querySelectorAll(".lasso-room-tab").forEach((node) => node.remove());
  lassoState.rooms.forEach((room) => {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = `room-tab lasso-room-tab${room.id === lassoState.activeRoomId ? " active" : ""}`;
    tab.textContent = room.name;
    tab.title = "Right-click to clear this room";
    tab.addEventListener("click", () => lassoSelectRoom(room.id));
    tab.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      lassoDeleteRoom(room.id);
    });
    tabs.append(tab);
  });
}

function lassoDrawCleanRoom(room) {
  const svg = document.querySelector("#roomOutline");
  if (!svg || !room) return;
  svg.replaceChildren();

  const padding = 42;
  const width = 420;
  const height = 280;
  const box = lassoBounds(room.points);
  const scale = Math.min(
    (width - padding * 2) / Math.max(box.width, 0.001),
    (height - padding * 2) / Math.max(box.height, 0.001)
  );
  const offsetX = (width - box.width * scale) / 2 - box.x * scale;
  const offsetY = (height - box.height * scale) / 2 - box.y * scale;
  const points = room.points.map((point) => `${(point.x * scale + offsetX).toFixed(1)},${(point.y * scale + offsetY).toFixed(1)}`).join(" ");

  const polygon = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
  polygon.setAttribute("points", points);
  polygon.setAttribute("class", "clean-room-outline");

  const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
  label.setAttribute("x", "210");
  label.setAttribute("y", "140");
  label.setAttribute("text-anchor", "middle");
  label.setAttribute("dominant-baseline", "middle");
  label.setAttribute("class", "clean-room-name");
  label.textContent = room.name;

  const length = document.querySelector("#length")?.value || "--";
  const widthValue = document.querySelector("#width")?.value || "--";
  const bottom = document.createElementNS("http://www.w3.org/2000/svg", "text");
  bottom.setAttribute("x", "210");
  bottom.setAttribute("y", "260");
  bottom.setAttribute("text-anchor", "middle");
  bottom.setAttribute("class", "clean-room-dimension-text");
  bottom.textContent = `${Number(length).toFixed(2)} m x ${Number(widthValue).toFixed(2)} m`;

  svg.append(polygon, label, bottom);
}

function lassoSelectRoom(roomId) {
  const room = lassoState.rooms.find((item) => item.id === roomId);
  if (!room) return;
  lassoState.activeRoomId = roomId;
  window.arqisSelectedPdfRoom = room;
  document.querySelector("#selectedRoomName").textContent = room.name;
  document.querySelector("#selectedRoomArea").textContent = "Marked";
  document.querySelector("#selectedRoomFeet").textContent = "Trace";
  document.querySelector("#roomTitle").textContent = room.name;
  document.querySelector("#cadStatus").textContent = "PDF lasso room marked";
  document.querySelector("#cadMessage").textContent = `${room.name} follows a custom outline around the room shape.`;
  document.querySelector("#cadShapeCount").textContent = `${lassoState.rooms.length}`;
  lassoDrawRooms();
  lassoRenderTabs();
  lassoDrawCleanRoom(room);
}

function lassoFinishRoom() {
  if (lassoState.points.length < 3) {
    document.querySelector("#cadStatus").textContent = "Lasso room needs more points";
    document.querySelector("#cadMessage").textContent = "Click around the room boundary first, then choose Finish room.";
    return;
  }
  const proposed = `Room ${lassoState.rooms.length + 1}`;
  const name = (window.prompt("Room name", proposed) || proposed).trim() || proposed;
  const points = lassoState.points.map((point) => ({ x: point.x, y: point.y }));
  const room = {
    id: crypto.randomUUID ? crypto.randomUUID() : `lasso-${Date.now()}`,
    name,
    points,
    ...lassoBounds(points)
  };
  lassoState.rooms.push(room);
  lassoClearDraft();
  lassoSave();
  lassoSelectRoom(room.id);
}

function lassoDeleteRoom(roomId) {
  const room = lassoState.rooms.find((item) => item.id === roomId);
  if (!room) return;
  if (!window.confirm(`Clear ${room.name}?`)) return;
  lassoState.rooms = lassoState.rooms.filter((item) => item.id !== roomId);
  if (lassoState.activeRoomId === roomId) lassoState.activeRoomId = "";
  lassoSave();
  lassoDrawRooms();
  lassoRenderTabs();
}

function lassoEnsureTools() {
  const mark = document.querySelector("#pdfMarkRoomBtn");
  if (!mark || document.querySelector("#pdfFinishRoomBtn")) return;
  const finish = document.createElement("button");
  finish.className = "pdf-tool-btn";
  finish.id = "pdfFinishRoomBtn";
  finish.type = "button";
  finish.textContent = "Finish room";
  finish.addEventListener("click", lassoFinishRoom);

  const undo = document.createElement("button");
  undo.className = "pdf-tool-btn";
  undo.id = "pdfUndoPointBtn";
  undo.type = "button";
  undo.textContent = "Undo point";
  undo.addEventListener("click", () => {
    lassoState.points.pop();
    lassoDrawDraft();
  });
  mark.after(finish, undo);
}

function lassoAttachOverlay() {
  const overlay = document.querySelector(".pdf-room-overlay");
  if (!overlay || overlay === lassoState.overlay) return;
  lassoState.overlay = overlay;
  lassoRestore();
  overlay.addEventListener("pointerdown", (event) => {
    if (!overlay.classList.contains("marking")) return;
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const point = lassoOverlayPoint(event);
    if (lassoState.points.length >= 3) {
      const first = lassoState.points[0];
      if (Math.hypot(point.x - first.x, point.y - first.y) < 0.018) {
        lassoFinishRoom();
        return;
      }
    }
    lassoState.points.push(point);
    lassoDrawDraft();
  }, true);
  lassoDrawRooms();
  lassoRenderTabs();
}

document.addEventListener("click", (event) => {
  if (event.target?.id === "pdfClearRoomsBtn") {
    lassoState.rooms = [];
    lassoClearDraft();
    lassoSave();
    lassoDrawRooms();
    lassoRenderTabs();
  }
}, true);

new MutationObserver(() => {
  lassoEnsureTools();
  lassoAttachOverlay();
}).observe(document.body, { childList: true, subtree: true });

lassoEnsureTools();
lassoAttachOverlay();
