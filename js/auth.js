const ALLOWED_ROLES = ["admin", "recepcao"];

function showMessage(element, text, type = "error") {
  if (!element) return;
  element.textContent = text;
  element.className = text ? `message ${type}` : "message";
}

function readableError(error, fallback) {
  return error?.message || fallback;
}

async function getCurrentSession() {
  const { data, error } = await supabaseClient.auth.getSession();
  if (error) throw error;
  return data.session;
}

async function getUserProfile(userId) {
  const { data, error } = await supabaseClient
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();

  if (error) throw error;
  return data;
}

async function signOutAndRedirect(reason = "") {
  await supabaseClient.auth.signOut();
  const query = reason ? `?message=${encodeURIComponent(reason)}` : "";
  window.location.replace(`index.html${query}`);
}

async function requireAdminAccess() {
  const session = await getCurrentSession();
  if (!session) {
    window.location.replace("index.html");
    return null;
  }

  const profile = await getUserProfile(session.user.id);
  if (!ALLOWED_ROLES.includes(profile?.role)) {
    await signOutAndRedirect("Acesso negado: seu usuário não possui permissão para acessar o painel.");
    return null;
  }

  return { session, profile };
}

async function handleLogin(event) {
  event.preventDefault();
  const message = document.querySelector("#login-message");
  const button = document.querySelector("#login-button");
  button.disabled = true;
  showMessage(message, "Entrando...", "info");

  try {
    const { error } = await supabaseClient.auth.signInWithPassword({
      email: document.querySelector("#email").value.trim(),
      password: document.querySelector("#password").value
    });
    if (error) throw error;

    const access = await requireAdminAccess();
    if (access) window.location.replace("admin.html");
  } catch (error) {
    showMessage(message, readableError(error, "Não foi possível fazer login. Verifique seus dados."));
    button.disabled = false;
  }
}

async function initializeLogin() {
  const params = new URLSearchParams(window.location.search);
  const message = document.querySelector("#login-message");
  if (params.get("message")) showMessage(message, params.get("message"));

  try {
    const session = await getCurrentSession();
    if (!session) return;
    const profile = await getUserProfile(session.user.id);
    if (ALLOWED_ROLES.includes(profile?.role)) window.location.replace("admin.html");
    else await supabaseClient.auth.signOut();
  } catch (error) {
    showMessage(message, readableError(error, "Não foi possível verificar sua sessão."));
  }
}

const loginForm = document.querySelector("#login-form");
if (loginForm) {
  loginForm.addEventListener("submit", handleLogin);
  initializeLogin();
}
