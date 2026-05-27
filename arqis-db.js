const ARQIS_SUPABASE_URL = "https://yopapazipjztygtwqshg.supabase.co";
const ARQIS_SUPABASE_KEY = "sb_publishable_K-7BG5-YdarJj1isaNA9EQ_eE7rnh4G";

let arqisDbClient = null;
let arqisDbReady = false;
let arqisSavedProjects = [];
let arqisLoadedRooms = [];

function arqisLoadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = [...document.scripts].find((script) => script.src === src);
    if (existing) {
      existing.addEventListener("load", resolve, { once: true });
      if (window.supabase) resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.addEventListener("load", resolve, { once: true });
    script.addEventListener("error", () => reject(new Error("Supabase client could not be loaded.")), { once: true });
    document.head.append(script);
  });
}

async function arqisInitDb() {
  if (arqisDbReady) return arqisDbClient;
  await arqisLoadScript("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2");
  arqisDbClient = window.supabase.createClient(ARQIS_SUPABASE_URL, ARQIS_SUPABASE_KEY);
  arqisDbReady = true;
  return arqisDbClient;
}

function arqisAddDatabasePanel() {
  const controls = document.querySelector(".controls");
  const firstPanel = controls?.querySelector(".panel");
  if (!controls || !firstPanel || document.querySelector("#arqisProjectPanel")) return;

  const panel = document.createElement("section");
  panel.className = "panel";
  panel.id = "arqisProjectPanel";
  panel.innerHTML = `
    <h2>Project</h2>
    <label>Client name<input id="arqisClientName" type="text" placeholder="Client name"></label>
    <label>Project name<input id="arqisProjectName" type="text" placeholder="Project name"></label>
    <button class="secondary" id="arqisSaveProjectBtn" type="button">Save project</button>
    <label>
      Open saved project
      <select id="arqisProjectSelect">
        <option value="">Loading saved projects...</option>
      </select>
    </label>
    <div class="grid two">
      <button class="secondary" id="arqisOpenProjectBtn" type="button">Open</button>
      <button class="secondary" id="arqisRefreshProjectsBtn" type="button">Refresh</button>
    </div>
    <p class="status" id="arqisSaveStatus">Not saved yet</p>
  `;
  controls.insertBefore(panel, firstPanel);
  document.querySelector("#arqisSaveProjectBtn").addEventListener("click", arqisSaveCurrentProject);
  document.querySelector("#arqisOpenProjectBtn").addEventListener("click", arqisOpenSelectedProject);
  document.querySelector("#arqisRefreshProjectsBtn").addEventListener("click", arqisRefreshProjectList);
  arqisRefreshProjectList();
}

function arqisSafeNumber(selector) {
  const value = Number(document.querySelector(selector)?.value);
  return Number.isFinite(value) ? value : null;
}

function arqisCurrentFileName() {
  const text = document.querySelector("#fileStatus")?.textContent?.trim() || "";
  if (!text || text === "No plan uploaded yet") return null;
  return text
    .replace(/ rendered as .*/i, "")
    .replace(/ opened as .*/i, "")
    .replace(/ analysed .*/i, "")
    .replace(/ selected .*/i, "")
    .replace(/ could not .*/i, "")
    .trim() || null;
}

function arqisRoomPolygon(room) {
  if (Array.isArray(room.points)) return room.points;
  if (Array.isArray(room.polygon)) return room.polygon;
  if (Number.isFinite(room.x) && Number.isFinite(room.y) && Number.isFinite(room.width) && Number.isFinite(room.height)) {
    return [
      { x: room.x, y: room.y },
      { x: room.x + room.width, y: room.y },
      { x: room.x + room.width, y: room.y + room.height },
      { x: room.x, y: room.y + room.height }
    ];
  }
  return [];
}

function arqisPolygonBounds(points) {
  const xs = points.map((point) => Number(point.x)).filter(Number.isFinite);
  const ys = points.map((point) => Number(point.y)).filter(Number.isFinite);
  if (!xs.length || !ys.length) return { x: 0, y: 0, width: 1, height: 1 };
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return {
    x,
    y,
    width: Math.max(...xs) - x || 1,
    height: Math.max(...ys) - y || 1
  };
}

function arqisRoomArea(room) {
  if (typeof lassoRoomArea === "function" && Array.isArray(room.points)) return lassoRoomArea(room);
  if (Number.isFinite(room.areaM2)) return room.areaM2;
  if (Number.isFinite(room.area_m2)) return room.area_m2;
  if (Number.isFinite(room.floor_area_m2)) return room.floor_area_m2;
  const length = arqisSafeNumber("#length");
  const width = arqisSafeNumber("#width");
  return length && width ? length * width : null;
}

function arqisCollectRooms() {
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
        source: lassoRooms.length ? "pdf_lasso" : pdfMarkedRooms.length ? "pdf_rectangle" : "cad_detected",
        page: room.page || null,
        raw: room
      }
    };
  });
}

async function arqisRefreshProjectList() {
  const select = document.querySelector("#arqisProjectSelect");
  const status = document.querySelector("#arqisSaveStatus");
  if (!select) return;
  select.innerHTML = `<option value="">Loading saved projects...</option>`;

  try {
    const db = await arqisInitDb();
    const { data, error } = await db
      .from("projects")
      .select("id,name,created_at,clients(id,name)")
      .order("created_at", { ascending: false });
    if (error) throw error;

    arqisSavedProjects = data || [];
    select.replaceChildren();
    if (!arqisSavedProjects.length) {
      select.append(new Option("No saved projects yet", ""));
      return;
    }
    select.append(new Option("Choose a project", ""));
    arqisSavedProjects.forEach((project) => {
      const clientName = project.clients?.name || "No client";
      select.append(new Option(`${clientName} - ${project.name}`, project.id));
    });
  } catch (error) {
    select.innerHTML = `<option value="">Could not load projects</option>`;
    if (status) status.textContent = error.message || "Could not load saved projects";
  }
}

function arqisSvgElement(name, attrs = {}) {
  const element = document.createElementNS("http://www.w3.org/2000/svg", name);
  Object.entries(attrs).forEach(([key, value]) => element.setAttribute(key, String(value)));
  return element;
}

function arqisNormalisePolygon(points) {
  const box = arqisPolygonBounds(points);
  const width = 420;
  const height = 280;
  const padding = 44;
  const scale = Math.min(
    (width - padding * 2) / Math.max(box.width, 0.000001),
    (height - padding * 2) / Math.max(box.height, 0.000001)
  );
  const offsetX = (width - box.width * scale) / 2 - box.x * scale;
  const offsetY = (height - box.height * scale) / 2 - box.y * scale;
  return points.map((point) => ({
    x: Number(point.x) * scale + offsetX,
    y: Number(point.y) * scale + offsetY
  }));
}

function arqisDrawLoadedRoom(room) {
  const svg = document.querySelector("#roomOutline");
  if (!svg) return;
  const polygon = arqisRoomPolygon(room);
  svg.hidden = false;
  svg.replaceChildren();

  if (polygon.length < 3) {
    const text = arqisSvgElement("text", {
      x: 210,
      y: 144,
      "text-anchor": "middle",
      fill: "#65736c",
      "font-size": 16,
      "font-weight": 800
    });
    text.textContent = "Saved room has no outline yet";
    svg.append(text);
    return;
  }

  const scaled = arqisNormalisePolygon(polygon);
  const points = scaled.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  const area = arqisRoomArea(room);
  const shape = arqisSvgElement("polygon", { points, class: "clean-room-outline" });
  const label = arqisSvgElement("text", {
    x: 210,
    y: 136,
    "text-anchor": "middle",
    "dominant-baseline": "middle",
    class: "clean-room-name"
  });
  label.textContent = room.name;
  const areaLabel = arqisSvgElement("text", {
    x: 210,
    y: 160,
    "text-anchor": "middle",
    class: "clean-room-dimension-text"
  });
  areaLabel.textContent = Number.isFinite(area) ? `${area.toFixed(2)} m²` : "Area not measured";
  svg.append(shape, label, areaLabel);
}

function arqisSelectLoadedRoom(index) {
  const room = arqisLoadedRooms[index];
  if (!room) return;
  const area = arqisRoomArea(room);
  document.querySelector("#selectedRoomName").textContent = room.name;
  document.querySelector("#selectedRoomArea").textContent = Number.isFinite(area) ? `${area.toFixed(2)} m²` : "--";
  document.querySelector("#selectedRoomFeet").textContent = Number.isFinite(area) ? `${(area * 10.7639).toFixed(2)} ft²` : "--";
  document.querySelector("#roomTitle").textContent = room.name;
  document.querySelectorAll("#roomTabs .room-tab").forEach((tab, tabIndex) => {
    tab.classList.toggle("active", tabIndex === index);
  });
  if (Number.isFinite(room.length_m)) document.querySelector("#length").value = room.length_m;
  if (Number.isFinite(room.width_m)) document.querySelector("#width").value = room.width_m;
  if (Number.isFinite(room.height_m || room.ceiling_height_m)) document.querySelector("#height").value = room.height_m || room.ceiling_height_m;
  arqisDrawLoadedRoom(room);
  if (typeof calculate === "function") calculate();
}

function arqisRenderLoadedProject(project, floor) {
  const tabs = document.querySelector("#roomTabs");
  const preview = document.querySelector("#planPreviewBody");
  const fileStatus = document.querySelector("#fileStatus");
  const cadStatus = document.querySelector("#cadStatus");
  const cadMessage = document.querySelector("#cadMessage");
  const cadShapeCount = document.querySelector("#cadShapeCount");
  const cadLargestArea = document.querySelector("#cadLargestArea");
  const cadTotalArea = document.querySelector("#cadTotalArea");
  const cadTotalFeet = document.querySelector("#cadTotalFeet");

  arqisLoadedRooms = (floor?.rooms || []).map((room) => ({ ...room, points: room.polygon || [] }));
  tabs.replaceChildren();
  preview.innerHTML = `
    <div class="plan-file-card">
      <strong>${project.name}</strong>
      <span>Saved project loaded from Supabase.</span>
      <span>The room data is restored. The original PDF/DWG background will come next with file storage.</span>
    </div>
  `;
  fileStatus.textContent = floor?.source_file_name ? `${floor.source_file_name} loaded from saved project` : `${project.name} loaded from saved project`;

  arqisLoadedRooms.forEach((room, index) => {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = `room-tab${index === 0 ? " active" : ""}`;
    tab.textContent = room.name;
    tab.addEventListener("click", () => arqisSelectLoadedRoom(index));
    tabs.append(tab);
  });

  const areas = arqisLoadedRooms.map(arqisRoomArea).filter(Number.isFinite);
  const total = areas.reduce((sum, area) => sum + area, 0);
  cadStatus.textContent = "Saved project loaded";
  cadMessage.textContent = `${project.name} loaded with ${arqisLoadedRooms.length} saved room${arqisLoadedRooms.length === 1 ? "" : "s"}.`;
  cadShapeCount.textContent = `${arqisLoadedRooms.length}`;
  cadLargestArea.textContent = areas.length ? `${Math.max(...areas).toFixed(2)} m²` : "--";
  cadTotalArea.textContent = areas.length ? `${total.toFixed(2)} m²` : "--";
  cadTotalFeet.textContent = areas.length ? `${(total * 10.7639).toFixed(2)} ft²` : "--";

  if (arqisLoadedRooms.length) {
    arqisSelectLoadedRoom(0);
  } else {
    document.querySelector("#roomTitle").textContent = floor?.name || project.name;
    document.querySelector("#selectedRoomName").textContent = "No room selected";
    document.querySelector("#selectedRoomArea").textContent = "--";
    document.querySelector("#selectedRoomFeet").textContent = "--";
    arqisDrawLoadedRoom({ name: "No room selected", polygon: [] });
  }
}

async function arqisOpenSelectedProject() {
  const status = document.querySelector("#arqisSaveStatus");
  const projectId = document.querySelector("#arqisProjectSelect")?.value;
  if (!projectId) {
    status.textContent = "Choose a saved project first";
    return;
  }

  status.textContent = "Opening saved project...";
  try {
    const db = await arqisInitDb();
    const { data: project, error } = await db
      .from("projects")
      .select("id,name,status,created_at,clients(id,name),floors(id,name,source_file_name,source_file_type,page_number,rooms(id,name,room_type,area_m2,floor_area_m2,length_m,width_m,height_m,ceiling_height_m,wall_lengths,polygon,costing,measured_dimensions))")
      .eq("id", projectId)
      .single();
    if (error) throw error;

    const floor = project.floors?.[0] || null;
    document.querySelector("#arqisClientName").value = project.clients?.name || "";
    document.querySelector("#arqisProjectName").value = project.name || "";
    arqisRenderLoadedProject(project, floor);
    status.textContent = `Opened ${project.clients?.name || "client"} / ${project.name}`;
  } catch (error) {
    status.textContent = error.message || "Could not open saved project";
  }
}

async function arqisSaveCurrentProject() {
  const status = document.querySelector("#arqisSaveStatus");
  const saveButton = document.querySelector("#arqisSaveProjectBtn");
  const clientName = document.querySelector("#arqisClientName")?.value?.trim();
  const projectName = document.querySelector("#arqisProjectName")?.value?.trim();

  if (!clientName || !projectName) {
    status.textContent = "Add client and project name first";
    return;
  }

  saveButton.disabled = true;
  status.textContent = "Saving to Supabase...";

  try {
    const db = await arqisInitDb();
    const rooms = arqisCollectRooms();

    const { data: client, error: clientError } = await db
      .from("clients")
      .insert({ name: clientName })
      .select("id")
      .single();
    if (clientError) throw clientError;

    const { data: project, error: projectError } = await db
      .from("projects")
      .insert({ client_id: client.id, name: projectName, status: "draft" })
      .select("id")
      .single();
    if (projectError) throw projectError;

    const { data: floor, error: floorError } = await db
      .from("floors")
      .insert({
        project_id: project.id,
        name: document.querySelector("#roomTitle")?.textContent || "Floor 1",
        source_file_name: arqisCurrentFileName(),
        source_file_type: arqisCurrentFileName()?.split(".").pop()?.toLowerCase() || null
      })
      .select("id")
      .single();
    if (floorError) throw floorError;

    if (rooms.length) {
      const { error: roomsError } = await db
        .from("rooms")
        .insert(rooms.map((room) => ({ ...room, floor_id: floor.id })));
      if (roomsError) throw roomsError;
    }

    status.textContent = `Saved ${clientName} / ${projectName} with ${rooms.length} room${rooms.length === 1 ? "" : "s"}`;
    await arqisRefreshProjectList();
    document.querySelector("#arqisProjectSelect").value = project.id;
  } catch (error) {
    status.textContent = error.message || "Save failed";
  } finally {
    saveButton.disabled = false;
  }
}

arqisAddDatabasePanel();
