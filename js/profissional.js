const PROFESSIONAL_ROLE = "profissional";
const CLOSED_STATUSES = new Set(["concluido", "cancelado_cliente", "cancelado_studio", "nao_compareceu", "expirado"]);
const COMPLETION_RPC = "marcar_agendamento_concluido_staff";
const COMMISSIONS_RPC = "listar_minhas_comissoes_profissional";
let currentProfile = null;
let currentProfessional = null;
let selectedAppointment = null;
let completionSaving = false;
let commissionsLoaded = false;
let toastTimer;

const valueFrom = (object, ...keys) => keys.map((key) => object?.[key]).find((value) => value !== undefined && value !== null && value !== "");
const displayValue = (value) => value === undefined || value === null || value === "" ? "—" : String(value);
const numberValue = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const formatCurrency = (value) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(numberValue(value));

function showMessage(element, text, type = "") {
  element.textContent = text;
  element.className = `message${type ? ` ${type}` : ""}`;
}

function showToast(text, type = "success") {
  window.clearTimeout(toastTimer);
  const toast = document.querySelector("#app-toast");
  document.querySelector("#toast-message").textContent = text;
  toast.className = `toast${type === "error" ? " error" : ""}`;
  toast.hidden = false;
  toastTimer = window.setTimeout(() => { toast.hidden = true; }, type === "error" ? 7000 : 4500);
}

function readableError(error, fallback) {
  return error?.message || fallback;
}

function rpcResultError(data) {
  const result = Array.isArray(data) ? data[0] : data;
  if (!result || typeof result !== "object") return null;
  if (result.success === false || result.ok === false || result.error) {
    return new Error(result.message || result.error || "A ação não pôde ser concluída.");
  }
  return null;
}

function dateInSaoPaulo(offsetDays = 0) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  const date = new Date(Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day) + offsetDays));
  return date.toISOString().slice(0, 10);
}

function normalizeAppointment(item) {
  return {
    raw: item,
    id: valueFrom(item, "id", "agendamentoId", "agendamento_id"),
    client: valueFrom(item, "clienteNome", "cliente_nome", "clientName", "cliente"),
    phone: valueFrom(item, "clientePhone", "cliente_phone", "clienteTelefone", "cliente_telefone", "telefone"),
    service: valueFrom(item, "servicoNome", "servico_nome", "serviceName", "servico"),
    date: valueFrom(item, "dataBr", "data_br", "data", "appointmentDate"),
    start: valueFrom(item, "horaInicio", "hora_inicio", "startTime", "horario"),
    end: valueFrom(item, "horaFim", "hora_fim", "endTime"),
    status: valueFrom(item, "status"),
    total: valueFrom(item, "totalPrice", "total_price", "valorTotal", "valor_total", "valorServico", "valor_servico")
  };
}

function addDetail(container, label, value) {
  const wrapper = document.createElement("div");
  const term = document.createElement("span");
  const description = document.createElement("strong");
  term.textContent = label;
  description.textContent = displayValue(value);
  wrapper.append(term, description);
  container.appendChild(wrapper);
}

function formatWhatsAppPhone(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (/^55\d{10,11}$/.test(digits)) return digits;
  if (/^\d{10,11}$/.test(digits)) return `55${digits}`;
  return null;
}

function openWhatsApp(appointment) {
  const phone = formatWhatsAppPhone(appointment.phone);
  if (!phone) {
    showToast("Cliente sem telefone válido cadastrado.", "error");
    return;
  }
  const message = `Olá, ${displayValue(appointment.client)}! Estou entrando em contato sobre seu atendimento de ${displayValue(appointment.service)} na Nail Dreams.`;
  const openedWindow = window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
  if (openedWindow) openedWindow.opener = null;
}

function createAction(label, className, handler) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = label;
  button.addEventListener("click", handler);
  return button;
}

function renderAgenda(data) {
  const list = document.querySelector("#agenda-list");
  const payload = Array.isArray(data) ? data : (data?.items || data?.agendamentos || []);
  list.replaceChildren();
  if (!payload.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "Nenhum atendimento encontrado para esta data.";
    list.appendChild(empty);
    return;
  }
  payload.map(normalizeAppointment).forEach((appointment) => {
    const card = document.createElement("article");
    card.className = "appointment-card";
    const heading = document.createElement("div");
    heading.className = "card-heading";
    const client = document.createElement("h2");
    client.textContent = displayValue(appointment.client);
    const status = document.createElement("span");
    status.className = "status-badge";
    status.textContent = displayValue(appointment.status).replaceAll("_", " ");
    heading.append(client, status);
    const details = document.createElement("div");
    details.className = "card-details";
    addDetail(details, "Serviço", appointment.service);
    addDetail(details, "Data", appointment.date);
    addDetail(details, "Horário", appointment.end ? `${displayValue(appointment.start)} – ${appointment.end}` : appointment.start);
    addDetail(details, "Status", displayValue(appointment.status).replaceAll("_", " "));
    card.append(heading, details);
    const currentStatus = String(appointment.status || "").toLowerCase();
    if (CLOSED_STATUSES.has(currentStatus)) {
      const note = document.createElement("p");
      note.className = "closed-note";
      note.textContent = "Atendimento encerrado";
      card.appendChild(note);
    } else {
      const actions = document.createElement("div");
      actions.className = "card-actions";
      actions.append(
        createAction("WhatsApp", "whatsapp-button", () => openWhatsApp(appointment)),
        createAction("Concluir", "", () => openCompletionModal(appointment))
      );
      card.appendChild(actions);
    }
    list.appendChild(card);
  });
}

async function loadAgenda(date) {
  const message = document.querySelector("#agenda-message");
  showMessage(message, "Carregando agenda...");
  try {
    const { data, error } = await supabaseClient.rpc("listar_minha_agenda_profissional", {
      p_data_inicio: date,
      p_data_fim: date
    });
    if (error) throw error;
    const resultError = rpcResultError(data);
    if (resultError) throw resultError;
    renderAgenda(Array.isArray(data) && data.length === 1 && data[0]?.items ? data[0] : data);
    showMessage(message, "");
  } catch (error) {
    console.error("Erro ao carregar agenda profissional:", error);
    renderAgenda([]);
    showMessage(message, readableError(error, "Não foi possível carregar sua agenda."), "error");
  }
}

function selectDate(date, filterName = "") {
  document.querySelector("#agenda-date").value = date;
  document.querySelectorAll("[data-date-filter]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.dateFilter === filterName);
  });
  loadAgenda(date);
}

function openCompletionModal(appointment) {
  selectedAppointment = appointment;
  const form = document.querySelector("#completion-form");
  form.reset();
  document.querySelector("#completion-amount").value = appointment.total ?? "";
  document.querySelector("#completion-method").value = "Pix";
  document.querySelector("#completion-payment-status").value = "pago";
  document.querySelector("#completion-summary").textContent = `${displayValue(appointment.client)} · ${displayValue(appointment.service)}`;
  showMessage(document.querySelector("#completion-message"), "");
  document.querySelector("#completion-modal").hidden = false;
  document.body.classList.add("modal-open");
  document.querySelector("#completion-amount").focus();
}

function closeCompletionModal() {
  if (completionSaving) return;
  selectedAppointment = null;
  document.querySelector("#completion-modal").hidden = true;
  document.body.classList.remove("modal-open");
}

function parseAmount(value) {
  const cleaned = String(value).trim().replace(/[^\d,.-]/g, "");
  return Number(cleaned.includes(",") ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned);
}

async function submitCompletion(event) {
  event.preventDefault();
  if (!selectedAppointment || completionSaving) return;
  const amount = parseAmount(document.querySelector("#completion-amount").value);
  const paymentStatus = document.querySelector("#completion-payment-status").value;
  const message = document.querySelector("#completion-message");
  if (!Number.isFinite(amount) || amount < 0 || (paymentStatus === "pago" && amount <= 0)) {
    showMessage(message, "Informe um valor pago válido.", "error");
    return;
  }
  completionSaving = true;
  const confirmButton = document.querySelector("#confirm-completion");
  confirmButton.disabled = true;
  confirmButton.textContent = "Concluindo...";
  showMessage(message, "");
  try {
    const { data, error } = await supabaseClient.rpc(COMPLETION_RPC, {
      p_agendamento_id: selectedAppointment.id,
      p_amount_paid: amount,
      p_payment_method: document.querySelector("#completion-method").value,
      p_payment_status: paymentStatus,
      p_notes: document.querySelector("#completion-notes").value.trim() || "Atendimento concluído pela profissional.",
      p_payment_notes: null
    });
    if (error) throw error;
    const resultError = rpcResultError(data);
    if (resultError) throw resultError;
    completionSaving = false;
    closeCompletionModal();
    await loadAgenda(document.querySelector("#agenda-date").value);
    commissionsLoaded = false;
    showToast("Atendimento concluído com sucesso!");
  } catch (error) {
    console.error("Erro ao concluir atendimento:", error);
    showMessage(message, readableError(error, "Não foi possível concluir o atendimento."), "error");
  } finally {
    completionSaving = false;
    confirmButton.disabled = false;
    confirmButton.textContent = "Confirmar conclusão";
  }
}

function renderCommissions(data) {
  const result = Array.isArray(data) ? (data[0] || {}) : (data || {});
  const summary = result.resumo || result.summary || result;
  const items = result.items || result.comissoes || (Array.isArray(data) ? data : []);
  const values = items.reduce((accumulator, item) => {
    const amount = numberValue(valueFrom(item, "valorComissao", "valor_comissao", "commissionAmount", "valor"));
    const status = String(valueFrom(item, "status") || "").toLowerCase();
    accumulator.total += amount;
    if (status === "paga" || status === "pago") accumulator.paid += amount;
    else if (status !== "cancelada" && status !== "cancelado") accumulator.pending += amount;
    return accumulator;
  }, { total: 0, paid: 0, pending: 0 });
  document.querySelector("#commission-total").textContent = formatCurrency(valueFrom(summary, "totalCalculado", "total_calculado") ?? values.total);
  document.querySelector("#commission-paid").textContent = formatCurrency(valueFrom(summary, "totalPago", "total_pago") ?? values.paid);
  document.querySelector("#commission-pending").textContent = formatCurrency(valueFrom(summary, "totalPendente", "total_pendente") ?? values.pending);
}

async function loadCommissions() {
  const message = document.querySelector("#commissions-message");
  showMessage(message, "Carregando comissões...");
  try {
    const { data, error } = await supabaseClient.rpc(COMMISSIONS_RPC);
    if (error) throw error;
    const resultError = rpcResultError(data);
    if (resultError) throw resultError;
    renderCommissions(data);
    commissionsLoaded = true;
    showMessage(message, "");
  } catch (error) {
    console.error("Erro ao carregar comissões profissionais:", error);
    renderCommissions({});
    showMessage(message, readableError(error, "Não foi possível carregar suas comissões."), "error");
  }
}

function renderProfile(session) {
  const name = valueFrom(currentProfessional, "nome", "name", "full_name") || valueFrom(currentProfile, "nome", "name", "full_name");
  document.querySelector("#professional-name").textContent = displayValue(name);
  document.querySelector("#profile-name").textContent = displayValue(name);
  document.querySelector("#profile-email").textContent = displayValue(valueFrom(currentProfile, "email") || session.user.email);
  document.querySelector("#profile-phone").textContent = displayValue(valueFrom(currentProfessional, "telefone", "phone") || valueFrom(currentProfile, "telefone", "phone"));
  document.querySelector("#profile-specialty").textContent = displayValue(valueFrom(currentProfessional, "especialidade", "specialty"));
}

function showProfessionalApp() {
  const loading = document.querySelector("#page-loading");
  const app = document.querySelector("#professional-app");
  loading.hidden = true;
  loading.style.display = "none";
  app.hidden = false;
  app.style.display = "";
}

function showSection(name) {
  document.querySelectorAll(".app-section").forEach((section) => {
    const active = section.id === `section-${name}`;
    section.hidden = !active;
    section.classList.toggle("is-active", active);
  });
  document.querySelectorAll(".nav-button").forEach((button) => {
    const active = button.dataset.section === name;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-current", active ? "page" : "false");
  });
  if (name === "commissions" && !commissionsLoaded) loadCommissions();
}

async function redirectToLogin(message = "") {
  await supabaseClient.auth.signOut();
  const query = message ? `?message=${encodeURIComponent(message)}` : "";
  window.location.replace(`index.html${query}`);
}

async function initialize() {
  try {
    const { data: sessionData, error: sessionError } = await supabaseClient.auth.getSession();
    if (sessionError) throw sessionError;
    const session = sessionData.session;
    if (!session) {
      window.location.replace("index.html");
      return;
    }
    const { data: profile, error: profileError } = await supabaseClient.from("profiles").select("*").eq("id", session.user.id).single();
    if (profileError) throw profileError;
    if (profile?.role !== PROFESSIONAL_ROLE) {
      await redirectToLogin("Acesso permitido somente para profissionais.");
      return;
    }
    currentProfile = profile;
    const { data: professional, error: professionalError } = await supabaseClient.from("profissionais").select("*").eq("profile_id", session.user.id).single();
    if (professionalError) throw professionalError;
    currentProfessional = professional;
    renderProfile(session);
    showProfessionalApp();
    selectDate(dateInSaoPaulo(), "today");
  } catch (error) {
    console.error("Erro ao iniciar área profissional:", error);
    await redirectToLogin("Não foi possível validar seu acesso profissional.");
  }
}

document.querySelectorAll(".nav-button").forEach((button) => button.addEventListener("click", () => showSection(button.dataset.section)));
document.querySelectorAll("[data-date-filter]").forEach((button) => button.addEventListener("click", () => selectDate(dateInSaoPaulo(button.dataset.dateFilter === "tomorrow" ? 1 : 0), button.dataset.dateFilter)));
document.querySelector("#agenda-date").addEventListener("change", (event) => { if (event.target.value) selectDate(event.target.value); });
document.querySelector("#completion-form").addEventListener("submit", submitCompletion);
document.querySelector("#close-completion").addEventListener("click", closeCompletionModal);
document.querySelector("#cancel-completion").addEventListener("click", closeCompletionModal);
document.querySelector("#completion-modal").addEventListener("click", (event) => { if (event.target === event.currentTarget) closeCompletionModal(); });
document.querySelector("#close-toast").addEventListener("click", () => { document.querySelector("#app-toast").hidden = true; });
document.querySelector("#logout-button").addEventListener("click", () => redirectToLogin());
document.addEventListener("keydown", (event) => { if (event.key === "Escape" && !document.querySelector("#completion-modal").hidden) closeCompletionModal(); });
initialize();
