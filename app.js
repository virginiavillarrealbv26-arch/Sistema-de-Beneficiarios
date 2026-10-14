const STORAGE_KEY = "sgba_state_v1";
const API_BASE = location.protocol === "file:" ? "" : "/api";

const state = migrateState(loadState());
let currentView = "dashboard";
let currentReportRows = [];
let currentReportMeta = { title: "reporte", from: "", to: "" };
let remoteSyncEnabled = Boolean(API_BASE);
let syncTimer = null;
const chartColors = ["#265dd8", "#0f766e", "#d97706", "#b42318", "#7c3aed", "#0891b2", "#be123c", "#4d7c0f"];
const districtColors = ["#4f8ef7", "#36b37e", "#f59e0b", "#ef6f6c", "#7c6ae2"];
const districtPolygons = {
  10: "128,48 220,42 270,88 262,154 172,176 104,142 96,88",
  11: "68,36 126,46 104,142 34,120 18,70",
  12: "172,176 262,154 280,236 214,248 150,226 136,196",
  13: "34,120 104,142 136,196 86,238 22,196 10,148",
  14: "214,248 280,236 310,250 304,198 262,154 220,42 172,176"
};
const districtRoads = [
  "M 20 80 L 310 80 M 52 20 L 52 250 M 118 16 L 118 252 M 240 18 L 240 255 M 20 160 L 310 160 M 20 220 L 310 220 M 160 18 L 160 252",
  "M 70 120 L 250 120 M 132 32 L 132 196 M 208 44 L 208 236 M 94 178 L 272 178"
];

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const permissions = {
  Administrador: {
    beneficiarios: true, ayudas: true, catalogos: true, reportes: true, usuarios: true, auditoria: true
  },
  Operador: {
    beneficiarios: true, ayudas: true, catalogos: false, reportes: true, usuarios: false, auditoria: false
  },
  Consulta: {
    beneficiarios: false, ayudas: false, catalogos: false, reportes: true, usuarios: false, auditoria: false
  }
};

function defaultState() {
  const today = new Date().toISOString().slice(0, 10);
  return {
    nextId: 200,
    currentUserId: 1,
    users: [
      { id: 1, username: "admin", fullName: "Administrador General", role: "Administrador", phone: "2804000001", active: true, barrioId: 10 },
      { id: 2, username: "operador01", fullName: "Operador de Asistencia", role: "Operador", phone: "2804000002", active: true, barrioId: 11 },
      { id: 3, username: "consulta01", fullName: "Usuario de Consulta", role: "Consulta", phone: "2804000003", active: true, barrioId: 12 }
    ],
    barrios: [
      item(10, "Centro"), item(11, "Norte"), item(12, "Sur"), item(13, "Oeste"), item(14, "Rural")
    ],
    tipos: [
      item(20, "Chapas"), item(21, "Alimentos"), item(22, "Colchones"), item(23, "Materiales"), item(24, "Medicamentos"), item(25, "Otros")
    ],
    motivos: [
      item(30, "Emergencia"), item(31, "Salud"), item(32, "Vivienda"), item(33, "Inundacion"), item(34, "Situacion economica"), item(35, "Otros")
    ],
    beneficiaries: [
      beneficiary(100, "Mariana", "Paredes", "30111222", "2804551001", "1988-04-12", 4, 10, "Familia con asistencia alimentaria recurrente.", true, "2026-08-01"),
      beneficiary(101, "Luis", "Arce", "28777111", "2804551002", "1979-09-20", 2, 12, "Solicito materiales por emergencia habitacional.", true, "2026-08-02"),
      beneficiary(102, "Camila", "Rios", "41999888", "2804551003", "2001-01-15", 3, 11, "", true, "2026-08-03"),
      beneficiary(103, "Jorge", "Molina", "25000123", "2804551004", "1968-07-30", 1, 13, "Inactivo por cambio de domicilio.", false, "2026-07-28")
    ],
    aids: [
      aid(150, 100, 21, 34, 8, today, "Entrega mensual", 2),
      aid(151, 101, 20, 32, 12, today, "Reparacion de techo", 2),
      aid(152, 102, 22, 30, 2, "2026-08-03", "Emergencia familiar", 1)
    ],
    audit: []
  };
}

function item(id, name) {
  return { id, name, active: true };
}

function beneficiary(id, name, lastName, dni, phone, birthDate, familySize, barrioId, notes, active, createdAt = new Date().toISOString().slice(0, 10)) {
  return { id, name, lastName, dni, phone, birthDate, familySize, barrioId, notes, active, createdAt };
}

function aid(id, beneficiaryId, typeId, reasonId, quantity, aidDate, notes, userId, typeOther = "", reasonOther = "") {
  return {
    id, beneficiaryId, typeId, reasonId, quantity, aidDate, notes, userId, typeOther, reasonOther,
    createdAt: new Date().toISOString()
  };
}

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) {
    const initial = defaultState();
    initial.audit.push(auditEntry(initial, "Sistema", "Inicializacion", "Datos de demostracion cargados"));
    return initial;
  }
  try {
    return JSON.parse(saved);
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return defaultState();
  }
}

function migrateState(source) {
  const today = new Date().toISOString().slice(0, 10);
  source.users = (source.users || []).map((user, index) => ({
    ...user,
    barrioId: user.barrioId ?? [10, 11, 12][index % 3] ?? 10
  }));
  source.beneficiaries = (source.beneficiaries || []).map((b) => ({ ...b, createdAt: b.createdAt || today }));
  source.aids = (source.aids || []).map((a) => ({ ...a, createdAt: a.createdAt || `${a.aidDate || today}T00:00:00.000Z` }));
  source.audit = source.audit || [];
  saveMigratedState(source);
  return source;
}

function saveMigratedState(source) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(source));
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  scheduleRemoteSync();
}

async function hydrateFromApi() {
  if (!remoteSyncEnabled) return;
  try {
    const response = await fetch(`${API_BASE}/state`);
    if (!response.ok) throw new Error("API no disponible");
    const remoteState = await response.json();
    if (remoteState?.users?.length) {
      Object.keys(state).forEach((key) => delete state[key]);
      Object.assign(state, migrateState(remoteState));
      renderAll();
    } else {
      await syncRemoteNow();
    }
  } catch (error) {
    remoteSyncEnabled = false;
    console.warn("Sin conexion al backend. Se usa almacenamiento local.", error);
  }
}

function scheduleRemoteSync() {
  if (!remoteSyncEnabled) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(syncRemoteNow, 500);
}

async function syncRemoteNow() {
  if (!remoteSyncEnabled) return;
  try {
    const response = await fetch(`${API_BASE}/state`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state)
    });
    if (!response.ok) throw new Error("No se pudo sincronizar con la API");
  } catch (error) {
    console.warn("No se pudo sincronizar con el backend. Los datos quedan en localStorage.", error);
  }
}

function nextId() {
  state.nextId += 1;
  return state.nextId;
}

function currentUser() {
  return state.users.find((user) => user.id === Number(state.currentUserId)) || state.users[0];
}

function can(action) {
  const user = currentUser();
  return Boolean(permissions[user.role]?.[action]);
}

function auditEntry(sourceState, module, action, detail, before = null, after = null) {
  const user = sourceState.users.find((u) => u.id === Number(sourceState.currentUserId)) || sourceState.users[0];
  return {
    id: Date.now() + Math.random(),
    timestamp: new Date().toISOString(),
    userId: user?.id || 0,
    username: user?.username || "sistema",
    module,
    action,
    detail,
    before,
    after
  };
}

function addAudit(module, action, detail, before = null, after = null) {
  state.audit.unshift(auditEntry(state, module, action, detail, before, after));
  saveState();
}

function init() {
  bindNavigation();
  bindForms();
  bindActions();
  renderAll();
  hydrateFromApi();
}

function bindNavigation() {
  $$(".nav-item").forEach((button) => {
    button.addEventListener("click", () => showView(button.dataset.view));
  });
  $$("[data-view-target]").forEach((button) => {
    button.addEventListener("click", () => showView(button.dataset.viewTarget));
  });
}

function showView(view) {
  currentView = view;
  $$(".view").forEach((section) => section.classList.toggle("active", section.id === view));
  $$(".nav-item").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
  $("#viewTitle").textContent = titleFor(view);
  renderAll();
}

function titleFor(view) {
  return {
    dashboard: "Dashboard",
    beneficiarios: "Gestion de beneficiarios",
    ayudas: "Gestion de ayudas",
    catalogos: "Categorias",
    reportes: "Reportes",
    usuarios: "Usuarios y seguridad",
    auditoria: "Auditoria"
  }[view] || "Sistema";
}

function bindForms() {
  $("#currentUser").addEventListener("change", (event) => {
    state.currentUserId = Number(event.target.value);
    addAudit("Seguridad", "Cambio de usuario activo", `Sesion operando como ${currentUser().username}`);
    renderAll();
  });

  $$("[data-close]").forEach((button) => button.addEventListener("click", () => button.closest("dialog").close()));

  $("#beneficiaryForm").addEventListener("submit", saveBeneficiary);
  $("#aidForm").addEventListener("submit", saveAid);
  $("#catalogForm").addEventListener("submit", saveCatalog);
  $("#userForm").addEventListener("submit", saveUser);

  $("#aidType").addEventListener("change", toggleOtherFields);
  $("#aidReason").addEventListener("change", toggleOtherFields);
}

function bindActions() {
  $("#openBeneficiaryModal").addEventListener("click", () => openBeneficiaryDialog());
  $("#newBeneficiaryBtn").addEventListener("click", () => openBeneficiaryDialog());
  $("#newAidBtn").addEventListener("click", () => openAidDialog());
  $("#newUserBtn").addEventListener("click", () => openUserDialog());
  $("#seedDataBtn").addEventListener("click", () => {
    if (!confirm("Esto reemplazara los datos locales por datos de demostracion. Continuar?")) return;
    const fresh = defaultState();
    Object.keys(state).forEach((key) => delete state[key]);
    Object.assign(state, fresh);
    addAudit("Sistema", "Restaurar demo", "Datos de demostracion restaurados");
    renderAll();
  });

  ["beneficiarySearch", "beneficiaryStatusFilter", "aidSearch", "aidTypeFilter", "aidReasonFilter", "auditSearch", "auditModuleFilter"].forEach((id) => {
    $(`#${id}`).addEventListener("input", renderAll);
  });
  ["dashboardTypeFilter", "dashboardBarrioFilter", "dashboardFrom", "dashboardTo"].forEach((id) => $(`#${id}`).addEventListener("change", renderDashboard));
  $("#clearDashboardDates").addEventListener("click", () => {
    $("#dashboardFrom").value = "";
    $("#dashboardTo").value = "";
    renderDashboard();
  });

  $("#runReportBtn").addEventListener("click", renderReport);
  $("#reportKind").addEventListener("change", renderReport);
  $("#reportFrom").addEventListener("change", renderReport);
  $("#reportTo").addEventListener("change", renderReport);
  $("#clearReportDates").addEventListener("click", () => {
    $("#reportFrom").value = "";
    $("#reportTo").value = "";
    renderReport();
  });

  $("#exportBeneficiariesBtn").addEventListener("click", () => exportCsv(exportName("beneficiarios"), beneficiaryRows().map(formatBeneficiaryExport), { title: "Beneficiarios" }));
  $("#exportAidsBtn").addEventListener("click", () => exportCsv(exportName("ayudas"), aidRows().map(formatAidExport), { title: "Ayudas" }));
  $("#exportAuditBtn").addEventListener("click", () => exportCsv(exportName("auditoria"), auditRows().map(formatAuditExport), { title: "Auditoria" }));
  $("#exportReportBtn").addEventListener("click", () => exportCsv(exportName(currentReportMeta.filenameBase, currentReportMeta.from, currentReportMeta.to), currentReportRows, currentReportMeta));

  $$("[data-catalog]").forEach((button) => button.addEventListener("click", () => openCatalogDialog(button.dataset.catalog)));
}

function renderAll() {
  renderUsersSelect();
  renderAccess();
  renderDashboard();
  renderBeneficiaries();
  renderAids();
  renderCatalogs();
  renderUsers();
  fillSelect($("#userBarrio"), activeItems(state.barrios), $("#userBarrio").value || currentUserBarrio().id || state.barrios[0]?.id || "");
  renderAudit();
  renderReport();
  renderUserBarrioMap();
}

function renderUsersSelect() {
  $("#currentUser").innerHTML = state.users.filter((u) => u.active).map((u) => option(u.id, `${u.username} - ${u.role}`)).join("");
  $("#currentUser").value = state.currentUserId;
  $("#roleHint").textContent = `Rol: ${currentUser().role}`;
}

function renderAccess() {
  const role = currentUser().role;
  if (currentView !== "dashboard" && !can(currentView)) {
    showView("dashboard");
    return;
  }
  $$(".nav-item").forEach((button) => {
    const view = button.dataset.view;
    const allowed = view === "dashboard" || can(view);
    button.disabled = !allowed;
    button.title = allowed ? "" : `Sin permiso para ${titleFor(view)} (${role})`;
  });
  $("#newBeneficiaryBtn").disabled = !can("beneficiarios");
  $("#openBeneficiaryModal").disabled = !can("beneficiarios");
  $("#newAidBtn").disabled = !can("ayudas");
  $("#newUserBtn").disabled = !can("usuarios");
}

function renderDashboard() {
  const activeBeneficiaries = state.beneficiaries.filter((b) => b.active);
  const from = $("#dashboardFrom").value;
  const to = $("#dashboardTo").value;
  const activeAids = dashboardAids(from, to);
  const selectedType = $("#dashboardTypeFilter").value || "all";
  const selectedBarrio = $("#dashboardBarrioFilter").value || "all";
  $("#kpiBeneficiarios").textContent = activeBeneficiaries.length;
  $("#kpiAyudas").textContent = activeAids.length;
  $("#kpiCantidad").textContent = activeAids.reduce((sum, aidItem) => sum + Number(aidItem.quantity), 0);
  $("#kpiBarrios").textContent = new Set(activeBeneficiaries.map((b) => b.barrioId)).size;

  fillSelect($("#dashboardTypeFilter"), [{ id: "all", name: "Todos los tipos" }, ...activeItems(state.tipos)], selectedType);
  fillSelect($("#dashboardBarrioFilter"), [{ id: "all", name: "Todos los barrios" }, ...activeItems(state.barrios)], selectedBarrio);
  renderBars("#chartTipos", groupAidsBy("typeId", $("#dashboardTypeFilter").value, from, to), state.tipos);
  renderPie("#pieBarrios", "#chartBarrios", groupAidsBy("barrioId", $("#dashboardBarrioFilter").value, from, to), state.barrios);
  renderBars("#chartMotivos", groupAidsBy("reasonId", "all", from, to), state.motivos);
  renderUserBarrioMap();
  const assignedBarrio = currentUserBarrio();
  const barrioLabel = document.getElementById("assignedBarrioLabel");
  if (barrioLabel) barrioLabel.textContent = assignedBarrio.name;

  $("#recentAuditRows").innerHTML = state.audit.slice(0, 6).map((entry) => `
    <tr><td>${formatDateTime(entry.timestamp)}</td><td>${entry.username}</td><td>${entry.action}</td><td>${entry.module}</td></tr>
  `).join("") || emptyRow(4);
}

function dashboardAids(from = "", to = "") {
  return state.aids.filter((aidItem) => {
    const beneficiaryItem = findBeneficiary(aidItem.beneficiaryId);
    if (!beneficiaryItem?.active) return false;
    return inRange(aidItem.aidDate, from, to);
  });
}

function groupAidsBy(field, filterValue, from = "", to = "") {
  const rows = dashboardAids(from, to).filter((aidItem) => {
    const beneficiaryItem = findBeneficiary(aidItem.beneficiaryId);
    if (field === "typeId" && filterValue !== "all") return aidItem.typeId === Number(filterValue);
    if (field === "barrioId" && filterValue !== "all") return beneficiaryItem.barrioId === Number(filterValue);
    return true;
  });
  return rows.reduce((acc, aidItem) => {
    const key = field === "barrioId" ? findBeneficiary(aidItem.beneficiaryId)?.barrioId : aidItem[field];
    acc[key] = (acc[key] || 0) + Number(aidItem.quantity);
    return acc;
  }, {});
}

function renderBars(selector, grouped, catalog) {
  const entries = Object.entries(grouped).sort((a, b) => b[1] - a[1]);
  const max = Math.max(...entries.map(([, value]) => value), 1);
  $(selector).innerHTML = entries.map(([id, value]) => {
    const label = catalog.find((item) => item.id === Number(id))?.name || "Sin dato";
    return `<div class="bar-row"><span>${label}</span><div class="bar-track"><div class="bar-fill" style="width:${(value / max) * 100}%"></div></div><strong>${value}</strong></div>`;
  }).join("") || `<p class="empty-state">Sin datos para mostrar.</p>`;
}

function renderPie(pieSelector, legendSelector, grouped, catalog) {
  const entries = Object.entries(grouped).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((sum, [, value]) => sum + value, 0);
  const pie = $(pieSelector);
  const legend = $(legendSelector);
  if (!entries.length || total === 0) {
    pie.style.background = "#e8edf6";
    pie.innerHTML = "<span>0</span>";
    legend.innerHTML = `<p class="empty-state">Sin datos para mostrar.</p>`;
    return;
  }

  let cursor = 0;
  const segments = entries.map(([, value], index) => {
    const start = cursor;
    cursor += (value / total) * 100;
    return `${chartColors[index % chartColors.length]} ${start}% ${cursor}%`;
  });
  pie.style.background = `conic-gradient(${segments.join(", ")})`;
  pie.innerHTML = `<span>${total}</span>`;
  legend.innerHTML = entries.map(([id, value], index) => {
    const label = catalog.find((item) => item.id === Number(id))?.name || "Sin dato";
    const pct = Math.round((value / total) * 100);
    return `<div class="legend-row"><span class="legend-color" style="background:${chartColors[index % chartColors.length]}"></span><strong>${label}</strong><span>${value} unidades</span><em>${pct}%</em></div>`;
  }).join("");
}

function renderBeneficiaries() {
  $("#beneficiaryRows").innerHTML = beneficiaryRows().map((beneficiaryItem) => `
    <tr>
      <td>${beneficiaryItem.dni}</td>
      <td><strong>${beneficiaryItem.lastName}, ${beneficiaryItem.name}</strong></td>
      <td>${catalogName(state.barrios, beneficiaryItem.barrioId)}</td>
      <td>${beneficiaryItem.phone}</td>
      <td>${beneficiaryItem.familySize}</td>
      <td>${statusBadge(beneficiaryItem.active)}</td>
      <td><div class="row-actions">
        <button class="ghost small" onclick="openBeneficiaryDialog(${beneficiaryItem.id})">Editar</button>
        <button class="ghost small" onclick="showBeneficiaryHistory(${beneficiaryItem.id})">Historial</button>
        <button class="ghost small" onclick="toggleBeneficiary(${beneficiaryItem.id})">${beneficiaryItem.active ? "Desactivar" : "Activar"}</button>
      </div></td>
    </tr>
  `).join("") || emptyRow(7);
}

function beneficiaryRows() {
  const term = normalize($("#beneficiarySearch")?.value || "");
  const status = $("#beneficiaryStatusFilter")?.value || "active";
  return state.beneficiaries.filter((b) => {
    const haystack = normalize(`${b.name} ${b.lastName} ${b.dni} ${b.phone} ${catalogName(state.barrios, b.barrioId)}`);
    if (status === "active" && !b.active) return false;
    if (status === "inactive" && b.active) return false;
    return haystack.includes(term);
  }).sort((a, b) => a.lastName.localeCompare(b.lastName));
}

function renderAids() {
  fillSelect($("#aidTypeFilter"), [{ id: "all", name: "Todos los tipos" }, ...activeItems(state.tipos)], $("#aidTypeFilter").value || "all");
  fillSelect($("#aidReasonFilter"), [{ id: "all", name: "Todos los motivos" }, ...activeItems(state.motivos)], $("#aidReasonFilter").value || "all");
  $("#aidRows").innerHTML = aidRows().map((aidItem) => {
    const beneficiaryItem = findBeneficiary(aidItem.beneficiaryId);
    return `
      <tr>
        <td>${formatDate(aidItem.aidDate)}</td>
        <td><strong>${beneficiaryItem ? `${beneficiaryItem.lastName}, ${beneficiaryItem.name}` : "Sin beneficiario"}</strong></td>
        <td>${aidTypeLabel(aidItem)}</td>
        <td>${aidReasonLabel(aidItem)}</td>
        <td>${aidItem.quantity}</td>
        <td>${findUser(aidItem.userId)?.username || "sistema"}</td>
        <td><div class="row-actions"><button class="ghost small" onclick="openAidDialog(${aidItem.id})">Editar</button></div></td>
      </tr>
    `;
  }).join("") || emptyRow(7);
}

function aidRows() {
  const term = normalize($("#aidSearch")?.value || "");
  const type = $("#aidTypeFilter")?.value || "all";
  const reason = $("#aidReasonFilter")?.value || "all";
  return state.aids.filter((aidItem) => {
    const beneficiaryItem = findBeneficiary(aidItem.beneficiaryId);
    const barrio = beneficiaryItem ? catalogName(state.barrios, beneficiaryItem.barrioId) : "";
    const haystack = normalize(`${beneficiaryItem?.name || ""} ${beneficiaryItem?.lastName || ""} ${aidTypeLabel(aidItem)} ${aidReasonLabel(aidItem)} ${barrio}`);
    if (type !== "all" && aidItem.typeId !== Number(type)) return false;
    if (reason !== "all" && aidItem.reasonId !== Number(reason)) return false;
    return haystack.includes(term);
  }).sort((a, b) => b.aidDate.localeCompare(a.aidDate));
}

function renderCatalogs() {
  renderCatalogList("barriosList", "barrios");
  renderCatalogList("tiposList", "tipos");
  renderCatalogList("motivosList", "motivos");
  fillSelect($("#beneficiaryBarrio"), activeItems(state.barrios), $("#beneficiaryBarrio").value);
  fillSelect($("#aidType"), activeItems(state.tipos), $("#aidType").value);
  fillSelect($("#aidReason"), activeItems(state.motivos), $("#aidReason").value);
  fillSelect($("#aidBeneficiary"), state.beneficiaries.filter((b) => b.active).map((b) => ({ id: b.id, name: `${b.lastName}, ${b.name} - DNI ${b.dni}` })), $("#aidBeneficiary").value);
}

function renderCatalogList(elementId, kind) {
  const rows = state[kind].map((catalogItem) => `
    <div class="catalog-item">
      <span>${catalogItem.name} ${statusBadge(catalogItem.active)}</span>
      <div class="row-actions">
        <button class="ghost small" onclick="openCatalogDialog('${kind}', ${catalogItem.id})">Editar</button>
        <button class="ghost small" onclick="toggleCatalog('${kind}', ${catalogItem.id})">${catalogItem.active ? "Desactivar" : "Activar"}</button>
      </div>
    </div>
  `).join("");
  $(`#${elementId}`).innerHTML = rows || `<p class="empty-state">Sin registros.</p>`;
}

function renderUsers() {
  $("#userRows").innerHTML = state.users.map((user) => `
    <tr>
      <td>${user.username}</td><td>${user.fullName}</td><td>${user.role}</td><td>${user.phone}</td><td>${statusBadge(user.active)}</td>
      <td><div class="row-actions">
        <button class="ghost small" onclick="openUserDialog(${user.id})">Editar</button>
        <button class="ghost small" onclick="toggleUser(${user.id})">${user.active ? "Desactivar" : "Activar"}</button>
      </div></td>
    </tr>
  `).join("") || emptyRow(6);
}

function renderAudit() {
  const modules = ["all", ...Array.from(new Set(state.audit.map((entry) => entry.module)))];
  const selectedModule = $("#auditModuleFilter").value || "all";
  $("#auditModuleFilter").innerHTML = modules.map((module) => option(module, module === "all" ? "Todos los modulos" : module)).join("");
  $("#auditModuleFilter").value = modules.includes(selectedModule) ? selectedModule : "all";
  $("#auditRows").innerHTML = auditRows().map((entry) => `
    <tr><td>${formatDateTime(entry.timestamp)}</td><td>${entry.username}</td><td>${entry.module}</td><td>${entry.action}</td><td>${entry.detail}</td></tr>
  `).join("") || emptyRow(5);
}

function auditRows() {
  const term = normalize($("#auditSearch")?.value || "");
  const module = $("#auditModuleFilter")?.value || "all";
  return state.audit.filter((entry) => {
    const haystack = normalize(`${entry.username} ${entry.module} ${entry.action} ${entry.detail}`);
    return (module === "all" || entry.module === module) && haystack.includes(term);
  });
}

function renderReport() {
  const kind = $("#reportKind")?.value || "beneficiarios";
  const from = $("#reportFrom")?.value;
  const to = $("#reportTo")?.value;
  const rangeText = reportRangeText(from, to);
  let headers = [];
  let rows = [];

  if (kind === "beneficiarios") {
    headers = ["Fecha alta", "DNI", "Apellido", "Nombre", "Barrio", "Telefono", "Integrantes", "Estado"];
    rows = state.beneficiaries.filter((b) => b.active && inRange(b.createdAt, from, to)).map(formatBeneficiaryExport);
  } else if (kind === "ayudas") {
    headers = ["Fecha", "Beneficiario", "Barrio", "Tipo", "Motivo", "Cantidad", "Responsable"];
    rows = state.aids.filter((a) => inRange(a.aidDate, from, to)).map(formatAidExport);
  } else {
    const groupField = { barrio: "barrioId", tipo: "typeId", motivo: "reasonId" }[kind];
    const catalog = { barrio: state.barrios, tipo: state.tipos, motivo: state.motivos }[kind];
    headers = ["Concepto", "Ayudas", "Cantidad entregada"];
    const grouped = {};
    state.aids.filter((a) => inRange(a.aidDate, from, to)).forEach((a) => {
      const key = groupField === "barrioId" ? findBeneficiary(a.beneficiaryId)?.barrioId : a[groupField];
      if (!grouped[key]) grouped[key] = { concepto: catalogName(catalog, key), ayudas: 0, cantidad: 0 };
      grouped[key].ayudas += 1;
      grouped[key].cantidad += Number(a.quantity);
    });
    rows = Object.values(grouped).map((r) => ({ Concepto: r.concepto, Ayudas: r.ayudas, "Cantidad entregada": r.cantidad }));
  }

  currentReportRows = rows;
  const reportLabel = $("#reportKind").selectedOptions[0]?.textContent || "Reporte";
  currentReportMeta = {
    title: reportLabel,
    filenameBase: reportLabel,
    from,
    to,
    subtitle: rangeText
  };
  $("#reportTitle").textContent = `${reportLabel}${rangeText ? ` - ${rangeText}` : ""}`;
  $("#reportCount").textContent = `${rows.length} registros`;
  $("#reportTable").innerHTML = `<thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${headers.map((h) => `<td>${row[h] ?? ""}</td>`).join("")}</tr>`).join("") || emptyRow(headers.length)}</tbody>`;
}

function openBeneficiaryDialog(id = null) {
  if (!can("beneficiarios")) return alert("El rol actual no tiene permiso para modificar beneficiarios.");
  clearMessage("beneficiaryMessage");
  const record = id ? findBeneficiary(id) : null;
  $("#beneficiaryModalTitle").textContent = record ? "Editar beneficiario" : "Nuevo beneficiario";
  $("#beneficiaryId").value = record?.id || "";
  $("#beneficiaryName").value = record?.name || "";
  $("#beneficiaryLastName").value = record?.lastName || "";
  $("#beneficiaryDni").value = record?.dni || "";
  $("#beneficiaryPhone").value = record?.phone || "";
  $("#beneficiaryBirth").value = record?.birthDate || "";
  $("#beneficiaryFamily").value = record?.familySize || 1;
  $("#beneficiaryBarrio").value = record?.barrioId || activeItems(state.barrios)[0]?.id || "";
  $("#beneficiaryActive").value = String(record?.active ?? true);
  $("#beneficiaryNotes").value = record?.notes || "";
  $("#beneficiaryDialog").showModal();
}

function saveBeneficiary(event) {
  event.preventDefault();
  const id = Number($("#beneficiaryId").value);
  const record = id ? findBeneficiary(id) : null;
  const draft = {
    id: id || nextId(),
    name: $("#beneficiaryName").value.trim(),
    lastName: $("#beneficiaryLastName").value.trim(),
    dni: $("#beneficiaryDni").value.trim(),
    phone: $("#beneficiaryPhone").value.trim(),
    birthDate: $("#beneficiaryBirth").value,
    familySize: Number($("#beneficiaryFamily").value),
    barrioId: Number($("#beneficiaryBarrio").value),
    active: $("#beneficiaryActive").value === "true",
    notes: $("#beneficiaryNotes").value.trim(),
    createdAt: record?.createdAt || new Date().toISOString().slice(0, 10)
  };

  const error = validateBeneficiary(draft, id);
  if (error) return showMessage("beneficiaryMessage", error);
  if (record) {
    const before = { ...record };
    Object.assign(record, draft);
    addAudit("Beneficiarios", "Modificar beneficiario", `${draft.lastName}, ${draft.name} DNI ${draft.dni}`, before, draft);
  } else {
    state.beneficiaries.push(draft);
    addAudit("Beneficiarios", "Alta beneficiario", `${draft.lastName}, ${draft.name} DNI ${draft.dni}`, null, draft);
  }
  saveState();
  $("#beneficiaryDialog").close();
  renderAll();
}

function validateBeneficiary(draft, id) {
  if (!draft.name || !draft.lastName || !draft.dni || !draft.phone || !draft.familySize || !draft.barrioId) return "Complete los campos obligatorios.";
  if (state.beneficiaries.some((b) => b.dni === draft.dni && b.id !== id)) return "El DNI ya existe.";
  if (draft.familySize < 1) return "La cantidad de integrantes debe ser como minimo 1.";
  if (draft.birthDate && age(draft.birthDate) < 16 && currentUser().role !== "Administrador") return "Solo Administrador puede autorizar beneficiarios menores de 16 anos.";
  if (!draft.birthDate && currentUser().role !== "Administrador") return "Solo Administrador puede omitir la fecha de nacimiento.";
  return "";
}

function openAidDialog(id = null) {
  if (!can("ayudas")) return alert("El rol actual no tiene permiso para registrar ayudas.");
  clearMessage("aidMessage");
  const record = id ? state.aids.find((a) => a.id === id) : null;
  $("#aidModalTitle").textContent = record ? "Editar ayuda" : "Registrar ayuda";
  $("#aidId").value = record?.id || "";
  $("#aidBeneficiary").value = record?.beneficiaryId || state.beneficiaries.find((b) => b.active)?.id || "";
  $("#aidType").value = record?.typeId || activeItems(state.tipos)[0]?.id || "";
  $("#aidTypeOther").value = record?.typeOther || "";
  $("#aidReason").value = record?.reasonId || activeItems(state.motivos)[0]?.id || "";
  $("#aidReasonOther").value = record?.reasonOther || "";
  $("#aidQuantity").value = record?.quantity || 1;
  $("#aidDate").value = record?.aidDate || new Date().toISOString().slice(0, 10);
  $("#aidNotes").value = record?.notes || "";
  toggleOtherFields();
  $("#aidDialog").showModal();
}

function saveAid(event) {
  event.preventDefault();
  const id = Number($("#aidId").value);
  const record = id ? state.aids.find((a) => a.id === id) : null;
  const draft = {
    id: id || nextId(),
    beneficiaryId: Number($("#aidBeneficiary").value),
    typeId: Number($("#aidType").value),
    reasonId: Number($("#aidReason").value),
    quantity: Number($("#aidQuantity").value),
    aidDate: $("#aidDate").value,
    notes: $("#aidNotes").value.trim(),
    typeOther: $("#aidTypeOther").value.trim(),
    reasonOther: $("#aidReasonOther").value.trim(),
    userId: record?.userId || currentUser().id,
    createdAt: record?.createdAt || new Date().toISOString()
  };
  const error = validateAid(draft);
  if (error) return showMessage("aidMessage", error);
  if (record) {
    const before = { ...record };
    Object.assign(record, draft);
    addAudit("Ayudas", "Modificar ayuda", `Ayuda ${draft.id} modificada`, before, draft);
  } else {
    state.aids.push(draft);
    addAudit("Ayudas", "Registrar ayuda", `${aidTypeLabel(draft)} para ${beneficiaryLabel(draft.beneficiaryId)}`, null, draft);
  }
  saveState();
  $("#aidDialog").close();
  renderAll();
}

function validateAid(draft) {
  const beneficiaryItem = findBeneficiary(draft.beneficiaryId);
  if (!beneficiaryItem) return "Seleccione un beneficiario.";
  if (!beneficiaryItem.active) return "No se pueden registrar ayudas a beneficiarios inactivos.";
  if (!draft.typeId || !draft.reasonId || !draft.aidDate) return "Complete los campos obligatorios.";
  if (draft.quantity < 1) return "La cantidad debe ser mayor o igual a 1.";
  if (isOther(state.tipos, draft.typeId) && !draft.typeOther) return "Indique el detalle del tipo Otros.";
  if (isOther(state.motivos, draft.reasonId) && !draft.reasonOther) return "Indique el detalle del motivo Otros.";
  return "";
}

function openCatalogDialog(kind, id = null) {
  if (!can("catalogos")) return alert("El rol actual no tiene permiso para modificar categorias.");
  clearMessage("catalogMessage");
  const record = id ? state[kind].find((item) => item.id === id) : null;
  $("#catalogKind").value = kind;
  $("#catalogId").value = record?.id || "";
  $("#catalogName").value = record?.name || "";
  $("#catalogModalTitle").textContent = record ? "Editar categoria" : "Nueva categoria";
  $("#catalogDialog").showModal();
}

function saveCatalog(event) {
  event.preventDefault();
  const kind = $("#catalogKind").value;
  const id = Number($("#catalogId").value);
  const name = $("#catalogName").value.trim();
  if (!name) return showMessage("catalogMessage", "Ingrese un nombre.");
  if (state[kind].some((item) => normalize(item.name) === normalize(name) && item.id !== id)) return showMessage("catalogMessage", "Ya existe un registro con ese nombre.");
  const record = id ? state[kind].find((item) => item.id === id) : null;
  if (record) {
    const before = { ...record };
    record.name = name;
    addAudit("Categorias", "Modificar categoria", `${kind}: ${name}`, before, record);
  } else {
    const created = { id: nextId(), name, active: true };
    state[kind].push(created);
    addAudit("Categorias", "Alta categoria", `${kind}: ${name}`, null, created);
  }
  saveState();
  $("#catalogDialog").close();
  renderAll();
}

function openUserDialog(id = null) {
  if (!can("usuarios")) return alert("El rol actual no tiene permiso para modificar usuarios.");
  clearMessage("userMessage");
  const record = id ? findUser(id) : null;
  $("#userId").value = record?.id || "";
  $("#username").value = record?.username || "";
  $("#userFullName").value = record?.fullName || "";
  $("#userPhone").value = record?.phone || "";
  $("#userRole").value = record?.role || "Operador";
  $("#userBarrio").value = record?.barrioId || state.barrios[0]?.id || "";
  $("#userActive").value = String(record?.active ?? true);
  $("#userModalTitle").textContent = record ? "Editar usuario" : "Nuevo usuario";
  $("#userDialog").showModal();
}

function saveUser(event) {
  event.preventDefault();
  const id = Number($("#userId").value);
  const draft = {
    id: id || nextId(),
    username: $("#username").value.trim(),
    fullName: $("#userFullName").value.trim(),
    phone: $("#userPhone").value.trim(),
    role: $("#userRole").value,
    barrioId: Number($("#userBarrio").value),
    active: $("#userActive").value === "true"
  };
  if (!draft.username || !draft.fullName || !draft.phone || !draft.barrioId) return showMessage("userMessage", "Complete los campos obligatorios.");
  if (state.users.some((u) => normalize(u.username) === normalize(draft.username) && u.id !== id)) return showMessage("userMessage", "El nombre de usuario ya existe.");
  const record = id ? findUser(id) : null;
  if (record) {
    const before = { ...record };
    Object.assign(record, draft);
    addAudit("Usuarios", "Modificar usuario", draft.username, before, draft);
  } else {
    state.users.push(draft);
    addAudit("Usuarios", "Alta usuario", draft.username, null, draft);
  }
  saveState();
  $("#userDialog").close();
  renderAll();
}

function toggleBeneficiary(id) {
  if (!can("beneficiarios")) return alert("Sin permiso para modificar beneficiarios.");
  const record = findBeneficiary(id);
  const before = { ...record };
  record.active = !record.active;
  addAudit("Beneficiarios", record.active ? "Activar beneficiario" : "Desactivar beneficiario", beneficiaryLabel(id), before, record);
  saveState();
  renderAll();
}

function toggleCatalog(kind, id) {
  if (!can("catalogos")) return alert("Sin permiso para modificar categorias.");
  const record = state[kind].find((item) => item.id === id);
  const before = { ...record };
  record.active = !record.active;
  addAudit("Categorias", record.active ? "Activar categoria" : "Desactivar categoria", `${kind}: ${record.name}`, before, record);
  saveState();
  renderAll();
}

function toggleUser(id) {
  if (!can("usuarios")) return alert("Sin permiso para modificar usuarios.");
  const record = findUser(id);
  const before = { ...record };
  record.active = !record.active;
  addAudit("Usuarios", record.active ? "Activar usuario" : "Desactivar usuario", record.username, before, record);
  saveState();
  renderAll();
}

function showBeneficiaryHistory(id) {
  const rows = state.aids.filter((aidItem) => aidItem.beneficiaryId === id).map((aidItem) => `${formatDate(aidItem.aidDate)} - ${aidTypeLabel(aidItem)} - ${aidReasonLabel(aidItem)} - Cantidad: ${aidItem.quantity}`);
  alert(rows.length ? rows.join("\n") : "El beneficiario no registra ayudas.");
}

function toggleOtherFields() {
  $("#aidTypeOtherWrap").classList.toggle("hidden", !isOther(state.tipos, Number($("#aidType").value)));
  $("#aidReasonOtherWrap").classList.toggle("hidden", !isOther(state.motivos, Number($("#aidReason").value)));
}

function formatBeneficiaryExport(b) {
  return {
    "Fecha alta": formatDate(b.createdAt),
    DNI: b.dni,
    Apellido: b.lastName,
    Nombre: b.name,
    Barrio: catalogName(state.barrios, b.barrioId),
    Telefono: b.phone,
    Integrantes: b.familySize,
    Estado: b.active ? "Activo" : "Inactivo"
  };
}

function formatAidExport(a) {
  const b = findBeneficiary(a.beneficiaryId);
  return {
    Fecha: formatDate(a.aidDate),
    Beneficiario: b ? `${b.lastName}, ${b.name}` : "Sin beneficiario",
    Barrio: b ? catalogName(state.barrios, b.barrioId) : "",
    Tipo: aidTypeLabel(a),
    Motivo: aidReasonLabel(a),
    Cantidad: a.quantity,
    Responsable: findUser(a.userId)?.username || "sistema"
  };
}

function formatAuditExport(a) {
  return {
    "Fecha y hora": formatDateTime(a.timestamp),
    Usuario: a.username,
    Modulo: a.module,
    Accion: a.action,
    Detalle: a.detail
  };
}

function exportCsv(filename, rows, meta = {}) {
  if (!rows.length) return alert("No hay datos para exportar.");
  const headers = Object.keys(rows[0]);
  const lines = [];
  if (meta.title) lines.push([meta.title].map(csvValue).join(";"));
  if (meta.subtitle) lines.push([meta.subtitle].map(csvValue).join(";"));
  if (!meta.subtitle && (meta.from || meta.to)) lines.push([`Periodo: ${reportRangeText(meta.from, meta.to)}`].map(csvValue).join(";"));
  if (lines.length) lines.push("");
  lines.push(headers.map(csvValue).join(";"));
  rows.forEach((row) => lines.push(headers.map((header) => csvValue(row[header])).join(";")));
  const csv = `\ufeff${lines.join("\r\n")}`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
  addAudit("Reportes", "Exportar CSV", filename);
}

function csvValue(value) {
  const text = String(value ?? "");
  return /[";\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function exportName(base, from = "", to = "") {
  const date = new Date().toISOString().slice(0, 10);
  const range = from || to ? `_${from || "inicio"}_a_${to || "hoy"}` : "";
  return `${normalizeFilename(base)}${range}_${date}.csv`;
}

function normalizeFilename(value) {
  return normalize(value).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "reporte";
}

function reportRangeText(from, to) {
  if (from && to) return `desde ${formatDate(from)} hasta ${formatDate(to)}`;
  if (from) return `desde ${formatDate(from)}`;
  if (to) return `hasta ${formatDate(to)}`;
  return "";
}

function activeItems(list) {
  return list.filter((item) => item.active);
}

function fillSelect(select, list, selected = "") {
  const current = selected || select.value;
  select.innerHTML = list.map((entry) => option(entry.id, entry.name)).join("");
  if (list.some((entry) => String(entry.id) === String(current))) select.value = current;
}

function option(value, label) {
  return `<option value="${value}">${label}</option>`;
}

function findBeneficiary(id) {
  return state.beneficiaries.find((b) => b.id === Number(id));
}

function findUser(id) {
  return state.users.find((u) => u.id === Number(id));
}

function beneficiaryLabel(id) {
  const b = findBeneficiary(id);
  return b ? `${b.lastName}, ${b.name} DNI ${b.dni}` : "Sin beneficiario";
}

function catalogName(list, id) {
  return list.find((item) => item.id === Number(id))?.name || "Sin dato";
}

function aidTypeLabel(aidItem) {
  const base = catalogName(state.tipos, aidItem.typeId);
  return aidItem.typeOther ? `${base}: ${aidItem.typeOther}` : base;
}

function aidReasonLabel(aidItem) {
  const base = catalogName(state.motivos, aidItem.reasonId);
  return aidItem.reasonOther ? `${base}: ${aidItem.reasonOther}` : base;
}

function isOther(list, id) {
  return normalize(catalogName(list, id)) === "otros";
}

function statusBadge(active) {
  return `<span class="badge ${active ? "ok" : "off"}">${active ? "Activo" : "Inactivo"}</span>`;
}

function emptyRow(cols) {
  return `<tr><td colspan="${cols}" class="empty-state">Sin registros.</td></tr>`;
}

function normalize(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function age(date) {
  const birth = new Date(date);
  const today = new Date();
  let years = today.getFullYear() - birth.getFullYear();
  const monthDelta = today.getMonth() - birth.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < birth.getDate())) years -= 1;
  return years;
}

function formatDate(date) {
  if (!date) return "";
  return new Date(`${date}T00:00:00`).toLocaleDateString("es-AR");
}

function formatDateTime(date) {
  return new Date(date).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });
}

function inRange(date, from, to) {
  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
}

function showMessage(id, text) {
  $(`#${id}`).textContent = text;
}

function clearMessage(id) {
  showMessage(id, "");
}

function currentUserBarrio() {
  const barrioId = Number(currentUser()?.barrioId || 0);
  return state.barrios.find((b) => Number(b.id) === barrioId) || state.barrios[0] || { id: 0, name: "Sin barrio" };
}

function renderUserBarrioMap() {
  const user = currentUser();
  const barrioId = Number(user?.barrioId || 0);
  const mapWrapper = document.getElementById("bellaVistaMap");
  if (!mapWrapper) return;

  const roads = districtRoads.map((path) => `<path d="${path}" stroke="#d6deec" stroke-width="2" fill="none" stroke-linecap="round" />`).join("");

  const mapSvg = `
    <svg viewBox="0 0 340 270" role="img" aria-label="Mapa urbano de Bella Vista, Tucumán">
      <defs>
        <linearGradient id="mapBg" x1="0" x2="1">
          <stop offset="0%" stop-color="#eef8ff"/>
          <stop offset="100%" stop-color="#edf7ef"/>
        </linearGradient>
        <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="5" stdDeviation="6" flood-opacity="0.18"/>
        </filter>
      </defs>
      <rect x="0" y="0" width="340" height="270" rx="18" fill="url(#mapBg)"/>
      <path d="M 18 34 L 112 20 L 312 40 L 324 246 L 208 256 L 48 234 L 18 168 Z" fill="#e4f0e4" stroke="#bfd5c1" stroke-width="2"/>
      ${roads}
      <path d="M 160 18 L 160 248" stroke="#b9c8dd" stroke-width="4" stroke-dasharray="8 8"/>
      <path d="M 84 104 L 244 104" stroke="#b9c8dd" stroke-width="4" stroke-dasharray="8 8"/>
      ${state.barrios.map((barrio, index) => {
        const polygon = districtPolygons[barrio.id] || "0,0 30,0 30,30 0,30";
        const active = Number(barrio.id) === barrioId;
        const color = active ? districtColors[index % districtColors.length] : "#dfeaf7";
        return `<polygon points="${polygon}" fill="${color}" stroke="${active ? '#0f766e' : '#8aa0bd'}" stroke-width="${active ? 4 : 2}" filter="url(#softShadow)" opacity="${active ? 1 : 0.9}" />`;
      }).join("")}
      <path d="M 112 78 L 154 70 L 200 86 L 198 138 L 154 146 L 106 130 Z" fill="#d4e6ff" stroke="#7ea7d8" stroke-width="2"/>
      <circle cx="154" cy="108" r="7" fill="#0f172a"/>
      <text x="170" y="30" font-size="13" font-weight="700" fill="#37506c" letter-spacing="2">BELLA VISTA</text>
      <text x="20" y="252" font-size="10" fill="#53708d">Tucumán · Argentina</text>
    </svg>
  `;

  mapWrapper.innerHTML = mapSvg + `<div class="district-marker" style="left:58%;top:50%;">${user?.fullName || "Usuario"}</div>`;

  const listing = document.getElementById("districtUserList");
  if (listing) {
    listing.innerHTML = state.users.filter((item) => item.active).map((item) => {
      const barrio = state.barrios.find((b) => Number(b.id) === Number(item.barrioId));
      const selected = Number(item.id) === Number(user.id);
      return `
        <li class="district-user ${selected ? "selected" : ""}">
          <span class="user-dot" style="background:${selected ? districtColors[(Number(item.barrioId) || 10) % districtColors.length] : "#c5d1e4"}"></span>
          <div>
            <strong>${item.fullName}</strong>
            <small>${barrio ? barrio.name : "Sin barrio"}</small>
          </div>
        </li>
      `;
    }).join("");
  }
}

window.openBeneficiaryDialog = openBeneficiaryDialog;
window.openAidDialog = openAidDialog;
window.openCatalogDialog = openCatalogDialog;
window.openUserDialog = openUserDialog;
window.toggleBeneficiary = toggleBeneficiary;
window.toggleCatalog = toggleCatalog;
window.toggleUser = toggleUser;
window.showBeneficiaryHistory = showBeneficiaryHistory;

init();
