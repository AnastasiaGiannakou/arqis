function arqisFirstCaptureFloorPreview() {
  const savedImage = document.querySelector(".saved-plan-image");
  if (savedImage?.src?.startsWith("data:image/")) return savedImage.src;
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

function arqisFirstRoomsForSave() {
  if (typeof window.arqisRoomBridgeCollectRooms === "function") return window.arqisRoomBridgeCollectRooms();
  if (typeof window.arqisCollectRooms === "function") return window.arqisCollectRooms();
  return [];
}

async function arqisFirstSaveProject(event) {
  const saveButton = event.target?.closest?.("#arqisSaveProjectBtn");
  if (!saveButton) return;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();

  const status = document.querySelector("#arqisSaveStatus");
  const clientName = document.querySelector("#arqisClientName")?.value?.trim();
  const projectName = document.querySelector("#arqisProjectName")?.value?.trim();
  let projectId = document.querySelector("#arqisProjectSelect")?.value || "";

  if (!clientName || !projectName) {
    status.textContent = "Add client and project name first";
    return;
  }

  saveButton.disabled = true;
  status.textContent = "Saving project and marked rooms...";

  try {
    const db = await arqisInitDb();
    const rooms = arqisFirstRoomsForSave();
    const previewImage = arqisFirstCaptureFloorPreview();

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
      : `Saved ${clientName} / ${projectName} with ${rooms.length} room${rooms.length === 1 ? "" : "s"}`;
    if (typeof arqisRefreshProjectList === "function") await arqisRefreshProjectList();
    const projectSelect = document.querySelector("#arqisProjectSelect");
    if (projectSelect) projectSelect.value = projectId;
  } catch (error) {
    status.textContent = typeof arqisFriendlyDbError === "function" ? arqisFriendlyDbError(error) : error.message || "Save failed";
  } finally {
    saveButton.disabled = false;
  }
}

window.addEventListener("click", arqisFirstSaveProject, true);
