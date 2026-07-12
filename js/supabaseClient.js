if (!window.supabase) {
  throw new Error("A biblioteca do Supabase não foi carregada.");
}

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
