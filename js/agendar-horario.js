const CLIENT_ROLE = "cliente";
const TEMP_BOOKING_KEY = "agendamento_temp";
const SLOT_INTERVAL_MINUTES = 30;

const dateInput = document.querySelector("#booking-date");
const timesContainer = document.querySelector("#available-times");
const timesLoading = document.querySelector("#times-loading");
const bookingMessage = document.querySelector("#booking-message");

let temporaryBooking = null;

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

function timeValue(date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
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
  const { data, error } = await supabaseClient.rpc("get_horarios_disponiveis", {
    p_profissional_id: temporaryBooking.profissional_id,
    p_servico_id: temporaryBooking.servico_id,
    p_data: selectedDate,
    p_intervalo_minutos: SLOT_INTERVAL_MINUTES
  });

  if (error) throw error;
  return data || [];
}

function normalizeAvailableTime(item) {
  const rawTime = typeof item === "string"
    ? item
    : item?.horario ?? item?.hora ?? item?.start_time ?? item?.horaInicio ?? item?.startAt;
  const match = String(rawTime || "").match(/(?:T|^)(\d{2}:\d{2})/);
  return match ? match[1] : null;
}

function chooseTime(selectedDate, selectedTime, button) {
  const duration = Number(temporaryBooking.duracao_minutos);
  if (!Number.isFinite(duration) || duration <= 0) {
    showMessage("A duração do serviço selecionado é inválida.");
    return;
  }

  button.disabled = true;
  const end = addMinutes(localDateTime(selectedDate, selectedTime), duration);
  const updatedBooking = {
    ...temporaryBooking,
    data: selectedDate,
    hora_inicio: selectedTime,
    hora_fim: timeValue(end)
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

function renderSlots(selectedDate, items) {
  timesContainer.replaceChildren();
  const times = (items || []).map(normalizeAvailableTime).filter(Boolean);

  if (!times.length) {
    const emptyState = document.createElement("p");
    emptyState.className = "empty-state";
    emptyState.textContent = "Não há horários disponíveis para esta data.";
    timesContainer.appendChild(emptyState);
  } else {
    times.forEach((time) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "time-button";
      button.textContent = time;
      button.addEventListener("click", () => chooseTime(selectedDate, time, button));
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
    renderSlots(selectedDate, availability);
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
    dateInput.addEventListener("change", handleDateChange);
  } catch (error) {
    console.error("Erro ao iniciar a seleção de horário:", error);
    dateInput.disabled = true;
    showMessage(readableError(error, "Não foi possível validar o acesso à agenda."));
  }
}

initializeScheduleSelection();
