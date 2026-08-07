const CLIENT_ROLE = "cliente";
const TEMP_BOOKING_KEY = "agendamento_temp";

const professionalsLoading = document.querySelector("#professionals-loading");
const professionalsContent = document.querySelector("#professionals-content");
const bookingMessage = document.querySelector("#booking-message");

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
    return booking?.servico_id ? booking : null;
  } catch (error) {
    console.error("Erro ao ler o agendamento temporário:", error);
    return null;
  }
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
    throw new Error("Este perfil não possui acesso à área de agendamento da cliente.");
  }

  return session;
}

function professionalInitials(name) {
  const parts = String(name || "ND").trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part[0]).join("") || "ND";
}

function chooseProfessional(professional, button) {
  button.disabled = true;
  const temporaryBooking = readTemporaryBooking();

  if (!temporaryBooking) {
    window.location.replace("agendar.html");
    return;
  }

  const updatedBooking = {
    ...temporaryBooking,
    profissional_id: professional.id,
    profissional_nome: professional.name
  };

  try {
    window.localStorage.setItem(TEMP_BOOKING_KEY, JSON.stringify(updatedBooking));
    window.location.assign("agendar-horario.html");
  } catch (error) {
    console.error("Erro ao guardar a profissional selecionada:", error);
    showMessage("Não foi possível guardar sua escolha. Tente novamente.");
    button.disabled = false;
  }
}

function createProfessionalCard(professional) {
  const card = document.createElement("article");
  card.className = "professional-card";

  const mark = document.createElement("span");
  mark.className = "professional-mark";
  mark.setAttribute("aria-hidden", "true");
  mark.textContent = professionalInitials(professional.name);

  const name = document.createElement("h2");
  name.textContent = professional.name || "Profissional";

  const specialty = document.createElement("p");
  specialty.className = "professional-specialty";
  specialty.textContent = professional.specialty || "Especialista Nail Dreams";

  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Escolher";
  button.addEventListener("click", () => chooseProfessional(professional, button));

  card.append(mark, name, specialty, button);
  return card;
}

function renderProfessionals(professionals) {
  professionalsContent.replaceChildren();

  if (!professionals.length) {
    const emptyState = document.createElement("p");
    emptyState.className = "empty-state";
    emptyState.textContent = "Nenhuma profissional está disponível para este serviço no momento.";
    professionalsContent.appendChild(emptyState);
  } else {
    professionals.forEach((professional) => {
      professionalsContent.appendChild(createProfessionalCard(professional));
    });
  }

  professionalsLoading.hidden = true;
  professionalsContent.hidden = false;
}

async function loadCompatibleProfessionals(serviceId) {
  const { data, error } = await supabaseClient
    .from("profissional_servicos")
    .select("profissional_id, profissionais!inner(id, name, specialty, active)")
    .eq("servico_id", serviceId)
    .eq("active", true)
    .eq("profissionais.active", true);

  if (error) throw error;

  const uniqueProfessionals = new Map();
  (data || []).forEach((link) => {
    const professional = Array.isArray(link.profissionais)
      ? link.profissionais[0]
      : link.profissionais;
    if (professional?.id) uniqueProfessionals.set(professional.id, professional);
  });

  const professionals = [...uniqueProfessionals.values()]
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "pt-BR"));

  renderProfessionals(professionals);
}

async function initializeProfessionalSelection() {
  const temporaryBooking = readTemporaryBooking();
  if (!temporaryBooking) {
    window.location.replace("agendar.html");
    return;
  }

  document.querySelector("#selected-service-name").textContent = temporaryBooking.servico_nome || "o serviço escolhido";

  try {
    const session = await requireClientSession();
    if (!session) return;
    await loadCompatibleProfessionals(temporaryBooking.servico_id);
  } catch (error) {
    console.error("Erro ao carregar profissionais:", error);
    professionalsLoading.hidden = true;
    showMessage(readableError(error, "Não foi possível carregar as profissionais disponíveis."));
  }
}

initializeProfessionalSelection();
