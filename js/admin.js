const adminMessage = document.querySelector("#admin-message");

function setBusy(button, busy, busyText) {
  if (!button.dataset.originalText) button.dataset.originalText = button.textContent;
  button.disabled = busy;
  button.textContent = busy ? busyText : button.dataset.originalText;
}

function todayInSaoPaulo() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric", month: "2-digit", day: "2-digit"
  }).format(new Date());
}

function displayValue(value) {
  return value === null || value === undefined || value === "" ? "—" : String(value);
}

function addDetail(container, label, value) {
  const item = document.createElement("div");
  const title = document.createElement("span");
  const content = document.createElement("strong");
  title.textContent = label;
  content.textContent = displayValue(value);
  item.append(title, content);
  container.appendChild(item);
}

function renderAgenda(items) {
  const list = document.querySelector("#agenda-list");
  list.replaceChildren();
  if (!items?.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "Nenhum agendamento encontrado neste período.";
    list.appendChild(empty);
    return;
  }

  items.forEach((appointment) => {
    const card = document.createElement("article");
    card.className = "appointment-card";
    const heading = document.createElement("div");
    heading.className = "card-heading";
    const name = document.createElement("h3");
    name.textContent = displayValue(appointment.clienteNome);
    const status = document.createElement("span");
    status.className = "status-badge";
    status.textContent = displayValue(appointment.status);
    heading.append(name, status);
    const details = document.createElement("div");
    details.className = "card-details";
    addDetail(details, "Telefone", appointment.clientePhone);
    addDetail(details, "Profissional", appointment.profissionalNome);
    addDetail(details, "Serviço", appointment.servicoNome);
    addDetail(details, "Data", appointment.dataBr);
    addDetail(details, "Horário", `${displayValue(appointment.horaInicio)} – ${displayValue(appointment.horaFim)}`);
    addDetail(details, "Total", appointment.totalPrice);
    addDetail(details, "Depósito", appointment.depositStatus);
    addDetail(details, "Pagamento", appointment.paymentStatus);
    card.append(heading, details);
    list.appendChild(card);
  });
}

async function loadAgenda(event) {
  event?.preventDefault();
  const button = document.querySelector("#load-agenda-button");
  setBusy(button, true, "Carregando...");
  showMessage(adminMessage, "");
  try {
    const { data, error } = await supabaseClient.rpc("listar_agenda_staff", {
      p_data_inicio: document.querySelector("#data-inicio").value,
      p_data_fim: document.querySelector("#data-fim").value,
      p_profissional_id: null,
      p_statuses: null
    });
    if (error) throw error;
    renderAgenda(data);
  } catch (error) {
    renderAgenda([]);
    showMessage(adminMessage, readableError(error, "Não foi possível carregar a agenda."));
  } finally {
    setBusy(button, false, "");
  }
}

function fillSelect(selectId, items, nameFields) {
  const select = document.querySelector(selectId);
  items.forEach((item) => {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = nameFields.map((field) => item[field]).find(Boolean) || "Sem nome";
    select.appendChild(option);
  });
}

async function loadCatalogs() {
  const [professionalsResult, servicesResult] = await Promise.all([
    supabaseClient.from("profissionais").select("*").eq("active", true),
    supabaseClient.from("servicos").select("*").eq("active", true)
  ]);
  if (professionalsResult.error) throw professionalsResult.error;
  if (servicesResult.error) throw servicesResult.error;
  fillSelect("#profissional", professionalsResult.data || [], ["nome", "name"]);
  fillSelect("#servico", servicesResult.data || [], ["nome", "name"]);
}

function normalizeTime(item) {
  const raw = typeof item === "string" ? item :
    item?.horario ?? item?.hora ?? item?.start_time ?? item?.horaInicio ?? item?.startAt;
  if (!raw) return null;
  const match = String(raw).match(/(?:T|^)(\d{2}:\d{2})/);
  return match ? match[1] : null;
}

function renderTimes(items) {
  const container = document.querySelector("#available-times");
  const selectedInput = document.querySelector("#selected-time");
  const selectedLabel = document.querySelector("#selected-time-label");
  const createButton = document.querySelector("#create-button");
  container.replaceChildren();
  selectedInput.value = "";
  selectedLabel.textContent = "";
  createButton.disabled = true;

  const times = (items || []).map(normalizeTime).filter(Boolean);
  if (!times.length) {
    const empty = document.createElement("span");
    empty.className = "muted";
    empty.textContent = "Nenhum horário disponível para esta data.";
    container.appendChild(empty);
    return;
  }

  times.forEach((time) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "time-button";
    button.textContent = time;
    button.addEventListener("click", () => {
      container.querySelectorAll("button").forEach((item) => item.classList.remove("selected"));
      button.classList.add("selected");
      selectedInput.value = time;
      selectedLabel.textContent = `Horário selecionado: ${time}`;
      createButton.disabled = false;
    });
    container.appendChild(button);
  });
}

async function searchAvailableTimes() {
  const professionalId = document.querySelector("#profissional").value;
  const serviceId = document.querySelector("#servico").value;
  const date = document.querySelector("#appointment-date").value;
  if (!professionalId || !serviceId || !date) {
    showMessage(adminMessage, "Selecione profissional, serviço e data para buscar horários.");
    return;
  }

  const button = document.querySelector("#search-times-button");
  setBusy(button, true, "Buscando...");
  showMessage(adminMessage, "");
  try {
    const { data, error } = await supabaseClient.rpc("get_horarios_disponiveis", {
      p_profissional_id: professionalId,
      p_servico_id: serviceId,
      p_data: date,
      p_intervalo_minutos: 30
    });
    if (error) throw error;
    renderTimes(data);
  } catch (error) {
    renderTimes([]);
    showMessage(adminMessage, readableError(error, "Não foi possível buscar os horários."));
  } finally {
    setBusy(button, false, "");
  }
}

function buildSaoPauloTimestamp(date, time) {
  return `${date}T${time}:00-03:00`;
}

async function createAppointment(event) {
  event.preventDefault();
  const time = document.querySelector("#selected-time").value;
  if (!time) {
    showMessage(adminMessage, "Escolha um horário disponível antes de criar o agendamento.");
    return;
  }

  const button = document.querySelector("#create-button");
  setBusy(button, true, "Criando...");
  showMessage(adminMessage, "");
  try {
    const date = document.querySelector("#appointment-date").value;
    const { error } = await supabaseClient.rpc("solicitar_agendamento_recepcao", {
      p_profissional_id: document.querySelector("#profissional").value,
      p_servico_id: document.querySelector("#servico").value,
      p_start_at: buildSaoPauloTimestamp(date, time),
      p_cliente_nome: document.querySelector("#cliente-nome").value.trim(),
      p_cliente_phone: document.querySelector("#cliente-phone").value.trim(),
      p_cliente_email: document.querySelector("#cliente-email").value.trim() || null,
      p_cliente_id: null,
      p_appointment_type: "normal",
      p_requires_deposit_override: null,
      p_deposit_percent_override: null,
      p_notes: null
    });
    if (error) throw error;
    showMessage(adminMessage, "Agendamento criado com sucesso.", "success");
    document.querySelector("#appointment-form").reset();
    renderTimes([]);
    await loadAgenda();
  } catch (error) {
    showMessage(adminMessage, readableError(error, "Não foi possível criar o agendamento."));
  } finally {
    setBusy(button, false, "");
    button.disabled = !document.querySelector("#selected-time").value;
  }
}

async function initializeAdmin() {
  try {
    const access = await requireAdminAccess();
    if (!access) return;
    const displayName = access.profile.nome || access.profile.name || access.profile.full_name;
    document.querySelector("#logged-user").textContent = displayName
      ? `${displayName} · ${access.session.user.email}`
      : access.session.user.email;

    const today = todayInSaoPaulo();
    document.querySelector("#data-inicio").value = today;
    document.querySelector("#data-fim").value = today;
    document.querySelector("#appointment-date").value = today;
    await loadCatalogs();
    await loadAgenda();
  } catch (error) {
    showMessage(adminMessage, readableError(error, "Não foi possível iniciar o painel."));
  }
}

document.querySelector("#logout-button").addEventListener("click", () => signOutAndRedirect());
document.querySelector("#agenda-form").addEventListener("submit", loadAgenda);
document.querySelector("#search-times-button").addEventListener("click", searchAvailableTimes);
document.querySelector("#appointment-form").addEventListener("submit", createAppointment);
initializeAdmin();
