async function arqisSaveIntoCurrentProject(event) {
  if (event.target?.id !== "arqisSaveProjectBtn") return;
  event.preventDefault();
  event.stopImmediatePropagation();

  const status = document.querySelector("#arqisSaveStatus");
  const saveButton = document.querySelector("#arqisSaveProjectBtn");
  const clientName = document.querySelector("#arqisClientName")?.value?.trim();
  const projectName = document.querySelector("#arqisProjectName")?.value?.trim();
  let projectId = document.querySelector("#arqisProjectSelect")?.value || "";

  if (!clientName || !projectName) {
    status.textContent = "Add client and project name first";
    return;
  }

  saveButton.disabled = true;
  status.textContent = "Saving to Supabase...";

  try {
    const db = await arqisInitDb();
    const rooms = arqisCollectRooms();

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
    const projectSelect = document.querySelector("#arqisProjectSelect");
    if (projectSelect) projectSelect.value = projectId;
  } catch (error) {
    status.textContent = error.message || "Save failed";
  } finally {
    saveButton.disabled = false;
  }
}

document.addEventListener("click", arqisSaveIntoCurrentProject, true);
