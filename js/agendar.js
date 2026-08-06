const CLIENT_ROLE = "cliente";
const TEMP_BOOKING_KEY = "agendamento_temp";
const CATEGORY_ORDER = ["Unhas", "Quiropraxia", "Sobrancelha", "Cílios"];

const servicesLoading = document.querySelector("#services-loading");
const servicesContent = document.querySelector("#services-content");
const bookingMessage = document.querySelector("#booking-message");

function showMessage(text = "") {
  bookingMessage.textContent = text;
  bookingMessage.className = text ? "message error" : "message";
}

function readableError(error, fallback) {
  return error?.message || fallback;
}

function formatPrice(value) {
  const price = Number(value);
  return Number.isFinite(price)
    ? price.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
    : "Valor sob consulta";
}

function categoryName(service) {
  return service.category?.trim() || "Outros serviços";
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

function chooseService(service, button) {
  button.disabled = true;

  const temporaryBooking = {
    servico_id: service.id,
    servico_nome: service.name,
    duracao_minutos: service.duration_minutes,
    valor: service.price
  };

  try {
    window.localStorage.setItem(TEMP_BOOKING_KEY, JSON.stringify(temporaryBooking));
    window.location.assign("agendar-profissional.html");
  } catch (error) {
    console.error("Erro ao guardar o serviço selecionado:", error);
    showMessage("Não foi possível guardar sua escolha. Tente novamente.");
    button.disabled = false;
  }
}

function createServiceCard(service) {
  const card = document.createElement("article");
  card.className = "service-card";

  const category = document.createElement("span");
  category.className = "service-category";
  category.textContent = categoryName(service);

  const title = document.createElement("h3");
  title.textContent = service.name || "Serviço sem nome";

  const description = document.createElement("p");
  description.className = "service-description";
  description.textContent = service.description || "Consulte os detalhes deste serviço com nossa equipe.";

  const deposit = document.createElement("p");
  deposit.className = "service-deposit-badge";
  deposit.textContent = `Sinal ${service.deposit_percent_default}%`;
  deposit.hidden = service.requires_deposit_default !== true;

  const details = document.createElement("div");
  details.className = "service-details";

  const duration = document.createElement("span");
  duration.className = "service-duration";
  duration.textContent = `${service.duration_minutes || 0} min`;

  const price = document.createElement("strong");
  price.className = "service-price";
  price.textContent = formatPrice(service.price);

  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Escolher";
  button.addEventListener("click", () => chooseService(service, button));

  details.append(duration, price);
  card.append(category, title, description, deposit, details, button);
  return card;
}

function renderServices(services) {
  servicesContent.replaceChildren();

  if (!services.length) {
    const emptyState = document.createElement("p");
    emptyState.className = "empty-state";
    emptyState.textContent = "Nenhum serviço está disponível no momento.";
    servicesContent.appendChild(emptyState);
  } else {
    const groups = new Map();

    services.forEach((service) => {
      const category = categoryName(service);
      if (!groups.has(category)) groups.set(category, []);
      groups.get(category).push(service);
    });

    const orderedGroups = [...groups.entries()].sort(([categoryA], [categoryB]) => {
      const positionA = CATEGORY_ORDER.indexOf(categoryA);
      const positionB = CATEGORY_ORDER.indexOf(categoryB);
      const orderA = positionA === -1 ? CATEGORY_ORDER.length : positionA;
      const orderB = positionB === -1 ? CATEGORY_ORDER.length : positionB;
      return orderA - orderB;
    });

    orderedGroups.forEach(([category, categoryServices]) => {
      const group = document.createElement("section");
      group.className = "service-group";

      const heading = document.createElement("h2");
      heading.textContent = category;

      const grid = document.createElement("div");
      grid.className = "service-grid";
      categoryServices.forEach((service) => grid.appendChild(createServiceCard(service)));

      group.append(heading, grid);
      servicesContent.appendChild(group);
    });
  }

  servicesLoading.hidden = true;
  servicesContent.hidden = false;
}

async function loadServices() {
  const { data, error } = await supabaseClient
    .from("servicos")
    .select("id, name, category, description, duration_minutes, price, active, requires_deposit_default, deposit_percent_default")
    .eq("active", true)
    .order("category")
    .order("name");

  if (error) throw error;
  renderServices(data || []);
}

async function initializeBooking() {
  try {
    const session = await requireClientSession();
    if (!session) return;
    await loadServices();
  } catch (error) {
    console.error("Erro ao iniciar a seleção de serviço:", error);
    servicesLoading.hidden = true;
    showMessage(readableError(error, "Não foi possível carregar os serviços."));
  }
}

initializeBooking();
