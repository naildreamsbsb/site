const resetForm = document.querySelector("#reset-password-form");
const resetMessage = document.querySelector("#reset-message");
const savePasswordButton = document.querySelector("#save-password-button");
let recoverySessionReady = false;

function showResetMessage(text, type = "error") {
  resetMessage.textContent = text;
  resetMessage.className = text ? `message ${type}` : "message";
}

function enablePasswordReset(session) {
  if (!session || recoverySessionReady) return;
  recoverySessionReady = true;
  savePasswordButton.disabled = false;
  showResetMessage("Link validado. Digite sua nova senha.", "info");
}

async function initializePasswordReset() {
  const { data: authListener } = supabaseClient.auth.onAuthStateChange((_event, session) => {
    enablePasswordReset(session);
  });

  try {
    const { data, error } = await supabaseClient.auth.getSession();
    if (error) throw error;
    enablePasswordReset(data.session);

    if (!data.session) {
      window.setTimeout(() => {
        if (!recoverySessionReady) {
          showResetMessage("Link de recuperação inválido ou expirado. Solicite um novo link.");
        }
      }, 3000);
    }
  } catch (error) {
    showResetMessage(error?.message || "Não foi possível validar o link de recuperação.");
  }

  window.addEventListener("pagehide", () => authListener.subscription.unsubscribe(), { once: true });
}

async function handlePasswordReset(event) {
  event.preventDefault();

  if (!recoverySessionReady) {
    showResetMessage("Aguarde a validação do link de recuperação.");
    return;
  }

  const newPassword = document.querySelector("#new-password").value;
  const confirmPassword = document.querySelector("#confirm-password").value;

  if (newPassword.length < 6) {
    showResetMessage("A nova senha deve ter pelo menos 6 caracteres.");
    return;
  }

  if (newPassword !== confirmPassword) {
    showResetMessage("As senhas não são iguais.");
    return;
  }

  savePasswordButton.disabled = true;
  savePasswordButton.textContent = "Salvando...";
  showResetMessage("", "info");

  try {
    const { error } = await supabaseClient.auth.updateUser({ password: newPassword });
    if (error) throw error;

    showResetMessage("Senha alterada com sucesso. Faça login novamente.", "success");
    resetForm.reset();
    await supabaseClient.auth.signOut();
    window.setTimeout(() => window.location.replace("login.html"), 3000);
  } catch (error) {
    showResetMessage(error?.message || "Não foi possível alterar a senha. Tente novamente.");
    savePasswordButton.disabled = false;
    savePasswordButton.textContent = "Salvar nova senha";
  }
}

resetForm.addEventListener("submit", handlePasswordReset);
initializePasswordReset();
