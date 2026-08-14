const CLIENT_ROLE = "cliente";
const TEMP_BOOKING_KEY = "agendamento_temp";
const VISUAL_CATEGORIES = {
  unhas: "Unhas",
  olhos: "Olhos",
  corpo: "Corpo"
};

const servicesLoading = document.querySelector("#services-loading");
const servicesContent = document.querySelector("#services-content");
const bookingMessage = document.querySelector("#booking-message");
let servicesCatalog = [];
let selectedVisualCategory = "unhas";

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

function normalizeCategoryText(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function visualCategory(service) {
  const category = normalizeCategoryText(service?.category);
  const name = normalizeCategoryText(service?.name);
  if (/cilio|sobrancelha|lash|brow|olho|volume|fox eyes/.test(`${category} ${name}`)) return "olhos";
  if (/quiroprax|massag|massoter|limpeza de pele|ventosa|acupunt|corpo|bem-estar|estetica/.test(`${category} ${name}`)) return "corpo";
  return "unhas";
}

function presentationPriority(service) {
  if (visualCategory(service) !== "corpo") return 0;

  const name = normalizeCategoryText(service?.name).trim();
  if (name === "quiropraxia completa") return 0;
  if (name === "quiropraxia adicional") return 1;
  return 2;
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

function renderServices() {
  servicesContent.replaceChildren();
  const services = servicesCatalog
    .filter((service) => visualCategory(service) === selectedVisualCategory)
    .sort((first, second) => presentationPriority(first) - presentationPriority(second));

  if (!services.length) {
    const emptyState = document.createElement("p");
    emptyState.className = "empty-state";
    emptyState.textContent = "Nenhum serviço está disponível no momento.";
    servicesContent.appendChild(emptyState);
  } else {
    const group = document.createElement("section");
    group.className = "service-group";
    const heading = document.createElement("h2");
    heading.textContent = VISUAL_CATEGORIES[selectedVisualCategory];
    const grid = document.createElement("div");
    grid.className = "service-grid";
    services.forEach((service) => grid.appendChild(createServiceCard(service)));
    group.append(heading, grid);
    servicesContent.appendChild(group);
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
  servicesCatalog = data || [];
  renderServices();
}

function selectVisualCategory(category) {
  if (!VISUAL_CATEGORIES[category] || category === selectedVisualCategory) return;
  selectedVisualCategory = category;
  document.querySelectorAll("[data-service-category]").forEach((button) => {
    const active = button.dataset.serviceCategory === category;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  renderServices();
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

document.querySelectorAll("[data-service-category]").forEach((button) => {
  button.addEventListener("click", () => selectVisualCategory(button.dataset.serviceCategory));
});

initializeBooking();
