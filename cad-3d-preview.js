(function () {
  const svgNs = "http://www.w3.org/2000/svg";

  const style = document.createElement("style");
  style.textContent = `
    .arqis-3d-card {
      display: grid;
      gap: 10px;
      padding: 16px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: rgba(255,255,255,0.78);
    }

    .arqis-3d-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }

    .arqis-3d-head span {
      color: var(--muted);
      font-size: 12px;
      font-weight: 800;
      text-transform: uppercase;
    }

    .arqis-3d-head button {
      min-height: 32px;
      padding: 0 12px;
      border: 1px solid var(--line);
      border-radius: 6px;
      background: var(--paper);
      color: var(--ink);
      font-weight: 800;
    }

    .arqis-3d-svg {
      width: 100%;
      min-height: 310px;
      border: 1px solid var(--line);
      border-radius: 6px;
      background:
        repeating-linear-gradient(90deg, rgba(24,32,29,0.035) 0 1px, transparent 1px 28px),
        repeating-linear-gradient(0deg, rgba(24,32,29,0.035) 0 1px, transparent 1px 28px),
        #f9fbf7;
    }

    .arqis-3d-note {
      color: var(--muted);
      font-size: 12px;
      font-weight: 700;
      line-height: 1.45;
    }

    .arqis-3d-measurements {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 8px;
    }

    .arqis-3d-measurements article {
      display: grid;
      gap: 3px;
      padding: 10px;
      border: 1px solid var(--line);
      border-radius: 6px;
      background: var(--paper);
    }

    .arqis-3d-measurements span {
      color: var(--muted);
      font-size: 11px;
      font-weight: 800;
      text-transform: uppercase;
    }

    .arqis-3d-measurements strong {
      font-size: 15px;
    }

    @media (max-width: 720px) {
      .arqis-3d-measurements {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }
  `;
  document.head.append(style);

  function numberValue(selector, fallback = 0) {
    const value = Number(document.querySelector(selector)?.value);
    return Number.isFinite(value) && value > 0 ? value : fallback;
  }

  function el(name, attrs = {}) {
    const node = document.createElementNS(svgNs, name);
    Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, String(value)));
    return node;
  }

  function polygonArea(points) {
    if (!Array.isArray(points) || points.length < 3) return 0;
    return Math.abs(points.reduce((sum, point, index) => {
      const next = points[(index + 1) % points.length];
      return sum + point.x * next.y - next.x * point.y;
    }, 0)) / 2;
  }

  function bounds(points) {
    const xs = points.map((point) => Number(point.x));
    const ys = points.map((point) => Number(point.y));
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    return {
      minX,
      maxX,
      minY,
      maxY,
      width: Math.max(maxX - minX, 0.000001),
      height: Math.max(maxY - minY, 0.000001)
    };
  }

  function collectMarkedRoom() {
    const selected = window.arqisSelectedPdfRoom;
    if (selected?.points?.length >= 3) return selected;

    const state = window.arqisLassoState || window.lassoState;
    if (state?.rooms?.length) {
      return state.rooms.find((room) => room.id === state.activeRoomId) || state.rooms[0];
    }

    const bridgeRooms = typeof window.arqisRoomBridgeCollectRooms === "function"
      ? window.arqisRoomBridgeCollectRooms()
      : [];
    if (bridgeRooms.length) return bridgeRooms[0];

    return null;
  }

  function collectCadRoom() {
    try {
      if (typeof detectedRooms !== "undefined" && Array.isArray(detectedRooms) && detectedRooms.length) {
        const activeIndex = [...document.querySelectorAll("#roomTabs .room-tab")]
          .findIndex((tab) => tab.classList.contains("active"));
        return detectedRooms[Math.max(0, activeIndex)] || detectedRooms[0];
      }
    } catch {
      return null;
    }
    return null;
  }

  function activeRoom() {
    const room = collectMarkedRoom() || collectCadRoom();
    const length = numberValue("#length", 3.2);
    const width = numberValue("#width", 2.4);

    if (!room?.points?.length) {
      return {
        name: document.querySelector("#selectedRoomName")?.textContent || "Manual room",
        points: [{ x: 0, y: 0 }, { x: length, y: 0 }, { x: length, y: width }, { x: 0, y: width }],
        length,
        width,
        source: "manual"
      };
    }

    return {
      ...room,
      name: room.name || document.querySelector("#selectedRoomName")?.textContent || "Selected room",
      length: Number(room.length_m) || length,
      width: Number(room.width_m) || width,
      source: "geometry"
    };
  }

  function roomPointsInMetres(room) {
    const pointBounds = bounds(room.points);
    const targetLength = Math.max(Number(room.length) || numberValue("#length", 3.2), 0.1);
    const targetWidth = Math.max(Number(room.width) || numberValue("#width", 2.4), 0.1);

    return room.points.map((point) => ({
      x: ((Number(point.x) - pointBounds.minX) / pointBounds.width) * targetLength,
      y: ((Number(point.y) - pointBounds.minY) / pointBounds.height) * targetWidth
    }));
  }

  function project(point) {
    return {
      x: (point.x - point.y) * 0.88,
      y: (point.x + point.y) * 0.42 - point.z * 0.72
    };
  }

  function buildProjection(points, height) {
    const bottom = points.map((point) => ({ ...point, z: 0 }));
    const top = points.map((point) => ({ ...point, z: height }));
    const projected = [...bottom, ...top].map(project);
    const xs = projected.map((point) => point.x);
    const ys = projected.map((point) => point.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const scale = Math.min(520 / Math.max(maxX - minX, 0.000001), 250 / Math.max(maxY - minY, 0.000001));
    const offsetX = 310 - ((minX + maxX) / 2) * scale;
    const offsetY = 170 - ((minY + maxY) / 2) * scale;

    return (point) => {
      const projectedPoint = project(point);
      return {
        x: projectedPoint.x * scale + offsetX,
        y: projectedPoint.y * scale + offsetY
      };
    };
  }

  function pointString(points) {
    return points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  }

  function roomPerimeter(points) {
    return points.reduce((sum, point, index) => {
      const next = points[(index + 1) % points.length];
      return sum + Math.hypot(next.x - point.x, next.y - point.y);
    }, 0);
  }

  function label(svg, text, x, y, options = {}) {
    const node = el("text", {
      x,
      y,
      "text-anchor": options.anchor || "middle",
      fill: options.fill || "#164c3a",
      "font-size": options.size || "12",
      "font-weight": "850",
      "paint-order": "stroke",
      stroke: "white",
      "stroke-width": options.strokeWidth || "4"
    });
    node.textContent = text;
    svg.append(node);
    return node;
  }

  function guideLine(svg, start, end, text, textOffset = { x: 0, y: 0 }) {
    svg.append(el("line", {
      x1: start.x,
      y1: start.y,
      x2: end.x,
      y2: end.y,
      stroke: "#b85f38",
      "stroke-width": "1.4",
      "stroke-dasharray": "5 4"
    }));
    label(
      svg,
      text,
      (start.x + end.x) / 2 + textOffset.x,
      (start.y + end.y) / 2 + textOffset.y,
      { fill: "#164c3a", size: "12" }
    );
  }

  function updateMeasurementStrip(room, points, height, floorArea) {
    const strip = document.querySelector("#arqis3dMeasurements");
    if (!strip) return;
    const length = Math.max(...points.map((point) => point.x)) - Math.min(...points.map((point) => point.x));
    const width = Math.max(...points.map((point) => point.y)) - Math.min(...points.map((point) => point.y));
    const perimeter = roomPerimeter(points);
    strip.innerHTML = `
      <article><span>Length</span><strong>${length.toFixed(2)} m</strong></article>
      <article><span>Width</span><strong>${width.toFixed(2)} m</strong></article>
      <article><span>Height</span><strong>${height.toFixed(2)} m</strong></article>
      <article><span>Perimeter</span><strong>${perimeter.toFixed(2)} m</strong></article>
    `;
    strip.dataset.area = floorArea.toFixed(2);
    strip.dataset.room = room.name || "Selected room";
  }

  function draw3d() {
    const svg = document.querySelector("#arqis3dPreview");
    const note = document.querySelector("#arqis3dNote");
    if (!svg) return;

    const room = activeRoom();
    const points = roomPointsInMetres(room);
    const height = numberValue("#height", 2.4);
    const renderPoint = buildProjection(points, height);
    const floorArea = polygonArea(points);
    const topPoints = points.map((point) => renderPoint({ ...point, z: height }));
    const bottomPoints = points.map((point) => renderPoint({ ...point, z: 0 }));
    const pointBounds = bounds(points);

    svg.replaceChildren();

    const walls = points.map((point, index) => {
      const next = points[(index + 1) % points.length];
      const face = [
        renderPoint({ ...point, z: 0 }),
        renderPoint({ ...next, z: 0 }),
        renderPoint({ ...next, z: height }),
        renderPoint({ ...point, z: height })
      ];
      const averageY = face.reduce((sum, item) => sum + item.y, 0) / face.length;
      return { face, averageY, index };
    }).sort((a, b) => a.averageY - b.averageY);

    walls.forEach((wall, index) => {
      const face = el("polygon", {
        points: pointString(wall.face),
        fill: index % 2 ? "rgba(29,107,79,0.18)" : "rgba(29,107,79,0.26)",
        stroke: "#164c3a",
        "stroke-width": "1.8",
        "stroke-linejoin": "round"
      });
      svg.append(face);
    });

    svg.append(el("polygon", {
      points: pointString(bottomPoints),
      fill: "rgba(184,95,56,0.10)",
      stroke: "#b85f38",
      "stroke-width": "1.6",
      "stroke-linejoin": "round"
    }));

    svg.append(el("polygon", {
      points: pointString(topPoints),
      fill: "rgba(29,107,79,0.20)",
      stroke: "#164c3a",
      "stroke-width": "2.6",
      "stroke-linejoin": "round"
    }));

    const lengthStart = renderPoint({ x: pointBounds.minX, y: pointBounds.minY, z: 0 });
    const lengthEnd = renderPoint({ x: pointBounds.maxX, y: pointBounds.minY, z: 0 });
    const widthStart = renderPoint({ x: pointBounds.maxX, y: pointBounds.minY, z: 0 });
    const widthEnd = renderPoint({ x: pointBounds.maxX, y: pointBounds.maxY, z: 0 });
    const heightStart = renderPoint({ x: pointBounds.maxX, y: pointBounds.maxY, z: 0 });
    const heightEnd = renderPoint({ x: pointBounds.maxX, y: pointBounds.maxY, z: height });
    guideLine(svg, lengthStart, lengthEnd, `${pointBounds.width.toFixed(2)} m`, { y: 18 });
    guideLine(svg, widthStart, widthEnd, `${pointBounds.height.toFixed(2)} m`, { x: 20 });
    guideLine(svg, heightStart, heightEnd, `${height.toFixed(2)} m high`, { x: 42 });

    const centre = topPoints.reduce((sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }), { x: 0, y: 0 });
    centre.x /= topPoints.length;
    centre.y /= topPoints.length;
    label(svg, room.name, centre.x, centre.y - 6, { size: "17" });
    label(svg, `${floorArea.toFixed(2)} m² floor`, centre.x, centre.y + 16, { size: "13", strokeWidth: "3" });
    updateMeasurementStrip(room, points, height, floorArea);

    if (note) {
      note.textContent = room.source === "manual"
        ? "3D preview is using the manual length, width, and ceiling height until a CAD/PDF room is selected."
        : "3D preview uses the selected room outline and the ceiling height from the left panel.";
    }
  }

  function install() {
    const roomCard = document.querySelector(".room-outline-card");
    if (!roomCard || document.querySelector("#arqis3dPreview")) return;

    const card = document.createElement("section");
    card.className = "arqis-3d-card";
    card.innerHTML = `
      <div class="arqis-3d-head">
        <span>3D room preview</span>
        <button id="arqis3dRefresh" type="button">Refresh 3D</button>
      </div>
      <svg class="arqis-3d-svg" id="arqis3dPreview" viewBox="0 0 620 340" role="img" aria-label="3D room preview"></svg>
      <div class="arqis-3d-measurements" id="arqis3dMeasurements" aria-label="3D room measurements"></div>
      <p class="arqis-3d-note" id="arqis3dNote"></p>
    `;
    roomCard.after(card);
    document.querySelector("#arqis3dRefresh")?.addEventListener("click", draw3d);
    draw3d();
  }

  ["#length", "#width", "#height", "#tileHeight", "#roomTabs"].forEach((selector) => {
    document.querySelectorAll(selector).forEach((node) => {
      node.addEventListener("input", draw3d, true);
      node.addEventListener("change", draw3d, true);
      node.addEventListener("click", () => window.setTimeout(draw3d, 0), true);
    });
  });

  document.addEventListener("click", () => window.setTimeout(draw3d, 0), true);
  window.addEventListener("arqis:rooms-changed", draw3d);
  window.addEventListener("load", () => {
    install();
    draw3d();
  });

  new MutationObserver(() => {
    install();
    window.requestAnimationFrame(draw3d);
  }).observe(document.body, { childList: true, subtree: true });

  window.arqisRender3dPreview = draw3d;
})();
