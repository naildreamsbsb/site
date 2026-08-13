const PROFESSIONAL_ROLE = "profissional";
const PREFERRED_CONTRACT_STATUSES = new Set(["pendente_assinatura", "aguardando_validacao", "ativo"]);
const WEEKDAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

let currentContract = null;
let sendingContract = false;
let workingHours = [];
let workingHoursSequence = 0;
let savingWorkingHours = false;
let toastTimeoutId = null;
let agendaView = "day";
let agendaSelectedDate = null;
let agendaAuthenticatedUser = null;
let agendaRequestId = 0;
let agendaLoading = false;
let professionalFinanceLoading = false;

const $ = (selector) => document.querySelector(selector);

function errorMessage(error, fallback) {
  return error?.message || fallback;
}

function displayValue(value) {
  return value === null || value === undefined || value === "" ? "—" : String(value);
}

function formatDate(value, includeTime = false) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return displayValue(value);
  return new Intl.DateTimeFormat("pt-BR", includeTime
    ? { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }
    : { dateStyle: "short", timeZone: "UTC" }).format(date);
}

function formatPercentage(value) {
  if (value === null || value === undefined || value === "") return "—";
  const number = Number(value);
  return Number.isFinite(number) ? `${number.toLocaleString("pt-BR")} %` : displayValue(value);
}

function formatCurrency(value) {
  const amount = Number(value);
  return Number.isFinite(amount)
    ? amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
    : "—";
}

function setProfessionalFinanceMessage(text = "", type = "") {
  const element = $("#professional-finance-message");
  element.textContent = text;
  element.className = `message${type ? ` ${type}` : ""}`;
}

function createFinanceSummaryCard(label, value, monetary = true) {
  const card = document.createElement("article");
  card.className = "professional-finance-card";
  const caption = document.createElement("span");
  caption.textContent = label;
  const content = document.createElement("strong");
  content.textContent = monetary ? formatCurrency(value) : Number(value || 0).toLocaleString("pt-BR");
  card.append(caption, content);
  return card;
}

function commissionStatusLabel(value) {
  if (!value) return "Não gerada";
  const labels = { calculada: "Calculada", aprovada: "Aprovada", paga: "Paga", cancelada: "Cancelada" };
  return labels[value] || String(value).replaceAll("_", " ");
}

function renderProfessionalFinance(data = {}) {
  const container = $("#professional-finance-content");
  container.replaceChildren();
  const summary = data.resumo || {};
  const cards = document.createElement("div");
  cards.className = "professional-finance-summary";
  cards.append(
    createFinanceSummaryCard("Atendimentos realizados", summary.totalAtendimentosConcluidos, false),
    createFinanceSummaryCard("Receita dos serviços", summary.receitaGerada),
    createFinanceSummaryCard("Valor recebido", summary.valorRecebido),
    createFinanceSummaryCard("Minha comissão", summary.comissaoTotal),
    createFinanceSummaryCard("Comissão paga", summary.comissaoPaga),
    createFinanceSummaryCard("Comissão pendente", summary.comissaoPendente)
  );
  container.appendChild(cards);

  const items = Array.isArray(data.items) ? data.items : [];
  if (!items.length) {
    const empty = document.createElement("article");
    empty.className = "state-card professional-finance-empty";
    empty.textContent = "Nenhum atendimento financeiro encontrado neste período.";
    container.appendChild(empty);
    return;
  }

  const details = document.createElement("section");
  details.className = "professional-finance-details";
  const heading = document.createElement("h3");
  heading.textContent = "Atendimentos do período";
  const list = document.createElement("div");
  list.className = "professional-finance-list";
  items.forEach((item) => {
    const card = document.createElement("article");
    card.className = "professional-finance-item";
    const cardHeading = document.createElement("header");
    const service = document.createElement("strong");
    service.textContent = displayValue(item.servico);
    const date = document.createElement("span");
    date.textContent = item.dataBr || formatDate(item.data);
    cardHeading.append(service, date);
    const fields = document.createElement("dl");
    [
      ["Cliente", displayValue(item.cliente), false],
      ["Valor do serviço", formatCurrency(item.valorServico), true],
      ["Valor recebido", formatCurrency(item.valorRecebido), true],
      ["Minha comissão", formatCurrency(item.comissao), true],
      ["Status", commissionStatusLabel(item.statusComissao), false]
    ].forEach(([label, value, monetary]) => {
      const field = createDetail(label, value);
      if (monetary) field.classList.add("finance-money");
      fields.appendChild(field);
    });
    card.append(cardHeading, fields);
    list.appendChild(card);
  });
  details.append(heading, list);
  container.appendChild(details);
}

async function loadProfessionalFinance(event) {
  event?.preventDefault();
  if (professionalFinanceLoading) return;
  const startDate = $("#professional-finance-start").value;
  const endDate = $("#professional-finance-end").value;
  if (!startDate || !endDate) {
    setProfessionalFinanceMessage("Informe a data inicial e a data final.", "error");
    return;
  }
  if (endDate < startDate) {
    setProfessionalFinanceMessage("A data final não pode ser anterior à data inicial.", "error");
    return;
  }

  professionalFinanceLoading = true;
  const button = $("#load-professional-finance");
  button.disabled = true;
  button.textContent = "Consultando...";
  setProfessionalFinanceMessage();
  try {
    const { data, error } = await supabaseClient.rpc("listar_meu_resumo_financeiro_profissional", {
      p_data_inicio: startDate,
      p_data_fim: endDate
    });
    if (error) throw error;
    const result = Array.isArray(data) ? data[0] : data;
    if (!result?.success) throw new Error(result?.message || "Não foi possível consultar seu financeiro.");
    renderProfessionalFinance(result);
    const start = new Date(`${startDate}T12:00:00`);
    const end = new Date(`${endDate}T12:00:00`);
    $("#professional-finance-period-label").textContent = `Período: ${formatAgendaDate(start)} até ${formatAgendaDate(end)}`;
  } catch (error) {
    console.error("Erro ao carregar financeiro profissional:", error);
    $("#professional-finance-content").replaceChildren();
    setProfessionalFinanceMessage(errorMessage(error, "Não foi possível consultar seu financeiro."), "error");
  } finally {
    professionalFinanceLoading = false;
    button.disabled = false;
    button.textContent = "Consultar";
  }
}

function setupProfessionalFinanceDates() {
  const today = saoPauloToday();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1, 12);
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0, 12);
  $("#professional-finance-start").value = localDateValue(firstDay);
  $("#professional-finance-end").value = localDateValue(lastDay);
  $("#professional-finance-period-label").textContent = `Período: ${new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(today)}`;
}

function professionalName(profile, professional, user) {
  return professional?.name || professional?.nome || profile?.full_name || profile?.nome || profile?.name
    || user?.user_metadata?.full_name || user?.user_metadata?.name || "Profissional";
}

function isPending(contract) {
  return contract?.status === "pendente_assinatura";
}

function isActive(contract) {
  return contract?.aceito === true && contract?.status === "ativo";
}

function isAwaitingValidation(contract) {
  return contract?.status === "aguardando_validacao";
}

function setMessage(text, type = "") {
  const element = $("#contract-message");
  element.textContent = text;
  element.className = `message${type ? ` ${type}` : ""}`;
}

function hideToast() {
  window.clearTimeout(toastTimeoutId);
  toastTimeoutId = null;
  $("#toast").hidden = true;
}

function showToast(text, duration = 0) {
  window.clearTimeout(toastTimeoutId);
  $("#toast-message").textContent = text;
  $("#toast").hidden = false;
  if (duration > 0) toastTimeoutId = window.setTimeout(hideToast, duration);
}

function routeForRole(role) {
  if (role === "admin" || role === "recepcao") return "admin.html";
  if (role === "cliente") return "cliente.html";
  return "login.html";
}

function redirectForRole(role) {
  window.location.replace(routeForRole(role));
}

function createDetail(label, value) {
  const wrapper = document.createElement("div");
  const term = document.createElement("dt");
  const description = document.createElement("dd");
  term.textContent = label;
  description.textContent = value;
  wrapper.append(term, description);
  return wrapper;
}

function localDateValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function saoPauloToday() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const year = Number(values.year);
  const month = Number(values.month);
  const day = Number(values.day);
  return new Date(year, month - 1, day, 12);
}

function addDays(date, amount) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function startOfWeek(date) {
  const day = date.getDay();
  return addDays(date, day === 0 ? -6 : 1 - day);
}

function agendaRange() {
  if (agendaView === "day") return { start: agendaSelectedDate, end: agendaSelectedDate };
  const start = startOfWeek(agendaSelectedDate);
  return { start, end: addDays(start, 6) };
}

function formatAgendaDate(date) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

function updateAgendaPeriodLabel() {
  const { start, end } = agendaRange();
  $("#agenda-period-label").textContent = agendaView === "day"
    ? formatAgendaDate(start)
    : `${formatAgendaDate(start).slice(0, 5)} a ${formatAgendaDate(end).slice(0, 5)}`;
}

function setAgendaLoading(loading) {
  agendaLoading = loading;
  ["#agenda-previous", "#agenda-next", "#agenda-today", "[data-agenda-view='day']", "[data-agenda-view='week']"]
    .forEach((selector) => { $(selector).disabled = loading; });
}

function agendaLoadErrorMessage(error) {
  const message = String(error?.message || "");
  if (/failed to fetch|networkerror|network request failed/i.test(message)) {
    return "Não foi possível conectar para carregar sua agenda. Verifique sua internet e tente novamente.";
  }
  return errorMessage(error, "Não foi possível carregar sua agenda. Tente novamente.");
}

function agendaStatusLabel(status) {
  const labels = {
    solicitado: "Solicitado",
    aguardando_sinal: "Aguardando sinal",
    confirmado: "Confirmado",
    concluido: "Concluído",
    cancelado: "Cancelado",
    cancelado_cliente: "Cancelado",
    cancelado_studio: "Cancelado"
  };
  return labels[status] || displayValue(status).replaceAll("_", " ");
}

function agendaStatusClass(status) {
  if (status === "confirmado") return "confirmed";
  if (status === "solicitado") return "requested";
  if (status === "aguardando_sinal") return "deposit";
  if (status === "concluido") return "completed";
  if (String(status).startsWith("cancelado")) return "cancelled";
  return "neutral";
}

function firstName(value) {
  const name = String(value || "").trim();
  return name ? name.split(/\s+/)[0] : "Cliente";
}

function abbreviateService(value) {
  const service = String(value || "Serviço").trim();
  const normalized = service.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (normalized.includes("esmalta") && normalized.includes("gel")) return "Esm. Gel";
  if (normalized.includes("manutencao") && normalized.includes("+30")) return "Manut. +30d";
  if (normalized.includes("manutencao") && normalized.includes("21")) return "Manut. 21d";
  if (normalized.includes("design") && normalized.includes("sobrancelha")) return "Design Sobr.";
  if (normalized.includes("quiropraxia")) return "Quiro.";
  if (["massagem", "pedicure", "manicure"].includes(normalized)) return service;
  return service.length > 16 ? `${service.slice(0, 15).trim()}…` : service;
}

function itemValue(item, ...keys) {
  return keys.map((key) => item?.[key]).find((value) => value !== null && value !== undefined && value !== "");
}

function openAgendaDetails(item) {
  const content = $("#agenda-detail-content");
  const details = [
    ["Cliente", itemValue(item, "clienteNome", "cliente_nome")],
    ["Telefone", itemValue(item, "clientePhone", "clienteTelefone", "cliente_telefone", "telefone", "phone")],
    ["E-mail", itemValue(item, "clienteEmail", "cliente_email")],
    ["Serviço", itemValue(item, "servicoNome", "servico_nome")],
    ["Data", itemValue(item, "dataBr", "data_br")],
    ["Início", itemValue(item, "horaInicio", "hora_inicio")],
    ["Fim", itemValue(item, "horaFim", "hora_fim")],
    ["Status", agendaStatusLabel(item.status)],
    ["Valor", itemValue(item, "totalPrice", "total_price")],
    ["Sinal", itemValue(item, "depositStatus", "deposit_status", "sinalStatus", "sinal_status")],
    ["Valor do sinal", itemValue(item, "depositAmount", "deposit_amount", "valorSinal", "valor_sinal")],
    ["Pagamento", itemValue(item, "paymentStatus", "payment_status", "pagamentoStatus", "pagamento_status")],
    ["Observações", itemValue(item, "observacoes", "observacao", "notes")]
  ].filter(([, value]) => value !== undefined && value !== null && value !== "");
  content.replaceChildren(...details.map(([label, value]) => createDetail(label, displayValue(value))));
  $("#agenda-detail-modal").hidden = false;
  document.body.classList.add("modal-open");
  $("#close-agenda-detail").focus();
}

function renderDayAgenda(items) {
  const container = $("#agenda-container");
  container.replaceChildren();
  if (!items.length) {
    const empty = document.createElement("article");
    empty.className = "state-card";
    empty.textContent = "Nenhum atendimento neste dia.";
    container.appendChild(empty);
    return;
  }

  const list = document.createElement("div");
  list.className = "agenda-list";
  items.forEach((item) => {
    const card = document.createElement("article");
    card.className = `agenda-card status-${agendaStatusClass(item.status)}`;
    const heading = document.createElement("header");
    const date = document.createElement("strong");
    date.textContent = displayValue(item.dataBr);
    const time = document.createElement("span");
    time.textContent = `${displayValue(item.horaInicio)} - ${displayValue(item.horaFim)}`;
    heading.append(date, time);

    const details = document.createElement("dl");
    details.className = "agenda-details";
    details.append(
      createDetail("Cliente", displayValue(item.clienteNome)),
      createDetail("Serviço", displayValue(item.servicoNome)),
      createDetail("Status", agendaStatusLabel(item.status))
    );
    card.append(heading, details);
    list.appendChild(card);
  });
  container.appendChild(list);
}

function timeToMinutes(value) {
  const match = String(value || "").match(/(\d{1,2}):(\d{2})/);
  return match ? (Number(match[1]) * 60) + Number(match[2]) : null;
}

function itemDateValue(item) {
  const direct = itemValue(item, "data", "date", "dataIso", "data_iso");
  if (direct && /^\d{4}-\d{2}-\d{2}/.test(String(direct))) return String(direct).slice(0, 10);
  const match = String(itemValue(item, "dataBr", "data_br") || "").match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : "";
}

function renderWeekAgenda(items) {
  const container = $("#agenda-container");
  const { start } = agendaRange();
  const starts = items.map((item) => timeToMinutes(item.horaInicio)).filter(Number.isFinite);
  const ends = items.map((item) => timeToMinutes(item.horaFim)).filter(Number.isFinite);
  const rangeStart = starts.length ? Math.max(0, Math.floor(Math.min(...starts) / 30) * 30) : 480;
  const rangeEnd = ends.length ? Math.min(1440, Math.ceil(Math.max(...ends) / 30) * 30) : 1080;
  const totalSlots = Math.max(1, (rangeEnd - rangeStart) / 30);
  const shell = document.createElement("div");
  shell.className = "week-calendar-scroll";
  const calendar = document.createElement("div");
  calendar.className = "week-calendar";
  calendar.style.setProperty("--week-slots", totalSlots);
  const corner = document.createElement("div");
  corner.className = "week-corner";
  calendar.appendChild(corner);
  const shortDays = ["SEG", "TER", "QUA", "QUI", "SEX", "SÁB", "DOM"];
  for (let index = 0; index < 7; index += 1) {
    const date = addDays(start, index);
    const header = document.createElement("div");
    header.className = "week-day-header";
    header.innerHTML = `<span>${shortDays[index]}</span><strong>${date.getDate()}</strong>`;
    calendar.appendChild(header);
  }
  const timeRail = document.createElement("div");
  timeRail.className = "week-time-rail";
  for (let slot = 0; slot < totalSlots; slot += 1) {
    const minutes = rangeStart + (slot * 30);
    const label = document.createElement("span");
    label.textContent = `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
    timeRail.appendChild(label);
  }
  calendar.appendChild(timeRail);
  for (let index = 0; index < 7; index += 1) {
    const dateValue = localDateValue(addDays(start, index));
    const column = document.createElement("div");
    column.className = "week-day-column";
    items.filter((item) => itemDateValue(item) === dateValue).forEach((item) => {
      const startMinutes = timeToMinutes(item.horaInicio) ?? rangeStart;
      const endMinutes = timeToMinutes(item.horaFim) ?? startMinutes + 30;
      const appointment = document.createElement("button");
      appointment.type = "button";
      appointment.className = `week-appointment status-${agendaStatusClass(item.status)}`;
      appointment.style.top = `${((startMinutes - rangeStart) / 30) * 44}px`;
      appointment.style.height = `${Math.max(40, ((endMinutes - startMinutes) / 30) * 44 - 3)}px`;
      appointment.setAttribute("aria-label", `${item.horaInicio}, ${item.clienteNome}, ${item.servicoNome}`);
      const time = document.createElement("strong");
      time.textContent = displayValue(item.horaInicio);
      const client = document.createElement("span");
      client.textContent = firstName(item.clienteNome);
      const service = document.createElement("small");
      service.textContent = abbreviateService(item.servicoNome);
      appointment.append(time, client, service);
      appointment.addEventListener("click", () => openAgendaDetails(item));
      column.appendChild(appointment);
    });
    calendar.appendChild(column);
  }
  shell.appendChild(calendar);
  container.replaceChildren(shell);
}

function renderAgenda(items) {
  const operationalItems = items.filter((item) => (
    item.status !== "cancelado_cliente" && item.status !== "cancelado_studio"
  ));
  if (agendaView === "week") renderWeekAgenda(operationalItems); else renderDayAgenda(operationalItems);
}

async function carregarMinhaAgenda(authenticatedUser) {
  const container = $("#agenda-container");
  if (!authenticatedUser) {
    container.innerHTML = '<article class="state-card">Faça login novamente para consultar sua agenda.</article>';
    return;
  }

  agendaAuthenticatedUser = authenticatedUser;
  if (!agendaSelectedDate) agendaSelectedDate = saoPauloToday();
  const { start, end } = agendaRange();
  const requestId = agendaRequestId += 1;
  updateAgendaPeriodLabel();
  setAgendaLoading(true);
  container.innerHTML = '<article class="state-card">Carregando sua agenda...</article>';
  try {
    const { data, error } = await supabaseClient.rpc("listar_agenda_profissional", {
      p_data_inicio: localDateValue(start),
      p_data_fim: localDateValue(end)
    });
    if (error) throw error;
    if (requestId !== agendaRequestId) return;
    const result = Array.isArray(data) ? data[0] : data;
    if (!result?.success) throw new Error(result?.message || "Não foi possível carregar sua agenda.");
    renderAgenda(Array.isArray(result.items) ? result.items : []);
  } catch (error) {
    if (requestId !== agendaRequestId) return;
    console.error("Erro ao carregar agenda profissional:", error);
    container.replaceChildren();
    const state = document.createElement("article");
    state.className = "state-card";
    state.textContent = agendaLoadErrorMessage(error);
    container.appendChild(state);
  } finally {
    if (requestId === agendaRequestId) setAgendaLoading(false);
  }
}

function changeAgendaView(view) {
  if (agendaLoading || view !== "day" && view !== "week" || view === agendaView) return;
  agendaView = view;
  document.querySelectorAll("[data-agenda-view]").forEach((button) => {
    const active = button.dataset.agendaView === view;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  carregarMinhaAgenda(agendaAuthenticatedUser);
}

function navigateAgenda(direction) {
  if (agendaLoading) return;
  agendaSelectedDate = addDays(agendaSelectedDate || saoPauloToday(), direction * (agendaView === "week" ? 7 : 1));
  carregarMinhaAgenda(agendaAuthenticatedUser);
}

function renderUpcomingAppointments(items) {
  const container = $("#upcoming-appointments");
  const now = Date.now();
  const confirmedItems = items
    .map((item) => ({ item, startTime: new Date(item.startAt).getTime() }))
    .filter(({ item, startTime }) => item.status === "confirmado" && Number.isFinite(startTime) && startTime > now)
    .sort((first, second) => first.startTime - second.startTime)
    .slice(0, 5)
    .map(({ item }) => item);
  if (!confirmedItems.length) {
    const empty = document.createElement("article");
    empty.className = "upcoming-calm";
    const title = document.createElement("strong");
    title.textContent = "Sua agenda está tranquila por enquanto ✨";
    const text = document.createElement("p");
    text.textContent = "Novos momentos e novas clientes estão a caminho. 💕";
    empty.append(title, text);
    container.replaceChildren(empty);
    return;
  }
  const list = document.createElement("div");
  list.className = "upcoming-list";
  confirmedItems.forEach((item) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "upcoming-card";
    card.setAttribute("aria-label", `${item.dataBr}, ${item.horaInicio}, ${firstName(item.clienteNome)}, ${item.servicoNome}`);
    const schedule = document.createElement("div");
    schedule.className = "upcoming-schedule";
    const date = document.createElement("strong");
    date.textContent = displayValue(item.dataBr);
    const time = document.createElement("span");
    time.textContent = `${displayValue(item.horaInicio)} às ${displayValue(item.horaFim)}`;
    schedule.append(date, time);
    const appointment = document.createElement("div");
    appointment.className = "upcoming-summary";
    const client = document.createElement("strong");
    client.textContent = firstName(item.clienteNome);
    const service = document.createElement("span");
    service.textContent = displayValue(item.servicoNome);
    appointment.append(client, service);
    card.append(schedule, appointment);
    card.addEventListener("click", () => openAgendaDetails(item));
    list.appendChild(card);
  });
  container.replaceChildren(list);
}

async function loadUpcomingAppointments(authenticatedUser) {
  const container = $("#upcoming-appointments");
  if (!authenticatedUser) {
    container.innerHTML = '<article class="state-card upcoming-empty">Faça login novamente para consultar seus atendimentos.</article>';
    return;
  }
  const start = saoPauloToday();
  const end = addDays(start, 30);
  try {
    const { data, error } = await supabaseClient.rpc("listar_agenda_profissional", {
      p_data_inicio: localDateValue(start),
      p_data_fim: localDateValue(end)
    });
    if (error) throw error;
    const result = Array.isArray(data) ? data[0] : data;
    if (!result?.success) throw new Error(result?.message || "Não foi possível carregar os próximos atendimentos.");
    renderUpcomingAppointments(Array.isArray(result.items) ? result.items : []);
  } catch (error) {
    console.error("Erro ao carregar próximos atendimentos:", error);
    const state = document.createElement("article");
    state.className = "state-card upcoming-empty";
    state.textContent = errorMessage(error, "Não foi possível carregar os próximos atendimentos.");
    container.replaceChildren(state);
  }
}

function setWorkingHoursMessage(text = "", type = "") {
  const element = $("#working-hours-message");
  element.textContent = text;
  element.className = `message${type ? ` ${type}` : ""}`;
}

function normalizeWorkingHour(item) {
  return {
    clientId: `working-hour-${workingHoursSequence += 1}`,
    id: item?.id || null,
    weekday: Number(item?.weekday),
    startTime: item?.startTime ?? item?.start_time ?? "",
    endTime: item?.endTime ?? item?.end_time ?? "",
    active: item?.active === true
  };
}

function createEmptyWorkingHour(weekday) {
  return normalizeWorkingHour({
    weekday,
    startTime: "09:00",
    endTime: "18:00",
    active: true
  });
}

function periodsForDay(weekday) {
  return workingHours
    .filter((period) => period.weekday === weekday)
    .sort((first, second) => first.startTime.localeCompare(second.startTime));
}

function updateWorkingHour(clientId, field, value) {
  const period = workingHours.find((item) => item.clientId === clientId);
  if (period) period[field] = value;
}

function createTimeField(period, field, label) {
  const wrapper = document.createElement("label");
  wrapper.className = "working-time-field";
  const text = document.createElement("span");
  text.textContent = label;
  const input = document.createElement("input");
  input.type = "time";
  input.step = "300";
  input.required = true;
  input.value = period[field];
  input.addEventListener("input", () => {
    updateWorkingHour(period.clientId, field, input.value);
    input.classList.remove("invalid");
    setWorkingHoursMessage();
  });
  wrapper.append(text, input);
  return wrapper;
}

function createPeriodRow(period) {
  const row = document.createElement("div");
  row.className = "working-period";
  row.dataset.clientId = period.clientId;
  row.append(
    createTimeField(period, "startTime", "Início"),
    createTimeField(period, "endTime", "Fim")
  );

  const separator = document.createElement("span");
  separator.className = "working-time-separator";
  separator.textContent = "às";
  row.insertBefore(separator, row.children[1]);

  const removeButton = document.createElement("button");
  removeButton.type = "button";
  removeButton.className = "remove-period-button";
  removeButton.setAttribute("aria-label", `Remover período de ${WEEKDAYS[period.weekday]}`);
  removeButton.textContent = "Remover";
  removeButton.addEventListener("click", () => {
    workingHours = workingHours.filter((item) => item.clientId !== period.clientId);
    setWorkingHoursMessage();
    renderWorkingHours();
  });
  row.appendChild(removeButton);
  return row;
}

function createDayCard(weekday) {
  const periods = periodsForDay(weekday);
  const dayIsActive = periods.some((period) => period.active);
  const card = document.createElement("article");
  card.className = `working-day-card${dayIsActive ? " is-open" : ""}`;

  const header = document.createElement("header");
  const title = document.createElement("div");
  const dayName = document.createElement("h2");
  dayName.textContent = WEEKDAYS[weekday];
  const summary = document.createElement("p");
  summary.textContent = dayIsActive
    ? `${periods.filter((period) => period.active).length} período(s)`
    : "Não atendo";
  title.append(dayName, summary);

  const toggleLabel = document.createElement("label");
  toggleLabel.className = "day-toggle";
  const toggle = document.createElement("input");
  toggle.type = "checkbox";
  toggle.checked = dayIsActive;
  const toggleText = document.createElement("span");
  toggleText.textContent = dayIsActive ? "Atendo" : "Não atendo";
  toggle.addEventListener("change", () => {
    let dayPeriods = periodsForDay(weekday);
    if (toggle.checked && !dayPeriods.length) {
      workingHours.push(createEmptyWorkingHour(weekday));
      dayPeriods = periodsForDay(weekday);
    }
    dayPeriods.forEach((period) => { period.active = toggle.checked; });
    setWorkingHoursMessage();
    renderWorkingHours();
  });
  toggleLabel.append(toggle, toggleText);
  header.append(title, toggleLabel);
  card.appendChild(header);

  if (dayIsActive) {
    const periodList = document.createElement("div");
    periodList.className = "working-periods";
    periods.filter((period) => period.active).forEach((period) => {
      periodList.appendChild(createPeriodRow(period));
    });

    const addButton = document.createElement("button");
    addButton.type = "button";
    addButton.className = "add-period-button";
    addButton.textContent = "+ Adicionar período";
    addButton.addEventListener("click", () => {
      workingHours.push(createEmptyWorkingHour(weekday));
      setWorkingHoursMessage();
      renderWorkingHours();
    });
    card.append(periodList, addButton);
  }

  return card;
}

function renderWorkingHours() {
  const container = $("#working-hours-container");
  const week = document.createElement("div");
  week.className = "working-hours-week";
  WEEKDAYS.forEach((_day, weekday) => week.appendChild(createDayCard(weekday)));
  container.replaceChildren(week);
}

function markInvalidPeriod(period) {
  const row = document.querySelector(`[data-client-id="${period.clientId}"]`);
  row?.querySelectorAll('input[type="time"]').forEach((input) => input.classList.add("invalid"));
  row?.scrollIntoView({ behavior: "smooth", block: "center" });
}

function validateWorkingHours() {
  for (const period of workingHours) {
    if (!period.startTime || !period.endTime) {
      markInvalidPeriod(period);
      return "Preencha o horário inicial e final de todos os períodos.";
    }
    if (period.startTime >= period.endTime) {
      markInvalidPeriod(period);
      return `${WEEKDAYS[period.weekday]} possui um período em que o início não é anterior ao fim.`;
    }
  }

  const periods = workingHours.filter((period) => period.active);
  for (let weekday = 0; weekday < WEEKDAYS.length; weekday += 1) {
    const dayPeriods = periods
      .filter((period) => period.weekday === weekday)
      .sort((first, second) => first.startTime.localeCompare(second.startTime));
    for (let index = 1; index < dayPeriods.length; index += 1) {
      if (dayPeriods[index].startTime < dayPeriods[index - 1].endTime) {
        markInvalidPeriod(dayPeriods[index]);
        return `${WEEKDAYS[weekday]} possui períodos sobrepostos.`;
      }
    }
  }
  return "";
}

function workingHoursPayload() {
  return workingHours.map((period) => ({
    ...(period.id ? { id: period.id } : {}),
    weekday: period.weekday,
    start_time: period.startTime,
    end_time: period.endTime,
    active: period.active
  }));
}

function mergeSavedWorkingHourIds(items) {
  const savedItems = Array.isArray(items) ? items : [];
  workingHours.forEach((period) => {
    const saved = savedItems.find((item) => (
      Number(item.weekday) === period.weekday
      && (item.startTime ?? item.start_time) === period.startTime
      && (item.endTime ?? item.end_time) === period.endTime
    ));
    if (saved?.id) period.id = saved.id;
  });
}

async function loadWorkingHours() {
  const container = $("#working-hours-container");
  try {
    const { data, error } = await supabaseClient.rpc("listar_meus_horarios_trabalho");
    if (error) throw error;
    const result = Array.isArray(data) ? data[0] : data;
    if (!result?.success) throw new Error(result?.message || "Não foi possível carregar seus horários.");
    workingHours = (Array.isArray(result.items) ? result.items : []).map(normalizeWorkingHour);
    renderWorkingHours();
    $("#save-working-hours").disabled = false;
  } catch (error) {
    console.error("Erro ao carregar horários de trabalho:", error);
    const state = document.createElement("article");
    state.className = "state-card";
    state.textContent = errorMessage(error, "Não foi possível carregar seus horários. Tente novamente.");
    container.replaceChildren(state);
    setWorkingHoursMessage(state.textContent, "error");
  }
}

async function saveWorkingHours() {
  if (savingWorkingHours) return;
  setWorkingHoursMessage();
  const validationError = validateWorkingHours();
  if (validationError) {
    setWorkingHoursMessage(validationError, "error");
    return;
  }

  const payload = workingHoursPayload();
  if (!payload.some((period) => period.active)) {
    const confirmed = window.confirm("Você está prestes a deixar sua agenda sem nenhum horário de atendimento. Deseja continuar?");
    if (!confirmed) return;
  }

  savingWorkingHours = true;
  const button = $("#save-working-hours");
  button.disabled = true;
  button.textContent = "Salvando horários...";
  setWorkingHoursMessage("Salvando horários...");

  try {
    const { data, error } = await supabaseClient.rpc("salvar_meus_horarios_trabalho", {
      p_periodos: payload
    });
    if (error) throw error;
    const result = Array.isArray(data) ? data[0] : data;
    if (!result?.success) throw new Error(result?.message || "Não foi possível salvar seus horários.");
    mergeSavedWorkingHourIds(result.items);
    renderWorkingHours();
    setWorkingHoursMessage(result.message || "Horários atualizados com sucesso.", "success");
    showToast("✓ Horários salvos com sucesso!", 3000);
  } catch (error) {
    console.error("Erro ao salvar horários de trabalho:", error);
    setWorkingHoursMessage(errorMessage(error, "Não foi possível salvar seus horários. Tente novamente."), "error");
  } finally {
    savingWorkingHours = false;
    button.disabled = false;
    button.textContent = "Salvar horários";
  }
}

function renderContract() {
  const container = $("#contract-container");
  container.replaceChildren();
  if (!currentContract) {
    const empty = document.createElement("article");
    empty.className = "state-card";
    empty.innerHTML = "<strong>Nenhum contrato disponível</strong><p>Quando seu contrato estiver pronto, ele aparecerá aqui.</p>";
    container.appendChild(empty);
    return;
  }

  const card = document.createElement("article");
  card.className = "contract-card";
  const header = document.createElement("header");
  header.className = "contract-card-header";
  const title = document.createElement("div");
  const eyebrow = document.createElement("p");
  eyebrow.className = "eyebrow";
  eyebrow.textContent = `Contrato ${displayValue(currentContract.numero_contrato)}`;
  const heading = document.createElement("h2");
  heading.textContent = `Versão ${displayValue(currentContract.versao)}`;
  title.append(eyebrow, heading);
  const badge = document.createElement("span");
  badge.className = `status-badge ${isActive(currentContract) ? "active" : isPending(currentContract) ? "pending" : "neutral"}`;
  badge.textContent = isActive(currentContract) ? "Contrato ativo" : isPending(currentContract) ? "Pendente de assinatura" : displayValue(currentContract.status).replaceAll("_", " ");
  header.append(title, badge);

  const details = document.createElement("dl");
  details.className = "contract-details";
  details.append(
    createDetail("Número do contrato", displayValue(currentContract.numero_contrato)),
    createDetail("Versão", displayValue(currentContract.versao)),
    createDetail("Status", isActive(currentContract) ? "Contrato ativo" : displayValue(currentContract.status).replaceAll("_", " ")),
    createDetail("Início", formatDate(currentContract.data_inicio)),
    createDetail("Fim da experiência", formatDate(currentContract.data_fim_experiencia)),
    createDetail("Percentual na experiência", formatPercentage(currentContract.percentual_experiencia)),
    createDetail("Percentual após experiência", formatPercentage(currentContract.percentual_pos_experiencia)),
    createDetail("Assinatura validada", currentContract.aceito ? "Sim" : "Não"),
    createDetail("Validado em", formatDate(currentContract.aceito_em, true))
  );

  const actions = document.createElement("div");
  actions.className = "contract-actions";
  const viewButton = document.createElement("button");
  viewButton.type = "button";
  viewButton.className = "button-secondary";
  viewButton.textContent = "Visualizar contrato";
  viewButton.addEventListener("click", openContractModal);
  actions.appendChild(viewButton);
  if (isPending(currentContract)) {
    const downloadButton = document.createElement("button");
    downloadButton.type = "button";
    downloadButton.className = "button-secondary";
    downloadButton.textContent = "Baixar contrato";
    downloadButton.addEventListener("click", downloadContract);
    const uploadButton = document.createElement("button");
    uploadButton.id = "upload-signed-contract";
    uploadButton.type = "button";
    uploadButton.textContent = "Enviar contrato assinado";
    uploadButton.addEventListener("click", selectSignedContract);
    actions.append(downloadButton, uploadButton);
  }
  if (isAwaitingValidation(currentContract)) {
    const notice = document.createElement("p");
    notice.className = "message success";
    notice.textContent = "Seu contrato foi enviado para análise do Studio. A assinatura será conferida e, após a validação, o contrato ficará ativo.";
    card.append(header, details, notice, actions);
  } else {
    card.append(header, details, actions);
  }
  container.appendChild(card);
}

function downloadContract() {
  if (!currentContract?.conteudo_contrato) {
    setMessage("O conteúdo deste contrato ainda não está disponível para download.", "error");
    return;
  }
  const blob = new Blob([currentContract.conteudo_contrato], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const contractNumber = String(currentContract.numero_contrato || currentContract.id || "profissional").replace(/[^a-zA-Z0-9_-]/g, "-");
  link.href = url;
  link.download = `contrato-${contractNumber}.txt`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function selectSignedContract() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "application/pdf,.pdf";
  input.addEventListener("change", () => {
    const [file] = input.files || [];
    if (file) sendSignedContract(file);
  }, { once: true });
  input.click();
}

function openContractModal() {
  if (!currentContract) return;
  $("#contract-modal-title").textContent = `Contrato ${displayValue(currentContract.numero_contrato)}`;
  $("#contract-full-content").textContent = displayValue(currentContract.conteudo_contrato);
  $("#pending-modal").hidden = true;
  $("#contract-modal").hidden = false;
  document.body.classList.add("modal-open");
  $("#close-contract-modal").focus();
}

function closeModal(selector) {
  $(selector).hidden = true;
  if ($("#contract-modal").hidden && $("#pending-modal").hidden && $("#agenda-detail-modal").hidden) {
    document.body.classList.remove("modal-open");
  }
}

async function loadContract() {
  const { data, error } = await supabaseClient
    .from("contratos_profissionais")
    .select("id, numero_contrato, versao, status, data_inicio, data_fim_experiencia, percentual_experiencia, percentual_pos_experiencia, aceito, aceito_em, conteudo_contrato, created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  const contracts = data || [];
  currentContract = contracts.find((contract) => PREFERRED_CONTRACT_STATUSES.has(contract.status)) || contracts[0] || null;
  renderContract();
  if (isPending(currentContract)) $("#pending-modal").hidden = false;
}

async function sendSignedContract(file) {
  if (!currentContract || !isPending(currentContract) || sendingContract) return;
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (!isPdf) {
    setMessage("Selecione um arquivo PDF assinado pelo GOV.BR.", "error");
    return;
  }
  sendingContract = true;
  const button = $("#upload-signed-contract");
  button.disabled = true;
  button.textContent = "Enviando...";
  setMessage("");
  // Referência temporária desta etapa. Deve ser substituída pela URL do Storage quando o upload for implementado.
  const temporaryFileUrl = URL.createObjectURL(file);
  try {
    const { error } = await supabaseClient.rpc("enviar_contrato_assinado_profissional", {
      p_contrato_id: currentContract.id,
      p_arquivo_assinado_url: temporaryFileUrl,
      p_tipo_assinatura: "gov_br",
      p_assinatura_referencia: null
    });
    if (error) throw error;
    await loadContract();
    setMessage("Seu contrato foi enviado para análise do Studio. A assinatura será conferida e, após a validação, o contrato ficará ativo.", "success");
    showToast("Contrato enviado para análise do Studio 💗");
  } catch (error) {
    console.error("Erro ao enviar contrato assinado:", error);
    setMessage(errorMessage(error, "Não foi possível enviar o contrato assinado. Tente novamente."), "error");
    button.disabled = false;
    button.textContent = "Enviar contrato assinado";
  } finally {
    URL.revokeObjectURL(temporaryFileUrl);
    sendingContract = false;
  }
}

function showSection(section) {
  const sectionTitles = {
    agenda: "Minha agenda",
    solicitacoes: "Solicitações",
    producao: "Produção",
  };
  const target = section === "dashboard" || section === "agenda" || section === "horarios" || section === "contrato"
    ? section
    : "coming-soon";
  document.querySelectorAll(".panel-section").forEach((element) => {
    const active = element.id === `section-${target}`;
    element.hidden = !active;
    element.classList.toggle("is-active", active);
  });
  document.querySelectorAll(".nav-item").forEach((button) => {
    const active = button.dataset.section === section;
    button.classList.toggle("is-active", active);
    if (active) button.setAttribute("aria-current", "page"); else button.removeAttribute("aria-current");
  });
  if (target === "coming-soon") $("#coming-soon-title").textContent = sectionTitles[section] || "Em breve";
}

async function initialize() {
  try {
    const { data: sessionData, error: sessionError } = await supabaseClient.auth.getSession();
    if (sessionError) throw sessionError;
    const session = sessionData.session;
    if (!session) {
      window.location.replace("login.html");
      return;
    }

    const { data: profile, error: profileError } = await supabaseClient
      .from("profiles").select("*").eq("id", session.user.id).maybeSingle();
    if (profileError) throw profileError;
    if (profile?.role !== PROFESSIONAL_ROLE) {
      redirectForRole(profile?.role);
      return;
    }

    const { data: professional, error: professionalError } = await supabaseClient
      .from("profissionais").select("*").eq("profile_id", session.user.id).eq("active", true).maybeSingle();
    if (professionalError) throw professionalError;
    if (!professional) {
      await supabaseClient.auth.signOut();
      window.location.replace(`login.html?message=${encodeURIComponent("Cadastro profissional ativo não encontrado.")}`);
      return;
    }

    const name = professionalName(profile, professional, session.user);
    $("#professional-name").textContent = name;
    $("#first-name").textContent = name.trim().split(/\s+/)[0];
    setupProfessionalFinanceDates();
    await Promise.all([
      loadContract(),
      loadWorkingHours(),
      (async () => {
        await loadUpcomingAppointments(session.user);
        await carregarMinhaAgenda(session.user);
      })()
    ]);
    $("#page-loading").hidden = true;
    $("#professional-app").hidden = false;
    loadProfessionalFinance();
  } catch (error) {
    console.error("Erro ao iniciar painel profissional:", error);
    await supabaseClient.auth.signOut();
    window.location.replace(`login.html?message=${encodeURIComponent("Não foi possível validar seu acesso profissional.")}`);
  }
}

document.querySelectorAll(".nav-item").forEach((button) => button.addEventListener("click", () => showSection(button.dataset.section)));
document.querySelectorAll("[data-agenda-view]").forEach((button) => button.addEventListener("click", () => changeAgendaView(button.dataset.agendaView)));
$("#agenda-previous").addEventListener("click", () => navigateAgenda(-1));
$("#agenda-next").addEventListener("click", () => navigateAgenda(1));
$("#agenda-today").addEventListener("click", () => {
  if (agendaLoading) return;
  agendaSelectedDate = saoPauloToday();
  carregarMinhaAgenda(agendaAuthenticatedUser);
});
$("#save-working-hours").addEventListener("click", saveWorkingHours);
$("#professional-finance-form").addEventListener("submit", loadProfessionalFinance);
$("#logout-button").addEventListener("click", async () => { await supabaseClient.auth.signOut(); window.location.replace("login.html"); });
$("#close-contract-modal").addEventListener("click", () => closeModal("#contract-modal"));
$("#close-contract-button").addEventListener("click", () => closeModal("#contract-modal"));
$("#dismiss-pending").addEventListener("click", () => closeModal("#pending-modal"));
$("#view-pending-contract").addEventListener("click", openContractModal);
$("#close-agenda-detail").addEventListener("click", () => closeModal("#agenda-detail-modal"));
$("#close-agenda-detail-button").addEventListener("click", () => closeModal("#agenda-detail-modal"));
$("#close-toast").addEventListener("click", hideToast);
$("#contract-modal").addEventListener("click", (event) => { if (event.target === event.currentTarget) closeModal("#contract-modal"); });
$("#pending-modal").addEventListener("click", (event) => { if (event.target === event.currentTarget) closeModal("#pending-modal"); });
$("#agenda-detail-modal").addEventListener("click", (event) => { if (event.target === event.currentTarget) closeModal("#agenda-detail-modal"); });
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (!$("#agenda-detail-modal").hidden) closeModal("#agenda-detail-modal");
  else if (!$("#contract-modal").hidden) closeModal("#contract-modal");
  else if (!$("#pending-modal").hidden) closeModal("#pending-modal");
});

initialize();
