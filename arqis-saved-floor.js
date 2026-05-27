const savedFloorStyle = document.createElement("style");
savedFloorStyle.textContent = `
  .saved-plan-thumb {
    width: 100%;
    max-height: 360px;
    object-fit: contain;
    border: 1px solid var(--line, #d7ded8);
    border-radius: 6px;
    background: white;
  }

  .saved-plan-wrap {
    position: relative;
    width: 100%;
    max-height: min(760px, 72vh);
    overflow: auto;
    border: 1px solid var(--line, #d7ded8);
    border-radius: 6px;
    background: white;
  }

  .saved-plan-stage {
    position: relative;
    width: 100%;
    min-width: 720px;
  }

  .saved-plan-image {
    display: block;
    width: 100%;
    height: auto;
  }

  .saved-plan-overlay {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }

  .saved-plan-room {
    fill: rgba(29, 107, 79, 0.12);
    stroke: #164c3a;
    stroke-width: 0.35px;
    vector-effect: non-scaling-stroke;
  }

  .saved-plan-room.active {
    fill: rgba(184, 95, 56, 0.18);
    stroke: #b85f38;
    stroke-width: 0.45px;
  }

  .saved-plan-label {
    fill: #164c3a;
    font-size: 1.6px;
    font-weight: 850;
    paint-order: stroke;
    stroke: white;
    stroke-width: 0.35px;
  }
`;
document.head.append(savedFloorStyle);

function arqisCaptureFloorPreview() {
  const canvas = document.querySelector(".pdf-main-canvas");
  if (!canvas || !canvas.width || !canvas.height) return null;

  const maxWidth = 1200;
  const scale = Math.min(1, maxWidth / canvas.width);
  const output = document.createElement("canvas");
  output.width = Math.max(1, Math.round(canvas.width * scale));
  output.height = Math.max(1, Math.round(canvas.height * scale));
  const context = output.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, output.width, output.height);
  context.drawImage(canvas, 0, 0, output.width, output.height);
  try {
    return output.toDataURL("image/jpeg", 0.82);
  } catch {
    return null;
  }
}

async function arqisFetchProjectWithLatestFloor(projectId) {
  const db = await arqisInitDb();
  const { data: project, error: projectError } = await db
    .from("projects")
    .select("id,name,status,created_at,clients(id,name)")
    .eq("id", projectId)
    .single();
  if (projectError) throw projectError;

  const { data: floors, error: floorsError } = await db
    .from("floors")
    .select("id,name,source_file_name,source_file_type,page_number,preview_image_url,created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(1);
  if (floorsError) throw floorsError;

  const floor = floors?.[0] || null;
  let rooms = [];
  if (floor?.id) {
    const { data: roomRows, error: roomsError } = await db
      .from("rooms")
      .select("id,name,room_type,area_m2,floor_area_m2,length_m,width_m,height_m,ceiling_height_m,wall_lengths,polygon,costing,measured_dimensions,created_at")
      .eq("floor_id", floor.id)
      .order("created_at", { ascending: true });
    if (roomsError) throw roomsError;
    rooms = roomRows || [];
  }

  return { ...project, floors: floor ? [{ ...floor, rooms }] : [] };
}

function arqisSavedRoomPolygonPoints(room) {
  return arqisRoomPolygon(room)
    .map((point) => `${Number(point.x) * 100},${Number(point.y) * 100}`)
    .join(" ");
}

function arqisSavedRoomLabelPoint(room) {
  const points = arqisRoomPolygon(room);
  if (!points.length) return { x: 50, y: 50 };
  const x = points.reduce((sum, point) => sum + Number(point.x || 0), 0) / points.length;
  const y = points.reduce((sum, point) => sum + Number(point.y || 0), 0) / points.length;
  return { x: x * 100, y: y * 100 };
}

function arqisRenderSavedPlan(floor, rooms, activeRoomId = "") {
  document.querySelector(".saved-plan-wrap")?.remove();
  if (!floor?.preview_image_url) return;

  const outline = document.querySelector("#roomOutline");
  if (!outline) return;
  const wrap = document.createElement("div");
  wrap.className = "saved-plan-wrap";
  wrap.innerHTML = `
    <div class="saved-plan-stage">
      <img class="saved-plan-image" alt="Saved floor plan" src="${floor.preview_image_url}">
      <svg class="saved-plan-overlay" viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="Saved room overlays"></svg>
    </div>
  `;
  outline.before(wrap);
  arqisUpdateSavedPlanOverlay(rooms, activeRoomId);
}

function arqisUpdateSavedPlanOverlay(rooms, activeRoomId = "") {
  const overlay = document.querySelector(".saved-plan-overlay");
  if (!overlay) return;
  overlay.replaceChildren();
  rooms.forEach((room) => {
    const points = arqisSavedRoomPolygonPoints(room);
    if (!points) return;
    const polygon = arqisSvgElement("polygon", {
      points,
      class: `saved-plan-room${room.id === activeRoomId ? " active" : ""}`
    });
    const labelPoint = arqisSavedRoomLabelPoint(room);
    const label = arqisSvgElement("text", {
      x: labelPoint.x.toFixed(2),
      y: labelPoint.y.toFixed(2),
      "text-anchor": "middle",
      class: "saved-plan-label"
    });
    label.textContent = room.name;
    overlay.append(polygon, label);
  });
}

function arqisRenderProjectWithSavedFloor(project, floor) {
  const tabs = document.querySelector("#roomTabs");
  const preview = document.querySelector("#planPreviewBody");
  const fileStatus = document.querySelector("#fileStatus");
  const cadStatus = document.querySelector("#cadStatus");
  const cadMessage = document.querySelector("#cadMessage");
  const cadShapeCount = document.querySelector("#cadShapeCount");
  const cadLargestArea = document.querySelector("#cadLargestArea");
  const cadTotalArea = document.querySelector("#cadTotalArea");
  const cadTotalFeet = document.querySelector("#cadTotalFeet");
  const rooms = (floor?.rooms || []).map((room) => ({ ...room, points: room.polygon || [] }));

  tabs.replaceChildren();
  document.querySelector(".saved-plan-wrap")?.remove();

  if (floor?.preview_image_url) {
    preview.innerHTML = `<img class="saved-plan-thumb" alt="Saved floor plan preview" src="${floor.preview_image_url}">`;
  } else {
    preview.innerHTML = `
      <div class="plan-file-card">
        <strong>${project.name}</strong>
        <span>Saved room data loaded from Supabase.</span>
        <span>This older save does not include the floor plan image. Save the project again with the PDF open to store it.</span>
      </div>
    `;
  }

  fileStatus.textContent = floor?.source_file_name ? `${floor.source_file_name} loaded from saved project` : `${project.name} loaded from saved project`;

  function selectRoom(index) {
    const room = rooms[index];
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
    arqisUpdateSavedPlanOverlay(rooms, room.id);
    if (typeof calculate === "function") calculate();
  }

  rooms.forEach((room, index) => {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = `room-tab${index === 0 ? " active" : ""}`;
    tab.textContent = room.name;
    tab.addEventListener("click", () => selectRoom(index));
    tabs.append(tab);
  });

  const areas = rooms.map(arqisRoomArea).filter(Number.isFinite);
  const total = areas.reduce((sum, area) => sum + area, 0);
  cadStatus.textContent = floor?.preview_image_url ? "Saved floor plan loaded" : "Saved project loaded";
  cadMessage.textContent = floor?.preview_image_url
    ? `${project.name} loaded with the saved floor plan and ${rooms.length} saved room${rooms.length === 1 ? "" : "s"}.`
    : `${project.name} loaded with ${rooms.length} saved room${rooms.length === 1 ? "" : "s"}. Save again with the PDF open to keep the plan image too.`;
  cadShapeCount.textContent = `${rooms.length}`;
  cadLargestArea.textContent = areas.length ? `${Math.max(...areas).toFixed(2)} m²` : "--";
  cadTotalArea.textContent = areas.length ? `${total.toFixed(2)} m²` : "--";
  cadTotalFeet.textContent = areas.length ? `${(total * 10.7639).toFixed(2)} ft²` : "--";

  arqisRenderSavedPlan(floor, rooms, rooms[0]?.id || "");
  if (rooms.length) {
    selectRoom(0);
  } else {
    document.querySelector("#roomTitle").textContent = floor?.name || project.name;
    document.querySelector("#selectedRoomName").textContent = "No room selected";
    document.querySelector("#selectedRoomArea").textContent = "--";
    document.querySelector("#selectedRoomFeet").textContent = "--";
    arqisDrawLoadedRoom({ name: "No room selected", polygon: [] });
  }
}

window.workspaceFetchProject = arqisFetchProjectWithLatestFloor;
window.arqisRenderLoadedProject = arqisRenderProjectWithSavedFloor;

async function arqisOpenSavedProjectWithFloorPreview(projectId, status) {
  if (!projectId) {
    status.textContent = "Choose a saved project first";
    return;
  }
  status.textContent = "Opening saved project...";
  const project = await arqisFetchProjectWithLatestFloor(projectId);
  const floor = project.floors?.[0] || null;
  document.querySelector("#arqisClientName").value = project.clients?.name || "";
  document.querySelector("#arqisProjectName").value = project.name || "";
  arqisRenderProjectWithSavedFloor(project, floor);
  status.textContent = `Opened ${project.clients?.name || "client"} / ${project.name}`;
}

async function arqisSaveProjectWithFloorPreview(status, saveButton) {
  const clientName = document.querySelector("#arqisClientName")?.value?.trim();
  const projectName = document.querySelector("#arqisProjectName")?.value?.trim();
  let projectId = document.querySelector("#arqisProjectSelect")?.value || "";

  if (!clientName || !projectName) {
    status.textContent = "Add client and project name first";
    return;
  }

  saveButton.disabled = true;
  status.textContent = "Saving project and floor plan...";

  try {
    const db = await arqisInitDb();
    const rooms = arqisCollectRooms();
    const previewImage = arqisCaptureFloorPreview();

    if (!projectId) {
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
      projectId = project.id;
    }

    const { data: floor, error: floorError } = await db
      .from("floors")
      .insert({
        project_id: projectId,
        name: document.querySelector("#roomTitle")?.textContent || "Floor 1",
        source_file_name: arqisCurrentFileName(),
        source_file_type: arqisCurrentFileName()?.split(".").pop()?.toLowerCase() || null,
        preview_image_url: previewImage
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

    status.textContent = previewImage
      ? `Saved ${clientName} / ${projectName} with the floor plan and ${rooms.length} room${rooms.length === 1 ? "" : "s"}`
      : `Saved ${clientName} / ${projectName} with ${rooms.length} room${rooms.length === 1 ? "" : "s"}. Upload/open the PDF before saving to keep the plan image.`;
    await arqisRefreshProjectList();
    const projectSelect = document.querySelector("#arqisProjectSelect");
    if (projectSelect) projectSelect.value = projectId;
  } catch (error) {
    status.textContent = typeof arqisFriendlyDbError === "function" ? arqisFriendlyDbError(error) : error.message || "Save failed";
  } finally {
    saveButton.disabled = false;
  }
}

window.addEventListener("click", (event) => {
  const saveButton = event.target?.closest?.("#arqisSaveProjectBtn");
  if (saveButton) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    arqisSaveProjectWithFloorPreview(document.querySelector("#arqisSaveStatus"), saveButton);
    return;
  }

  const openButton = event.target?.closest?.("#arqisOpenProjectBtn");
  if (openButton) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    arqisOpenSavedProjectWithFloorPreview(
      document.querySelector("#arqisProjectSelect")?.value,
      document.querySelector("#arqisSaveStatus")
    ).catch((error) => {
      document.querySelector("#arqisSaveStatus").textContent = typeof arqisFriendlyDbError === "function" ? arqisFriendlyDbError(error) : error.message || "Could not open saved project";
    });
  }
}, true);
