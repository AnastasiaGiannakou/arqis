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
      linear-gradient(rgba(247,248,245,0.9), rgba(231,235,229,0.96)),
      repeating-linear-gradient(90deg, rgba(24,32,29,0.04) 0 1px, transparent 1px 80px),
      repeating-linear-gradient(0deg, rgba(24,32,29,0.04) 0 1px, transparent 1px 80px);
  }

  body.workspace-selecting .workspace-screen {
    display: grid;
    align-content: center;
  }

  .workspace-shell {
    width: min(920px, 100%);
    margin: 0 auto;
    display: grid;
    gap: 22px;
  }

  .workspace-head {
    display: grid;
    gap: 10px;
  }

  .workspace-head h1 {
    font-size: clamp(48px, 9vw, 92px);
    line-height: 0.95;
    color: var(--green-dark);
  }

  .workspace-head p:not(.eyebrow) {
    max-width: 58ch;
    color: var(--muted);
    line-height: 1.5;
  }

  .workspace-card {
    display: grid;
    gap: 16px;
    padding: 22px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: rgba(255,255,255,0.9);
    box-shadow: 0 18px 54px rgba(24,32,29,0.09);
  }

  .workspace-card h2 {
    font-size: 24px;
  }

  .workspace-card p {
    color: var(--muted);
    line-height: 1.45;
  }

  .workspace-step {
    display: none;
    gap: 16px;
  }

  .workspace-step.active {
    display: grid;
  }

  .workspace-mode {
    width: min(420px, 100%);
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

  .workspace-card button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .workspace-status {
    min-height: 20px;
    color: var(--muted);
    font-size: 13px;
    font-weight: 700;
  }

  .workspace-client-summary {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    align-items: center;
    padding: 12px 14px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: rgba(247,248,245,0.92);
  }

  .workspace-client-summary strong {
    display: block;
    font-size: 18px;
  }

  @media (max-width: 760px) {
    .workspace-screen { padding: 20px; }
    .workspace-card { padding: 18px; }
  }
`;
document.head.append(workspaceStyle);

let workspaceClient = null;
let workspaceProjects = [];
let workspaceMode = "existing";

function arqisFriendlyDbError(error) {
  const message = error?.message || String(error || "");
  if (message.toLowerCase().includes("row-level security")) {
    return "Supabase is blocking this save. Run the prototype save policies SQL in Supabase, then try again.";
  }
  if (message.toLowerCase().includes("failed to fetch")) {
    return "ARQIS could not reach Supabase. Check the connection and try again.";
  }
  return message || "Something went wrong.";
}

function workspaceCreateScreen() {
  if (document.querySelector("#workspaceScreen")) return;
  const screen = document.createElement("section");
  screen.className = "workspace-screen";
  screen.id = "workspaceScreen";
  screen.innerHTML = `
    <div class="workspace-shell">
      <header class="workspace-head">
        <p class="eyebrow">Client workspace</p>
        <h1>ARQIS</h1>
        <p>Start by choosing the client. Then choose an existing project for that client, or create a new project before opening the measuring workspace.</p>
      </header>

      <section class="workspace-card workspace-step active" id="workspaceClientStep" aria-label="Client step">
        <div>
          <p class="eyebrow">Client</p>
          <h2>Who is this for?</h2>
        </div>
        <div class="segmented workspace-mode" aria-label="Client mode">
          <input id="workspaceModeExisting" name="workspaceMode" type="radio" value="existing" checked>
          <label for="workspaceModeExisting">Sign in</label>
          <input id="workspaceModeNew" name="workspaceMode" type="radio" value="new">
          <label for="workspaceModeNew">New client</label>
        </div>
        <label>Client name<input id="workspaceClientName" type="text" placeholder="e.g. Nadia"></label>
        <button id="workspaceContinueClientBtn" type="button">Continue</button>
      </section>

      <section class="workspace-card workspace-step" id="workspaceProjectStep" aria-label="Project step">
        <div class="workspace-client-summary">
          <div>
            <span class="eyebrow">Client</span>
            <strong id="workspaceClientSummary">Client</strong>
          </div>
          <button class="secondary-action" id="workspaceBackToClientBtn" type="button">Change</button>
        </div>
        <div>
          <p class="eyebrow">Project</p>
          <h2>Choose project or create one</h2>
        </div>
        <label>Existing project<select id="workspaceProjectSelect"><option value="">Loading projects...</option></select></label>
        <div class="grid two">
          <button id="workspaceOpenProjectBtn" type="button">Open project</button>
          <button class="secondary-action" id="workspaceRefreshBtn" type="button">Refresh</button>
        </div>
        <label>New project name<input id="workspaceNewProjectName" type="text" placeholder="e.g. Athens house"></label>
        <button id="workspaceCreateProjectBtn" type="button">Create new project</button>
      </section>

      <p class="workspace-status" id="workspaceStatus"></p>
    </div>
  `;
  document.body.append(screen);

  document.querySelector("#workspaceContinueClientBtn").addEventListener("click", workspaceContinueClient);
  document.querySelector("#workspaceCreateProjectBtn").addEventListener("click", workspaceCreateProject);
  document.querySelector("#workspaceOpenProjectBtn").addEventListener("click", workspaceOpenSelectedProject);
  document.querySelector("#workspaceRefreshBtn").addEventListener("click", () => workspaceLoadProjects(workspaceClient?.id));
  document.querySelector("#workspaceBackToClientBtn").addEventListener("click", workspaceBackToClient);
  document.querySelectorAll("input[name='workspaceMode']").forEach((radio) => {
    radio.addEventListener("change", (event) => {
      workspaceMode = event.target.value;
      workspaceStatus(workspaceMode === "new" ? "Add the client name, then create their first project." : "Type an existing client name to sign in.");
    });
  });
}

function workspaceShow() {
  workspaceCreateScreen();
  document.body.classList.add("entered", "workspace-selecting");
  workspaceStatus("Type a client name to begin.");
}

function workspaceEnterProject() {
  document.body.classList.remove("workspace-selecting");
  document.body.classList.add("entered");
}

function workspaceStatus(message) {
  const status = document.querySelector("#workspaceStatus");
  if (status) status.textContent = message || "";
}

function workspaceSetStep(step) {
  document.querySelector("#workspaceClientStep")?.classList.toggle("active", step === "client");
  document.querySelector("#workspaceProjectStep")?.classList.toggle("active", step === "project");
}

function workspaceBackToClient() {
  workspaceClient = null;
  workspaceProjects = [];
  workspaceSetStep("client");
  workspaceStatus("Type a client name to begin.");
}

async function workspaceFindClientByName(clientName) {
  const db = await arqisInitDb();
  const { data, error } = await db
    .from("clients")
    .select("id,name,created_at")
    .ilike("name", clientName)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw error;
  return data?.[0] || null;
}

async function workspaceCreateClient(clientName) {
  const db = await arqisInitDb();
  const { data: client, error } = await db
    .from("clients")
    .insert({ name: clientName })
    .select("id,name,created_at")
    .single();
  if (error) throw error;
  return client;
}

async function workspaceContinueClient() {
  const clientName = document.querySelector("#workspaceClientName")?.value?.trim();
  if (!clientName) {
    workspaceStatus("Add a client name first.");
    return;
  }

  workspaceStatus(workspaceMode === "new" ? "Creating client..." : "Finding client...");
  try {
    const existingClient = await workspaceFindClientByName(clientName);
    if (workspaceMode === "existing") {
      if (!existingClient) {
        workspaceStatus(`No client called ${clientName} yet. Choose New client to create them.`);
        return;
      }
      workspaceClient = existingClient;
    } else {
      workspaceClient = existingClient || await workspaceCreateClient(clientName);
    }

    document.querySelector("#workspaceClientSummary").textContent = workspaceClient.name;
    document.querySelector("#workspaceNewProjectName").value = "";
    workspaceSetStep("project");
    await workspaceLoadProjects(workspaceClient.id);
  } catch (error) {
    workspaceStatus(arqisFriendlyDbError(error));
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
      projectSelect.append(new Option("No projects yet", ""));
      workspaceStatus("Create the first project for this client.");
      return;
    }
    projectSelect.append(new Option("Choose a project", ""));
    workspaceProjects.forEach((project) => projectSelect.append(new Option(project.name, project.id)));
    workspaceStatus("Choose a project, or create a new one.");
  } catch (error) {
    projectSelect.innerHTML = `<option value="">Could not load projects</option>`;
    workspaceStatus(arqisFriendlyDbError(error));
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

async function workspaceCreateProject() {
  const projectName = document.querySelector("#workspaceNewProjectName")?.value?.trim();
  if (!workspaceClient?.id) {
    workspaceStatus("Choose a client first.");
    return;
  }
  if (!projectName) {
    workspaceStatus("Add a project name first.");
    return;
  }

  workspaceStatus("Creating project...");
  try {
    const db = await arqisInitDb();
    const { data: project, error: projectError } = await db
      .from("projects")
      .insert({ client_id: workspaceClient.id, name: projectName, status: "draft" })
      .select("id,name")
      .single();
    if (projectError) throw projectError;

    workspacePrepareBlankProject(workspaceClient.name, project.name);
    workspaceEnterProject();
    await arqisRefreshProjectList();
    const projectSelect = document.querySelector("#arqisProjectSelect");
    if (projectSelect) projectSelect.value = project.id;
    document.querySelector("#arqisSaveStatus").textContent = `Created ${workspaceClient.name} / ${project.name}`;
  } catch (error) {
    workspaceStatus(arqisFriendlyDbError(error));
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
    workspaceStatus(arqisFriendlyDbError(error));
  }
}

document.querySelector("#enterAppBtn")?.addEventListener("click", () => {
  window.setTimeout(workspaceShow, 0);
});

workspaceCreateScreen();
