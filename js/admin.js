const adminMessage = document.querySelector("#admin-message");
const appointmentMessage = document.querySelector("#appointment-message");
const agendaActionMessage = document.querySelector("#agenda-action-message");
const completionModal = document.querySelector("#completion-modal");
const completionForm = document.querySelector("#completion-form");
const completionMessage = document.querySelector("#completion-message");
const confirmCompletionButton = document.querySelector("#confirm-completion");
const cancelCompletionButton = document.querySelector("#cancel-completion");
const closeCompletionButton = document.querySelector("#close-completion-modal");
let appointmentMessageTimeout;
let completionAppointment = null;
let completionSaving = false;
let completionAllowedProfessionalIds = new Set();
let activeProfessionals = [];
let activeServices = [];
let currentUserRole = null;

const ACTIONABLE_STATUSES = new Set([
  "solicitado", "aguardando_sinal", "confirmado", "reagendamento_solicitado"
]);
const CLOSED_STATUSES = new Set([
  "concluido", "cancelado_cliente", "cancelado_studio", "nao_compareceu", "expirado"
]);

function showAppointmentMessage(text, type = "error", autoHide = false) {
  window.clearTimeout(appointmentMessageTimeout);
  showMessage(appointmentMessage, text, type);
  if (text && autoHide) {
    appointmentMessageTimeout = window.setTimeout(() => {
      showMessage(appointmentMessage, "");
    }, 5000);
  }
}

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

function numberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function formatCurrency(value) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(numberValue(value));
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

function rpcResultError(data) {
  const result = Array.isArray(data) ? data[0] : data;
  return result?.success === false
    ? new Error(result.message || result.error || "A ação não pôde ser concluída.")
    : null;
}

async function runAppointmentAction(button, callback) {
  const card = button.closest(".appointment-card");
  const cardButtons = [...card.querySelectorAll(".card-actions button")];
  const originalText = button.textContent;

  cardButtons.forEach((item) => { item.disabled = true; });
  button.textContent = "Processando...";
  showMessage(agendaActionMessage, "");

  try {
    const successMessage = await callback();
    await loadAgenda();
    showMessage(agendaActionMessage, successMessage, "success");
  } catch (error) {
    console.error("Erro ao executar ação no agendamento:", error);
    showMessage(agendaActionMessage, readableError(error, "Não foi possível concluir a ação."));
  } finally {
    if (card.isConnected) {
      cardButtons.forEach((item) => { item.disabled = false; });
      button.textContent = originalText;
    }
  }
}

async function callAppointmentRpc(name, parameters) {
  const { data, error } = await supabaseClient.rpc(name, parameters);
  if (error) throw error;
  const resultError = rpcResultError(data);
  if (resultError) throw resultError;
}

function createActionButton(label, className, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `card-action-button ${className}`;
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

function normalizeAmount(value) {
  const cleaned = String(value).trim().replace(/[^\d,.-]/g, "");
  const normalized = cleaned.includes(",")
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : cleaned;
  return Number(normalized);
}

function setCompletionSummary(id, value) {
  document.querySelector(id).textContent = displayValue(value);
}

function findCatalogId(items, itemName, idFields, nameFields) {
  const directId = idFields.map((field) => itemName[field]).find(Boolean);
  if (directId) return directId;
  const currentName = nameFields.map((field) => itemName[field]).find(Boolean);
  return items.find((item) => nameFields.some((field) => item[field] === currentName))?.id || null;
}

function getAppointmentProfessionalId(appointment) {
  return findCatalogId(
    activeProfessionals,
    appointment,
    ["profissionalId", "profissional_id"],
    ["profissionalNome", "nome", "name"]
  );
}

function getAppointmentServiceId(appointment) {
  return findCatalogId(
    activeServices,
    appointment,
    ["servicoId", "servico_id"],
    ["servicoNome", "nome", "name"]
  );
}

async function loadCompletionProfessionals(appointment) {
  const select = document.querySelector("#completion-professional");
  const serviceId = getAppointmentServiceId(appointment);
  const currentProfessionalId = getAppointmentProfessionalId(appointment);
  if (!serviceId) throw new Error("Não foi possível identificar o serviço deste agendamento.");

  const { data: links, error: linksError } = await supabaseClient
    .from("profissional_servicos")
    .select("profissional_id")
    .eq("servico_id", serviceId);
  if (linksError) throw linksError;
  if (completionAppointment !== appointment) return;

  const allowedIds = [...new Set((links || []).map((item) => item.profissional_id).filter(Boolean))];
  completionAllowedProfessionalIds = new Set(allowedIds);
  const professionals = activeProfessionals.filter((item) => allowedIds.includes(item.id));
  select.replaceChildren();
  professionals.forEach((professional) => {
    const option = document.createElement("option");
    option.value = professional.id;
    option.textContent = professional.nome || professional.name || "Sem nome";
    select.appendChild(option);
  });

  if (!professionals.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "Nenhuma profissional disponível";
    select.appendChild(option);
    throw new Error("Nenhuma profissional ativa realiza este serviço.");
  }
  if (!professionals.some((item) => item.id === currentProfessionalId)) {
    throw new Error("A profissional atual não está disponível para este serviço.");
  }

  select.value = currentProfessionalId;
  select.disabled = false;
  confirmCompletionButton.disabled = false;
}

async function openCompletionModal(appointment) {
  completionAppointment = appointment;
  completionAllowedProfessionalIds = new Set();
  completionForm.reset();
  const professionalSelect = document.querySelector("#completion-professional");
  professionalSelect.replaceChildren(new Option("Carregando...", ""));
  professionalSelect.disabled = true;
  confirmCompletionButton.disabled = true;
  showMessage(agendaActionMessage, "");
  showMessage(completionMessage, "");
  setCompletionSummary("#completion-client", appointment.clienteNome);
  setCompletionSummary("#completion-total", appointment.totalPrice);
  document.querySelector("#completion-amount").value = appointment.totalPrice ?? "";
  document.querySelector("#completion-method").value = "Pix";
  document.querySelector("#completion-status").value = "pago";
  completionModal.hidden = false;
  document.body.classList.add("modal-open");
  try {
    await loadCompletionProfessionals(appointment);
    if (completionAppointment === appointment) professionalSelect.focus();
  } catch (error) {
    console.error("Erro ao carregar profissionais do atendimento:", error);
    if (completionAppointment === appointment) {
      showMessage(completionMessage, readableError(error, "Não foi possível carregar as profissionais."));
    }
  }
}

function closeCompletionModal() {
  if (completionSaving) return;
  completionModal.hidden = true;
  document.body.classList.remove("modal-open");
  completionAppointment = null;
  completionAllowedProfessionalIds = new Set();
  showMessage(completionMessage, "");
}

async function handleCompletionSubmit(event) {
  event.preventDefault();
  if (!completionAppointment || completionSaving) return;

  const amountPaid = normalizeAmount(document.querySelector("#completion-amount").value);
  const professionalId = document.querySelector("#completion-professional").value;
  const paymentMethod = document.querySelector("#completion-method").value;
  const paymentStatus = document.querySelector("#completion-status").value;
  const notes = document.querySelector("#completion-notes").value.trim();
  const paymentNotes = document.querySelector("#completion-payment-notes").value.trim();

  if (!Number.isFinite(amountPaid) || amountPaid < 0) {
    showMessage(completionMessage, "Informe um valor pago válido, igual ou maior que zero.");
    return;
  }
  if (!professionalId || !completionAllowedProfessionalIds.has(professionalId)) {
    showMessage(completionMessage, "Selecione uma profissional válida para este serviço.");
    return;
  }
  if (paymentStatus === "pago" && amountPaid <= 0) {
    showMessage(completionMessage, "Para o status pago, o valor deve ser maior que zero.");
    return;
  }

  completionSaving = true;
  confirmCompletionButton.disabled = true;
  cancelCompletionButton.disabled = true;
  closeCompletionButton.disabled = true;
  confirmCompletionButton.textContent = "Finalizando...";
  showMessage(completionMessage, "");

  try {
    const originalProfessionalId = getAppointmentProfessionalId(completionAppointment);
    if (professionalId !== originalProfessionalId) {
      const { error: updateError } = await supabaseClient
        .from("agendamentos")
        .update({ profissional_id: professionalId })
        .eq("id", completionAppointment.id);
      if (updateError) throw updateError;
    }

    await callAppointmentRpc("marcar_agendamento_concluido_staff", {
      p_agendamento_id: completionAppointment.id,
      p_amount_paid: amountPaid,
      p_payment_method: paymentMethod,
      p_payment_status: paymentStatus,
      p_notes: notes || "Atendimento concluído pelo painel administrativo.",
      p_payment_notes: paymentNotes || null
    });

    completionSaving = false;
    closeCompletionModal();
    await loadAgenda();
    showMessage(agendaActionMessage, "Atendimento concluído com sucesso!", "success");
  } catch (error) {
    console.error("Erro ao concluir atendimento:", error);
    showMessage(completionMessage, readableError(error, "Não foi possível concluir o atendimento."));
  } finally {
    completionSaving = false;
    confirmCompletionButton.disabled = false;
    cancelCompletionButton.disabled = false;
    closeCompletionButton.disabled = false;
    confirmCompletionButton.textContent = "Confirmar";
  }
}

function renderCardActions(card, appointment) {
  const currentStatus = String(appointment.status || "").toLowerCase();

  if (CLOSED_STATUSES.has(currentStatus)) {
    const closed = document.createElement("p");
    closed.className = "appointment-closed";
    closed.textContent = "Atendimento encerrado";
    card.appendChild(closed);
    return;
  }
  if (!ACTIONABLE_STATUSES.has(currentStatus)) return;

  const actions = document.createElement("div");
  actions.className = "card-actions";

  if (currentStatus !== "confirmado") {
    actions.appendChild(createActionButton("Confirmar", "action-confirm", (event) => {
      runAppointmentAction(event.currentTarget, async () => {
        await callAppointmentRpc("confirmar_agendamento_staff", {
          p_agendamento_id: appointment.id,
          p_deposit_status: "pago",
          p_notes: "Confirmado pelo painel administrativo."
        });
        return "Agendamento confirmado com sucesso.";
      });
    }));
  }

  actions.appendChild(createActionButton("Concluir", "action-complete", () => {
    openCompletionModal(appointment);
  }));

  actions.appendChild(createActionButton("Cancelar", "action-cancel", (event) => {
    if (!window.confirm("Deseja realmente cancelar este agendamento?")) return;
    const reason = window.prompt("Motivo do cancelamento:");
    runAppointmentAction(event.currentTarget, async () => {
      await callAppointmentRpc("cancelar_agendamento", {
        p_agendamento_id: appointment.id,
        p_cancel_reason: reason?.trim() || "Cancelado pelo painel administrativo."
      });
      return "Agendamento cancelado com sucesso.";
    });
  }));

  actions.appendChild(createActionButton("Não compareceu", "action-no-show", (event) => {
    if (!window.confirm("Confirmar que a cliente não compareceu?")) return;
    const notes = window.prompt("Observação:");
    runAppointmentAction(event.currentTarget, async () => {
      await callAppointmentRpc("marcar_nao_compareceu_staff", {
        p_agendamento_id: appointment.id,
        p_notes: notes?.trim() || "Cliente não compareceu."
      });
      return "Ausência registrada com sucesso.";
    });
  }));

  card.appendChild(actions);
}

function renderAgenda(items) {
  const list = document.querySelector("#agenda-list");
  list.replaceChildren();
  if (!Array.isArray(items) || items.length === 0) {
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
    renderCardActions(card, appointment);
    list.appendChild(card);
  });
}

async function loadAgenda(event) {
  event?.preventDefault();
  const button = document.querySelector("#load-agenda-button");
  setBusy(button, true, "Carregando...");
  showMessage(adminMessage, "");
  try {
    const dataInicio = document.querySelector("#data-inicio").value;
    const dataFim = document.querySelector("#data-fim").value;
    const { data, error } = await supabaseClient.rpc("listar_agenda_staff", {
      p_data_inicio: dataInicio,
      p_data_fim: dataFim,
      p_profissional_id: null,
      p_statuses: null
    });
    if (error) throw error;
    const items = data?.items || [];
    renderAgenda(items);
  } catch (error) {
    console.error("Erro ao carregar a agenda:", error);
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
  activeProfessionals = professionalsResult.data || [];
  activeServices = servicesResult.data || [];
  fillSelect("#profissional", activeProfessionals, ["nome", "name"]);
  fillSelect("#servico", activeServices, ["nome", "name"]);
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

function clearAvailableTimes() {
  document.querySelector("#available-times").replaceChildren();
  document.querySelector("#selected-time").value = "";
  document.querySelector("#selected-time-label").textContent = "";
  document.querySelector("#create-button").disabled = true;
}

async function searchAvailableTimes() {
  const professionalId = document.querySelector("#profissional").value;
  const serviceId = document.querySelector("#servico").value;
  const date = document.querySelector("#appointment-date").value;
  if (!professionalId || !serviceId || !date) {
    showAppointmentMessage("Selecione profissional, serviço e data para buscar horários.");
    return;
  }

  const button = document.querySelector("#search-times-button");
  setBusy(button, true, "Buscando...");
  showAppointmentMessage("");
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
    showAppointmentMessage(readableError(error, "Não foi possível buscar os horários."));
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
    showAppointmentMessage("Escolha um horário disponível antes de criar o agendamento.");
    return;
  }

  const button = document.querySelector("#create-button");
  setBusy(button, true, "Criando...");
  showAppointmentMessage("");
  try {
    const date = document.querySelector("#appointment-date").value;
    const { data, error } = await supabaseClient.rpc("solicitar_agendamento_recepcao", {
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
    const result = Array.isArray(data) ? data[0] : data;
    if (result?.success === false) {
      throw new Error(result.message || result.error || "Não foi possível criar o agendamento.");
    }

    showAppointmentMessage("Agendamento criado com sucesso!", "success", true);
    document.querySelector("#cliente-nome").value = "";
    document.querySelector("#cliente-phone").value = "";
    document.querySelector("#cliente-email").value = "";
    clearAvailableTimes();
    await loadAgenda();
  } catch (error) {
    showAppointmentMessage(readableError(error, "Não foi possível criar o agendamento."));
  } finally {
    setBusy(button, false, "");
    button.disabled = !document.querySelector("#selected-time").value;
  }
}

function createFinanceCard(label, value, monetary = false) {
  const card = document.createElement("article");
  card.className = monetary ? "finance-card finance-card-value" : "finance-card";
  const title = document.createElement("span");
  const content = document.createElement("strong");
  title.textContent = label;
  content.textContent = monetary ? formatCurrency(value) : numberValue(value).toLocaleString("pt-BR");
  card.append(title, content);
  return card;
}

function renderFinanceCards(resumo = {}) {
  const grid = document.createElement("div");
  grid.className = "finance-card-grid";
  const totalCanceled = numberValue(resumo.totalCanceladoCliente)
    + numberValue(resumo.totalCanceladoStudio);
  const cards = [
    ["Agendamentos", resumo.totalAgendamentos],
    ["Concluídos", resumo.totalConcluidos],
    ["Não compareceu", resumo.totalNaoCompareceu],
    ["Cancelados", totalCanceled],
    ["Receita concluída", resumo.receitaBrutaConcluida, true],
    ["Total recebido", resumo.totalRecebido, true],
    ["Pendente", resumo.totalPendentePagamento, true],
    ["Sinais pendentes", resumo.totalSinalPendente, true],
    ["Ticket médio", resumo.ticketMedioConcluido, true]
  ];
  cards.forEach(([label, value, monetary]) => {
    grid.appendChild(createFinanceCard(label, value, monetary));
  });
  document.querySelector("#finance-content").appendChild(grid);
}

function createFinanceTable(title, columns, rows) {
  const section = document.createElement("section");
  section.className = "finance-table-section";
  const heading = document.createElement("h3");
  heading.textContent = title;
  section.appendChild(heading);

  if (!Array.isArray(rows) || rows.length === 0) {
    const empty = document.createElement("p");
    empty.className = "finance-table-empty";
    empty.textContent = "Nenhum dado disponível.";
    section.appendChild(empty);
    return section;
  }

  const wrapper = document.createElement("div");
  wrapper.className = "finance-table-wrapper";
  const table = document.createElement("table");
  table.className = "finance-table";
  const head = document.createElement("thead");
  const headRow = document.createElement("tr");
  columns.forEach((column) => {
    const cell = document.createElement("th");
    cell.scope = "col";
    cell.textContent = column.label;
    headRow.appendChild(cell);
  });
  head.appendChild(headRow);

  const body = document.createElement("tbody");
  rows.forEach((row) => {
    const tableRow = document.createElement("tr");
    columns.forEach((column) => {
      const cell = document.createElement("td");
      const rawValue = typeof column.value === "function" ? column.value(row) : row[column.value];
      cell.textContent = column.currency ? formatCurrency(rawValue) : displayValue(rawValue);
      if (column.currency) cell.className = "finance-money";
      tableRow.appendChild(cell);
    });
    body.appendChild(tableRow);
  });
  table.append(head, body);
  wrapper.appendChild(table);
  section.appendChild(wrapper);
  return section;
}

function renderFinanceTables(data) {
  const content = document.querySelector("#finance-content");
  content.appendChild(createFinanceTable("Por forma de pagamento", [
    { label: "Forma", value: "formaPagamento" },
    { label: "Quantidade", value: "quantidade" },
    { label: "Total recebido", value: "totalRecebido", currency: true }
  ], data.porPagamento));

  content.appendChild(createFinanceTable("Por profissional", [
    { label: "Profissional", value: "profissionalNome" },
    { label: "Agendamentos", value: "totalAgendamentos" },
    { label: "Concluídos", value: "totalConcluidos" },
    { label: "Receita", value: "receitaBrutaConcluida", currency: true },
    { label: "Recebido", value: "totalRecebido", currency: true }
  ], data.porProfissional));

  content.appendChild(createFinanceTable("Por serviço", [
    { label: "Serviço", value: "servicoNome" },
    { label: "Categoria", value: "servicoCategoria" },
    { label: "Agendamentos", value: "totalAgendamentos" },
    { label: "Concluídos", value: "totalConcluidos" },
    { label: "Receita", value: "receitaBrutaConcluida", currency: true },
    { label: "Recebido", value: "totalRecebido", currency: true }
  ], data.porServico));

  content.appendChild(createFinanceTable("Movimentações do período", [
    { label: "Data", value: (item) => `${displayValue(item.dataBr)} ${displayValue(item.horaInicio)}` },
    { label: "Cliente", value: "clienteNome" },
    { label: "Profissional", value: "profissionalNome" },
    { label: "Serviço", value: "servicoNome" },
    { label: "Status", value: "status" },
    { label: "Total", value: "totalPrice", currency: true },
    { label: "Pago", value: "amountPaid", currency: true },
    { label: "Status pag.", value: "paymentStatus" },
    { label: "Forma", value: "paymentMethod" }
  ], data.items));
}

function renderFinancialSummary(data) {
  const content = document.querySelector("#finance-content");
  content.replaceChildren();
  if (!Array.isArray(data.items) || data.items.length === 0) {
    const empty = document.createElement("p");
    empty.className = "finance-empty-state";
    empty.textContent = "Nenhuma movimentação financeira encontrada neste período.";
    content.appendChild(empty);
  }
  renderFinanceCards(data.resumo || {});
  renderFinanceTables(data);
}

async function loadFinancialSummary(event) {
  event?.preventDefault();
  if (currentUserRole !== "admin") return;

  const button = document.querySelector("#load-finance-button");
  const message = document.querySelector("#finance-message");
  setBusy(button, true, "Carregando...");
  showMessage(message, "");

  try {
    const { data, error } = await supabaseClient.rpc("resumo_financeiro_admin", {
      p_data_inicio: document.querySelector("#finance-start-date").value,
      p_data_fim: document.querySelector("#finance-end-date").value,
      p_profissional_id: document.querySelector("#finance-professional").value || null
    });
    if (error) throw error;
    const result = Array.isArray(data) ? data[0] : data;
    const resultError = rpcResultError(result);
    if (resultError) throw resultError;
    renderFinancialSummary(result || {});
  } catch (error) {
    console.error("Erro ao carregar resumo financeiro:", error);
    document.querySelector("#finance-content").replaceChildren();
    showMessage(message, readableError(error, "Não foi possível carregar o resumo financeiro."));
  } finally {
    setBusy(button, false, "");
  }
}

function setupFinanceFilters(defaultDate) {
  document.querySelector("#finance-start-date").value = defaultDate;
  document.querySelector("#finance-end-date").value = defaultDate;
  const select = document.querySelector("#finance-professional");
  activeProfessionals.forEach((professional) => {
    const option = document.createElement("option");
    option.value = professional.id;
    option.textContent = professional.nome || professional.name || "Sem nome";
    select.appendChild(option);
  });
}

async function initializeAdmin() {
  try {
    const access = await requireAdminAccess();
    if (!access) return;
    currentUserRole = access.profile.role;
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
    if (currentUserRole === "admin") {
      document.querySelector("#finance-section").hidden = false;
      setupFinanceFilters(today);
      await loadFinancialSummary();
    }
  } catch (error) {
    showMessage(adminMessage, readableError(error, "Não foi possível iniciar o painel."));
  }
}

document.querySelector("#logout-button").addEventListener("click", () => signOutAndRedirect());
document.querySelector("#agenda-form").addEventListener("submit", loadAgenda);
document.querySelector("#search-times-button").addEventListener("click", searchAvailableTimes);
document.querySelector("#appointment-form").addEventListener("submit", createAppointment);
document.querySelector("#finance-form").addEventListener("submit", loadFinancialSummary);
completionForm.addEventListener("submit", handleCompletionSubmit);
cancelCompletionButton.addEventListener("click", closeCompletionModal);
closeCompletionButton.addEventListener("click", closeCompletionModal);
completionModal.addEventListener("click", (event) => {
  if (event.target === completionModal) closeCompletionModal();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !completionModal.hidden) closeCompletionModal();
});
initializeAdmin();
