import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm"

export const supabaseClient = createClient(
  "https://frafczojgjzxrypnstam.supabase.co",
  "sb_publishable_eIV6S_JcirxgJvRiwN55Qg_WW6amXCY",
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  }
)