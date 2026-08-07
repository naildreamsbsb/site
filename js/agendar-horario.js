const CLIENT_ROLE = "cliente";
const TEMP_BOOKING_KEY = "agendamento_temp";
const SLOT_INTERVAL_MINUTES = 30;
const CLOSED_APPOINTMENT_STATUSES = new Set([
  "cancelado_cliente",
  "cancelado_studio",
  "nao_compareceu",
  "expirado"
]);

const dateInput = document.querySelector("#booking-date");
const timesContainer = document.querySelector("#available-times");
const timesLoading = document.querySelector("#times-loading");
const bookingMessage = document.querySelector("#booking-message");

let temporaryBooking = null;
let currentClient = null;

function showMessage(text = "") {
  bookingMessage.textContent = text;
  bookingMessage.className = text ? "message error" : "message";
}

function readableError(error, fallback) {
  return error?.message || fallback;
}

function readTemporaryBooking() {
  try {
    const booking = JSON.parse(window.localStorage.getItem(TEMP_BOOKING_KEY));
    return booking?.servico_id && booking?.profissional_id ? booking : null;
  } catch (error) {
    console.error("Erro ao ler o agendamento temporário:", error);
    return null;
  }
}

function localDateTime(date, time) {
  return new Date(`${date}T${String(time).slice(0, 5)}:00`);
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60000);
}

function timeLabel(date) {
  return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function timeValue(date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function intervalsOverlap(startA, endA, startB, endB) {
  return startA < endB && endA > startB;
}

function weekdayMatches(value, selectedDate) {
  const weekday = new Date(`${selectedDate}T12:00:00`).getDay();
  const numericValue = Number(value);
  if (Number.isInteger(numericValue)) return numericValue === weekday;

  const weekdayNames = ["domingo", "segunda", "terca", "quarta", "quinta", "sexta", "sabado"];
  const normalizedValue = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  return normalizedValue.startsWith(weekdayNames[weekday]);
}

function selectedDayLimits(selectedDate) {
  return {
    start: new Date(`${selectedDate}T00:00:00`),
    end: new Date(`${selectedDate}T23:59:59.999`)
  };
}

async function requireClientContext() {
  const { data: sessionData, error: sessionError } = await supabaseClient.auth.getSession();
  if (sessionError) throw sessionError;

  const session = sessionData.session;
  if (!session) {
    window.location.replace("login.html");
    return null;
  }

  const [profileResult, clientResult] = await Promise.all([
    supabaseClient.from("profiles").select("role").eq("id", session.user.id).maybeSingle(),
    supabaseClient.from("clientes").select("id, profile_id").eq("profile_id", session.user.id).maybeSingle()
  ]);

  if (profileResult.error) throw profileResult.error;
  if (profileResult.data?.role !== CLIENT_ROLE) {
    throw new Error("Este perfil não possui acesso à área de agendamento da cliente.");
  }
  if (clientResult.error) throw clientResult.error;
  if (!clientResult.data) throw new Error("Não foi possível localizar o cadastro da cliente.");

  return { session, client: clientResult.data };
}

async function fetchDayAvailability(selectedDate) {
  const limits = selectedDayLimits(selectedDate);
  const professionalId = temporaryBooking.profissional_id;

  const [workResult, blocksResult, appointmentsResult] = await Promise.all([
    supabaseClient
      .from("horarios_trabalho")
      .select("profissional_id, weekday, start_time, end_time, active")
      .eq("profissional_id", professionalId)
      .eq("active", true),
    supabaseClient
      .from("bloqueios_agenda")
      .select("profissional_id, start_at, end_at, active")
      .eq("profissional_id", professionalId)
      .eq("active", true)
      .lt("start_at", limits.end.toISOString())
      .gt("end_at", limits.start.toISOString()),
    supabaseClient
      .from("agendamentos")
      .select("profissional_id, cliente_id, start_at, end_at, status")
      .or(`profissional_id.eq.${professionalId},cliente_id.eq.${currentClient.id}`)
      .lt("start_at", limits.end.toISOString())
      .gt("end_at", limits.start.toISOString())
  ]);

  if (workResult.error) throw workResult.error;
  if (blocksResult.error) throw blocksResult.error;
  if (appointmentsResult.error) throw appointmentsResult.error;

  return {
    schedules: (workResult.data || []).filter((item) => weekdayMatches(item.weekday, selectedDate)),
    blocks: blocksResult.data || [],
    appointments: (appointmentsResult.data || []).filter(
      (item) => !CLOSED_APPOINTMENT_STATUSES.has(item.status)
    )
  };
}

function generateAvailableSlots(selectedDate, schedules, blocks, appointments) {
  const duration = Number(temporaryBooking.duracao_minutos);
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error("A duração do serviço selecionado é inválida.");
  }

  const now = new Date();
  const slots = new Map();

  schedules.forEach((schedule) => {
    const workStart = localDateTime(selectedDate, schedule.start_time);
    const workEnd = localDateTime(selectedDate, schedule.end_time);

    for (let slotStart = workStart; addMinutes(slotStart, duration) <= workEnd; slotStart = addMinutes(slotStart, SLOT_INTERVAL_MINUTES)) {
      const slotEnd = addMinutes(slotStart, duration);
      if (slotStart <= now) continue;

      const blocked = blocks.some((block) => intervalsOverlap(
        slotStart,
        slotEnd,
        new Date(block.start_at),
        new Date(block.end_at)
      ));
      if (blocked) continue;

      const occupied = appointments.some((appointment) => intervalsOverlap(
        slotStart,
        slotEnd,
        new Date(appointment.start_at),
        new Date(appointment.end_at)
      ));
      if (occupied) continue;

      slots.set(slotStart.getTime(), { start: slotStart, end: slotEnd });
    }
  });

  return [...slots.values()].sort((a, b) => a.start - b.start);
}

function chooseTime(selectedDate, slot, button) {
  button.disabled = true;
  const updatedBooking = {
    ...temporaryBooking,
    data: selectedDate,
    hora_inicio: timeValue(slot.start),
    hora_fim: timeValue(slot.end)
  };

  try {
    window.localStorage.setItem(TEMP_BOOKING_KEY, JSON.stringify(updatedBooking));
    window.location.assign("agendar-confirmacao.html");
  } catch (error) {
    console.error("Erro ao guardar o horário selecionado:", error);
    showMessage("Não foi possível guardar sua escolha. Tente novamente.");
    button.disabled = false;
  }
}

function renderSlots(selectedDate, slots) {
  timesContainer.replaceChildren();

  if (!slots.length) {
    const emptyState = document.createElement("p");
    emptyState.className = "empty-state";
    emptyState.textContent = "Não há horários disponíveis para esta data.";
    timesContainer.appendChild(emptyState);
  } else {
    slots.forEach((slot) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "time-button";
      button.textContent = timeLabel(slot.start);
      button.addEventListener("click", () => chooseTime(selectedDate, slot, button));
      timesContainer.appendChild(button);
    });
  }
}

async function handleDateChange() {
  const selectedDate = dateInput.value;
  if (!selectedDate) return;

  showMessage();
  timesContainer.replaceChildren();
  timesLoading.hidden = false;

  try {
    const availability = await fetchDayAvailability(selectedDate);
    const slots = generateAvailableSlots(
      selectedDate,
      availability.schedules,
      availability.blocks,
      availability.appointments
    );
    renderSlots(selectedDate, slots);
  } catch (error) {
    console.error("Erro ao consultar horários:", error);
    showMessage(readableError(error, "Não foi possível consultar os horários disponíveis."));
    renderSlots(selectedDate, []);
  } finally {
    timesLoading.hidden = true;
  }
}

async function initializeScheduleSelection() {
  temporaryBooking = readTemporaryBooking();
  if (!temporaryBooking) {
    window.location.replace("agendar.html");
    return;
  }

  document.querySelector("#selected-service").textContent = temporaryBooking.servico_nome || "—";
  document.querySelector("#selected-professional").textContent = temporaryBooking.profissional_nome || "—";
  document.querySelector("#selected-duration").textContent = `${temporaryBooking.duracao_minutos} min`;
  dateInput.min = new Date().toLocaleDateString("sv-SE");

  try {
    const context = await requireClientContext();
    if (!context) return;
    currentClient = context.client;
    dateInput.addEventListener("change", handleDateChange);
  } catch (error) {
    console.error("Erro ao iniciar a seleção de horário:", error);
    dateInput.disabled = true;
    showMessage(readableError(error, "Não foi possível validar o acesso à agenda."));
  }
}

initializeScheduleSelection();
