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
const registrationModal = document.querySelector("#registration-modal");
const registrationForm = document.querySelector("#registration-form");
const registrationMessage = document.querySelector("#registration-message");
const saveRegistrationButton = document.querySelector("#save-registration");
const cancelRegistrationButton = document.querySelector("#cancel-registration");
const closeRegistrationButton = document.querySelector("#close-registration-modal");
const settingsForm = document.querySelector("#settings-form");
const settingsMessage = document.querySelector("#settings-message");
const saveSettingsButton = document.querySelector("#save-settings-button");
const contractViewModal = document.querySelector("#contract-view-modal");
const closeContractViewButton = document.querySelector("#close-contract-view");
const backContractViewButton = document.querySelector("#back-contract-view");
const originalContractModal = document.querySelector("#original-contract-modal");
const closeOriginalContractButton = document.querySelector("#close-original-contract");
const backOriginalContractButton = document.querySelector("#back-original-contract");
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
let availableTimesRequestId = 0;
let commissionBeingAdjusted = null;
let commissionAdjustSaving = false;
let allowedSections = new Set(["agenda", "new-appointment"]);
let toastTimeout;
let registrationState = null;
let registrationSaving = false;
let clientsCache = [];
let professionalsCache = [];
let servicesCache = [];
let currentUserId = null;
let settingsLoading = false;
let settingsSaving = false;
let studioSettings = null;
let studioSettingsLoadError = null;
let contractValidationSaving = false;
let adminWorkingHours = [];
let adminWorkingHoursSequence = 0;
let adminWorkingHoursLoading = false;
let adminWorkingHoursSaving = false;
let adminWorkingHoursRequestId = 0;

const WORKING_HOURS_WEEKDAYS = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
const GOOGLE_REVIEW_URL = ""; // Preencher somente com o link oficial de avaliação direta da Nail Dreams.
const CLIENT_RESCHEDULE_URL = "https://naildreams.com.br/cliente.html";

const STUDIO_SETTINGS_FALLBACK = {
  studio_name: "Nail Dreams",
  studio_whatsapp: "",
  pix_key: "",
  confirmation_message_template: "Olá, {cliente}! Seu agendamento no {studio} está confirmado para {data} às {hora}, com {profissional}. Serviço: {servico}.",
  cancellation_message_template: "Olá, {cliente}. Seu agendamento no {studio}, marcado para {data} às {hora}, foi cancelado.",
  no_show_message_template: "Olá, {cliente}. Registramos que você não compareceu ao agendamento de {servico} no {studio}, em {data} às {hora}.",
  deposit_message_template: "Olá, {cliente}! Para confirmar seu agendamento de {servico} no {studio}, envie o sinal de {valor_sinal}. Chave Pix: {pix_key}."
};

const SECTION_TITLES = {
  agenda: "Agenda",
  "new-appointment": "Novo agendamento",
  clients: "Clientes",
  professionals: "Profissionais",
  "working-hours": "Horários das profissionais",
  contracts: "Contratos",
  services: "Serviços",
  settings: "Configurações",
  finance: "Resumo financeiro / Caixa",
  commissions: "Comissões"
};

function hideToast() {
  window.clearTimeout(toastTimeout);
  document.querySelector("#app-toast").hidden = true;
}

function showToast(message, type = "success", duration) {
  const toast = document.querySelector("#app-toast");
  window.clearTimeout(toastTimeout);
  document.querySelector("#app-toast-message").textContent = message;
  toast.className = `app-toast app-toast-${type}`;
  toast.setAttribute("role", type === "error" ? "alert" : "status");
  toast.setAttribute("aria-live", type === "error" ? "assertive" : "polite");
  toast.hidden = false;
  toastTimeout = window.setTimeout(hideToast, duration ?? (type === "error" ? 7000 : 5000));
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
  if (safeSection === "new-appointment") resetNewAppointmentForm();
  if (safeSection === "settings" && currentUserRole === "admin") loadStudioSettings();
  if (safeSection === "contracts" && currentUserRole === "admin") loadContracts();
}

function applyRoleBasedNavigation(profile) {
  const isAdmin = profile?.role === "admin";
  allowedSections = new Set(isAdmin
    ? ["agenda", "new-appointment", "clients", "professionals", "working-hours", "contracts", "services", "settings", "finance", "commissions"]
    : ["agenda", "new-appointment", "clients"]);
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

function formatWhatsAppPhone(phone) {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (/^55\d{10,11}$/.test(digits)) return digits;
  if (/^\d{10,11}$/.test(digits)) return `55${digits}`;
  return null;
}

function formatMoneyBR(value) {
  return formatCurrency(value);
}

function fillMessageTemplate(template, appointment) {
  const templateMoney = (value) => value === null || value === undefined || value === ""
    ? ""
    : formatMoneyBR(value);
  const variables = {
    cliente: appointment?.clienteNome,
    studio: studioSettings?.studio_name || STUDIO_SETTINGS_FALLBACK.studio_name,
    servico: appointment?.servicoNome,
    profissional: appointment?.profissionalNome,
    data: appointment?.dataBr,
    hora: appointment?.horaInicio,
    valor: templateMoney(appointment?.totalPrice),
    valor_sinal: templateMoney(appointment?.depositAmount),
    pix_key: studioSettings?.pix_key
  };

  return String(template || "").replace(
    /\{(cliente|studio|servico|profissional|data|hora|valor|valor_sinal|pix_key)\}/g,
    (_, key) => variables[key] ?? ""
  );
}

function openWhatsAppMessage(phone, message) {
  const formattedPhone = formatWhatsAppPhone(phone);
  if (!formattedPhone) return false;
  const url = `https://wa.me/${formattedPhone}?text=${encodeURIComponent(message)}`;
  const openedWindow = window.open(url, "_blank");
  if (openedWindow) openedWindow.opener = null;
  return true;
}

function appointmentClientFirstName(appointment) {
  return String(appointment?.clienteNome || "cliente").trim().split(/\s+/)[0] || "cliente";
}

function whatsappUrl(phone, message) {
  const formattedPhone = formatWhatsAppPhone(phone);
  return formattedPhone ? `https://wa.me/${formattedPhone}?text=${encodeURIComponent(message)}` : null;
}

function prepareWhatsAppWindow() {
  const preparedWindow = window.open("about:blank", "_blank");
  if (preparedWindow) preparedWindow.opener = null;
  return preparedWindow;
}

function closePreparedWhatsAppWindow(preparedWindow) {
  if (preparedWindow && !preparedWindow.closed) preparedWindow.close();
}

function showWhatsAppFallback(url, message) {
  agendaActionMessage.className = "message info";
  agendaActionMessage.replaceChildren(document.createTextNode(`${message} `));
  const button = document.createElement("button");
  button.type = "button";
  button.className = "card-action-button action-whatsapp";
  button.textContent = "Enviar mensagem pelo WhatsApp";
  button.addEventListener("click", () => {
    const openedWindow = window.open(url, "_blank");
    if (openedWindow) openedWindow.opener = null;
  });
  agendaActionMessage.appendChild(button);
}

function openWhatsAppAfterSuccess(appointment, message, preparedWindow) {
  const url = whatsappUrl(appointment?.clientePhone, message);
  if (!url) {
    closePreparedWhatsAppWindow(preparedWindow);
    showToast("Status atualizado, mas a cliente não possui um telefone válido para abrir o WhatsApp.", "info");
    return;
  }
  if (preparedWindow && !preparedWindow.closed) {
    preparedWindow.location.replace(url);
    return;
  }
  showWhatsAppFallback(url, "Status atualizado, mas o navegador bloqueou a abertura do WhatsApp.");
}

function confirmationWhatsAppMessage(appointment) {
  return `Agendamento confirmado! 💕\n\nOlá, ${appointmentClientFirstName(appointment)}! Seu atendimento no Studio Nail Dreams foi confirmado.\n\n📅 ${displayValue(appointment.dataBr)}\n⏰ ${displayValue(appointment.horaInicio)} às ${displayValue(appointment.horaFim)}\n✨ ${displayValue(appointment.servicoNome)}\n👩‍🎨 ${displayValue(appointment.profissionalNome)}\n\nEsperamos você! ✨`;
}

function completionWhatsAppMessage(appointment) {
  const reviewSection = GOOGLE_REVIEW_URL
    ? `\n\n⭐ Avalie a Nail Dreams no Google:\n${GOOGLE_REVIEW_URL}`
    : "";
  return `Olá, ${appointmentClientFirstName(appointment)}! 💕\n\nFoi uma alegria receber você na Nail Dreams. Esperamos que seu momento com a gente tenha sido tão especial quanto foi para nós cuidar de você. ✨\n\nSe puder, conte como foi sua experiência. Sua avaliação ajuda outras pessoas a conhecerem nosso trabalho e nos ajuda a continuar melhorando.${reviewSection}\n\nEsperamos você novamente em breve. ❤️\n\nCom carinho,\nEquipe Nail Dreams`;
}

function cancellationWhatsAppMessage(appointment) {
  return `Olá, ${appointmentClientFirstName(appointment)}! 💕\n\nSeu atendimento de ${displayValue(appointment.dataBr)}, às ${displayValue(appointment.horaInicio)}, foi cancelado.\n\nQuando quiser escolher um novo momento para cuidar de você, será um prazer receber você novamente na Nail Dreams. ✨\n\n📅 Para remarcar:\n${CLIENT_RESCHEDULE_URL}\n\nCom carinho,\nEquipe Nail Dreams`;
}

function noShowWhatsAppMessage(appointment) {
  return `Olá, ${appointmentClientFirstName(appointment)}! 💕\n\nSentimos sua falta no atendimento marcado para ${displayValue(appointment.dataBr)}, às ${displayValue(appointment.horaInicio)}.\n\nSabemos que imprevistos acontecem. Para uma próxima marcação, será necessário o pagamento antecipado de 30% do valor do serviço como sinal de reserva.\n\nEssa medida nos ajuda a preservar o horário reservado especialmente para cada cliente e a organização da agenda das nossas profissionais. ✨\n\nQuando quiser reagendar, estaremos à disposição.\n\nEquipe Nail Dreams`;
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

  let actionResult = null;
  try {
    actionResult = await callback();
    const successMessage = typeof actionResult === "string" ? actionResult : actionResult.message;
    await loadAgenda();
    showToast(successMessage, "success");
    actionResult.afterSuccess?.();
  } catch (error) {
    actionResult?.onFailure?.();
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

  const appointment = completionAppointment;
  const preparedWhatsAppWindow = prepareWhatsAppWindow();

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
    openWhatsAppAfterSuccess(appointment, completionWhatsAppMessage(appointment), preparedWhatsAppWindow);
  } catch (error) {
    closePreparedWhatsAppWindow(preparedWhatsAppWindow);
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
  const preparedWhatsAppWindow = prepareWhatsAppWindow();
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
    openWhatsAppAfterSuccess(
      appointment,
      isCancel ? cancellationWhatsAppMessage(appointment) : noShowWhatsAppMessage(appointment),
      preparedWhatsAppWindow
    );
  } catch (error) {
    closePreparedWhatsAppWindow(preparedWhatsAppWindow);
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

function getWhatsAppAction(status) {
  if (status === "solicitado" || status === "aguardando_sinal") {
    return {
      label: "WhatsApp · Enviar sinal/Pix",
      templateKey: "deposit_message_template"
    };
  }
  if (status === "confirmado") {
    return {
      label: "WhatsApp · Enviar confirmação",
      templateKey: "confirmation_message_template"
    };
  }
  if (status === "cancelado_cliente" || status === "cancelado_studio") {
    return {
      label: "WhatsApp · Enviar cancelamento",
      templateKey: "cancellation_message_template"
    };
  }
  if (status === "nao_compareceu") {
    return {
      label: "WhatsApp · Enviar não compareceu",
      templateKey: "no_show_message_template"
    };
  }
  return null;
}

function renderWhatsAppAction(card, appointment) {
  const action = getWhatsAppAction(String(appointment.status || "").toLowerCase());
  if (!action) return;

  const actions = document.createElement("div");
  actions.className = "card-whatsapp-actions";
  const button = createActionButton(action.label, "action-whatsapp", () => {
    if (!formatWhatsAppPhone(appointment.clientePhone)) {
      showToast("Cliente sem telefone cadastrado.", "error");
      return;
    }
    const template = studioSettings?.[action.templateKey]
      || STUDIO_SETTINGS_FALLBACK[action.templateKey];
    openWhatsAppMessage(
      appointment.clientePhone,
      fillMessageTemplate(template, appointment)
    );
  });
  actions.appendChild(button);
  card.appendChild(actions);
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
      const preparedWhatsAppWindow = prepareWhatsAppWindow();
      runAppointmentAction(event.currentTarget, async () => {
        try {
          await callAppointmentRpc("confirmar_agendamento_staff", {
            p_agendamento_id: appointment.id,
            p_deposit_status: "pago",
            p_notes: "Confirmado pelo painel administrativo."
          });
          return {
            message: "Agendamento confirmado com sucesso.",
            afterSuccess: () => openWhatsAppAfterSuccess(
              appointment,
              confirmationWhatsAppMessage(appointment),
              preparedWhatsAppWindow
            ),
            onFailure: () => closePreparedWhatsAppWindow(preparedWhatsAppWindow)
          };
        } catch (error) {
          closePreparedWhatsAppWindow(preparedWhatsAppWindow);
          throw error;
        }
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
    renderWhatsAppAction(card, appointment);
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

function setAdminWorkingHoursMessage(text = "", type = "") {
  showMessage(document.querySelector("#working-hours-message"), text, type);
}

function normalizeAdminWorkingHour(item) {
  return {
    clientId: `admin-working-hour-${adminWorkingHoursSequence += 1}`,
    id: item?.id || null,
    weekday: Number(item?.weekday),
    startTime: item?.startTime ?? item?.start_time ?? "",
    endTime: item?.endTime ?? item?.end_time ?? "",
    active: item?.active === true
  };
}

function createAdminWorkingHour(weekday) {
  return normalizeAdminWorkingHour({ weekday, start_time: "09:00", end_time: "18:00", active: true });
}

function adminPeriodsForDay(weekday) {
  return adminWorkingHours
    .filter((period) => period.weekday === weekday)
    .sort((first, second) => first.startTime.localeCompare(second.startTime));
}

function createAdminTimeField(period, field, label) {
  const wrapper = document.createElement("label");
  wrapper.className = "working-time-field";
  const caption = document.createElement("span");
  caption.textContent = label;
  const input = document.createElement("input");
  input.type = "time";
  input.step = "300";
  input.required = true;
  input.value = period[field];
  input.addEventListener("input", () => {
    period[field] = input.value;
    input.classList.remove("invalid");
    setAdminWorkingHoursMessage();
  });
  wrapper.append(caption, input);
  return wrapper;
}

function createAdminPeriodRow(period) {
  const row = document.createElement("div");
  row.className = "working-period";
  row.dataset.clientId = period.clientId;
  row.append(createAdminTimeField(period, "startTime", "Início"));
  const separator = document.createElement("span");
  separator.className = "working-time-separator";
  separator.textContent = "às";
  row.append(separator, createAdminTimeField(period, "endTime", "Fim"));
  const removeButton = document.createElement("button");
  removeButton.type = "button";
  removeButton.className = "working-period-remove";
  removeButton.textContent = "Remover";
  removeButton.setAttribute("aria-label", `Remover período de ${WORKING_HOURS_WEEKDAYS[period.weekday]}`);
  removeButton.addEventListener("click", () => {
    adminWorkingHours = adminWorkingHours.filter((item) => item.clientId !== period.clientId);
    setAdminWorkingHoursMessage();
    renderAdminWorkingHours();
  });
  row.appendChild(removeButton);
  return row;
}

function createAdminWorkingDay(weekday) {
  const periods = adminPeriodsForDay(weekday);
  const activePeriods = periods.filter((period) => period.active);
  const isOpen = activePeriods.length > 0;
  const card = document.createElement("article");
  card.className = `working-day-card${isOpen ? " is-open" : ""}`;
  const header = document.createElement("header");
  const heading = document.createElement("div");
  const title = document.createElement("h3");
  title.textContent = WORKING_HOURS_WEEKDAYS[weekday];
  const summary = document.createElement("p");
  summary.textContent = isOpen ? `${activePeriods.length} período(s)` : "Não atende";
  heading.append(title, summary);
  const toggleLabel = document.createElement("label");
  toggleLabel.className = "working-day-toggle";
  const toggle = document.createElement("input");
  toggle.type = "checkbox";
  toggle.checked = isOpen;
  const toggleText = document.createElement("span");
  toggleText.textContent = isOpen ? "Atende" : "Não atende";
  toggle.addEventListener("change", () => {
    let dayPeriods = adminPeriodsForDay(weekday);
    if (toggle.checked && !dayPeriods.length) {
      adminWorkingHours.push(createAdminWorkingHour(weekday));
      dayPeriods = adminPeriodsForDay(weekday);
    }
    dayPeriods.forEach((period) => { period.active = toggle.checked; });
    setAdminWorkingHoursMessage();
    renderAdminWorkingHours();
  });
  toggleLabel.append(toggle, toggleText);
  header.append(heading, toggleLabel);
  card.appendChild(header);
  if (isOpen) {
    const list = document.createElement("div");
    list.className = "working-periods";
    activePeriods.forEach((period) => list.appendChild(createAdminPeriodRow(period)));
    const addButton = document.createElement("button");
    addButton.type = "button";
    addButton.className = "working-period-add";
    addButton.textContent = "+ Adicionar período";
    addButton.addEventListener("click", () => {
      adminWorkingHours.push(createAdminWorkingHour(weekday));
      setAdminWorkingHoursMessage();
      renderAdminWorkingHours();
    });
    card.append(list, addButton);
  }
  return card;
}

function renderAdminWorkingHours() {
  const week = document.createElement("div");
  week.className = "working-hours-week";
  WORKING_HOURS_WEEKDAYS.forEach((_day, weekday) => week.appendChild(createAdminWorkingDay(weekday)));
  document.querySelector("#working-hours-content").replaceChildren(week);
}

function markInvalidAdminPeriod(period) {
  const row = document.querySelector(`#working-hours-content [data-client-id="${period.clientId}"]`);
  row?.querySelectorAll('input[type="time"]').forEach((input) => input.classList.add("invalid"));
  row?.scrollIntoView({ behavior: "smooth", block: "center" });
}

function validateAdminWorkingHours() {
  const activePeriods = adminWorkingHours.filter((period) => period.active);
  for (const period of activePeriods) {
    if (!period.startTime || !period.endTime) {
      markInvalidAdminPeriod(period);
      return "Preencha o horário inicial e final de todos os períodos ativos.";
    }
    if (period.startTime >= period.endTime) {
      markInvalidAdminPeriod(period);
      return `${WORKING_HOURS_WEEKDAYS[period.weekday]} possui um período em que o início não é anterior ao fim.`;
    }
  }
  for (let weekday = 0; weekday < WORKING_HOURS_WEEKDAYS.length; weekday += 1) {
    const periods = activePeriods
      .filter((period) => period.weekday === weekday)
      .sort((first, second) => first.startTime.localeCompare(second.startTime));
    for (let index = 1; index < periods.length; index += 1) {
      if (periods[index].startTime < periods[index - 1].endTime) {
        markInvalidAdminPeriod(periods[index]);
        return `${WORKING_HOURS_WEEKDAYS[weekday]} possui períodos sobrepostos.`;
      }
    }
  }
  return "";
}

function adminWorkingHoursPayload() {
  return adminWorkingHours.map((period) => ({
    ...(period.id ? { id: period.id } : {}),
    weekday: period.weekday,
    start_time: period.startTime,
    end_time: period.endTime,
    active: period.active
  }));
}

function setupAdminWorkingHoursProfessionals() {
  const select = document.querySelector("#working-hours-professional");
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Selecione uma profissional";
  select.replaceChildren(placeholder);
  fillSelect("#working-hours-professional", activeProfessionals, ["nome", "name"]);
}

async function loadAdminWorkingHours() {
  if (currentUserRole !== "admin") return;
  const professionalId = document.querySelector("#working-hours-professional").value;
  const button = document.querySelector("#save-working-hours-button");
  const content = document.querySelector("#working-hours-content");
  const requestId = adminWorkingHoursRequestId += 1;
  setAdminWorkingHoursMessage();
  button.disabled = true;
  adminWorkingHours = [];
  if (!professionalId) {
    content.innerHTML = '<div class="empty-state">Selecione uma profissional para visualizar os horários.</div>';
    return;
  }
  adminWorkingHoursLoading = true;
  content.innerHTML = '<div class="empty-state">Carregando horários...</div>';
  try {
    const { data, error } = await supabaseClient.rpc("listar_horarios_profissional_staff", {
      p_profissional_id: professionalId
    });
    if (error) throw error;
    if (requestId !== adminWorkingHoursRequestId) return;
    const result = Array.isArray(data) ? data[0] : data;
    if (!result?.success) throw new Error(result?.message || "Não foi possível carregar os horários.");
    adminWorkingHours = (Array.isArray(result.items) ? result.items : []).map(normalizeAdminWorkingHour);
    renderAdminWorkingHours();
    button.disabled = false;
  } catch (error) {
    if (requestId !== adminWorkingHoursRequestId) return;
    console.error("Erro ao carregar horários da profissional:", error);
    content.innerHTML = '<div class="empty-state">Não foi possível carregar os horários desta profissional.</div>';
    setAdminWorkingHoursMessage(readableError(error, "Não foi possível carregar os horários desta profissional."), "error");
  } finally {
    if (requestId === adminWorkingHoursRequestId) adminWorkingHoursLoading = false;
  }
}

async function saveAdminWorkingHours() {
  if (currentUserRole !== "admin" || adminWorkingHoursLoading || adminWorkingHoursSaving) return;
  const professionalId = document.querySelector("#working-hours-professional").value;
  if (!professionalId) {
    setAdminWorkingHoursMessage("Selecione uma profissional antes de salvar.", "error");
    return;
  }
  const validationError = validateAdminWorkingHours();
  if (validationError) {
    setAdminWorkingHoursMessage(validationError, "error");
    return;
  }
  const payload = adminWorkingHoursPayload();
  if (!payload.some((period) => period.active)) {
    const confirmed = window.confirm("Você está prestes a deixar esta profissional sem nenhum horário de atendimento. Deseja continuar?");
    if (!confirmed) return;
  }
  const button = document.querySelector("#save-working-hours-button");
  adminWorkingHoursSaving = true;
  setBusy(button, true, "Salvando horários...");
  setAdminWorkingHoursMessage("Salvando horários...", "info");
  try {
    const { data, error } = await supabaseClient.rpc("salvar_horarios_profissional_admin", {
      p_profissional_id: professionalId,
      p_periodos: payload
    });
    if (error) throw error;
    const result = Array.isArray(data) ? data[0] : data;
    if (!result?.success) throw new Error(result?.message || "Não foi possível salvar os horários.");
    setAdminWorkingHoursMessage();
    showToast("✓ Horários salvos com sucesso!", "success", 3000);
    await loadAdminWorkingHours();
  } catch (error) {
    console.error("Erro ao salvar horários da profissional:", error);
    setAdminWorkingHoursMessage(readableError(error, "Não foi possível salvar os horários."), "error");
  } finally {
    adminWorkingHoursSaving = false;
    setBusy(button, false, "");
    button.disabled = !document.querySelector("#working-hours-professional").value;
  }
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
  const professionalSelect = document.querySelector("#profissional");
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Selecione";
  professionalSelect.replaceChildren(placeholder);
  fillSelect("#profissional", activeProfessionals, ["nome", "name"]);
  if (currentUserRole === "admin") setupAdminWorkingHoursProfessionals();
  setServiceSelectPlaceholder("Selecione uma profissional primeiro");
  resetAvailableTimes("Selecione uma profissional primeiro.");
}

function setupProfessionalFilter(selectId) {
  const select = document.querySelector(selectId);
  const selectedValue = select.value;
  const all = document.createElement("option");
  all.value = "";
  all.textContent = "Todas";
  select.replaceChildren(all);
  activeProfessionals.forEach((professional) => {
    const option = document.createElement("option");
    option.value = professional.id;
    option.textContent = professional.nome || professional.name || "Sem nome";
    select.appendChild(option);
  });
  if ([...select.options].some((option) => option.value === selectedValue)) select.value = selectedValue;
}

function setServiceSelectPlaceholder(text, disabled = true) {
  const select = document.querySelector("#servico");
  const option = document.createElement("option");
  option.value = "";
  option.textContent = text;
  select.replaceChildren(option);
  select.disabled = disabled;
}

function resetNewAppointmentForm() {
  servicesRequestId += 1;
  document.querySelector("#appointment-form").reset();
  document.querySelector("#cliente-nome").value = "";
  document.querySelector("#cliente-phone").value = "";
  document.querySelector("#cliente-email").value = "";
  document.querySelector("#profissional").value = "";
  document.querySelector("#appointment-date").value = "";
  setServiceSelectPlaceholder("Selecione uma profissional primeiro");
  resetAvailableTimes("Selecione uma profissional primeiro.");
  showAppointmentMessage("");
}

function resetAvailableTimes(message = "") {
  availableTimesRequestId += 1;
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
  const selectedSummary = document.querySelector("#selected-time-summary");
  const createButton = document.querySelector("#create-button");
  container.replaceChildren();
  container.hidden = false;
  selectedInput.value = "";
  selectedLabel.textContent = "";
  selectedSummary.hidden = true;
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
      container.hidden = true;
      selectedSummary.hidden = false;
      createButton.disabled = false;
    });
    container.appendChild(button);
  });
}

function clearAvailableTimes() {
  const container = document.querySelector("#available-times");
  container.replaceChildren();
  container.hidden = false;
  document.querySelector("#selected-time").value = "";
  document.querySelector("#selected-time-label").textContent = "";
  document.querySelector("#selected-time-summary").hidden = true;
  document.querySelector("#create-button").disabled = true;
}

function reopenAvailableTimes() {
  const container = document.querySelector("#available-times");
  if (!container.children.length) return;
  container.hidden = false;
  document.querySelector("#selected-time-summary").hidden = true;
  container.querySelector(".time-button.selected")?.focus();
}

async function searchAvailableTimes() {
  const professionalId = document.querySelector("#profissional").value;
  const serviceId = document.querySelector("#servico").value;
  const date = document.querySelector("#appointment-date").value;
  if (!professionalId || !serviceId || !date) {
    showAppointmentMessage("Selecione profissional, serviço e data para buscar horários.");
    return;
  }

  const requestId = ++availableTimesRequestId;
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
    if (requestId !== availableTimesRequestId) return;
    renderTimes(data);
  } catch (error) {
    if (requestId !== availableTimesRequestId) return;
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
    resetNewAppointmentForm();
    document.querySelector("#data-inicio").value = date;
    document.querySelector("#data-fim").value = date;
    showSection("agenda");
    await loadAgenda();
  } catch (error) {
    showToast(readableError(error, "Não foi possível criar o agendamento."), "error");
  } finally {
    setBusy(button, false, "");
    button.disabled = !document.querySelector("#selected-time").value;
  }
}

function optionalValue(selector) {
  const value = document.querySelector(selector).value.trim();
  return value || null;
}

function friendlyBoolean(value) {
  return value ? "Sim" : "Não";
}

function createManagementActions(item, type) {
  const actions = document.createElement("div");
  actions.className = "management-actions";
  const edit = createActionButton("Editar", "management-edit-button", () => openRegistrationModal(type, item));
  actions.appendChild(edit);
  if (type === "professional" || type === "service") {
    const active = Boolean(item.active);
    const toggle = createActionButton(
      active ? "Desativar" : "Ativar",
      active ? "management-disable-button" : "management-enable-button",
      () => toggleRegistrationActive(type, item)
    );
    actions.appendChild(toggle);
  }
  return actions;
}

function renderManagementList(containerId, items, columns, type) {
  const container = document.querySelector(containerId);
  container.replaceChildren();
  if (!items.length) {
    const empty = document.createElement("p");
    empty.className = "finance-empty-state";
    empty.textContent = "Nenhum registro encontrado.";
    container.appendChild(empty);
    return;
  }

  const wrapper = document.createElement("div");
  wrapper.className = "finance-table-wrapper table-scroll desktop-table";
  const table = document.createElement("table");
  table.className = "finance-table management-table";
  const head = document.createElement("thead");
  const headRow = document.createElement("tr");
  [...columns.map((column) => column.label), "Ações"].forEach((label) => {
    const th = document.createElement("th");
    th.scope = "col";
    th.textContent = label;
    headRow.appendChild(th);
  });
  head.appendChild(headRow);
  const body = document.createElement("tbody");
  items.forEach((item) => {
    const row = document.createElement("tr");
    columns.forEach((column) => {
      const cell = document.createElement("td");
      const value = typeof column.value === "function" ? column.value(item) : item[column.value];
      cell.textContent = displayValue(value);
      row.appendChild(cell);
    });
    const actionCell = document.createElement("td");
    actionCell.appendChild(createManagementActions(item, type));
    row.appendChild(actionCell);
    body.appendChild(row);
  });
  table.append(head, body);
  wrapper.appendChild(table);

  const mobileList = document.createElement("div");
  mobileList.className = "mobile-list data-mobile-list";
  items.forEach((item) => {
    const card = document.createElement("article");
    card.className = "mobile-data-card management-mobile-card";
    columns.forEach((column) => {
      const value = typeof column.value === "function" ? column.value(item) : item[column.value];
      card.appendChild(createCompactMobileField(column.label, value));
    });
    const actions = createManagementActions(item, type);
    actions.classList.add("mobile-card-actions");
    card.appendChild(actions);
    mobileList.appendChild(card);
  });
  container.append(wrapper, mobileList);
}

function contractValue(contract, ...keys) {
  return keys.map((key) => contract?.[key]).find((value) => value !== undefined && value !== null && value !== "");
}

function formatContractDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return displayValue(value);
  const hasTime = String(value).includes("T") || String(value).includes(" ");
  return new Intl.DateTimeFormat("pt-BR", hasTime
    ? { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }
    : { dateStyle: "short", timeZone: "UTC" }).format(date);
}

function formatContractPercentage(value) {
  if (value === undefined || value === null || value === "") return "—";
  const number = Number(value);
  return Number.isFinite(number) ? `${number.toLocaleString("pt-BR")} %` : displayValue(value);
}

function contractStatusLabel(status) {
  const labels = {
    pendente_assinatura: "Aguardando assinatura",
    aguardando_validacao: "Aguardando validação",
    ativo: "Ativo"
  };
  return labels[status] || displayValue(status).replaceAll("_", " ");
}

function normalizeContract(contract) {
  const professionalRelation = contract?.profissionais || contract?.profissional;
  const relatedProfessional = Array.isArray(professionalRelation) ? professionalRelation[0] : professionalRelation;
  return {
    raw: contract,
    id: contractValue(contract, "id", "contrato_id", "contratoId"),
    number: contractValue(contract, "numero_contrato", "numeroContrato", "numero"),
    professional: contractValue(contract, "profissional_nome", "profissionalNome", "nome_profissional", "nomeProfissional")
      || contractValue(relatedProfessional, "nome", "name", "full_name"),
    status: contractValue(contract, "status"),
    version: contractValue(contract, "versao", "version"),
    experienceCommission: contractValue(contract, "percentual_experiencia", "percentualExperiencia", "comissao_experiencia", "comissaoExperiencia"),
    postExperienceCommission: contractValue(contract, "percentual_pos_experiencia", "percentualPosExperiencia", "comissao_pos_experiencia", "comissaoPosExperiencia"),
    startDate: contractValue(contract, "data_inicio", "dataInicio"),
    sentAt: contractValue(contract, "enviado_em", "enviadoEm", "arquivo_assinado_enviado_em", "arquivoAssinadoEnviadoEm"),
    validatedAt: contractValue(contract, "validado_em", "validadoEm", "aceito_em", "aceitoEm"),
    validationNotes: contractValue(contract, "observacao_validacao", "observacaoValidacao", "observacoes_validacao", "observacoesValidacao"),
    signedFileUrl: contractValue(contract, "arquivo_assinado_url", "arquivoAssinadoUrl"),
    originalContent: contractValue(contract, "conteudo_contrato", "conteudoContrato")
  };
}

function closeContractViewModal() {
  contractViewModal.hidden = true;
  if (originalContractModal.hidden) document.body.classList.remove("modal-open");
}

function closeOriginalContractModal() {
  originalContractModal.hidden = true;
  if (contractViewModal.hidden) document.body.classList.remove("modal-open");
}

function openOriginalContractModal(contract) {
  document.querySelector("#original-contract-title").textContent = `Contrato original ${displayValue(contract.number)}`;
  document.querySelector("#original-contract-content").textContent = displayValue(contract.originalContent);
  originalContractModal.hidden = false;
  document.body.classList.add("modal-open");
  closeOriginalContractButton.focus();
}

function openContractViewModal(contract) {
  document.querySelector("#contract-view-title").textContent = `Contrato ${displayValue(contract.number)}`;
  const details = document.querySelector("#contract-view-details");
  details.replaceChildren();
  addDetail(details, "Profissional", contract.professional);
  addDetail(details, "Status", contractStatusLabel(contract.status));
  addDetail(details, "Número do contrato", contract.number);
  addDetail(details, "Versão", contract.version);
  addDetail(details, "Comissão experiência", formatContractPercentage(contract.experienceCommission));
  addDetail(details, "Comissão pós experiência", formatContractPercentage(contract.postExperienceCommission));
  addDetail(details, "Data início", formatContractDate(contract.startDate));
  addDetail(details, "Enviado em", formatContractDate(contract.sentAt));
  addDetail(details, "Validado em", formatContractDate(contract.validatedAt));
  addDetail(details, "Observação validação", contract.validationNotes);

  const documentActions = document.querySelector("#contract-document-actions");
  documentActions.replaceChildren();
  if (contract.signedFileUrl) {
    documentActions.appendChild(createActionButton("Ver documento assinado", "action-confirm", () => {
      const openedWindow = window.open(contract.signedFileUrl, "_blank", "noopener,noreferrer");
      if (openedWindow) openedWindow.opener = null;
    }));
  } else {
    const unavailable = document.createElement("span");
    unavailable.className = "muted";
    unavailable.textContent = "Nenhum documento assinado disponível.";
    documentActions.appendChild(unavailable);
  }
  const originalButton = createActionButton("Visualizar contrato original", "management-edit-button", () => openOriginalContractModal(contract));
  originalButton.disabled = !contract.originalContent;
  documentActions.appendChild(originalButton);
  contractViewModal.hidden = false;
  document.body.classList.add("modal-open");
  closeContractViewButton.focus();
}

function createContractAction(contract) {
  const actions = document.createElement("div");
  actions.className = "management-actions";
  actions.appendChild(createActionButton("Visualizar", "management-edit-button", () => openContractViewModal(contract)));
  if (contract.status === "aguardando_validacao") {
    actions.appendChild(createActionButton("Validar contrato", "management-enable-button", (event) => validateContract(contract, event.currentTarget)));
    actions.appendChild(createActionButton("Solicitar correção", "management-disable-button", (event) => requestContractCorrection(contract, event.currentTarget)));
  }
  return actions;
}

async function validateContract(contract, button) {
  if (contractValidationSaving) return;
  const confirmed = window.confirm(`Confirma a validação do contrato ${displayValue(contract.number)} de ${displayValue(contract.professional)}?`);
  if (!confirmed) return;
  contractValidationSaving = true;
  setBusy(button, true, "Validando...");
  try {
    const { data, error } = await supabaseClient.rpc("validar_contrato_profissional", {
      p_contrato_id: contract.id,
      p_aprovado: true,
      p_observacao: null
    });
    if (error) throw error;
    const resultError = rpcResultError(data);
    if (resultError) throw resultError;
    await loadContracts();
    showToast("Contrato validado com sucesso.", "success");
  } catch (error) {
    console.error("Erro ao validar contrato profissional:", error);
    showToast(readableError(error, "Não foi possível validar o contrato."), "error");
    if (button.isConnected) setBusy(button, false, "");
  } finally {
    contractValidationSaving = false;
  }
}

async function requestContractCorrection(contract, button) {
  if (contractValidationSaving) return;
  const reasonInput = window.prompt("Informe o motivo da correção solicitada:");
  if (reasonInput === null) return;
  const reason = reasonInput.trim();
  if (!reason) {
    showToast("Informe o motivo da correção.", "error");
    return;
  }
  contractValidationSaving = true;
  setBusy(button, true, "Enviando...");
  try {
    const { data, error } = await supabaseClient.rpc("validar_contrato_profissional", {
      p_contrato_id: contract.id,
      p_aprovado: false,
      p_observacao: reason
    });
    if (error) throw error;
    const resultError = rpcResultError(data);
    if (resultError) throw resultError;
    await loadContracts();
    showToast("Solicitação de correção enviada com sucesso.", "success");
  } catch (error) {
    console.error("Erro ao solicitar correção do contrato profissional:", error);
    showToast(readableError(error, "Não foi possível solicitar a correção do contrato."), "error");
    if (button.isConnected) setBusy(button, false, "");
  } finally {
    contractValidationSaving = false;
  }
}

function renderContractSummary(contracts) {
  const grid = document.createElement("div");
  grid.className = "finance-card-grid";
  const counts = {
    active: contracts.filter((contract) => contract.status === "ativo").length,
    signature: contracts.filter((contract) => contract.status === "pendente_assinatura").length,
    validation: contracts.filter((contract) => contract.status === "aguardando_validacao").length
  };
  grid.append(
    createFinanceCard("Total contratos", contracts.length),
    createFinanceCard("Ativos", counts.active),
    createFinanceCard("Aguardando assinatura", counts.signature),
    createFinanceCard("Aguardando validação", counts.validation)
  );
  return grid;
}

function renderContracts(contracts) {
  const content = document.querySelector("#contracts-content");
  content.replaceChildren(renderContractSummary(contracts));
  if (!contracts.length) {
    const empty = document.createElement("p");
    empty.className = "finance-empty-state";
    empty.textContent = "Nenhum contrato encontrado.";
    content.appendChild(empty);
    return;
  }

  const columns = ["Profissional", "Contrato", "Status", "Comissão", "Data início", "Ações"];
  const wrapper = document.createElement("div");
  wrapper.className = "finance-table-wrapper table-scroll desktop-table";
  const table = document.createElement("table");
  table.className = "finance-table management-table";
  const head = document.createElement("thead");
  const headRow = document.createElement("tr");
  columns.forEach((label) => {
    const cell = document.createElement("th");
    cell.scope = "col";
    cell.textContent = label;
    headRow.appendChild(cell);
  });
  head.appendChild(headRow);
  const body = document.createElement("tbody");
  contracts.forEach((contract) => {
    const row = document.createElement("tr");
    [
      displayValue(contract.professional),
      displayValue(contract.number),
      contractStatusLabel(contract.status),
      `${formatContractPercentage(contract.experienceCommission)} / ${formatContractPercentage(contract.postExperienceCommission)}`,
      formatContractDate(contract.startDate)
    ].forEach((value, index) => {
      const cell = document.createElement("td");
      cell.textContent = value;
      if (index === 2) cell.className = "commission-state";
      row.appendChild(cell);
    });
    const actionCell = document.createElement("td");
    actionCell.appendChild(createContractAction(contract));
    row.appendChild(actionCell);
    body.appendChild(row);
  });
  table.append(head, body);
  wrapper.appendChild(table);

  const mobileList = document.createElement("div");
  mobileList.className = "mobile-list data-mobile-list";
  contracts.forEach((contract) => {
    const card = document.createElement("article");
    card.className = "mobile-data-card management-mobile-card";
    card.append(
      createCompactMobileField("Profissional", contract.professional),
      createCompactMobileField("Contrato", contract.number),
      createCompactMobileField("Status", contractStatusLabel(contract.status)),
      createCompactMobileField("Comissão", `${formatContractPercentage(contract.experienceCommission)} / ${formatContractPercentage(contract.postExperienceCommission)}`),
      createCompactMobileField("Data início", formatContractDate(contract.startDate))
    );
    const actions = createContractAction(contract);
    actions.classList.add("mobile-card-actions");
    card.appendChild(actions);
    mobileList.appendChild(card);
  });
  content.append(wrapper, mobileList);
}

async function loadContracts() {
  if (currentUserRole !== "admin") return;
  const message = document.querySelector("#contracts-message");
  showMessage(message, "Carregando contratos...", "info");
  try {
    const { data, error } = await supabaseClient.rpc("listar_contratos_profissionais_admin");
    if (error) throw error;
    const resultError = rpcResultError(data);
    if (resultError) throw resultError;
    const payload = Array.isArray(data) ? data : data?.items || data?.contratos || data?.data || [];
    renderContracts(payload.map(normalizeContract));
    showMessage(message, "");
  } catch (error) {
    console.error("Erro ao carregar contratos profissionais:", error);
    document.querySelector("#contracts-content").replaceChildren();
    showMessage(message, readableError(error, "Não foi possível carregar os contratos."), "error");
  }
}

async function loadClients(event) {
  event?.preventDefault();
  if (!currentUserRole) return;
  const button = document.querySelector("#search-clients-button");
  const search = document.querySelector("#clients-search").value.trim().replace(/[,()]/g, " ");
  setBusy(button, true, "Buscando...");
  try {
    let query = supabaseClient.from("clientes").select("*").order("full_name");
    if (search) {
      query = query.or(`full_name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%`);
    }
    const { data, error } = await query;
    if (error) throw error;
    clientsCache = data || [];
    renderManagementList("#clients-content", clientsCache, [
      { label: "Nome", value: "full_name" },
      { label: "Telefone", value: "phone" },
      { label: "E-mail", value: "email" },
      { label: "Nascimento", value: "birth_date" },
      { label: "Cliente da casa", value: (item) => friendlyBoolean(item.is_house_client) },
      { label: "Exige sinal", value: (item) => friendlyBoolean(item.requires_deposit_default) },
      { label: "% sinal", value: (item) => item.deposit_percent_default ?? 0 },
      { label: "Observações", value: "notes" }
    ], "client");
  } catch (error) {
    console.error("Erro ao carregar clientes:", error);
    showToast(readableError(error, "Não foi possível carregar os clientes."), "error");
  } finally {
    setBusy(button, false, "");
  }
}

async function loadProfessionalsManagement() {
  if (currentUserRole !== "admin") return;
  try {
    const { data, error } = await supabaseClient.from("profissionais").select("*").order("name");
    if (error) throw error;
    professionalsCache = data || [];
    renderManagementList("#professionals-content", professionalsCache, [
      { label: "Nome", value: (item) => item.name || item.nome },
      { label: "Telefone", value: "phone" },
      { label: "E-mail", value: "email" },
      { label: "Especialidade", value: "specialty" },
      { label: "Ativo", value: (item) => friendlyBoolean(item.active) },
      { label: "Cor", value: "color" },
      { label: "Observações", value: "notes" }
    ], "professional");
  } catch (error) {
    console.error("Erro ao carregar profissionais:", error);
    showToast(readableError(error, "Não foi possível carregar os profissionais."), "error");
  }
}

async function loadServicesManagement() {
  if (currentUserRole !== "admin") return;
  try {
    const { data, error } = await supabaseClient.from("servicos").select("*").order("name");
    if (error) throw error;
    servicesCache = data || [];
    renderManagementList("#services-content", servicesCache, [
      { label: "Serviço", value: (item) => item.name || item.nome },
      { label: "Categoria", value: (item) => item.category || item.categoria },
      { label: "Descrição", value: "description" },
      { label: "Duração", value: (item) => `${item.duration_minutes ?? 0} min` },
      { label: "Preço", value: (item) => formatCurrency(item.price) },
      { label: "Ativo", value: (item) => friendlyBoolean(item.active) },
      { label: "Exige sinal", value: (item) => friendlyBoolean(item.requires_deposit_default) },
      { label: "% sinal", value: (item) => item.deposit_percent_default ?? 0 }
    ], "service");
  } catch (error) {
    console.error("Erro ao carregar serviços:", error);
    showToast(readableError(error, "Não foi possível carregar os serviços."), "error");
  }
}

function setRegistrationField(selector, value) {
  document.querySelector(selector).value = value ?? "";
}

function renderProfessionalServiceCheckboxes(activeLinkIds = new Set()) {
  const container = document.querySelector("#professional-services-checkboxes");
  container.replaceChildren();
  if (!activeServices.length) {
    const empty = document.createElement("span");
    empty.className = "muted";
    empty.textContent = "Nenhum serviço ativo disponível.";
    container.appendChild(empty);
    return;
  }
  activeServices.forEach((service) => {
    const label = document.createElement("label");
    label.className = "checkbox-label service-checkbox";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = service.id;
    input.checked = activeLinkIds.has(String(service.id));
    label.append(input, document.createTextNode(service.name || service.nome || "Sem nome"));
    container.appendChild(label);
  });
}

async function openRegistrationModal(type, item = null) {
  if ((type === "professional" || type === "service") && currentUserRole !== "admin") return;
  registrationState = { type, item };
  registrationForm.reset();
  showMessage(registrationMessage, "");
  document.querySelectorAll(".registration-fields").forEach((fields) => { fields.hidden = true; });
  document.querySelector(`#${type}-registration-fields`).hidden = false;
  const editing = Boolean(item);
  const titles = { client: "cliente", professional: "profissional", service: "serviço" };
  document.querySelector("#registration-modal-title").textContent = `${editing ? "Editar" : "Novo"} ${titles[type]}`;
  document.querySelector("#registration-modal-intro").textContent = "Preencha os dados e confirme para salvar.";

  if (type === "client") {
    setRegistrationField("#registration-client-name", item?.full_name);
    setRegistrationField("#registration-client-phone", item?.phone);
    setRegistrationField("#registration-client-email", item?.email);
    setRegistrationField("#registration-client-birth-date", item?.birth_date);
    document.querySelector("#registration-client-house").checked = Boolean(item?.is_house_client);
    document.querySelector("#registration-client-deposit").checked = Boolean(item?.requires_deposit_default);
    setRegistrationField("#registration-client-deposit-percent", item?.deposit_percent_default ?? 0);
    setRegistrationField("#registration-client-notes", item?.notes);
  } else if (type === "professional") {
    setRegistrationField("#registration-professional-name", item?.name || item?.nome);
    setRegistrationField("#registration-professional-phone", item?.phone);
    setRegistrationField("#registration-professional-email", item?.email);
    setRegistrationField("#registration-professional-specialty", item?.specialty);
    setRegistrationField("#registration-professional-color", item?.color || "#a94f72");
    document.querySelector("#registration-professional-active").checked = item ? Boolean(item.active) : true;
    setRegistrationField("#registration-professional-notes", item?.notes);
    let activeLinkIds = new Set();
    if (item?.id) {
      const { data, error } = await supabaseClient
        .from("profissional_servicos")
        .select("servico_id, active")
        .eq("profissional_id", item.id);
      if (error) {
        showToast(readableError(error, "Não foi possível carregar os vínculos."), "error");
        return;
      }
      activeLinkIds = new Set((data || []).filter((link) => link.active).map((link) => String(link.servico_id)));
    }
    renderProfessionalServiceCheckboxes(activeLinkIds);
  } else {
    setRegistrationField("#registration-service-name", item?.name || item?.nome);
    setRegistrationField("#registration-service-category", item?.category || item?.categoria);
    setRegistrationField("#registration-service-duration", item?.duration_minutes);
    setRegistrationField("#registration-service-price", item?.price ?? 0);
    document.querySelector("#registration-service-active").checked = item ? Boolean(item.active) : true;
    document.querySelector("#registration-service-deposit").checked = Boolean(item?.requires_deposit_default);
    setRegistrationField("#registration-service-deposit-percent", item?.deposit_percent_default ?? 0);
    setRegistrationField("#registration-service-description", item?.description);
  }
  registrationModal.hidden = false;
  document.body.classList.add("modal-open");
}

function closeRegistrationModal() {
  if (registrationSaving) return;
  registrationModal.hidden = true;
  document.body.classList.remove("modal-open");
  registrationState = null;
  showMessage(registrationMessage, "");
}

async function syncProfessionalServices(professionalId) {
  const selectedIds = new Set(
    [...document.querySelectorAll("#professional-services-checkboxes input:checked")].map((input) => String(input.value))
  );
  const { data, error } = await supabaseClient
    .from("profissional_servicos")
    .select("id, servico_id, active")
    .eq("profissional_id", professionalId);
  if (error) throw error;
  const existing = data || [];
  const operations = activeServices.map((service) => {
    const link = existing.find((item) => String(item.servico_id) === String(service.id));
    const shouldBeActive = selectedIds.has(String(service.id));
    if (link && Boolean(link.active) !== shouldBeActive) {
      return supabaseClient.from("profissional_servicos").update({ active: shouldBeActive }).eq("id", link.id);
    }
    if (!link && shouldBeActive) {
      return supabaseClient.from("profissional_servicos").insert({
        profissional_id: professionalId,
        servico_id: service.id,
        active: true
      });
    }
    return null;
  }).filter(Boolean);
  const results = await Promise.all(operations);
  const operationError = results.find((result) => result.error)?.error;
  if (operationError) throw operationError;
}

async function refreshActiveCatalogs() {
  await loadCatalogs();
  if (currentUserRole === "admin") {
    setupProfessionalFilter("#finance-professional");
    setupProfessionalFilter("#commissions-professional");
  }
}

async function saveRegistration(event) {
  event.preventDefault();
  if (!registrationState || registrationSaving) return;
  const { type, item } = registrationState;
  if ((type === "professional" || type === "service") && currentUserRole !== "admin") return;
  let payload;
  if (type === "client") {
    const name = document.querySelector("#registration-client-name").value.trim();
    const percent = numberValue(document.querySelector("#registration-client-deposit-percent").value);
    if (!name) return showMessage(registrationMessage, "Informe o nome da cliente.");
    if (percent < 0 || percent > 100) return showMessage(registrationMessage, "O percentual deve ficar entre 0 e 100.");
    payload = {
      full_name: name,
      phone: optionalValue("#registration-client-phone"),
      email: optionalValue("#registration-client-email"),
      birth_date: optionalValue("#registration-client-birth-date"),
      is_house_client: document.querySelector("#registration-client-house").checked,
      requires_deposit_default: document.querySelector("#registration-client-deposit").checked,
      deposit_percent_default: percent,
      notes: optionalValue("#registration-client-notes")
    };
  } else if (type === "professional") {
    const name = document.querySelector("#registration-professional-name").value.trim();
    if (!name) return showMessage(registrationMessage, "Informe o nome da profissional.");
    payload = {
      name,
      phone: optionalValue("#registration-professional-phone"),
      email: optionalValue("#registration-professional-email"),
      specialty: optionalValue("#registration-professional-specialty"),
      color: document.querySelector("#registration-professional-color").value,
      active: document.querySelector("#registration-professional-active").checked,
      notes: optionalValue("#registration-professional-notes")
    };
  } else {
    const name = document.querySelector("#registration-service-name").value.trim();
    const duration = Number(document.querySelector("#registration-service-duration").value);
    const price = normalizeAmount(document.querySelector("#registration-service-price").value);
    const percent = numberValue(document.querySelector("#registration-service-deposit-percent").value);
    if (!name) return showMessage(registrationMessage, "Informe o nome do serviço.");
    if (!Number.isFinite(duration) || duration <= 0) return showMessage(registrationMessage, "A duração deve ser maior que zero.");
    if (!Number.isFinite(price) || price < 0) return showMessage(registrationMessage, "O preço não pode ser negativo.");
    if (percent < 0 || percent > 100) return showMessage(registrationMessage, "O percentual deve ficar entre 0 e 100.");
    payload = {
      name,
      category: optionalValue("#registration-service-category"),
      description: optionalValue("#registration-service-description"),
      duration_minutes: duration,
      price,
      active: document.querySelector("#registration-service-active").checked,
      requires_deposit_default: document.querySelector("#registration-service-deposit").checked,
      deposit_percent_default: percent
    };
  }

  registrationSaving = true;
  saveRegistrationButton.disabled = true;
  cancelRegistrationButton.disabled = true;
  closeRegistrationButton.disabled = true;
  saveRegistrationButton.textContent = "Salvando...";
  showMessage(registrationMessage, "");
  try {
    const table = type === "client" ? "clientes" : type === "professional" ? "profissionais" : "servicos";
    let saved;
    if (item?.id) {
      const { error } = await supabaseClient.from(table).update(payload).eq("id", item.id);
      if (error) throw error;
      saved = { ...item, ...payload };
    } else {
      const { data, error } = await supabaseClient.from(table).insert(payload).select().single();
      if (error) throw error;
      saved = data;
    }
    registrationState.item = saved;
    if (type === "professional") await syncProfessionalServices(saved.id);

    registrationSaving = false;
    closeRegistrationModal();
    if (type === "client") await loadClients();
    else {
      await refreshActiveCatalogs();
      if (type === "professional") await loadProfessionalsManagement();
      else await loadServicesManagement();
    }
    showToast(
      type === "professional"
        ? "Profissional e vínculos salvos com sucesso!"
        : `${type === "client" ? "Cliente" : "Serviço"} salvo com sucesso!`,
      "success"
    );
  } catch (error) {
    console.error("Erro ao salvar cadastro:", error);
    const message = readableError(error, "Não foi possível salvar o cadastro.");
    showMessage(registrationMessage, message);
    showToast(message, "error");
  } finally {
    registrationSaving = false;
    saveRegistrationButton.disabled = false;
    cancelRegistrationButton.disabled = false;
    closeRegistrationButton.disabled = false;
    saveRegistrationButton.textContent = "Salvar";
  }
}

async function toggleRegistrationActive(type, item) {
  if (currentUserRole !== "admin") return;
  const table = type === "professional" ? "profissionais" : "servicos";
  const nextActive = !item.active;
  try {
    const { error } = await supabaseClient.from(table).update({ active: nextActive }).eq("id", item.id);
    if (error) throw error;
    await refreshActiveCatalogs();
    if (type === "professional") await loadProfessionalsManagement();
    else await loadServicesManagement();
    showToast(`${type === "professional" ? "Profissional" : "Serviço"} ${nextActive ? "ativado" : "desativado"} com sucesso!`, "success");
  } catch (error) {
    console.error("Erro ao alterar status do cadastro:", error);
    showToast(readableError(error, "Não foi possível alterar o status."), "error");
  }
}

function setSettingsValue(selector, value) {
  document.querySelector(selector).value = value ?? "";
}

function normalizeStudioSettings(data = {}) {
  return {
    ...STUDIO_SETTINGS_FALLBACK,
    ...data,
    studio_name: data.studio_name || STUDIO_SETTINGS_FALLBACK.studio_name
  };
}

async function loadGlobalStudioSettings() {
  try {
    const { data, error } = await supabaseClient
      .from("studio_settings")
      .select("*")
      .eq("id", true)
      .single();
    if (error?.code === "PGRST116") {
      throw new Error("As configurações do studio ainda não foram cadastradas.");
    }
    if (error) throw error;
    if (!data) throw new Error("As configurações do studio ainda não foram cadastradas.");
    studioSettings = normalizeStudioSettings(data);
    studioSettingsLoadError = null;
    return true;
  } catch (error) {
    console.warn("Não foi possível carregar as configurações globais; usando valores padrão:", error);
    studioSettings = normalizeStudioSettings();
    studioSettingsLoadError = error;
    return false;
  }
}

async function loadStudioSettings() {
  if (currentUserRole !== "admin" || settingsLoading || settingsSaving) return;
  settingsLoading = true;
  saveSettingsButton.disabled = true;
  showMessage(settingsMessage, "Carregando...", "info");
  try {
    if (studioSettingsLoadError) {
      const loaded = await loadGlobalStudioSettings();
      if (!loaded) throw studioSettingsLoadError;
    }
    if (!studioSettings) throw new Error("As configurações do studio ainda não foram carregadas.");
    const data = studioSettings;

    setSettingsValue("#settings-studio-name", data.studio_name);
    setSettingsValue("#settings-whatsapp", data.studio_whatsapp);
    setSettingsValue("#settings-pix-key", data.pix_key);
    setSettingsValue("#settings-timezone", data.timezone || "America/Sao_Paulo");
    setSettingsValue("#settings-open-time", String(data.default_open_time || "").slice(0, 5));
    setSettingsValue("#settings-close-time", String(data.default_close_time || "").slice(0, 5));
    setSettingsValue("#settings-interval", data.appointment_interval_minutes);
    document.querySelector("#settings-requires-deposit").checked = Boolean(data.requires_deposit_default);
    setSettingsValue("#settings-deposit-percent", data.default_deposit_percent ?? 0);
    setSettingsValue("#settings-confirmation-message", data.confirmation_message_template);
    setSettingsValue("#settings-cancellation-message", data.cancellation_message_template);
    setSettingsValue("#settings-no-show-message", data.no_show_message_template);
    setSettingsValue("#settings-deposit-message", data.deposit_message_template);
    setSettingsValue("#settings-notes", data.notes);

    const closedDays = new Set(
      (Array.isArray(data.closed_weekdays) ? data.closed_weekdays : []).map((day) => String(day))
    );
    document.querySelectorAll('input[name="closed-weekday"]').forEach((input) => {
      input.checked = closedDays.has(input.value);
    });
    showMessage(settingsMessage, "");
    saveSettingsButton.disabled = false;
  } catch (error) {
    console.error("Erro ao carregar configurações:", error);
    const message = readableError(error, "Não foi possível carregar as configurações do sistema.");
    showMessage(settingsMessage, message);
    showToast(message, "error");
  } finally {
    settingsLoading = false;
  }
}

async function saveStudioSettings(event) {
  event.preventDefault();
  if (currentUserRole !== "admin" || settingsLoading || settingsSaving) return;

  const studioName = document.querySelector("#settings-studio-name").value.trim();
  const openTime = document.querySelector("#settings-open-time").value;
  const closeTime = document.querySelector("#settings-close-time").value;
  const interval = Number(document.querySelector("#settings-interval").value);
  const depositPercent = Number(document.querySelector("#settings-deposit-percent").value || 0);
  if (!studioName) return showToast("Informe o nome do studio.", "error");
  if (!openTime || !closeTime || closeTime <= openTime) {
    return showToast("O horário de fechamento deve ser maior que o horário de abertura.", "error");
  }
  if (!Number.isFinite(interval) || interval <= 0) return showToast("O intervalo deve ser maior que zero.", "error");
  if (!Number.isFinite(depositPercent) || depositPercent < 0 || depositPercent > 100) {
    return showToast("O percentual de sinal deve ficar entre 0 e 100.", "error");
  }

  const closedWeekdays = [...document.querySelectorAll('input[name="closed-weekday"]:checked')]
    .map((input) => Number(input.value))
    .sort((a, b) => a - b);
  const payload = {
    studio_name: studioName,
    studio_whatsapp: optionalValue("#settings-whatsapp"),
    pix_key: optionalValue("#settings-pix-key"),
    timezone: optionalValue("#settings-timezone"),
    default_open_time: openTime,
    default_close_time: closeTime,
    closed_weekdays: closedWeekdays,
    appointment_interval_minutes: interval,
    requires_deposit_default: document.querySelector("#settings-requires-deposit").checked,
    default_deposit_percent: depositPercent,
    confirmation_message_template: optionalValue("#settings-confirmation-message"),
    cancellation_message_template: optionalValue("#settings-cancellation-message"),
    no_show_message_template: optionalValue("#settings-no-show-message"),
    deposit_message_template: optionalValue("#settings-deposit-message"),
    notes: optionalValue("#settings-notes"),
    updated_by: currentUserId
  };

  settingsSaving = true;
  setBusy(saveSettingsButton, true, "Salvando...");
  showMessage(settingsMessage, "");
  try {
    const { error } = await supabaseClient
      .from("studio_settings")
      .update(payload)
      .eq("id", true);
    if (error) throw error;
    studioSettings = normalizeStudioSettings({ ...studioSettings, ...payload });
    studioSettingsLoadError = null;
    showToast("Configurações salvas com sucesso!", "success");
  } catch (error) {
    console.error("Erro ao salvar configurações:", error);
    showToast(readableError(error, "Não foi possível salvar as configurações."), "error");
  } finally {
    settingsSaving = false;
    setBusy(saveSettingsButton, false, "");
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
  setupProfessionalFilter("#finance-professional");
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
  setupProfessionalFilter("#commissions-professional");
}

async function initializeAdmin() {
  try {
    const access = await requireAdminAccess();
    if (!access) return;
    currentUserRole = access.profile.role;
    currentUserId = access.session.user.id;
    if (currentUserRole === "admin" || currentUserRole === "recepcao") {
      await loadGlobalStudioSettings();
    }
    applyRoleBasedNavigation(access.profile);
    const displayName = access.profile.nome || access.profile.name || access.profile.full_name;
    document.querySelector("#logged-user").textContent = displayName
      ? `${displayName} · ${access.session.user.email}`
      : access.session.user.email;

    const today = todayInSaoPaulo();
    document.querySelector("#data-inicio").value = today;
    document.querySelector("#data-fim").value = today;
    await loadCatalogs();
    await loadAgenda();
    await loadClients();
    if (currentUserRole === "admin") {
      await Promise.all([loadProfessionalsManagement(), loadServicesManagement()]);
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
document.querySelector("#appointment-date").addEventListener("change", () => {
  resetAvailableTimes("Clique em Buscar horários para ver a disponibilidade.");
});
document.querySelector("#change-selected-time").addEventListener("click", reopenAvailableTimes);
document.querySelector("#finance-form").addEventListener("submit", loadFinancialSummary);
document.querySelector("#commissions-form").addEventListener("submit", loadCommissions);
document.querySelector("#generate-commissions-button").addEventListener("click", generateCommissions);
document.querySelector("#clients-search-form").addEventListener("submit", loadClients);
document.querySelector("#new-client-button").addEventListener("click", () => openRegistrationModal("client"));
document.querySelector("#new-professional-button").addEventListener("click", () => openRegistrationModal("professional"));
document.querySelector("#new-service-button").addEventListener("click", () => openRegistrationModal("service"));
document.querySelector("#working-hours-professional").addEventListener("change", loadAdminWorkingHours);
document.querySelector("#save-working-hours-button").addEventListener("click", saveAdminWorkingHours);
settingsForm.addEventListener("submit", saveStudioSettings);
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
closeContractViewButton.addEventListener("click", closeContractViewModal);
backContractViewButton.addEventListener("click", closeContractViewModal);
contractViewModal.addEventListener("click", (event) => {
  if (event.target === contractViewModal) closeContractViewModal();
});
closeOriginalContractButton.addEventListener("click", closeOriginalContractModal);
backOriginalContractButton.addEventListener("click", closeOriginalContractModal);
originalContractModal.addEventListener("click", (event) => {
  if (event.target === originalContractModal) closeOriginalContractModal();
});
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (!originalContractModal.hidden) closeOriginalContractModal();
  else if (!contractViewModal.hidden) closeContractViewModal();
});
document.querySelector("#app-toast-close").addEventListener("click", hideToast);
registrationForm.addEventListener("submit", saveRegistration);
cancelRegistrationButton.addEventListener("click", closeRegistrationModal);
closeRegistrationButton.addEventListener("click", closeRegistrationModal);
registrationModal.addEventListener("click", (event) => {
  if (event.target === registrationModal) closeRegistrationModal();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !registrationModal.hidden) closeRegistrationModal();
});
setupSidebarNavigation();
initializeAdmin();
