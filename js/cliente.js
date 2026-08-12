const CLIENT_ROLE = "cliente";

const loadingSection = document.querySelector("#client-loading");
const loginSection = document.querySelector("#client-login");
const deniedSection = document.querySelector("#client-access-denied");
const dashboardSection = document.querySelector("#client-dashboard");
const clientMessage = document.querySelector("#client-message");

function showOnly(section) {
  [loadingSection, loginSection, deniedSection, dashboardSection].forEach((item) => {
    item.hidden = item !== section;
  });
}

function showMessage(text = "", type = "error") {
  clientMessage.textContent = text;
  clientMessage.className = text ? `message ${type}` : "message";
}

function readableError(error, fallback) {
  return error?.message || fallback;
}

function userDisplayName(user) {
  return user.user_metadata?.full_name
    || user.user_metadata?.name
    || user.email?.split("@")[0]
    || "Cliente";
}

async function findOrCreateProfile(user) {
  const { data: existingProfile, error: profileError } = await supabaseClient
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) throw profileError;
  if (existingProfile) return existingProfile;

  const profilePayload = {
    id: user.id,
    email: user.email,
    role: CLIENT_ROLE
  };

  const { data: createdProfile, error: createError } = await supabaseClient
    .from("profiles")
    .insert(profilePayload)
    .select("*")
    .single();

  if (createError) throw createError;
  return createdProfile;
}

async function findOrCreateClient(user) {
  const { data: existingClient, error: clientError } = await supabaseClient
    .from("clientes")
    .select("*")
    .eq("profile_id", user.id)
    .maybeSingle();

  if (clientError) throw clientError;
  if (existingClient) return existingClient;

  const clientPayload = {
    profile_id: user.id,
    full_name: userDisplayName(user),
    email: user.email
  };

  const { data: createdClient, error: createError } = await supabaseClient
    .from("clientes")
    .insert(clientPayload)
    .select("*")
    .single();

  if (createError) throw createError;
  return createdClient;
}

function renderDashboard(user, client) {
  document.querySelector("#client-name").textContent = client.full_name || userDisplayName(user);
  document.querySelector("#client-email").textContent = client.email || user.email || "";
  showOnly(dashboardSection);
}

async function loadClientArea(session) {
  showMessage();

  if (!session?.user) {
    showOnly(loginSection);
    return;
  }

  showOnly(loadingSection);

  try {
    const profile = await findOrCreateProfile(session.user);

    if (profile.role !== CLIENT_ROLE) {
      showOnly(deniedSection);
      return;
    }

    const client = await findOrCreateClient(session.user);
    renderDashboard(session.user, client);
  } catch (error) {
    console.error("Erro ao preparar a área da cliente:", error);
    showMessage(readableError(error, "Não foi possível preparar sua área. Tente novamente."));
    showOnly(loginSection);
  }
}

async function loginWithGoogle() {
  const button = document.querySelector("#google-login-button");
  button.disabled = true;
  showMessage("Redirecionando para o Google...", "info");

  const { error } = await supabaseClient.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: new URL("cliente.html", window.location.href).href
    }
  });

  if (error) {
    showMessage(readableError(error, "Não foi possível iniciar o login com Google."));
    button.disabled = false;
  }
}

async function logout() {
  showMessage();
  const { error } = await supabaseClient.auth.signOut();
  if (error) {
    showMessage(readableError(error, "Não foi possível sair da sua conta."));
    return;
  }
  showOnly(loginSection);
}

function startBooking() {
  window.location.assign("agendar.html");
}

function showAppointments() {
  window.location.assign("meus-agendamentos.html");
}

async function initializeClientArea() {
  try {
    const { data, error } = await supabaseClient.auth.getSession();
    if (error) throw error;
    await loadClientArea(data.session);
  } catch (error) {
    console.error("Erro ao verificar a sessão da cliente:", error);
    showMessage(readableError(error, "Não foi possível verificar sua sessão."));
    showOnly(loginSection);
  }

  supabaseClient.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_IN" || event === "SIGNED_OUT") {
      window.setTimeout(() => loadClientArea(session), 0);
    }
  });
}

document.querySelector("#google-login-button").addEventListener("click", loginWithGoogle);
document.querySelector("#logout-button").addEventListener("click", logout);
document.querySelector("#denied-logout-button").addEventListener("click", logout);
document.querySelector("#schedule-button").addEventListener("click", startBooking);
document.querySelector("#appointments-button").addEventListener("click", showAppointments);

initializeClientArea();
