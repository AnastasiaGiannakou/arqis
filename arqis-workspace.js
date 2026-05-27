const workspaceStyle = document.createElement("style");
workspaceStyle.textContent = `
  body.workspace-selecting .entry-screen,
  body.workspace-selecting .app {
    display: none;
  }

  .workspace-screen {
    display: none;
    min-height: 100vh;
    padding: 32px;
    background:
      linear-gradient(rgba(247,248,245,0.88), rgba(231,235,229,0.94)),
      repeating-linear-gradient(90deg, rgba(24,32,29,0.04) 0 1px, transparent 1px 80px),
      repeating-linear-gradient(0deg, rgba(24,32,29,0.04) 0 1px, transparent 1px 80px);
  }

  body.workspace-selecting .workspace-screen {
    display: grid;
    align-content: center;
  }

  .workspace-shell {
    width: min(1120px, 100%);
    margin: 0 auto;
    display: grid;
    gap: 24px;
  }

  .workspace-head {
    display: flex;
    justify-content: space-between;
    gap: 18px;
    align-items: end;
  }

  .workspace-head h1 {
    font-size: clamp(44px, 8vw, 88px);
    line-height: 0.95;
    color: var(--green-dark);
  }

  .workspace-head p {
    max-width: 48ch;
    color: var(--muted);
    line-height: 1.5;
  }

  .workspace-actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 18px;
  }

  .workspace-card {
    display: grid;
    gap: 14px;
    padding: 22px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: rgba(255,255,255,0.86);
    box-shadow: 0 18px 54px rgba(24,32,29,0.09);
  }

  .workspace-card h2 {
    font-size: 21px;
  }

  .workspace-card p {
    color: var(--muted);
    line-height: 1.45;
  }

  .workspace-card button {
    min-height: 42px;
    border: 0;
    border-radius: 6px;
    background: var(--green-dark);
    color: white;
    font-weight: 850;
  }

  .workspace-card button.secondary-action {
    border: 1px solid var(--line);
    background: white;
    color: var(--ink);
  }

  .workspace-status {
    min-height: 20px;
    color: var(--muted);
    font-size: 13px;
    font-weight: 700;
  }

  @media (max-width: 760px) {
    .workspace-screen { padding: 20px; }
    .workspace-actions { grid-template-columns: 1fr; }
    .workspace-head { display: grid; }
  }
`;
document.head.append(workspaceStyle);

let workspaceClients = [];
let workspaceProjects = [];

function workspaceCreateScreen() {
  if (document.querySelector("#workspaceScreen")) return;
  const screen = document.createElement("section");
  screen.className = "workspace-screen";
  screen.id = "workspaceScreen";
  screen.innerHTML = `
    <div class="workspace-shell">
      <header class="workspace-head">
        <div>
          <p class="eyebrow">Client workspace</p>
          <h1>ARQIS</h1>
        </div>
        <p>Create a client first, then keep each project, floor, and marked room under that client.</p>
      </header>

      <div class="workspace-actions">
        <section class="workspace-card" aria-label="New client">
          <h2>New Client</h2>
          <p>Start a fresh client record and create the first project for them.</p>
          <label>Client name<input id="workspaceNewClientName" type="text" placeholder="e.g. Nadia"></label>
          <label>Project name<input id="workspaceNewProjectName" type="text" placeholder="e.g. Athens house"></label>
          <button id="workspaceCreateProjectBtn" type="button">Create client project</button>
        </section>

        <section class="workspace-card" aria-label="Open client">
          <h2>Open Client</h2>
          <p>Choose an existing client and open one of their saved projects.</p>
          <label>Client<select id="workspaceClientSelect"><option value="">Loading clients...</option></select></label>
          <label>Project<select id="workspaceProjectSelect"><option value="">Choose a client first</option></select></label>
          <div class="grid two">
            <button id="workspaceOpenProjectBtn" type="button">Open project</button>
            <button class="secondary-action" id="workspaceRefreshBtn" type="button">Refresh</button>
          </div>
        </section>
      </div>

      <p class="workspace-status" id="workspaceStatus"></p>
    </div>
  `;
  document.body.append(screen);

  document.querySelector("#workspaceCreateProjectBtn").addEventListener("click", workspaceCreateClientProject);
  document.querySelector("#workspaceOpenProjectBtn").addEventListener("click", workspaceOpenSelectedProject);
  document.querySelector("#workspaceRefreshBtn").addEventListener("click", workspaceLoadClients);
  document.querySelector("#workspaceClientSelect").addEventListener("change", (event) => workspaceLoadProjects(event.target.value));
}

function workspaceShow() {
  workspaceCreateScreen();
  document.body.classList.add("entered", "workspace-selecting");
  workspaceLoadClients();
}

function workspaceEnterProject() {
  document.body.classList.remove("workspace-selecting");
  document.body.classList.add("entered");
}

function workspaceStatus(message) {
  const status = document.querySelector("#workspaceStatus");
  if (status) status.textContent = message || "";
}

async function workspaceLoadClients() {
  workspaceCreateScreen();
  const clientSelect = document.querySelector("#workspaceClientSelect");
  const projectSelect = document.querySelector("#workspaceProjectSelect");
  clientSelect.innerHTML = `<option value="">Loading clients...</option>`;
  projectSelect.innerHTML = `<option value="">Choose a client first</option>`;

  try {
    const db = await arqisInitDb();
    const { data, error } = await db
      .from("clients")
      .select("id,name,created_at")
      .order("created_at", { ascending: false });
    if (error) throw error;

    workspaceClients = data || [];
    clientSelect.replaceChildren();
    if (!workspaceClients.length) {
      clientSelect.append(new Option("No clients yet", ""));
      workspaceStatus("Create the first client to begin.");
      return;
    }
    clientSelect.append(new Option("Choose a client", ""));
    workspaceClients.forEach((client) => clientSelect.append(new Option(client.name, client.id)));
    workspaceStatus("");
  } catch (error) {
    clientSelect.innerHTML = `<option value="">Could not load clients</option>`;
    workspaceStatus(error.message || "Could not load clients.");
  }
}

async function workspaceLoadProjects(clientId) {
  const projectSelect = document.querySelector("#workspaceProjectSelect");
  projectSelect.innerHTML = `<option value="">Loading projects...</option>`;
  if (!clientId) {
    projectSelect.innerHTML = `<option value="">Choose a client first</option>`;
    return;
  }

  try {
    const db = await arqisInitDb();
    const { data, error } = await db
      .from("projects")
      .select("id,name,created_at")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false });
    if (error) throw error;

    workspaceProjects = data || [];
    projectSelect.replaceChildren();
    if (!workspaceProjects.length) {
      projectSelect.append(new Option("No projects for this client", ""));
      return;
    }
    projectSelect.append(new Option("Choose a project", ""));
    workspaceProjects.forEach((project) => projectSelect.append(new Option(project.name, project.id)));
  } catch (error) {
    projectSelect.innerHTML = `<option value="">Could not load projects</option>`;
    workspaceStatus(error.message || "Could not load projects.");
  }
}

function workspacePrepareBlankProject(clientName, projectName) {
  document.querySelector("#arqisClientName").value = clientName;
  document.querySelector("#arqisProjectName").value = projectName;
  document.querySelector("#roomTitle").textContent = projectName;
  document.querySelector("#selectedRoomName").textContent = "No room selected";
  document.querySelector("#selectedRoomArea").textContent = "--";
  document.querySelector("#selectedRoomFeet").textContent = "--";
  document.querySelector("#fileStatus").textContent = "No plan uploaded yet";
  document.querySelector("#planPreviewBody").innerHTML = "<p>Upload a plan to start this project.</p>";
  document.querySelector("#roomTabs").replaceChildren();
  document.querySelector("#cadStatus").textContent = "Project ready";
  document.querySelector("#cadMessage").textContent = "Upload a PDF, DWG, or DXF plan to begin marking rooms for this project.";
  document.querySelector("#cadShapeCount").textContent = "0";
  document.querySelector("#cadLargestArea").textContent = "--";
  document.querySelector("#cadTotalArea").textContent = "--";
  document.querySelector("#cadTotalFeet").textContent = "--";
}

async function workspaceCreateClientProject() {
  const clientName = document.querySelector("#workspaceNewClientName")?.value?.trim();
  const projectName = document.querySelector("#workspaceNewProjectName")?.value?.trim();
  if (!clientName || !projectName) {
    workspaceStatus("Add both client name and project name.");
    return;
  }

  workspaceStatus("Creating client project...");
  try {
    const db = await arqisInitDb();
    const { data: client, error: clientError } = await db
      .from("clients")
      .insert({ name: clientName })
      .select("id,name")
      .single();
    if (clientError) throw clientError;

    const { data: project, error: projectError } = await db
      .from("projects")
      .insert({ client_id: client.id, name: projectName, status: "draft" })
      .select("id,name")
      .single();
    if (projectError) throw projectError;

    workspacePrepareBlankProject(client.name, project.name);
    workspaceEnterProject();
    await arqisRefreshProjectList();
    const projectSelect = document.querySelector("#arqisProjectSelect");
    if (projectSelect) projectSelect.value = project.id;
    document.querySelector("#arqisSaveStatus").textContent = `Created ${client.name} / ${project.name}`;
  } catch (error) {
    workspaceStatus(error.message || "Could not create client project.");
  }
}

async function workspaceFetchProject(projectId) {
  const db = await arqisInitDb();
  const { data: project, error } = await db
    .from("projects")
    .select("id,name,status,created_at,clients(id,name),floors(id,name,source_file_name,source_file_type,page_number,rooms(id,name,room_type,area_m2,floor_area_m2,length_m,width_m,height_m,ceiling_height_m,wall_lengths,polygon,costing,measured_dimensions))")
    .eq("id", projectId)
    .single();
  if (error) throw error;
  return project;
}

async function workspaceOpenSelectedProject() {
  const projectId = document.querySelector("#workspaceProjectSelect")?.value;
  if (!projectId) {
    workspaceStatus("Choose a project to open.");
    return;
  }

  workspaceStatus("Opening project...");
  try {
    const project = await workspaceFetchProject(projectId);
    const floor = project.floors?.[0] || null;
    document.querySelector("#arqisClientName").value = project.clients?.name || "";
    document.querySelector("#arqisProjectName").value = project.name || "";
    arqisRenderLoadedProject(project, floor);
    workspaceEnterProject();
    await arqisRefreshProjectList();
    const projectSelect = document.querySelector("#arqisProjectSelect");
    if (projectSelect) projectSelect.value = project.id;
    document.querySelector("#arqisSaveStatus").textContent = `Opened ${project.clients?.name || "client"} / ${project.name}`;
  } catch (error) {
    workspaceStatus(error.message || "Could not open project.");
  }
}

document.querySelector("#enterAppBtn")?.addEventListener("click", () => {
  window.setTimeout(workspaceShow, 0);
});

workspaceCreateScreen();
