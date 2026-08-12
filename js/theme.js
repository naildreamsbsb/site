(function initializeTheme() {
  const STORAGE_KEY = "nail-dreams-theme";
  const root = document.documentElement;

  function storedTheme() {
    try {
      const value = window.localStorage.getItem(STORAGE_KEY);
      return value === "light" || value === "dark" ? value : null;
    } catch (error) {
      console.warn("Não foi possível acessar a preferência de tema:", error);
      return null;
    }
  }

  function preferredTheme() {
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function applyTheme(theme, persist = false) {
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
    if (persist) {
      try {
        window.localStorage.setItem(STORAGE_KEY, theme);
      } catch (error) {
        console.warn("Não foi possível salvar a preferência de tema:", error);
      }
    }
    const button = document.querySelector("#theme-toggle");
    if (button) {
      const dark = theme === "dark";
      button.textContent = dark ? "☀" : "🌙";
      button.setAttribute("aria-label", dark ? "Ativar tema claro" : "Ativar tema escuro");
      button.title = dark ? "Tema claro" : "Tema escuro";
    }
  }

  applyTheme(storedTheme() || preferredTheme());

  function createToggle() {
    if (document.querySelector("#theme-toggle")) return;
    const button = document.createElement("button");
    button.id = "theme-toggle";
    button.className = "theme-toggle";
    button.type = "button";
    button.addEventListener("click", () => {
      applyTheme(root.dataset.theme === "dark" ? "light" : "dark", true);
    });
    document.body.appendChild(button);
    applyTheme(root.dataset.theme || preferredTheme());
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", createToggle, { once: true });
  } else {
    createToggle();
  }
})();
