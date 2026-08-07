const CLIENT_ROLE = "cliente";
const TEMP_BOOKING_KEY = "agendamento_temp";

const confirmationCard = document.querySelector("#confirmation-card");
const confirmationMessage = document.querySelector("#confirmation-message");
const confirmButton = document.querySelector("#confirm-booking-button");

let temporaryBooking = null;

function showMessage(text = "", type = "error") {
  confirmationMessage.textContent = text;
  confirmationMessage.className = text ? `message ${type}` : "message";
}

function readableError(error, fallback) {
  return error?.message || fallback;
}

function readTemporaryBooking() {
  try {
    const booking = JSON.parse(window.localStorage.getItem(TEMP_BOOKING_KEY));
    const isComplete = booking?.servico_id
      && booking?.profissional_id
      && booking?.data
      && booking?.hora_inicio
      && booking?.hora_fim;
    return isComplete ? booking : null;
  } catch (error) {
    console.error("Erro ao ler o agendamento temporário:", error);
    return null;
  }
}

function formatCurrency(value) {
  const amount = Number(value);
  return Number.isFinite(amount)
    ? amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
    : "Valor não informado";
}

function formatDate(value) {
  const [year, month, day] = String(value || "").split("-");
  return year && month && day ? `${day}/${month}/${year}` : "—";
}

function depositAmount(booking) {
  const savedAmount = Number(booking.deposit_amount);
  if (Number.isFinite(savedAmount)) return savedAmount;

  const price = Number(booking.valor);
  const percent = Number(booking.deposit_percent);
  return Number.isFinite(price) && Number.isFinite(percent)
    ? price * percent / 100
    : NaN;
}

async function requireClientSession() {
  const { data: sessionData, error: sessionError } = await supabaseClient.auth.getSession();
  if (sessionError) throw sessionError;

  const session = sessionData.session;
  if (!session) {
    window.location.replace("login.html");
    return null;
  }

  const { data: profile, error: profileError } = await supabaseClient
    .from("profiles")
    .select("role")
    .eq("id", session.user.id)
    .maybeSingle();

  if (profileError) throw profileError;
  if (profile?.role !== CLIENT_ROLE) {
    throw new Error("Este perfil não possui acesso à confirmação da cliente.");
  }

  return session;
}

function renderConfirmation(booking) {
  document.querySelector("#summary-service").textContent = booking.servico_nome || "—";
  document.querySelector("#summary-professional").textContent = booking.profissional_nome || "—";
  document.querySelector("#summary-date").textContent = formatDate(booking.data);
  document.querySelector("#summary-start-time").textContent = booking.hora_inicio || "—";
  document.querySelector("#summary-end-time").textContent = booking.hora_fim || "—";
  document.querySelector("#summary-duration").textContent = `${booking.duracao_minutos} min`;
  document.querySelector("#summary-price").textContent = formatCurrency(booking.valor);

  if (booking.requires_deposit === true) {
    document.querySelector("#summary-deposit-percent").textContent = `Sinal de ${booking.deposit_percent}%`;
    document.querySelector("#summary-deposit-amount").textContent = formatCurrency(depositAmount(booking));
    document.querySelector("#deposit-summary").hidden = false;
  }

  confirmationCard.hidden = false;
}

function bookingStartAt(booking) {
  const [year, month, day] = String(booking.data).split("-").map(Number);
  const [hour, minute] = String(booking.hora_inicio).split(":").map(Number);
  const desiredAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0);

  if (![year, month, day, hour, minute].every(Number.isFinite)) {
    throw new Error("A data ou o horário selecionado é inválido.");
  }

  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  });

  let timestamp = desiredAsUtc;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const parts = Object.fromEntries(
      formatter.formatToParts(new Date(timestamp)).map((part) => [part.type, part.value])
    );
    const displayedAsUtc = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second)
    );
    timestamp = desiredAsUtc - (displayedAsUtc - timestamp);
  }

  return new Date(timestamp).toISOString();
}

async function confirmReview() {
  confirmButton.disabled = true;
  confirmButton.textContent = "Solicitando...";
  showMessage();

  try {
    const startAt = bookingStartAt(temporaryBooking);
    const { data: result, error } = await supabaseClient.rpc("solicitar_agendamento_cliente", {
      p_profissional_id: temporaryBooking.profissional_id,
      p_servico_id: temporaryBooking.servico_id,
      p_start_at: startAt,
      p_cliente_nome: temporaryBooking.cliente_nome || null,
      p_cliente_phone: temporaryBooking.cliente_phone || null,
      p_notes: temporaryBooking.notes || null
    });

    if (error) throw error;

    if (result?.success === true) {
      confirmButton.textContent = "Agendamento solicitado";
      showMessage(result.message || "Agendamento solicitado com sucesso.", "success");
      window.localStorage.removeItem(TEMP_BOOKING_KEY);
      confirmationMessage.scrollIntoView({ behavior: "smooth", block: "center" });
      window.setTimeout(() => window.location.replace("cliente.html"), 3000);
      return;
    }

    showMessage(result?.message || "Não foi possível solicitar o agendamento.");
  } catch (error) {
    console.error("Erro ao solicitar o agendamento:", error);
    showMessage(readableError(error, "Não foi possível solicitar o agendamento."));
  }

  confirmButton.disabled = false;
  confirmButton.textContent = "Confirmar agendamento";
  confirmationMessage.scrollIntoView({ behavior: "smooth", block: "center" });
}

async function initializeConfirmation() {
  temporaryBooking = readTemporaryBooking();
  if (!temporaryBooking) {
    window.location.replace("agendar.html");
    return;
  }

  try {
    const session = await requireClientSession();
    if (!session) return;
    renderConfirmation(temporaryBooking);
    confirmButton.addEventListener("click", confirmReview);
  } catch (error) {
    console.error("Erro ao preparar a confirmação:", error);
    showMessage(readableError(error, "Não foi possível preparar a confirmação do agendamento."));
  }
}

initializeConfirmation();
