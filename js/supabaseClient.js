(function bootstrapSupabase() {
  window.supabaseBootstrapError = null;

  try {
    if (!window.supabase?.createClient) {
      throw new Error("A biblioteca de acesso não foi carregada.");
    }

    const config = window.NAIL_DREAMS_CONFIG;
    if (!config?.supabaseUrl || !config?.supabasePublishableKey) {
      throw new Error("A configuração de acesso não foi carregada.");
    }

    window.supabaseClient = window.supabaseClient || window.supabase.createClient(
      config.supabaseUrl,
      config.supabasePublishableKey
    );

    window.dispatchEvent(new CustomEvent("supabase:ready"));
  } catch (error) {
    window.supabaseClient = null;
    window.supabaseBootstrapError = error;
    window.dispatchEvent(new CustomEvent("supabase:error", { detail: error }));
    console.error("Falha ao inicializar o acesso ao sistema.", error);
  }
})();
