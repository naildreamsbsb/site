const adminMessage = document.querySelector("#admin-message");
const appointmentMessage = document.querySelector("#appointment-message");
const agendaActionMessage = document.querySelector("#agenda-action-message");
const completionModal = document.querySelector("#completion-modal");
const completionForm = document.querySelector("#completion-form");
const completionMessage = document.querySelector("#completion-message");
const confirmCompletionButton = document.querySelector("#confirm-completion");
const cancelCompletionButton = document.querySelector("#cancel-completion");
const closeCompletionButton = document.querySelector("#close-completion-modal");
const appointmentActionModal = document.querySelector("#appointment-action-modal");
const appointmentActionForm = document.querySelector("#appointment-action-form");
const appointmentActionMessage = document.querySelector("#appointment-action-message");
const confirmAppointmentActionButton = document.querySelector("#confirm-appointment-action");
const backAppointmentActionButton = document.querySelector("#back-appointment-action");
const closeAppointmentActionButton = document.querySelector("#close-appointment-action");
const commissionAdjustModal = document.querySelector("#commission-adjust-modal");
const commissionAdjustForm = document.querySelector("#commission-adjust-form");
const commissionAdjustMessage = document.querySelector("#commission-adjust-message");
const confirmCommissionAdjustButton = document.querySelector("#confirm-commission-adjust");
const cancelCommissionAdjustButton = document.querySelector("#cancel-commission-adjust");
const closeCommissionAdjustButton = document.querySelector("#close-commission-adjust");
let appointmentMessageTimeout;
let completionAppointment = null;
let completionSaving = false;
let completionAllowedProfessionalIds = new Set();
let activeProfessionals = [];
let activeServices = [];
let currentUserRole = null;
let appointmentAction = null;
let appointmentActionSaving = false;
let servicesRequestId = 0;
let commissionBeingAdjusted = null;
let commissionAdjustSaving = false;
let allowedSections = new Set(["agenda", "new-appointment"]);
let toastTimeout;

const SECTION_TITLES = {
  agenda: "Agenda",
  "new-appointment": "Novo agendamento",
  finance: "Resumo financeiro / Caixa",
  commissions: "Comissões"
};

function hideToast() {
  window.clearTimeout(toastTimeout);
  document.querySelector("#app-toast").hidden = true;
}

function showToast(message, type = "success") {
  const toast = document.querySelector("#app-toast");
  window.clearTimeout(toastTimeout);
  document.querySelector("#app-toast-message").textContent = message;
  toast.className = `app-toast app-toast-${type}`;
  toast.setAttribute("role", type === "error" ? "alert" : "status");
  toast.setAttribute("aria-live", type === "error" ? "assertive" : "polite");
  toast.hidden = false;
  toastTimeout = window.setTimeout(hideToast, type === "error" ? 7000 : 5000);
}

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

function updatePageTitle(sectionName) {
  document.querySelector("#page-title").textContent = SECTION_TITLES[sectionName] || "Painel administrativo";
}

function closeSidebar() {
  document.body.classList.remove("sidebar-open");
  document.querySelector("#sidebar-toggle").setAttribute("aria-expanded", "false");
}

function showSection(sectionName) {
  const safeSection = allowedSections.has(sectionName) ? sectionName : "agenda";
  document.querySelectorAll(".app-section").forEach((section) => {
    const active = section.id === `section-${safeSection}`;
    section.classList.toggle("is-active", active);
    section.setAttribute("aria-hidden", String(!active));
  });
  document.querySelectorAll(".sidebar-link").forEach((button) => {
    const active = button.dataset.section === safeSection;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-current", active ? "page" : "false");
  });
  updatePageTitle(safeSection);
  try {
    window.localStorage.setItem("adminCurrentSection", safeSection);
  } catch (error) {
    console.warn("Não foi possível salvar a seção atual:", error);
  }
  closeSidebar();
}

function applyRoleBasedNavigation(profile) {
  const isAdmin = profile?.role === "admin";
  allowedSections = new Set(isAdmin
    ? ["agenda", "new-appointment", "finance", "commissions"]
    : ["agenda", "new-appointment"]);
  document.querySelectorAll(".admin-only-navigation").forEach((item) => {
    item.hidden = !isAdmin;
  });

  let savedSection = "agenda";
  try {
    savedSection = window.localStorage.getItem("adminCurrentSection") || "agenda";
  } catch (error) {
    console.warn("Não foi possível recuperar a seção anterior:", error);
  }
  showSection(savedSection);
}

function setupSidebarNavigation() {
  document.querySelectorAll(".sidebar-link").forEach((button) => {
    button.addEventListener("click", () => showSection(button.dataset.section));
  });
  document.querySelector("#sidebar-toggle").addEventListener("click", () => {
    const opening = !document.body.classList.contains("sidebar-open");
    document.body.classList.toggle("sidebar-open", opening);
    document.querySelector("#sidebar-toggle").setAttribute("aria-expanded", String(opening));
  });
  document.querySelector("#sidebar-backdrop").addEventListener("click", closeSidebar);
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
    showToast(successMessage, "success");
  } catch (error) {
    console.error("Erro ao executar ação no agendamento:", error);
    showToast(readableError(error, "Não foi possível concluir a ação."), "error");
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
    .eq("servico_id", serviceId)
    .eq("active", true);
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
    showToast("Atendimento concluído com sucesso!", "success");
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

function setActionSummary(id, value) {
  document.querySelector(id).textContent = displayValue(value);
}

function openAppointmentActionModal(appointment, mode) {
  appointmentAction = { appointment, mode };
  appointmentActionForm.reset();
  showMessage(agendaActionMessage, "");
  showMessage(appointmentActionMessage, "");
  setActionSummary("#action-client", appointment.clienteNome);
  setActionSummary("#action-professional", appointment.profissionalNome);
  setActionSummary("#action-service", appointment.servicoNome);
  setActionSummary(
    "#action-date-time",
    `${displayValue(appointment.dataBr)} às ${displayValue(appointment.horaInicio)}`
  );

  const isCancel = mode === "cancel";
  document.querySelector("#appointment-action-title").textContent = isCancel
    ? "Cancelar agendamento"
    : "Cliente não compareceu";
  document.querySelector("#appointment-action-info").textContent = isCancel
    ? "Informe o motivo para registrar o cancelamento."
    : "Use esta ação quando a cliente não comparecer ao horário agendado.";
  document.querySelector("#appointment-action-field-label").textContent = isCancel
    ? "Motivo do cancelamento"
    : "Observação";

  appointmentActionModal.hidden = false;
  document.body.classList.add("modal-open");
  document.querySelector("#appointment-action-notes").focus();
}

function openCancelModal(appointment) {
  openAppointmentActionModal(appointment, "cancel");
}

function openNoShowModal(appointment) {
  openAppointmentActionModal(appointment, "no-show");
}

function closeAppointmentActionModal() {
  if (appointmentActionSaving) return;
  appointmentActionModal.hidden = true;
  document.body.classList.remove("modal-open");
  appointmentAction = null;
  showMessage(appointmentActionMessage, "");
}

async function submitAppointmentActionModal(event) {
  event.preventDefault();
  if (!appointmentAction || appointmentActionSaving) return;

  const { appointment, mode } = appointmentAction;
  const notes = document.querySelector("#appointment-action-notes").value.trim();
  const isCancel = mode === "cancel";
  appointmentActionSaving = true;
  confirmAppointmentActionButton.disabled = true;
  backAppointmentActionButton.disabled = true;
  closeAppointmentActionButton.disabled = true;
  confirmAppointmentActionButton.textContent = isCancel ? "Cancelando..." : "Salvando...";
  showMessage(appointmentActionMessage, "");

  try {
    if (isCancel) {
      await callAppointmentRpc("cancelar_agendamento", {
        p_agendamento_id: appointment.id,
        p_cancel_reason: notes || "Cancelado pelo painel administrativo."
      });
    } else {
      await callAppointmentRpc("marcar_nao_compareceu_staff", {
        p_agendamento_id: appointment.id,
        p_notes: notes || "Cliente não compareceu."
      });
    }

    appointmentActionSaving = false;
    closeAppointmentActionModal();
    await loadAgenda();
    showToast(
      isCancel ? "Agendamento cancelado com sucesso!" : "Agendamento marcado como não compareceu.",
      "success"
    );
  } catch (error) {
    console.error(`Erro ao ${isCancel ? "cancelar agendamento" : "registrar ausência"}:`, error);
    showMessage(appointmentActionMessage, readableError(error, "Não foi possível concluir a ação."));
  } finally {
    appointmentActionSaving = false;
    confirmAppointmentActionButton.disabled = false;
    backAppointmentActionButton.disabled = false;
    closeAppointmentActionButton.disabled = false;
    confirmAppointmentActionButton.textContent = "Confirmar";
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

  actions.appendChild(createActionButton("Cancelar", "action-cancel", () => {
    openCancelModal(appointment);
  }));

  actions.appendChild(createActionButton("Não compareceu", "action-no-show", () => {
    openNoShowModal(appointment);
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
    showToast(readableError(error, "Não foi possível carregar a agenda."), "error");
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
}

function setServiceSelectPlaceholder(text, disabled = true) {
  const select = document.querySelector("#servico");
  const option = document.createElement("option");
  option.value = "";
  option.textContent = text;
  select.replaceChildren(option);
  select.disabled = disabled;
}

function resetAvailableTimes(message = "") {
  clearAvailableTimes();
  if (message) {
    const hint = document.createElement("span");
    hint.className = "muted";
    hint.textContent = message;
    document.querySelector("#available-times").appendChild(hint);
  }
}

async function loadServicesForProfessional() {
  const professionalId = document.querySelector("#profissional").value;
  const requestId = ++servicesRequestId;
  showAppointmentMessage("");
  resetAvailableTimes(professionalId
    ? "Selecione um serviço para buscar horários."
    : "Selecione uma profissional primeiro.");

  if (!professionalId) {
    setServiceSelectPlaceholder("Selecione uma profissional primeiro");
    return;
  }

  setServiceSelectPlaceholder("Carregando serviços...");
  try {
    const { data: links, error } = await supabaseClient
      .from("profissional_servicos")
      .select("servico_id")
      .eq("profissional_id", professionalId)
      .eq("active", true);
    if (error) throw error;
    if (requestId !== servicesRequestId) return;

    const serviceIds = new Set((links || []).map((item) => item.servico_id).filter(Boolean));
    const services = activeServices.filter((service) => serviceIds.has(service.id));
    if (!services.length) {
      setServiceSelectPlaceholder("Nenhum serviço disponível");
      showAppointmentMessage("Esta profissional não possui serviços ativos vinculados.", "info");
      return;
    }

    const select = document.querySelector("#servico");
    setServiceSelectPlaceholder("Selecione", false);
    services.forEach((service) => {
      const option = document.createElement("option");
      option.value = service.id;
      const name = service.nome || service.name || "Sem nome";
      const category = service.categoria || service.category;
      option.textContent = category ? `${name} · ${category}` : name;
      select.appendChild(option);
    });
  } catch (error) {
    if (requestId !== servicesRequestId) return;
    console.error("Erro ao carregar serviços da profissional:", error);
    setServiceSelectPlaceholder("Não foi possível carregar os serviços");
    showAppointmentMessage(readableError(error, "Não foi possível carregar os serviços desta profissional."));
  }
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
    showToast(readableError(error, "Não foi possível buscar os horários."), "error");
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

    showToast("Agendamento criado com sucesso!", "success");
    document.querySelector("#cliente-nome").value = "";
    document.querySelector("#cliente-phone").value = "";
    document.querySelector("#cliente-email").value = "";
    clearAvailableTimes();
    await loadAgenda();
  } catch (error) {
    showToast(readableError(error, "Não foi possível criar o agendamento."), "error");
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
    ["Total recebido", resumo.totalRecebido, true],
    ["Receita concluída", resumo.receitaBrutaConcluida, true],
    ["Pendente", resumo.totalPendentePagamento, true],
    ["Sinais pendentes", resumo.totalSinalPendente, true],
    ["Ticket médio", resumo.ticketMedioConcluido, true],
    ["Agendamentos", resumo.totalAgendamentos],
    ["Concluídos", resumo.totalConcluidos],
    ["Não compareceu", resumo.totalNaoCompareceu],
    ["Cancelados", totalCanceled]
  ];
  cards.forEach(([label, value, monetary]) => {
    grid.appendChild(createFinanceCard(label, value, monetary));
  });
  document.querySelector("#finance-content").appendChild(grid);
}

function normalizeProfessionalName(value) {
  return String(value || "").trim().toLocaleLowerCase("pt-BR");
}

function mergeActiveProfessionals(summaryRows, selectedProfessionalId, zeroValues) {
  const rows = Array.isArray(summaryRows) ? summaryRows : [];
  const professionals = selectedProfessionalId
    ? activeProfessionals.filter((item) => String(item.id) === String(selectedProfessionalId))
    : activeProfessionals;

  return professionals.map((professional) => {
    const professionalName = professional.nome || professional.name || "Sem nome";
    const existing = rows.find((row) => {
      const rowId = row.profissionalId ?? row.profissional_id ?? row.id;
      return (rowId && String(rowId) === String(professional.id))
        || normalizeProfessionalName(row.profissionalNome) === normalizeProfessionalName(professionalName);
    });
    return {
      ...zeroValues,
      ...(existing || {}),
      profissionalId: professional.id,
      profissionalNome: professionalName
    };
  });
}

function mergeProfessionalsWithFinanceSummary(porProfissional, selectedProfessionalId) {
  return mergeActiveProfessionals(porProfissional, selectedProfessionalId, {
    totalAgendamentos: 0,
    totalConcluidos: 0,
    totalNaoCompareceu: 0,
    totalCancelados: 0,
    receitaBrutaConcluida: 0,
    totalRecebido: 0
  });
}

function mergeProfessionalsWithCommissionSummary(porProfissional, selectedProfessionalId) {
  return mergeActiveProfessionals(porProfissional, selectedProfessionalId, {
    quantidade: 0,
    totalServicos: 0,
    totalRecebido: 0,
    totalComissao: 0,
    totalPendente: 0,
    totalPago: 0
  });
}

function createMobileDataList(columns, rows) {
  const list = document.createElement("div");
  list.className = "mobile-list data-mobile-list";
  rows.forEach((row) => {
    const card = document.createElement("article");
    card.className = "mobile-data-card";
    columns.forEach((column) => {
      const field = document.createElement("div");
      const label = document.createElement("span");
      const value = document.createElement("strong");
      const rawValue = typeof column.value === "function" ? column.value(row) : row[column.value];
      label.textContent = column.label;
      value.textContent = column.currency ? formatCurrency(rawValue) : displayValue(rawValue);
      if (column.currency) value.className = "finance-money";
      field.append(label, value);
      card.appendChild(field);
    });
    list.appendChild(card);
  });
  return list;
}

function createCompactMobileField(labelText, valueText, monetary = false) {
  const field = document.createElement("div");
  field.className = "compact-card-field";
  const label = document.createElement("span");
  const value = document.createElement("strong");
  label.textContent = labelText;
  value.textContent = displayValue(valueText);
  if (monetary) value.classList.add("finance-money");
  field.append(label, value);
  return field;
}

function createMovementMobileList(items) {
  const list = document.createElement("div");
  list.className = "mobile-list data-mobile-list";
  items.forEach((item) => {
    const card = document.createElement("article");
    card.className = "mobile-data-card compact-mobile-card";
    const heading = document.createElement("div");
    heading.className = "compact-card-heading";
    const client = document.createElement("strong");
    const status = document.createElement("span");
    client.textContent = displayValue(item.clienteNome);
    status.className = "compact-status-badge";
    status.textContent = displayValue(item.status);
    heading.append(client, status);

    const grid = document.createElement("div");
    grid.className = "compact-card-grid";
    grid.append(
      createCompactMobileField("Data/Hora", `${displayValue(item.dataBr)} ${displayValue(item.horaInicio)}`),
      createCompactMobileField("Profissional", item.profissionalNome),
      createCompactMobileField("Serviço", item.servicoNome),
      createCompactMobileField("Forma", item.paymentMethod),
      createCompactMobileField("Total", formatCurrency(item.totalPrice), true),
      createCompactMobileField("Pago", formatCurrency(item.amountPaid), true),
      createCompactMobileField("Status pag.", item.paymentStatus)
    );
    card.append(heading, grid);
    list.appendChild(card);
  });
  return list;
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
  wrapper.className = "finance-table-wrapper table-scroll desktop-table";
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
  const mobileList = title === "Movimentações do período"
    ? createMovementMobileList(rows)
    : createMobileDataList(columns, rows);
  section.append(wrapper, mobileList);
  return section;
}

function renderFinanceTables(data) {
  const content = document.querySelector("#finance-content");
  const selectedProfessionalId = document.querySelector("#finance-professional").value || null;
  const professionalsSummary = mergeProfessionalsWithFinanceSummary(
    data.porProfissional,
    selectedProfessionalId
  );
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
  ], professionalsSummary));

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
    showToast(readableError(error, "Não foi possível carregar o resumo financeiro."), "error");
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

function getCommissionFilters() {
  const status = document.querySelector("#commissions-status").value;
  return {
    startDate: document.querySelector("#commissions-start-date").value,
    endDate: document.querySelector("#commissions-end-date").value,
    professionalId: document.querySelector("#commissions-professional").value || null,
    statuses: status === "todas" ? null : [status]
  };
}

function renderCommissionCards(resumo = {}) {
  const grid = document.createElement("div");
  grid.className = "finance-card-grid";
  [
    ["Comissões", resumo.totalComissoes, false],
    ["Total calculado", resumo.totalCalculado, true],
    ["Pendente", resumo.totalPendente, true],
    ["Pago", resumo.totalPago, true],
    ["Cancelado", resumo.totalCancelado, true]
  ].forEach(([label, value, monetary]) => {
    grid.appendChild(createFinanceCard(label, value, monetary));
  });
  document.querySelector("#commissions-content").appendChild(grid);
}

function openCommissionAdjustModal(commission) {
  commissionBeingAdjusted = commission;
  commissionAdjustForm.reset();
  showMessage(document.querySelector("#commissions-message"), "");
  showMessage(commissionAdjustMessage, "");
  setActionSummary("#commission-client", commission.clienteNome);
  setActionSummary("#commission-professional", commission.profissionalNome);
  setActionSummary("#commission-service", commission.servicoNome);
  setActionSummary("#commission-current-value", formatCurrency(commission.valorComissao));
  document.querySelector("#commission-new-value").value = commission.valorComissao ?? "";
  commissionAdjustModal.hidden = false;
  document.body.classList.add("modal-open");
  document.querySelector("#commission-new-value").focus();
}

function closeCommissionAdjustModal() {
  if (commissionAdjustSaving) return;
  commissionAdjustModal.hidden = true;
  document.body.classList.remove("modal-open");
  commissionBeingAdjusted = null;
  showMessage(commissionAdjustMessage, "");
}

async function submitCommissionAdjust(event) {
  event.preventDefault();
  if (currentUserRole !== "admin" || !commissionBeingAdjusted || commissionAdjustSaving) return;

  const newValue = normalizeAmount(document.querySelector("#commission-new-value").value);
  const reason = document.querySelector("#commission-adjust-reason").value.trim();
  if (!Number.isFinite(newValue) || newValue < 0) {
    showMessage(commissionAdjustMessage, "O novo valor da comissão deve ser igual ou maior que zero.");
    return;
  }
  if (!reason) {
    showMessage(commissionAdjustMessage, "Informe o motivo do ajuste.");
    return;
  }

  commissionAdjustSaving = true;
  confirmCommissionAdjustButton.disabled = true;
  cancelCommissionAdjustButton.disabled = true;
  closeCommissionAdjustButton.disabled = true;
  confirmCommissionAdjustButton.textContent = "Salvando...";
  showMessage(commissionAdjustMessage, "");

  try {
    await callAppointmentRpc("ajustar_comissao_manual_admin", {
      p_comissao_id: commissionBeingAdjusted.id,
      p_valor_comissao: newValue,
      p_motivo: reason
    });
    commissionAdjustSaving = false;
    closeCommissionAdjustModal();
    await loadCommissions();
    showToast("Comissão ajustada com sucesso!", "success");
  } catch (error) {
    console.error("Erro ao ajustar comissão:", error);
    showMessage(commissionAdjustMessage, readableError(error, "Não foi possível ajustar a comissão."));
  } finally {
    commissionAdjustSaving = false;
    confirmCommissionAdjustButton.disabled = false;
    cancelCommissionAdjustButton.disabled = false;
    closeCommissionAdjustButton.disabled = false;
    confirmCommissionAdjustButton.textContent = "Confirmar";
  }
}

async function markCommissionPaid(button, commission) {
  if (currentUserRole !== "admin") return;
  if (!window.confirm("Marcar esta comissão como paga?")) return;

  const rowButtons = [...button.closest(".commission-row-actions").querySelectorAll("button")];
  const originalText = button.textContent;
  rowButtons.forEach((item) => { item.disabled = true; });
  button.textContent = "Salvando...";
  showMessage(document.querySelector("#commissions-message"), "");
  try {
    await callAppointmentRpc("marcar_comissoes_pagas_admin", {
      p_comissao_ids: [commission.id],
      p_notes: "Comissão marcada como paga pelo painel administrativo."
    });
    await loadCommissions();
    showToast("Comissão marcada como paga!", "success");
  } catch (error) {
    console.error("Erro ao marcar comissão como paga:", error);
    showToast(readableError(error, "Não foi possível marcar a comissão como paga."), "error");
    if (button.isConnected) {
      rowButtons.forEach((item) => { item.disabled = false; });
      button.textContent = originalText;
    }
  }
}

function createCommissionActions(commission) {
  const container = document.createElement("div");
  container.className = "commission-row-actions";
  const status = String(commission.status || "").toLowerCase();
  if (status === "calculada" || status === "aprovada") {
    const adjust = createActionButton("Ajustar", "commission-adjust-button", () => {
      openCommissionAdjustModal(commission);
    });
    const pay = createActionButton("Marcar como paga", "commission-pay-button", (event) => {
      markCommissionPaid(event.currentTarget, commission);
    });
    container.append(adjust, pay);
  } else {
    const state = document.createElement("span");
    state.className = `commission-state commission-state-${status}`;
    state.textContent = status === "paga"
      ? "Comissão paga"
      : status === "cancelada" ? "Comissão cancelada" : displayValue(commission.status);
    container.appendChild(state);
  }
  return container;
}

function createCommissionMobileList(items) {
  const list = document.createElement("div");
  list.className = "mobile-list data-mobile-list";
  items.forEach((commission) => {
    const card = document.createElement("article");
    card.className = "mobile-data-card compact-mobile-card commission-mobile-card";
    const heading = document.createElement("div");
    heading.className = "compact-card-heading";
    const client = document.createElement("strong");
    const status = document.createElement("span");
    client.textContent = displayValue(commission.clienteNome);
    status.className = "compact-status-badge";
    status.textContent = displayValue(commission.status);
    heading.append(client, status);
    const grid = document.createElement("div");
    grid.className = "compact-card-grid";
    [
      ["Data", `${displayValue(commission.dataBr)} ${displayValue(commission.horaInicio)}`],
      ["Profissional", commission.profissionalNome],
      ["Serviço", commission.servicoNome],
      ["Valor recebido", formatCurrency(commission.valorRecebido), true],
      ["Comissão", formatCurrency(commission.valorComissao), true],
      ["Base cálculo", formatCurrency(commission.baseCalculo), true],
      ["Tipo", commission.calculationType],
      ["Percentual", commission.commissionPercent == null ? "—" : `${commission.commissionPercent}%`]
    ].forEach(([fieldLabel, fieldValue, monetary]) => {
      grid.appendChild(createCompactMobileField(fieldLabel, fieldValue, monetary));
    });
    card.append(heading, grid);
    const actions = createCommissionActions(commission);
    actions.classList.add("mobile-card-actions");
    card.appendChild(actions);
    list.appendChild(card);
  });
  return list;
}

function renderCommissionItems(items) {
  const section = document.createElement("section");
  section.className = "finance-table-section";
  const heading = document.createElement("h3");
  heading.textContent = "Comissões detalhadas";
  section.appendChild(heading);
  if (!Array.isArray(items) || items.length === 0) {
    const empty = document.createElement("p");
    empty.className = "finance-empty-state";
    empty.textContent = "Nenhuma comissão encontrada neste período.";
    section.appendChild(empty);
    return section;
  }

  const columns = [
    ["Data", (item) => `${displayValue(item.dataBr)} ${displayValue(item.horaInicio)}`],
    ["Cliente", (item) => item.clienteNome],
    ["Profissional", (item) => item.profissionalNome],
    ["Serviço", (item) => item.servicoNome],
    ["Valor serviço", (item) => formatCurrency(item.valorServico)],
    ["Recebido", (item) => formatCurrency(item.valorRecebido)],
    ["Base", (item) => formatCurrency(item.baseCalculo)],
    ["Cálculo", (item) => item.calculationType],
    ["Percentual", (item) => item.commissionPercent == null ? "—" : `${item.commissionPercent}%`],
    ["Valor fixo", (item) => item.fixedAmount == null ? "—" : formatCurrency(item.fixedAmount)],
    ["Comissão", (item) => formatCurrency(item.valorComissao)],
    ["Status", (item) => item.status],
    ["Observações", (item) => item.notes]
  ];
  const wrapper = document.createElement("div");
  wrapper.className = "finance-table-wrapper table-scroll desktop-table";
  const table = document.createElement("table");
  table.className = "finance-table commission-table";
  const head = document.createElement("thead");
  const headRow = document.createElement("tr");
  columns.concat([["Ações", null]]).forEach(([label]) => {
    const th = document.createElement("th");
    th.scope = "col";
    th.textContent = label;
    headRow.appendChild(th);
  });
  head.appendChild(headRow);
  const body = document.createElement("tbody");
  items.forEach((commission) => {
    const row = document.createElement("tr");
    columns.forEach(([, getter], index) => {
      const cell = document.createElement("td");
      cell.textContent = displayValue(getter(commission));
      if ([4, 5, 6, 9, 10].includes(index)) cell.classList.add("finance-money");
      if (index === 12) cell.classList.add("commission-notes");
      row.appendChild(cell);
    });
    const actionCell = document.createElement("td");
    actionCell.appendChild(createCommissionActions(commission));
    row.appendChild(actionCell);
    body.appendChild(row);
  });
  table.append(head, body);
  wrapper.appendChild(table);
  section.append(wrapper, createCommissionMobileList(items));
  return section;
}

function renderCommissions(data) {
  const content = document.querySelector("#commissions-content");
  content.replaceChildren();
  renderCommissionCards(data.resumo || {});
  const selectedProfessionalId = document.querySelector("#commissions-professional").value || null;
  const professionalsSummary = mergeProfessionalsWithCommissionSummary(
    data.porProfissional,
    selectedProfessionalId
  );
  content.appendChild(createFinanceTable("Por profissional", [
    { label: "Profissional", value: "profissionalNome" },
    { label: "Quantidade", value: "quantidade" },
    { label: "Serviços", value: "totalServicos", currency: true },
    { label: "Recebido", value: "totalRecebido", currency: true },
    { label: "Comissão", value: "totalComissao", currency: true },
    { label: "Pendente", value: "totalPendente", currency: true },
    { label: "Pago", value: "totalPago", currency: true }
  ], professionalsSummary));
  content.appendChild(renderCommissionItems(data.items));
}

async function loadCommissions(event) {
  event?.preventDefault();
  if (currentUserRole !== "admin") return false;
  const button = document.querySelector("#load-commissions-button");
  const message = document.querySelector("#commissions-message");
  const filters = getCommissionFilters();
  setBusy(button, true, "Carregando...");
  showMessage(message, "");
  try {
    const { data, error } = await supabaseClient.rpc("listar_comissoes_admin", {
      p_data_inicio: filters.startDate,
      p_data_fim: filters.endDate,
      p_profissional_id: filters.professionalId,
      p_statuses: filters.statuses
    });
    if (error) throw error;
    const result = Array.isArray(data) ? data[0] : data;
    const resultError = rpcResultError(result);
    if (resultError) throw resultError;
    renderCommissions(result || {});
    return true;
  } catch (error) {
    console.error("Erro ao carregar comissões:", error);
    document.querySelector("#commissions-content").replaceChildren();
    showToast(readableError(error, "Não foi possível carregar as comissões."), "error");
    return false;
  } finally {
    setBusy(button, false, "");
  }
}

async function generateCommissions() {
  if (currentUserRole !== "admin") return;
  const button = document.querySelector("#generate-commissions-button");
  const message = document.querySelector("#commissions-message");
  const filters = getCommissionFilters();
  setBusy(button, true, "Gerando...");
  showMessage(message, "");
  try {
    const { data, error } = await supabaseClient.rpc("gerar_comissoes_periodo_admin", {
      p_data_inicio: filters.startDate,
      p_data_fim: filters.endDate,
      p_profissional_id: filters.professionalId
    });
    if (error) throw error;
    const result = Array.isArray(data) ? data[0] : data;
    const resultError = rpcResultError(result);
    if (resultError) throw resultError;
    const loaded = await loadCommissions();
    if (!loaded) return;

    const errorsList = Array.isArray(result?.errosLista) ? result.errosLista : [];
    const errorDetails = errorsList.length
      ? ` Detalhes: ${errorsList.map((item) => typeof item === "string" ? item : JSON.stringify(item)).join("; ")}`
      : "";
    const text = `Concluídos analisados: ${numberValue(result?.totalAgendamentosConcluidos)}. `
      + `Comissões geradas: ${numberValue(result?.comissoesGeradas)}. `
      + `Erros: ${numberValue(result?.erros)}.${errorDetails}`;
    showToast(text, numberValue(result?.erros) > 0 ? "info" : "success");
  } catch (error) {
    console.error("Erro ao gerar comissões:", error);
    showToast(readableError(error, "Não foi possível gerar as comissões."), "error");
  } finally {
    setBusy(button, false, "");
  }
}

function setupCommissionFilters(defaultDate) {
  document.querySelector("#commissions-start-date").value = defaultDate;
  document.querySelector("#commissions-end-date").value = defaultDate;
  const select = document.querySelector("#commissions-professional");
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
    applyRoleBasedNavigation(access.profile);
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
      setupFinanceFilters(today);
      await loadFinancialSummary();
      setupCommissionFilters(today);
      await loadCommissions();
    }
  } catch (error) {
    showToast(readableError(error, "Não foi possível iniciar o painel."), "error");
  }
}

document.querySelector("#logout-button").addEventListener("click", () => signOutAndRedirect());
document.querySelector("#agenda-form").addEventListener("submit", loadAgenda);
document.querySelector("#search-times-button").addEventListener("click", searchAvailableTimes);
document.querySelector("#appointment-form").addEventListener("submit", createAppointment);
document.querySelector("#profissional").addEventListener("change", loadServicesForProfessional);
document.querySelector("#servico").addEventListener("change", () => {
  resetAvailableTimes("Clique em Buscar horários para ver a disponibilidade.");
});
document.querySelector("#finance-form").addEventListener("submit", loadFinancialSummary);
document.querySelector("#commissions-form").addEventListener("submit", loadCommissions);
document.querySelector("#generate-commissions-button").addEventListener("click", generateCommissions);
completionForm.addEventListener("submit", handleCompletionSubmit);
cancelCompletionButton.addEventListener("click", closeCompletionModal);
closeCompletionButton.addEventListener("click", closeCompletionModal);
completionModal.addEventListener("click", (event) => {
  if (event.target === completionModal) closeCompletionModal();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !completionModal.hidden) closeCompletionModal();
});
appointmentActionForm.addEventListener("submit", submitAppointmentActionModal);
backAppointmentActionButton.addEventListener("click", closeAppointmentActionModal);
closeAppointmentActionButton.addEventListener("click", closeAppointmentActionModal);
appointmentActionModal.addEventListener("click", (event) => {
  if (event.target === appointmentActionModal) closeAppointmentActionModal();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !appointmentActionModal.hidden) closeAppointmentActionModal();
});
commissionAdjustForm.addEventListener("submit", submitCommissionAdjust);
cancelCommissionAdjustButton.addEventListener("click", closeCommissionAdjustModal);
closeCommissionAdjustButton.addEventListener("click", closeCommissionAdjustModal);
commissionAdjustModal.addEventListener("click", (event) => {
  if (event.target === commissionAdjustModal) closeCommissionAdjustModal();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !commissionAdjustModal.hidden) closeCommissionAdjustModal();
});
document.querySelector("#app-toast-close").addEventListener("click", hideToast);
setupSidebarNavigation();
initializeAdmin();
