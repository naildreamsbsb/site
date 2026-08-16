const CLIENT_ROLE = "cliente";
const TEMP_BOOKING_KEY = "agendamento_temp";
const STUDIO_WHATSAPP_NUMBER = "5561985879423";
const CREATE_TIMEOUT_MS = 15000;
const CHECK_TIMEOUT_MS = 8000;
const RECONCILIATION_ATTEMPTS = 4;
const card = document.querySelector("#confirmation-card");
const message = document.querySelector("#confirmation-message");
const confirmButton = document.querySelector("#confirm-booking-button");
const whatsappFallback = document.querySelector("#whatsapp-fallback-button");
let booking;
let client;
let attemptActive = false;

function showMessage(text = "", type = "error") {
  message.textContent = text;
  message.className = text ? `message ${type}` : "message";
}

function readBooking() {
  try {
    const value = JSON.parse(localStorage.getItem(TEMP_BOOKING_KEY));
    return Array.isArray(value?.itens) && value.itens.length && value.data && value.hora_inicio ? value : null;
  } catch {
    return null;
  }
}

function money(value) {
  return Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function dateText(value) {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function createAttemptId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function ensureAttemptId() {
  if (!booking.tentativa_id) {
    booking.tentativa_id = createAttemptId();
    localStorage.setItem(TEMP_BOOKING_KEY, JSON.stringify(booking));
  }
  return booking.tentativa_id;
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function withTimeout(promise, milliseconds) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error("REQUEST_TIMEOUT")), milliseconds);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}

async function context() {
  if (!window.supabaseClient) throw new Error("BOOTSTRAP_UNAVAILABLE");
  const session = await window.supabaseClient.auth.getSession();
  if (session.error) throw session.error;
  if (!session.data.session) {
    location.replace("login.html");
    return false;
  }
  const [profile, result] = await Promise.all([
    window.supabaseClient.from("profiles").select("role").eq("id", session.data.session.user.id).maybeSingle(),
    window.supabaseClient.from("clientes").select("id,full_name,phone").eq("profile_id", session.data.session.user.id).maybeSingle()
  ]);
  if (profile.error) throw profile.error;
  if (result.error) throw result.error;
  if (profile.data?.role !== CLIENT_ROLE || !result.data) throw new Error("CLIENT_NOT_FOUND");
  client = result.data;
  return true;
}

function render() {
  const list = document.querySelector("#summary-procedures");
  booking.itens.forEach((item, index) => {
    const row = document.createElement("article");
    const title = document.createElement("strong");
    const detail = document.createElement("span");
    title.textContent = `${index + 1}. ${item.servico_nome}`;
    detail.textContent = `${item.profissional_nome} · ${item.duracao_minutos} min · ${money(item.valor)}`;
    row.append(title, detail);
    list.appendChild(row);
  });
  document.querySelector("#summary-date").textContent = dateText(booking.data);
  document.querySelector("#summary-start-time").textContent = booking.hora_inicio;
  document.querySelector("#summary-end-time").textContent = booking.hora_fim;
  const duration = booking.itens.reduce((sum, item) => sum + Number(item.duracao_minutos), 0);
  const price = booking.itens.reduce((sum, item) => sum + Number(item.valor), 0);
  document.querySelector("#summary-duration").textContent = `${duration} min`;
  document.querySelector("#summary-price").textContent = money(price);
  card.hidden = false;
}

function startAt() {
  const [year, month, day] = booking.data.split("-").map(Number);
  const [hour, minute] = booking.hora_inicio.split(":").map(Number);
  const desired = Date.UTC(year, month - 1, day, hour, minute);
  const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  let timestamp = desired;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(timestamp)).map((part) => [part.type, part.value]));
    const displayed = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
    timestamp = desired - (displayed - timestamp);
  }
  return new Date(timestamp).toISOString();
}

function whatsappUrl() {
  const procedures = booking.itens.map((item, index) => `${index + 1}. ${item.servico_nome} — ${item.profissional_nome}`).join("\n");
  const text = `Novo agendamento Nail Dreams 💕\n\nCliente: ${client.full_name}\n${procedures}\nData: ${dateText(booking.data)}\nHorário: ${booking.hora_inicio} às ${booking.hora_fim}`;
  return `https://wa.me/${STUDIO_WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;
}

function showWhatsAppFallback(url) {
  whatsappFallback.hidden = false;
  whatsappFallback.onclick = () => {
    const opened = window.open(url, "_blank", "noopener");
    if (!opened) location.assign(url);
  };
}

function createParameters() {
  return {
    p_attempt_id: ensureAttemptId(), p_cliente_id: client.id, p_start_at: startAt(),
    p_itens: booking.itens.map((item, index) => ({ servico_id: item.servico_id, profissional_id: item.profissional_id, ordem: index + 1 })),
    p_cliente_nome: null, p_cliente_phone: null, p_cliente_email: null, p_appointment_type: "normal",
    p_requires_deposit_override: null, p_deposit_percent_override: null, p_notes: null
  };
}

async function reconcileAttempt() {
  for (let attempt = 0; attempt < RECONCILIATION_ATTEMPTS; attempt += 1) {
    if (attempt > 0) await delay(1500);
    try {
      const { data, error } = await withTimeout(window.supabaseClient.rpc("consultar_tentativa_agendamento_v1", { p_attempt_id: ensureAttemptId() }), CHECK_TIMEOUT_MS);
      if (!error && data?.found === true) return data;
    } catch (error) {
      console.warn("Falha temporária ao reconciliar agendamento.", error);
    }
  }
  return null;
}

async function selectedTimeIsAvailable() {
  let elapsed = 0;
  let possibleStarts = null;
  for (const item of booking.itens) {
    const { data, error } = await withTimeout(window.supabaseClient.rpc("get_horarios_disponiveis", {
      p_profissional_id: item.profissional_id, p_servico_id: item.servico_id, p_data: booking.data, p_intervalo_minutos: 30
    }), CHECK_TIMEOUT_MS);
    if (error) throw error;
    const startsForItem = new Set((data || []).map((slot) => {
      const [hour, minute] = String(slot.horario || "").split(":").map(Number);
      return hour * 60 + minute - elapsed;
    }).filter(Number.isFinite));
    possibleStarts = possibleStarts === null
      ? startsForItem
      : new Set([...possibleStarts].filter((value) => startsForItem.has(value)));
    elapsed += Number(item.duracao_minutos);
  }
  const [selectedHour, selectedMinute] = booking.hora_inicio.split(":").map(Number);
  return possibleStarts?.has(selectedHour * 60 + selectedMinute) === true;
}

function finishSuccess(result) {
  const url = whatsappUrl();
  showMessage(result?.message || "Agendamento criado com sucesso.", "success");
  localStorage.removeItem(TEMP_BOOKING_KEY);
  confirmButton.hidden = true;
  document.querySelector(".confirmation-note").textContent = "Agendamento registrado. Nossa equipe dará continuidade ao seu atendimento. 💗";
  const opened = window.open(url, "_blank", "noopener");
  if (!opened) showWhatsAppFallback(url);
}

function allowRetry() {
  attemptActive = false;
  confirmButton.disabled = false;
  confirmButton.textContent = "Tentar novamente";
}

async function confirm() {
  if (attemptActive) return;
  attemptActive = true;
  confirmButton.disabled = true;
  confirmButton.textContent = "Criando agendamento...";
  whatsappFallback.hidden = true;
  showMessage();
  try {
    const { data, error } = await withTimeout(window.supabaseClient.rpc("solicitar_agendamento_publico_v3", createParameters()), CREATE_TIMEOUT_MS);
    if (error || data?.success !== true) throw error || new Error("CREATE_REJECTED");
    finishSuccess(data);
    return;
  } catch (error) {
    console.error("Falha ou timeout na criação do agendamento.", error);
  }

  confirmButton.textContent = "Verificando agendamento...";
  showMessage("Estamos verificando se seu agendamento foi concluído...", "info");
  const reconciled = await reconcileAttempt();
  if (reconciled?.found) {
    finishSuccess(reconciled);
    return;
  }

  try {
    if (await selectedTimeIsAvailable()) {
      showMessage("Não conseguimos concluir seu agendamento. O horário continua disponível. Tente novamente.");
      allowRetry();
    } else {
      attemptActive = false;
      confirmButton.disabled = true;
      confirmButton.textContent = "Horário indisponível";
      showMessage("Esse horário acabou de ficar indisponível. Escolha outro horário.");
    }
  } catch (error) {
    console.error("Não foi possível confirmar novamente a disponibilidade.", error);
    attemptActive = false;
    confirmButton.disabled = true;
    confirmButton.textContent = "Atualize a página";
    showMessage("Não foi possível confirmar o resultado. Atualize a página antes de tentar novamente.");
  }
}

async function init() {
  booking = readBooking();
  if (!booking) return location.replace("agendar.html");
  try {
    if (await context()) {
      ensureAttemptId();
      render();
      confirmButton.addEventListener("click", confirm);
    }
  } catch (error) {
    console.error("Falha ao preparar confirmação.", error);
    showMessage("Não foi possível preparar a confirmação. Atualize a página e tente novamente.");
  }
}

init();
