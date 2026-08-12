const CLOSED_OR_COMPLETED_STATUSES = new Set([
  "concluido",
  "cancelado",
  "cancelado_cliente",
  "cancelado_studio",
  "nao_compareceu",
  "expirado"
]);

const loadingSection = document.querySelector("#appointments-loading");
const contentSection = document.querySelector("#appointments-content");
const appointmentsMessage = document.querySelector("#appointments-message");

function showMessage(text = "", type = "error") {
  appointmentsMessage.textContent = text;
  appointmentsMessage.className = text ? `message ${type}` : "message";
}

function readableError(error, fallback) {
  return error?.message || fallback;
}

function userDisplayName(user) {
  return user.user_metadata?.full_name
    || user.user_metadata?.name
    || user.email?.split("@")[0]
    || "cliente";
}

function normalizedStatus(status) {
  return String(status || "").trim().toLowerCase();
}

function statusPresentation(status) {
  const value = normalizedStatus(status);
  if (value === "confirmado") return { label: "Confirmado", className: "status-confirmado" };
  if (value === "solicitado") return { label: "Solicitado", className: "status-solicitado" };
  if (value === "aguardando_sinal") return { label: "Aguardando sinal", className: "status-aguardando-sinal" };
  if (value === "concluido") return { label: "Concluído", className: "status-concluido" };
  if (value.startsWith("cancelado")) return { label: "Cancelado", className: "status-cancelado" };
  if (value === "nao_compareceu") return { label: "Não compareceu", className: "status-cancelado" };
  if (value === "expirado") return { label: "Expirado", className: "status-cancelado" };
  return {
    label: value ? value.replaceAll("_", " ") : "Status não informado",
    className: "status-default"
  };
}

function formatDate(date) {
  const [year, month, day] = String(date || "").split("-");
  return year && month && day ? `${day}/${month}/${year}` : "Data não informada";
}

function formatCurrency(value) {
  const amount = Number(value);
  return value !== null && value !== "" && Number.isFinite(amount)
    ? amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
    : null;
}

function formatValue(value) {
  const text = String(value || "").trim();
  return text ? text.replaceAll("_", " ") : "";
}

function appointmentTimestamp(appointment) {
  const time = appointment.horaInicio || "00:00";
  const timestamp = new Date(`${appointment.data}T${time}:00`).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function addDetail(list, icon, label, value) {
  const wrapper = document.createElement("div");
  wrapper.className = "appointment-detail";
  const term = document.createElement("dt");
  term.setAttribute("aria-label", label);
  term.textContent = icon;
  const description = document.createElement("dd");
  description.textContent = value;
  wrapper.append(term, description);
  list.appendChild(wrapper);
}

function createAppointmentCard(appointment) {
  const card = document.createElement("article");
  card.className = "appointment-card";
  const header = document.createElement("div");
  header.className = "appointment-card-header";
  const service = document.createElement("div");
  service.className = "appointment-service";
  const serviceIcon = document.createElement("span");
  serviceIcon.className = "appointment-service-icon";
  serviceIcon.setAttribute("aria-hidden", "true");
  serviceIcon.textContent = "✨";
  const serviceText = document.createElement("div");
  const title = document.createElement("h3");
  title.textContent = appointment.servicoNome || "Atendimento Nail Dreams";
  const category = document.createElement("p");
  category.className = "appointment-category";
  category.textContent = appointment.servicoCategoria || "Serviço";
  serviceText.append(title, category);
  service.append(serviceIcon, serviceText);

  const presentation = statusPresentation(appointment.status);
  const badge = document.createElement("span");
  badge.className = `status-badge ${presentation.className}`;
  badge.textContent = presentation.label;
  header.append(service, badge);

  const details = document.createElement("dl");
  details.className = "appointment-details";
  addDetail(details, "📅", "Data", formatDate(appointment.data));
  addDetail(details, "⏰", "Horário", `${appointment.horaInicio || "—"} às ${appointment.horaFim || "—"}`);
  addDetail(details, "👩", "Profissional", appointment.profissionalNome || "Profissional não informada");

  const finance = document.createElement("div");
  finance.className = "appointment-finance";
  const totalPrice = formatCurrency(appointment.totalPrice);
  const depositAmount = formatCurrency(appointment.depositAmount);
  const paymentStatus = formatValue(appointment.paymentStatus);
  if (totalPrice) {
    const total = document.createElement("p");
    total.textContent = `Valor total: ${totalPrice}`;
    finance.appendChild(total);
  }
  if (depositAmount && Number(appointment.depositAmount) > 0) {
    const deposit = document.createElement("p");
    deposit.textContent = `Sinal: ${depositAmount}`;
    finance.appendChild(deposit);
  }
  if (paymentStatus) {
    const payment = document.createElement("p");
    payment.textContent = `Pagamento: ${paymentStatus}`;
    finance.appendChild(payment);
  }

  card.append(header, details);
  if (finance.childElementCount) card.appendChild(finance);
  return card;
}

function renderList(container, appointments, emptyMessage) {
  container.replaceChildren();
  if (!appointments.length) {
    const empty = document.createElement("p");
    empty.className = "appointments-empty";
    empty.textContent = emptyMessage;
    container.appendChild(empty);
    return;
  }
  appointments.forEach((appointment) => container.appendChild(createAppointmentCard(appointment)));
}

function renderAppointments(items) {
  const now = Date.now();
  const upcoming = [];
  const history = [];

  (items || []).forEach((appointment) => {
    const isClosed = CLOSED_OR_COMPLETED_STATUSES.has(normalizedStatus(appointment.status));
    const isPast = appointmentTimestamp(appointment) < now;
    (isClosed || isPast ? history : upcoming).push(appointment);
  });

  upcoming.sort((a, b) => appointmentTimestamp(a) - appointmentTimestamp(b));
  history.sort((a, b) => appointmentTimestamp(b) - appointmentTimestamp(a));
  document.querySelector("#upcoming-count").textContent = upcoming.length;
  document.querySelector("#history-count").textContent = history.length;
  renderList(document.querySelector("#upcoming-appointments"), upcoming, "Você não possui próximos atendimentos agendados.");
  renderList(document.querySelector("#appointment-history"), history, "Seu histórico de atendimentos aparecerá aqui.");
  loadingSection.hidden = true;
  contentSection.hidden = false;
}

async function initializeAppointments() {
  try {
    const { data: sessionData, error: sessionError } = await supabaseClient.auth.getSession();
    if (sessionError) throw sessionError;
    const session = sessionData.session;
    if (!session?.user) {
      window.location.replace("cliente.html");
      return;
    }

    document.querySelector("#appointments-client-name").textContent = userDisplayName(session.user);
    const { data: result, error } = await supabaseClient.rpc("listar_meus_agendamentos_cliente");
    if (error) throw error;
    if (result?.success !== true) {
      throw new Error(result?.message || "Não foi possível carregar seus agendamentos.");
    }
    renderAppointments(result.items || []);
  } catch (error) {
    console.error("Erro ao carregar os agendamentos da cliente:", error);
    loadingSection.hidden = true;
    showMessage(readableError(error, "Não foi possível carregar seus agendamentos. Tente novamente."));
  }
}

initializeAppointments();
