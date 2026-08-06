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
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function requireAuthenticatedUser() {
  const session = await getCurrentSession();
  if (!session) {
    window.location.replace("login.html");
    return null;
  }

  const profile = await getUserProfile(session.user.id);
  return { session, profile };
}

async function signOutAndRedirect(reason = "") {
  await supabaseClient.auth.signOut();
  const query = reason ? `?message=${encodeURIComponent(reason)}` : "";
  window.location.replace(`login.html${query}`);
}

async function requireAdminAccess() {
  const access = await requireAuthenticatedUser();
  if (!access) return null;
  const { session, profile } = access;
  if (!ALLOWED_ROLES.includes(profile?.role)) {
    await signOutAndRedirect("Acesso negado: seu usuário não possui permissão para acessar o painel.");
    return null;
  }

  return { session, profile };
}

async function requireProfessionalAccess() {
  const access = await requireAuthenticatedUser();
  if (!access) return null;

  if (access.profile?.role !== "profissional") {
    await signOutAndRedirect("Acesso negado: seu usuário não possui permissão para acessar a área profissional.");
    return null;
  }

  return access;
}

async function redirectByRole(profile) {
  if (ALLOWED_ROLES.includes(profile?.role)) {
    window.location.replace("admin.html");
    return true;
  }

  if (profile?.role === "profissional") {
    window.location.replace("profissional.html");
    return true;
  }

  await signOutAndRedirect("Acesso negado: seu perfil ainda não possui uma área disponível.");
  return false;
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

    const access = await requireAuthenticatedUser();
    if (access) await redirectByRole(access.profile);
  } catch (error) {
    showMessage(message, readableError(error, "Não foi possível fazer login. Verifique seus dados."));
    button.disabled = false;
  }
}

async function handleForgotPassword() {
  const emailInput = document.querySelector("#email");
  const message = document.querySelector("#login-message");
  const button = document.querySelector("#forgot-password-button");
  const email = emailInput.value.trim();

  if (!email || !emailInput.checkValidity()) {
    showMessage(message, "Informe um e-mail válido para redefinir sua senha.");
    emailInput.focus();
    return;
  }

  button.disabled = true;
  button.textContent = "Enviando...";
  showMessage(message, "", "info");

  try {
    const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password.html`
    });
    if (error) throw error;
    showMessage(message, "Enviamos um link de redefinição para seu e-mail.", "success");
  } catch (error) {
    showMessage(message, readableError(error, "Não foi possível enviar o link de redefinição."));
  } finally {
    button.disabled = false;
    button.textContent = "Esqueci minha senha";
  }
}

let activeSessionProfile = null;

function showLoginForm() {
  activeSessionProfile = null;
  document.querySelector("#active-session").hidden = true;
  document.querySelector("#login-form").hidden = false;
}

function showActiveSession(session, profile) {
  const displayName = profile?.nome
    || profile?.name
    || profile?.full_name
    || session.user.user_metadata?.name
    || session.user.user_metadata?.full_name
    || session.user.email;

  activeSessionProfile = profile;
  document.querySelector("#active-session-user").textContent = displayName || "Usuário conectado";
  document.querySelector("#login-form").hidden = true;
  document.querySelector("#active-session").hidden = false;
}

async function handleContinueSession() {
  const button = document.querySelector("#continue-session-button");
  button.disabled = true;

  try {
    await redirectByRole(activeSessionProfile);
  } catch (error) {
    showMessage(document.querySelector("#login-message"), readableError(error, "Não foi possível continuar com esta sessão."));
    button.disabled = false;
  }
}

async function handleSwitchUser() {
  const button = document.querySelector("#switch-user-button");
  button.disabled = true;

  try {
    const { error } = await supabaseClient.auth.signOut();
    if (error) throw error;
    showMessage(document.querySelector("#login-message"), "", "info");
    showLoginForm();
    document.querySelector("#email").focus();
  } catch (error) {
    showMessage(document.querySelector("#login-message"), readableError(error, "Não foi possível encerrar a sessão."));
  } finally {
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
    showActiveSession(session, profile);
  } catch (error) {
    showMessage(message, readableError(error, "Não foi possível verificar sua sessão."));
  }
}

const loginForm = document.querySelector("#login-form");
if (loginForm) {
  loginForm.addEventListener("submit", handleLogin);
  document.querySelector("#forgot-password-button").addEventListener("click", handleForgotPassword);
  document.querySelector("#continue-session-button").addEventListener("click", handleContinueSession);
  document.querySelector("#switch-user-button").addEventListener("click", handleSwitchUser);
  initializeLogin();
}
