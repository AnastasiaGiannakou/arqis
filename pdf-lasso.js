const lassoState = {
  points: [],
  rooms: [],
  overlay: null,
  activeRoomId: "",
  projectKey: "",
  dragging: null
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
    stroke-width: 2px;
  }

  .lasso-draft-line {
    fill: rgba(29, 107, 79, 0.08);
    stroke: #1d6b4f;
    stroke-width: 1.5px;
    stroke-dasharray: 5 4;
    vector-effect: non-scaling-stroke;
    pointer-events: none;
  }

  .lasso-point {
    fill: #1d6b4f;
    stroke: white;
    stroke-width: 0.4px;
    vector-effect: non-scaling-stroke;
    pointer-events: none;
  }

  .lasso-corner-handle {
    fill: rgba(255, 255, 255, 0.95);
    stroke: #b85f38;
    stroke-width: 0.45px;
    vector-effect: non-scaling-stroke;
    cursor: grab;
    pointer-events: auto;
  }

  .lasso-corner-handle:active {
    cursor: grabbing;
  }

  .lasso-room-label {
    fill: #164c3a;
    font-size: 1.45px;
    font-weight: 850;
    paint-order: stroke;
    stroke: white;
    stroke-width: 0.28px;
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

function lassoNumber(selector, fallback) {
  const value = Number(document.querySelector(selector)?.value);
  return Number.isFinite(value) && value > 0 ? value : fallback;
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

function lassoPolygonArea(points) {
  if (!Array.isArray(points) || points.length < 3) return 0;
  let sum = 0;
  points.forEach((point, index) => {
    const next = points[(index + 1) % points.length];
    sum += point.x * next.y - next.x * point.y;
  });
  return Math.abs(sum) / 2;
}

function lassoRoomArea(room) {
  const box = lassoBounds(room.points);
  const boxArea = Math.max(box.width * box.height, 0.000001);
  const shapeRatio = Math.min(1, lassoPolygonArea(room.points) / boxArea);
  return lassoNumber("#length", 3.2) * lassoNumber("#width", 2.4) * shapeRatio;
}

function lassoFeet(metres) {
  return metres * 10.7639;
}

function lassoOverlayPoint(event) {
  const bounds = lassoState.overlay.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
    y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height))
  };
}

function lassoMarkerRadius() {
  const width = lassoState.overlay?.getBoundingClientRect().width || 900;
  return Math.max(0.28, Math.min(0.85, 360 / width));
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

  const radius = lassoMarkerRadius();
  lassoState.points.forEach((point) => {
    const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    dot.classList.add("lasso-point");
    dot.setAttribute("cx", `${point.x * 100}`);
    dot.setAttribute("cy", `${point.y * 100}`);
    dot.setAttribute("r", radius.toFixed(2));
    overlay.append(dot);
  });
}

function lassoDrawRooms() {
  const overlay = lassoState.overlay;
  if (!overlay) return;
  overlay.querySelectorAll(".lasso-room-polygon,.lasso-room-label,.lasso-corner-handle").forEach((node) => node.remove());

  const radius = lassoMarkerRadius();
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

    if (room.id === lassoState.activeRoomId) {
      room.points.forEach((point, index) => {
        const handle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        handle.classList.add("lasso-corner-handle");
        handle.setAttribute("cx", `${point.x * 100}`);
        handle.setAttribute("cy", `${point.y * 100}`);
        handle.setAttribute("r", radius.toFixed(2));
        handle.addEventListener("pointerdown", (event) => {
          event.preventDefault();
          event.stopPropagation();
          lassoState.dragging = { roomId: room.id, index };
          handle.setPointerCapture(event.pointerId);
        });
        overlay.append(handle);
      });
    }
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

function lassoSvgElement(name, attrs = {}) {
  const element = document.createElementNS("http://www.w3.org/2000/svg", name);
  Object.entries(attrs).forEach(([key, value]) => element.setAttribute(key, String(value)));
  return element;
}

function lassoDrawCleanRoom(room) {
  const svg = document.querySelector("#roomOutline");
  if (!svg || !room) return;
  svg.replaceChildren();

  const padding = 48;
  const svgWidth = 420;
  const svgHeight = 280;
  const box = lassoBounds(room.points);
  const scale = Math.min(
    (svgWidth - padding * 2) / Math.max(box.width, 0.001),
    (svgHeight - padding * 2) / Math.max(box.height, 0.001)
  );
  const offsetX = (svgWidth - box.width * scale) / 2 - box.x * scale;
  const offsetY = (svgHeight - box.height * scale) / 2 - box.y * scale;
  const scaled = room.points.map((point) => ({
    x: point.x * scale + offsetX,
    y: point.y * scale + offsetY
  }));
  const points = scaled.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  const area = lassoRoomArea(room);

  const polygon = lassoSvgElement("polygon", { points, class: "clean-room-outline" });
  const label = lassoSvgElement("text", {
    x: 210,
    y: 136,
    "text-anchor": "middle",
    "dominant-baseline": "middle",
    class: "clean-room-name"
  });
  label.textContent = room.name;

  const areaLabel = lassoSvgElement("text", {
    x: 210,
    y: 160,
    "text-anchor": "middle",
    class: "clean-room-dimension-text"
  });
  areaLabel.textContent = `${area.toFixed(2)} m²`;

  const scaleX = lassoNumber("#length", 3.2) / Math.max(box.width, 0.001);
  const scaleY = lassoNumber("#width", 2.4) / Math.max(box.height, 0.001);
  scaled.forEach((point, index) => {
    const next = scaled[(index + 1) % scaled.length];
    const original = room.points[index];
    const originalNext = room.points[(index + 1) % room.points.length];
    const metres = Math.hypot((originalNext.x - original.x) * scaleX, (originalNext.y - original.y) * scaleY);
    if (metres < 0.15) return;
    const text = lassoSvgElement("text", {
      x: ((point.x + next.x) / 2).toFixed(1),
      y: ((point.y + next.y) / 2 - 5).toFixed(1),
      "text-anchor": "middle",
      class: "clean-room-dimension-text"
    });
    text.textContent = `${metres.toFixed(2)} m`;
    svg.append(text);
  });

  svg.prepend(polygon);
  svg.append(label, areaLabel);
}

function lassoUpdateTotals(room) {
  const area = lassoRoomArea(room);
  const feet = lassoFeet(area);
  document.querySelector("#selectedRoomArea").textContent = `${area.toFixed(2)} m²`;
  document.querySelector("#selectedRoomFeet").textContent = `${feet.toFixed(2)} ft²`;
  document.querySelector("#floorArea").textContent = `${area.toFixed(2)} m²`;
  document.querySelector("#cadShapeCount").textContent = `${lassoState.rooms.length}`;
  document.querySelector("#cadLargestArea").textContent = `${Math.max(...lassoState.rooms.map(lassoRoomArea), 0).toFixed(2)} m²`;
  const total = lassoState.rooms.reduce((sum, item) => sum + lassoRoomArea(item), 0);
  document.querySelector("#cadTotalArea").textContent = `${total.toFixed(2)} m²`;
  document.querySelector("#cadTotalFeet").textContent = `${lassoFeet(total).toFixed(2)} ft²`;
}

function lassoSelectRoom(roomId) {
  const room = lassoState.rooms.find((item) => item.id === roomId);
  if (!room) return;
  lassoState.activeRoomId = roomId;
  window.arqisSelectedPdfRoom = room;
  document.querySelector("#selectedRoomName").textContent = room.name;
  document.querySelector("#roomTitle").textContent = room.name;
  document.querySelector("#cadStatus").textContent = "PDF lasso room marked";
  document.querySelector("#cadMessage").textContent = `${room.name} follows a custom outline. Drag the white corner handles to amend it.`;
  lassoUpdateTotals(room);
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
    if (event.target?.classList?.contains("lasso-corner-handle")) return;
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

  overlay.addEventListener("pointermove", (event) => {
    if (!lassoState.dragging) return;
    event.preventDefault();
    const room = lassoState.rooms.find((item) => item.id === lassoState.dragging.roomId);
    if (!room) return;
    room.points[lassoState.dragging.index] = lassoOverlayPoint(event);
    Object.assign(room, lassoBounds(room.points));
    lassoSave();
    lassoDrawRooms();
    lassoDrawCleanRoom(room);
    lassoUpdateTotals(room);
  });

  overlay.addEventListener("pointerup", () => {
    lassoState.dragging = null;
  });

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

["#length", "#width"].forEach((selector) => {
  document.querySelector(selector)?.addEventListener("input", () => {
    const room = lassoState.rooms.find((item) => item.id === lassoState.activeRoomId);
    if (!room) return;
    lassoDrawCleanRoom(room);
    lassoUpdateTotals(room);
  });
});

new MutationObserver(() => {
  lassoEnsureTools();
  lassoAttachOverlay();
}).observe(document.body, { childList: true, subtree: true });

window.addEventListener("resize", () => {
  lassoDrawDraft();
  lassoDrawRooms();
});

lassoEnsureTools();
lassoAttachOverlay();
