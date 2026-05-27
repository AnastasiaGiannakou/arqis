const ARQIS_SUPABASE_URL = "https://yopapazipjztygtwqshg.supabase.co";
const ARQIS_SUPABASE_KEY = "sb_publishable_K-7BG5-YdarJj1isaNA9EQ_eE7rnh4G";

let arqisDbClient = null;
let arqisDbReady = false;

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
    <p class="status" id="arqisSaveStatus">Not saved yet</p>
  `;
  controls.insertBefore(panel, firstPanel);
  document.querySelector("#arqisSaveProjectBtn").addEventListener("click", arqisSaveCurrentProject);
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

function arqisRoomArea(room) {
  if (typeof lassoRoomArea === "function" && Array.isArray(room.points)) return lassoRoomArea(room);
  if (Number.isFinite(room.areaM2)) return room.areaM2;
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
  } catch (error) {
    status.textContent = error.message || "Save failed";
  } finally {
    saveButton.disabled = false;
  }
}

arqisAddDatabasePanel();
